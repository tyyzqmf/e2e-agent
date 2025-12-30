/**
 * Claude SDK Client Configuration
 * =================================
 *
 * Functions for creating and configuring the Claude Code SDK client.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { type Subprocess, spawn } from "bun";
import type { ClientOptions } from "./config.ts";
import {
	BEDROCK_ENV_VALUES,
	DEFAULT_SYSTEM_PROMPT,
	MAX_TURNS,
	SETTINGS_FILENAME,
} from "./config.ts";
import {
	CONTEXT_MANAGEMENT_PROMPT,
	createSecuritySettings,
	getDefaultMcpServers,
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
interface AuthConfig {
	useBedrock: boolean;
	awsRegion: string | null;
	envVars: Record<string, string>;
}

/**
 * Claude Code SDK client wrapper
 * Since we don't have the actual SDK, we'll create a wrapper that spawns claude CLI
 */
export interface ClaudeClient {
	/** Send a query to the agent */
	query(message: string): Promise<void>;
	/** Receive response stream */
	receiveResponse(): AsyncGenerator<AgentMessage, void, unknown>;
	/** Cleanup resources */
	cleanup(): Promise<void>;
	/** Get the subprocess (if available) */
	getProcess(): Subprocess | null;
}

/**
 * Agent message types
 */
export interface AgentMessage {
	type: string;
	content?: MessageContent[];
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
	total_cost_usd?: number;
	duration_ms?: number;
	num_turns?: number;
	session_id?: string;
}

export interface MessageContent {
	type: string;
	text?: string;
	name?: string;
	input?: unknown;
	content?: string;
	is_error?: boolean;
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
 * Uses fromNodeProviderChain for credential resolution and STS GetCallerIdentity to verify
 */
async function validateAwsCredentials(): Promise<void> {
	const region = getAwsRegion();

	try {
		// Use credential provider chain (env vars, ~/.aws/credentials, EC2/ECS metadata, SSO, etc.)
		const credentials = fromNodeProviderChain({ clientConfig: { region } });

		// Validate credentials by calling STS GetCallerIdentity
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
 */
async function configureAuthentication(): Promise<AuthConfig> {
	const useBedrock = BEDROCK_ENV_VALUES.includes(
		(process.env.USE_AWS_BEDROCK ?? "").toLowerCase() as any,
	);

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
				"Or set USE_AWS_BEDROCK=true to use AWS Bedrock instead.",
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
function writeSecuritySettings(
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

/**
 * Print client configuration information
 */
function printClientConfiguration(
	settingsFile: string,
	useBedrock: boolean,
	awsRegion: string | null,
): void {
	console.log(`Created security settings at ${settingsFile}`);
	if (useBedrock) {
		console.log(`   - Using AWS Bedrock (region: ${awsRegion})`);
	} else {
		console.log("   - Using Anthropic API");
	}
	console.log("   - Sandbox enabled (OS-level bash isolation)");
	console.log(`   - Filesystem restricted to: ${join(settingsFile, "..")}`);
	console.log("   - MCP servers: chrome-devtools (browser automation)");
	console.log();
}

// ====================================
// Client Creation
// ====================================

/**
 * Build the final system prompt
 */
function buildSystemPrompt(options: {
	base?: string;
	append?: string;
	skillContent?: string;
}): string {
	let prompt = options.base ?? DEFAULT_SYSTEM_PROMPT;

	if (options.append) {
		prompt = `${prompt}\n\n${options.append}`;
	}
	if (options.skillContent) {
		prompt = `${prompt}\n\n${options.skillContent}`;
	}

	// Add context management guidelines
	prompt = `${prompt}\n\n${CONTEXT_MANAGEMENT_PROMPT}`;

	return prompt;
}

/**
 * Create a Claude Code SDK client with multi-layered security.
 *
 * @param options - Client configuration options
 * @returns Configured client wrapper
 */
export async function createClient(
	options: ClientOptions,
): Promise<ClaudeClient> {
	const {
		projectDir,
		model,
		systemPrompt,
		appendSystemPrompt,
		skills,
		pluginDirs,
		skillContent,
		loadDefaultSkills = true,
	} = options;

	// Configure authentication
	const { useBedrock, awsRegion, envVars } = await configureAuthentication();

	// Create and write security settings
	const securitySettings = createSecuritySettings(projectDir);
	const settingsFile = writeSecuritySettings(projectDir, securitySettings);
	printClientConfiguration(settingsFile, useBedrock, awsRegion);

	// Collect plugin directories from skill names
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

	// Validate plugin directories
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

	// Get MCP servers configuration
	const mcpServers = getDefaultMcpServers();

	// Build environment variables
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		...envVars,
	};

	// Create a client wrapper that uses claude CLI
	return createClaudeCliClient({
		model,
		systemPrompt: finalSystemPrompt,
		projectDir,
		settingsFile,
		env,
		pluginDirs: validatedPluginDirs,
		mcpServers,
	});
}

// ====================================
// Claude CLI Client Implementation
// ====================================

interface ClaudeCliClientOptions {
	model: string;
	systemPrompt: string;
	projectDir: string;
	settingsFile: string;
	env: Record<string, string>;
	pluginDirs: string[];
	mcpServers: Record<string, { command: string; args: string[] }>;
}

/**
 * Create a client that uses the claude CLI
 */
function createClaudeCliClient(options: ClaudeCliClientOptions): ClaudeClient {
	let process: Subprocess | null = null;
	let _responseBuffer = "";
	const _responseResolve: ((value: undefined) => void) | null = null;

	return {
		async query(message: string): Promise<void> {
			// Build claude command
			const args = [
				"--print",
				"--model",
				options.model,
				"--max-turns",
				String(MAX_TURNS),
				"--output-format",
				"stream-json",
			];

			// Add system prompt via --system-prompt
			args.push("--system-prompt", options.systemPrompt);

			// Add settings file
			if (options.settingsFile) {
				args.push("--settings", options.settingsFile);
			}

			// Add plugin directories
			for (const pluginDir of options.pluginDirs) {
				args.push("--plugin-dir", pluginDir);
			}

			// Add MCP servers
			for (const [name, config] of Object.entries(options.mcpServers)) {
				const mcpArg = JSON.stringify({ [name]: config });
				args.push("--mcp-server", mcpArg);
			}

			// Add the message as positional argument
			args.push(message);

			// Spawn claude CLI process
			process = spawn({
				cmd: ["claude", ...args],
				cwd: options.projectDir,
				env: options.env,
				stdout: "pipe",
				stderr: "pipe",
				stdin: "ignore",
			});

			_responseBuffer = "";
		},

		async *receiveResponse(): AsyncGenerator<AgentMessage, void, unknown> {
			if (!process) {
				throw new Error("No active query");
			}

			const stdout = process.stdout;
			if (!stdout) {
				throw new Error("No stdout available");
			}

			const decoder = new TextDecoder();
			const reader = stdout.getReader();
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					// Process complete lines
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.trim()) continue;

						try {
							const msg = JSON.parse(line);
							yield convertToAgentMessage(msg);
						} catch {
							// Not JSON, might be raw output
							yield {
								type: "AssistantMessage",
								content: [{ type: "TextBlock", text: line }],
							};
						}
					}
				}

				// Process any remaining buffer
				if (buffer.trim()) {
					try {
						const msg = JSON.parse(buffer);
						yield convertToAgentMessage(msg);
					} catch {
						yield {
							type: "AssistantMessage",
							content: [{ type: "TextBlock", text: buffer }],
						};
					}
				}
			} finally {
				reader.releaseLock();
			}
		},

		async cleanup(): Promise<void> {
			if (process) {
				try {
					process.kill("SIGTERM");
					await process.exited;
				} catch {
					// Ignore errors during cleanup
				}
				process = null;
			}
		},

		getProcess(): Subprocess | null {
			return process;
		},
	};
}

