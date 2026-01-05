/**
 * SDK Utilities
 * ==============
 *
 * Utility functions for configuring and using the Claude Agent SDK directly.
 * This module provides authentication and options building.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	McpStdioServerConfig,
	Options as SDKOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
	CONTEXT_WINDOW,
	ISOLATE_SESSION_CACHE,
	MAX_TURNS,
	MIN_CACHEABLE_TOKENS,
	SETTINGS_FILENAME,
} from "./config.ts";
import {
	CONTEXT_MANAGEMENT_PROMPT,
	createSecuritySettings,
	getAllAllowedTools,
	getDefaultMcpServers,
	type McpServerConfig,
	type SecuritySettings,
} from "./security/index.ts";
import {
	collectPluginDirectories,
	DEFAULT_PLUGINS_DIR,
} from "./skills/index.ts";

// ====================================
// Types
// ====================================

/**
 * Authentication configuration result
 */
export interface AuthConfig {
	useBedrock: boolean;
	awsRegion: string | null;
	envVars: Record<string, string>;
}

/**
 * Options for creating SDK configuration
 */
export interface CreateSdkOptionsParams {
	projectDir: string;
	model: string;
	systemPrompt?: string;
	appendSystemPrompt?: string;
	skills?: string[];
	pluginDirs?: string[];
	skillContent?: string;
	loadDefaultSkills?: boolean;
	resumeSessionId?: string;
}

// ====================================
// AWS Credential Validation
// ====================================

/**
 * Get AWS region from environment variables
 */
function getAwsRegion(): string {
	const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
	if (!region) {
		throw new Error(
			"AWS_REGION or AWS_DEFAULT_REGION environment variable not set.\n" +
				"Set your AWS region for Bedrock (e.g., us-east-1, us-west-2)",
		);
	}
	return region;
}

/**
 * Validate AWS credentials are available
 */
async function validateAwsCredentials(): Promise<void> {
	const region = getAwsRegion();

	try {
		const credentials = fromNodeProviderChain({ clientConfig: { region } });
		const stsClient = new STSClient({ region, credentials });
		const identity = await stsClient.send(new GetCallerIdentityCommand({}));
		console.log(`AWS credentials validated (Account: ${identity.Account})`);
	} catch (error) {
		throw new Error(
			"AWS credentials not found or invalid.\n" +
				"Configure AWS credentials using one of:\n" +
				"  1. AWS CLI: aws configure\n" +
				"  2. Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY\n" +
				"  3. IAM role (if running on EC2/ECS/Lambda)\n\n" +
				`Error: ${error instanceof Error ? error.message : error}`,
		);
	}
}

// ====================================
// Authentication Configuration
// ====================================

/**
 * Configure authentication for AWS Bedrock or Anthropic API
 * Uses CLAUDE_CODE_USE_BEDROCK environment variable (official Claude Code env var)
 */
export async function configureAuthentication(): Promise<AuthConfig> {
	const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";

	if (useBedrock) {
		const awsRegion = getAwsRegion();
		await validateAwsCredentials();
		console.log(`Using AWS Bedrock in region: ${awsRegion}`);

		return {
			useBedrock: true,
			awsRegion,
			envVars: {
				CLAUDE_CODE_USE_BEDROCK: "1",
				AWS_REGION: awsRegion,
			},
		};
	}

	// Anthropic API authentication
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY environment variable not set.\n" +
				"Get your API key from: https://console.anthropic.com/\n" +
				"Or set CLAUDE_CODE_USE_BEDROCK=1 to use AWS Bedrock instead.",
		);
	}

	return {
		useBedrock: false,
		awsRegion: null,
		envVars: {},
	};
}

// ====================================
// Security Settings
// ====================================

/**
 * Write security settings to a file in the project directory
 */
export function writeSecuritySettings(
	projectDir: string,
	settings: SecuritySettings,
): string {
	if (!existsSync(projectDir)) {
		mkdirSync(projectDir, { recursive: true });
	}

	const settingsFile = join(projectDir, SETTINGS_FILENAME);
	writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf-8");

	return settingsFile;
}

// ====================================
// System Prompt Building
// ====================================

/**
 * Generate a unique session ID for cache isolation
 */
function generateSessionId(): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${timestamp}-${random}`;
}

/**
 * Build system prompt with caching optimization
 */
export function buildSystemPrompt(options: {
	base?: string;
	append?: string;
	skillContent?: string;
}): string {
	const parts: string[] = [];

	// Session isolation prefix (prevents cache hits from previous sessions)
	if (ISOLATE_SESSION_CACHE) {
		const sessionId = generateSessionId();
		parts.push(`[Session: ${sessionId}]`);
		console.log(`[Cache Isolation] New session ID: ${sessionId}`);
	}

	// Base system prompt
	const defaultPrompt =
		"You are an expert full-stack developer and QA engineer " +
		"with deep expertise in end-to-end testing.";
	parts.push(options.base ?? defaultPrompt);

	// Context management guidelines
	parts.push(CONTEXT_MANAGEMENT_PROMPT);

	// Skill content
	if (options.skillContent) {
		parts.push(options.skillContent);
	}

	// Session-specific appends
	if (options.append) {
		parts.push(options.append);
	}

	const prompt = parts.join("\n\n");

	// Log prompt size for caching optimization
	const estimatedTokens = Math.ceil(prompt.length / 4);
	const cacheEligible = estimatedTokens >= MIN_CACHEABLE_TOKENS;
	const cacheNote = ISOLATE_SESSION_CACHE
		? " (isolated per session)"
		: " (shared across sessions)";
	console.log(
		`[Prompt Cache] Size: ~${estimatedTokens} tokens, ` +
			`Cache eligible: ${cacheEligible ? "Yes" : `No (min: ${MIN_CACHEABLE_TOKENS})`}${cacheNote}`,
	);

	return prompt;
}

// ====================================
// MCP Server Configuration
// ====================================

/**
 * Convert MCP server configs to SDK format
 */
function convertMcpServersToSdkFormat(
	servers: Record<string, McpServerConfig>,
): Record<string, McpStdioServerConfig> {
	const result: Record<string, McpStdioServerConfig> = {};

	for (const [name, config] of Object.entries(servers)) {
		const sdkConfig: McpStdioServerConfig = {
			type: "stdio",
			command: config.command,
			args: config.args,
		};
		if (config.env) {
			sdkConfig.env = config.env;
		}
		result[name] = sdkConfig;
	}

	return result;
}

// ====================================
// SDK Options Builder
// ====================================

/**
 * Create SDK options for a query
 */
export async function createSdkOptions(
	params: CreateSdkOptionsParams,
): Promise<{ options: SDKOptions; authConfig: AuthConfig }> {
	const {
		projectDir,
		model,
		systemPrompt,
		appendSystemPrompt,
		skills,
		pluginDirs,
		skillContent,
		loadDefaultSkills = true,
		resumeSessionId,
	} = params;

	// Configure authentication
	const authConfig = await configureAuthentication();

	// Set environment variables
	for (const [key, value] of Object.entries(authConfig.envVars)) {
		process.env[key] = value;
	}

	// Create and write security settings
	const securitySettings = createSecuritySettings(projectDir);
	const settingsFile = writeSecuritySettings(projectDir, securitySettings);

	// Print configuration info
	console.log(`Created security settings at ${settingsFile}`);
	if (authConfig.useBedrock) {
		console.log(`   - Using AWS Bedrock (region: ${authConfig.awsRegion})`);
	} else {
		console.log("   - Using Anthropic API");
	}
	console.log("   - Using Claude Agent SDK");
	console.log(`   - Filesystem restricted to: ${projectDir}`);
	console.log("   - MCP servers: chrome-devtools (browser automation)");
	console.log();

	// Collect plugin directories
	const allPluginDirs: string[] = pluginDirs ? [...pluginDirs] : [];

	if (skills) {
		for (const skillName of skills) {
			const skillPluginPath = join(DEFAULT_PLUGINS_DIR, skillName);
			if (existsSync(skillPluginPath)) {
				allPluginDirs.push(skillPluginPath);
			} else {
				console.log(
					`Warning: Skill '${skillName}' not found in ${DEFAULT_PLUGINS_DIR}`,
				);
			}
		}
	}

	const validatedPluginDirs = collectPluginDirectories({
		pluginDirs: allPluginDirs.length > 0 ? allPluginDirs : undefined,
		loadDefaultSkills,
		verbose: true,
	});

	// Build system prompt
	const finalSystemPrompt = buildSystemPrompt({
		base: systemPrompt,
		append: appendSystemPrompt,
		skillContent,
	});

	// Get MCP servers and tools
	const mcpServers = getDefaultMcpServers();
	const sdkMcpServers = convertMcpServersToSdkFormat(mcpServers);
	const allowedTools = getAllAllowedTools();

	// Build environment
	const env: Record<string, string | undefined> = {
		...(process.env as Record<string, string | undefined>),
		...authConfig.envVars,
	};

	// Log session mode
	if (resumeSessionId) {
		console.log(
			`[Session] Resuming session: ${resumeSessionId.slice(0, 16)}...`,
		);
	} else {
		console.log("[Session] Starting new session");
	}

	// Build SDK options
	const options: SDKOptions = {
		model,
		cwd: projectDir,
		systemPrompt: finalSystemPrompt,
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		mcpServers: sdkMcpServers,
		allowedTools,
		maxTurns: MAX_TURNS,
		env,
		plugins: validatedPluginDirs.map((path) => ({
			type: "local" as const,
			path,
		})),
		resume: resumeSessionId,
	};

	return { options, authConfig };
}