/**
 * Convert claude CLI output to AgentMessage format
 */
function convertToAgentMessage(msg: any): AgentMessage {
	// Handle different message types from claude CLI
	if (msg.type === "assistant") {
		return {
			type: "AssistantMessage",
			content: [{ type: "TextBlock", text: msg.message ?? "" }],
		};
	}

	if (msg.type === "tool_use") {
		return {
			type: "AssistantMessage",
			content: [
				{
					type: "ToolUseBlock",
					name: msg.tool ?? msg.name ?? "unknown",
					input: msg.input ?? msg.arguments ?? {},
				},
			],
		};
	}

	if (msg.type === "tool_result") {
		return {
			type: "UserMessage",
			content: [
				{
					type: "ToolResultBlock",
					content: msg.result ?? msg.output ?? "",
					is_error: msg.is_error ?? false,
				},
			],
		};
	}

	if (msg.type === "result" || msg.type === "done") {
		return {
			type: "ResultMessage",
			usage: {
				input_tokens: msg.input_tokens ?? msg.usage?.input_tokens ?? 0,
				output_tokens: msg.output_tokens ?? msg.usage?.output_tokens ?? 0,
				cache_creation_input_tokens:
					msg.cache_creation_tokens ??
					msg.usage?.cache_creation_input_tokens ??
					0,
				cache_read_input_tokens:
					msg.cache_read_tokens ?? msg.usage?.cache_read_input_tokens ?? 0,
			},
			total_cost_usd: msg.total_cost_usd ?? msg.cost ?? null,
			duration_ms: msg.duration_ms ?? msg.duration ?? 0,
			num_turns: msg.num_turns ?? msg.turns ?? 0,
			session_id: msg.session_id ?? "unknown",
		};
	}

	// Default: return as-is
	return msg as AgentMessage;
}
