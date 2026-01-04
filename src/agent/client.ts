/**
 * Claude SDK Client Configuration
 * =================================
 *
 * Functions for creating and configuring the Claude Agent SDK client.
 * Uses @anthropic-ai/claude-agent-sdk for programmatic agent interaction.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type McpStdioServerConfig,
	type Query,
	query,
	type SDKAssistantMessage,
	type SDKMessage,
	type Options as SDKOptions,
	type SDKResultMessage,
	type SDKSystemMessage,
	type SDKUserMessage,
	type SdkBeta,
} from "@anthropic-ai/claude-agent-sdk";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { ClientOptions } from "./config.ts";
import {
	BEDROCK_ENV_VALUES,
	CACHE_COST_MULTIPLIERS,
	CONTEXT_COMPRESSION_THRESHOLD,
	CONTEXT_WINDOW,
	DEFAULT_SYSTEM_PROMPT,
	ENABLE_1M_CONTEXT,
	ENABLE_PROMPT_CACHING,
	ENABLE_TOKEN_MONITORING,
	ISOLATE_SESSION_CACHE,
	MAX_TURNS,
	MIN_CACHEABLE_TOKENS,
	SETTINGS_FILENAME,
	TOKEN_LOG_INTERVAL,
	TOKEN_WARNING_THRESHOLDS,
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
interface AuthConfig {
	useBedrock: boolean;
	awsRegion: string | null;
	envVars: Record<string, string>;
}

/**
 * Claude Agent SDK client wrapper
 */
export interface ClaudeClient {
	/** Send a query to the agent */
	query(message: string): Promise<void>;
	/** Receive response stream */
	receiveResponse(): AsyncGenerator<AgentMessage, void, unknown>;
	/** Cleanup resources */
	cleanup(): Promise<void>;
	/** Get the subprocess (if available) - deprecated for SDK */
	getProcess(): null;
}

/**
 * Agent message types (aligned with SDK message format)
 */
export interface AgentMessage {
	type: string;
	subtype?: string;
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
	tool_name?: string;
	input?: unknown;
	result?: string;
	error?: {
		type?: string;
		message?: string;
		tool?: string;
	};
	cost?: number;
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
	console.log("   - Using Claude Agent SDK");
	console.log(`   - Filesystem restricted to: ${join(settingsFile, "..")}`);
	console.log("   - MCP servers: chrome-devtools (browser automation)");
	console.log();
}

// ====================================
// Client Creation
// ====================================

/**
 * Build the final system prompt optimized for prompt caching.
 *
 * Prompt structure for optimal caching:
 * 1. Static base prompt (highly cacheable)
 * 2. Context management guidelines (stable)
 * 3. Skill content (semi-stable)
 * 4. Session-specific appends (variable)
 *
 * This ordering ensures maximum cache hit rate as stable
 * content is at the beginning of the prompt.
 */
/**
 * Generate a unique session ID for cache isolation
 */
function generateSessionId(): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${timestamp}-${random}`;
}

function buildSystemPrompt(options: {
	base?: string;
	append?: string;
	skillContent?: string;
}): string {
	const parts: string[] = [];

	// 0. Session isolation prefix (if enabled)
	// This MUST be at the very beginning to prevent cache hits from previous sessions
	// Claude's prompt caching uses prefix matching, so a unique prefix = no cache hit
	if (ISOLATE_SESSION_CACHE) {
		const sessionId = generateSessionId();
		parts.push(`[Session: ${sessionId}]`);
		console.log(`[Cache Isolation] New session ID: ${sessionId}`);
	}

	// 1. Base system prompt (most stable - cache this)
	parts.push(options.base ?? DEFAULT_SYSTEM_PROMPT);

	// 2. Context management guidelines (stable)
	parts.push(CONTEXT_MANAGEMENT_PROMPT);

	// 3. Skill content (semi-stable, changes per skill set)
	if (options.skillContent) {
		parts.push(options.skillContent);
	}

	// 4. Session-specific appends (variable - at the end)
	if (options.append) {
		parts.push(options.append);
	}

	const prompt = parts.join("\n\n");

	// Log prompt size for caching optimization
	if (ENABLE_PROMPT_CACHING) {
		// Rough token estimate: ~4 chars per token
		const estimatedTokens = Math.ceil(prompt.length / 4);
		const cacheEligible = estimatedTokens >= MIN_CACHEABLE_TOKENS;
		const cacheNote = ISOLATE_SESSION_CACHE
			? " (isolated per session)"
			: " (shared across sessions)";
		console.log(
			`[Prompt Cache] Size: ~${estimatedTokens} tokens, ` +
				`Cache eligible: ${cacheEligible ? "Yes" : `No (min: ${MIN_CACHEABLE_TOKENS})`}${cacheNote}`,
		);
	}

	return prompt;
}

/**
 * Calculate and log cache cost savings
 */
function logCacheStatistics(usage: {
	input_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}): void {
	const inputTokens = usage.input_tokens ?? 0;
	const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
	const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

	if (cacheCreationTokens === 0 && cacheReadTokens === 0) {
		return; // No cache activity
	}

	// Calculate cost savings
	// Without cache: all tokens at 1x cost
	// With cache: creation at 1.25x, reads at 0.1x
	const withoutCacheCost = inputTokens + cacheCreationTokens + cacheReadTokens;
	const withCacheCost =
		inputTokens +
		cacheCreationTokens * CACHE_COST_MULTIPLIERS.WRITE +
		cacheReadTokens * CACHE_COST_MULTIPLIERS.READ;
	const savings = withoutCacheCost - withCacheCost;
	const savingsPercent =
		withoutCacheCost > 0 ? (savings / withoutCacheCost) * 100 : 0;

	console.log(
		`[Prompt Cache] Created: ${cacheCreationTokens} tokens, ` +
			`Read: ${cacheReadTokens} tokens, ` +
			`Savings: ~${savingsPercent.toFixed(1)}%`,
	);
}

// ====================================
// Token Usage Monitor
// ====================================

/**
 * Real-time token usage monitor
 *
 * Tracks both:
 * 1. Current context usage - estimated from cumulative deltas or message_start events
 * 2. Cumulative token usage (for billing) - sum of all tokens across all turns
 *
 * Current context estimation:
 * - Primary: from message_start event (most accurate, but not always available)
 * - Fallback: from cumulative deltas (last turn's input + cache_read)
 *
 * When API returns "Input is too long" error, message_start is never sent,
 * so we need the fallback estimation to warn before the error occurs.
 */
class TokenUsageMonitor {
	private contextWindowLimit: number;
	// Current context tracking
	private currentContextTokens: number = 0;
	private lastTurnInputTokens: number = 0;
	private lastTurnCacheReadTokens: number = 0;
	// Previous cumulative values (for calculating deltas)
	private prevCumulativeInput: number = 0;
	private prevCumulativeCacheRead: number = 0;
	// Cumulative values (for billing - sum of all turns)
	private cumulativeInputTokens: number = 0;
	private cumulativeOutputTokens: number = 0;
	private cumulativeCacheReadTokens: number = 0;
	private cumulativeCacheWriteTokens: number = 0;
	private turnCount: number = 0;
	private warningLevel: "none" | "warn" | "critical" | "imminent" = "none";

	constructor(contextWindowLimit: number) {
		this.contextWindowLimit = contextWindowLimit;
	}

	/**
	 * Log session start message
	 */
	logSessionStart(): void {
		console.log(
			`[Token Monitor] Session started | Context limit: ${(this.contextWindowLimit / 1000).toFixed(0)}K tokens`,
		);
	}

	/**
	 * Update current context usage from message_start event.
	 * This is the most accurate source as it contains the actual input_tokens
	 * for the current API request.
	 *
	 * @param inputTokens - Input tokens from message_start (current request)
	 * @param cacheReadTokens - Cache read tokens (also part of current context)
	 */
	updateCurrentContext(inputTokens: number, cacheReadTokens: number = 0): void {
		// Current context = input_tokens + cache_read_tokens
		this.currentContextTokens = inputTokens + cacheReadTokens;
		this.lastTurnInputTokens = inputTokens;
		this.lastTurnCacheReadTokens = cacheReadTokens;

		// Log current context and check warnings
		this.logCurrentContext();
		this.checkWarningThresholds();
	}

	/**
	 * Log current context usage
	 */
	private logCurrentContext(): void {
		const usagePercent =
			(this.currentContextTokens / this.contextWindowLimit) * 100;

		console.log(
			`[Token Monitor] Context: ${(this.currentContextTokens / 1000).toFixed(1)}K / ${(this.contextWindowLimit / 1000).toFixed(0)}K (${usagePercent.toFixed(1)}%)`,
		);
	}

	/**
	 * Check and emit warnings based on context usage thresholds
	 */
	private checkWarningThresholds(): void {
		const usageRatio = this.currentContextTokens / this.contextWindowLimit;

		if (
			usageRatio >= TOKEN_WARNING_THRESHOLDS.COMPRESSION_IMMINENT &&
			this.warningLevel !== "imminent"
		) {
			this.warningLevel = "imminent";
			console.warn(
				`\n⚠️  [Token Monitor] WARNING: Context at ${(usageRatio * 100).toFixed(1)}% - ` +
					`COMPRESSION IMMINENT!\n` +
					`    Current: ${(this.currentContextTokens / 1000).toFixed(1)}K tokens\n` +
					`    Limit: ${(this.contextWindowLimit / 1000).toFixed(0)}K tokens\n` +
					`    Threshold: ${(TOKEN_WARNING_THRESHOLDS.COMPRESSION_IMMINENT * 100).toFixed(0)}%\n`,
			);
		} else if (
			usageRatio >= TOKEN_WARNING_THRESHOLDS.CRITICAL &&
			this.warningLevel !== "critical" &&
			this.warningLevel !== "imminent"
		) {
			this.warningLevel = "critical";
			console.warn(
				`\n⚠️  [Token Monitor] CRITICAL: Context at ${(usageRatio * 100).toFixed(1)}% - ` +
					`approaching compression threshold\n`,
			);
		} else if (
			usageRatio >= TOKEN_WARNING_THRESHOLDS.WARN &&
			this.warningLevel === "none"
		) {
			this.warningLevel = "warn";
			console.log(
				`[Token Monitor] Note: Context usage at ${(usageRatio * 100).toFixed(1)}%`,
			);
		}
	}

	/**
	 * Update cumulative token usage and estimate current context from deltas.
	 *
	 * This method calculates the delta (difference from last cumulative values)
	 * to estimate the current context size. This is a fallback when message_start
	 * events are not available (e.g., when API returns error before streaming).
	 *
	 * @param inputTokens - Cumulative non-cached input tokens
	 * @param outputTokens - Cumulative output tokens generated
	 * @param cacheReadTokens - Cumulative tokens read from cache
	 * @param cacheWriteTokens - Cumulative tokens written to cache
	 */
	updateCumulativeUsage(
		inputTokens: number,
		outputTokens: number,
		cacheReadTokens: number = 0,
		cacheWriteTokens: number = 0,
	): void {
		// Calculate deltas (this turn's usage)
		const deltaInput = inputTokens - this.prevCumulativeInput;
		const deltaCacheRead = cacheReadTokens - this.prevCumulativeCacheRead;

		// Estimate current context from delta if we haven't received message_start
		// Delta represents this turn's input, which approximates current context
		if (deltaInput > 0 || deltaCacheRead > 0) {
			const estimatedContext = deltaInput + deltaCacheRead;
			// Only update if we have a reasonable estimate and it's larger than current
			if (estimatedContext > this.currentContextTokens) {
				this.currentContextTokens = estimatedContext;
				this.lastTurnInputTokens = deltaInput;
				this.lastTurnCacheReadTokens = deltaCacheRead;

				// Log and check warnings
				this.logCurrentContext();
				this.checkWarningThresholds();
			}
		}

		// Save current as previous for next delta calculation
		this.prevCumulativeInput = inputTokens;
		this.prevCumulativeCacheRead = cacheReadTokens;

		// Update cumulative values
		this.cumulativeInputTokens = inputTokens;
		this.cumulativeOutputTokens = outputTokens;
		this.cumulativeCacheReadTokens = cacheReadTokens;
		this.cumulativeCacheWriteTokens = cacheWriteTokens;
		this.turnCount++;
	}

	/**
	 * Print final summary
	 */
	printSummary(): void {
		// Calculate cumulative totals (for billing reference)
		const cumulativeTotal =
			this.cumulativeInputTokens +
			this.cumulativeCacheWriteTokens +
			this.cumulativeCacheReadTokens;

		const contextPercent =
			(this.currentContextTokens / this.contextWindowLimit) * 100;

		console.log("\n" + "─".repeat(60));
		console.log("[Token Monitor] Session Summary");
		console.log("─".repeat(60));

		// Show current context usage (last turn's context)
		if (this.currentContextTokens > 0) {
			console.log(
				`Last Turn Context: ${(this.currentContextTokens / 1000).toFixed(1)}K / ${(this.contextWindowLimit / 1000).toFixed(0)}K (${contextPercent.toFixed(1)}%)`,
			);
			if (this.lastTurnInputTokens > 0 || this.lastTurnCacheReadTokens > 0) {
				console.log(
					`  (input: ${(this.lastTurnInputTokens / 1000).toFixed(1)}K + cache_read: ${(this.lastTurnCacheReadTokens / 1000).toFixed(1)}K)`,
				);
			}
			console.log();
		}

		console.log(`Cumulative Token Usage (for billing):`);
		console.log(
			`  Input:         ${this.cumulativeInputTokens.toLocaleString().padStart(12)} tokens`,
		);
		console.log(
			`  Cache Write:   ${this.cumulativeCacheWriteTokens.toLocaleString().padStart(12)} tokens`,
		);
		console.log(
			`  Cache Read:    ${this.cumulativeCacheReadTokens.toLocaleString().padStart(12)} tokens`,
		);
		console.log(
			`  Output:        ${this.cumulativeOutputTokens.toLocaleString().padStart(12)} tokens`,
		);
		console.log(`  ${"─".repeat(37)}`);
		console.log(
			`  Total Input:   ${cumulativeTotal.toLocaleString().padStart(12)} tokens (cumulative)`,
		);
		console.log("─".repeat(60) + "\n");
	}
}

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

/**
 * Create a Claude Agent SDK client with multi-layered security.
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

	// Set environment variables for SDK
	for (const [key, value] of Object.entries(envVars)) {
		process.env[key] = value;
	}

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
	const sdkMcpServers = convertMcpServersToSdkFormat(mcpServers);

	// Get allowed tools list
	const allowedTools = getAllAllowedTools();

	// Build environment with both process.env and custom envVars
	const env: Record<string, string | undefined> = {
		...(process.env as Record<string, string | undefined>),
		...envVars,
	};

	// Create a client wrapper that uses the SDK
	return createSdkClient({
		model,
		systemPrompt: finalSystemPrompt,
		projectDir,
		mcpServers: sdkMcpServers,
		allowedTools,
		pluginDirs: validatedPluginDirs,
		maxTurns: MAX_TURNS,
		env,
	});
}

// ====================================
// SDK Client Implementation
// ====================================

interface SdkClientOptions {
	model: string;
	systemPrompt: string;
	projectDir: string;
	mcpServers: Record<string, McpStdioServerConfig>;
	allowedTools: string[];
	pluginDirs: string[];
	maxTurns: number;
	env: Record<string, string | undefined>;
}

/**
 * Create a client that uses the Claude Agent SDK
 */
function createSdkClient(options: SdkClientOptions): ClaudeClient {
	let currentQuery: Query | null = null;
	let sessionStartTime: number = 0;
	let abortController: AbortController | null = null;
	let tokenMonitor: TokenUsageMonitor | null = null;

	return {
		async query(message: string): Promise<void> {
			sessionStartTime = Date.now();
			abortController = new AbortController();

			// Configure betas for extended context window
			const betas: SdkBeta[] = [];
			if (ENABLE_1M_CONTEXT) {
				betas.push("context-1m-2025-08-07");
			}

			// Context window configuration (SDK handles compaction automatically)
			const contextWindow = ENABLE_1M_CONTEXT
				? CONTEXT_WINDOW.EXTENDED_1M
				: CONTEXT_WINDOW.DEFAULT;
			const compressionThreshold = Math.floor(
				contextWindow * CONTEXT_COMPRESSION_THRESHOLD,
			);

			console.log(
				`[Context] Window: ${(contextWindow / 1000).toFixed(0)}K tokens, ` +
					`Auto-compaction at: ~${(compressionThreshold / 1000).toFixed(0)}K tokens ` +
					`(${(CONTEXT_COMPRESSION_THRESHOLD * 100).toFixed(0)}%)`,
			);

			// Initialize token usage monitor
			if (ENABLE_TOKEN_MONITORING) {
				tokenMonitor = new TokenUsageMonitor(contextWindow);
				tokenMonitor.logSessionStart();
			}

			// Build SDK options
			const sdkOptions: SDKOptions = {
				model: options.model,
				cwd: options.projectDir,
				systemPrompt: options.systemPrompt,
				permissionMode: "bypassPermissions",
				allowDangerouslySkipPermissions: true,
				mcpServers: options.mcpServers,
				allowedTools: options.allowedTools,
				maxTurns: options.maxTurns,
				env: options.env,
				abortController,
				// Enable extended context window beta
				betas: betas.length > 0 ? betas : undefined,
				// Load plugins from validated directories
				plugins: options.pluginDirs.map((path) => ({
					type: "local" as const,
					path,
				})),
				// NOTE: extraArgs with "context-window-tokens" causes SDK to fail
				// The SDK doesn't support this argument - removed to fix the issue
			};

			// Create the SDK query
			currentQuery = query({
				prompt: message,
				options: sdkOptions,
			});
		},

		async *receiveResponse(): AsyncGenerator<AgentMessage, void, unknown> {
			if (!currentQuery) {
				throw new Error("No active query");
			}

			let sessionId = "unknown";

			try {
				for await (const message of currentQuery) {
					// Convert SDK message to AgentMessage format
					const agentMessage = convertSdkMessage(message);

					// Track session metadata from init message
					if (message.type === "system") {
						const sysMsg = message as SDKSystemMessage;
						if (sysMsg.subtype === "init") {
							sessionId = sysMsg.session_id;
						}
					}

					// Handle result message (final message with usage stats)
					if (message.type === "result") {
						const resultMsg = message as SDKResultMessage;
						const usage = {
							input_tokens: resultMsg.usage?.input_tokens ?? 0,
							output_tokens: resultMsg.usage?.output_tokens ?? 0,
							cache_creation_input_tokens:
								resultMsg.usage?.cache_creation_input_tokens ?? 0,
							cache_read_input_tokens:
								resultMsg.usage?.cache_read_input_tokens ?? 0,
						};

						// Update token monitor with final cumulative usage (for billing)
						if (tokenMonitor) {
							tokenMonitor.updateCumulativeUsage(
								usage.input_tokens,
								usage.output_tokens,
								usage.cache_read_input_tokens,
								usage.cache_creation_input_tokens,
							);
							tokenMonitor.printSummary();
						}

						// Log cache statistics for cost optimization insights
						if (ENABLE_PROMPT_CACHING) {
							logCacheStatistics(usage);
						}

						yield {
							type: "ResultMessage",
							usage,
							total_cost_usd: resultMsg.total_cost_usd ?? null,
							duration_ms:
								resultMsg.duration_ms ?? Date.now() - sessionStartTime,
							num_turns: resultMsg.num_turns ?? 0,
							session_id: resultMsg.session_id ?? sessionId,
						};
						continue;
					}

					// Update token monitor from streaming events
					if (message.type === "stream_event" && tokenMonitor) {
						const streamMsg = message as any;
						const event = streamMsg.event;

						// Capture current context from message_start event
						// message_start contains input_tokens for THIS request (= current context size)
						if (event?.type === "message_start" && event.message?.usage) {
							const msgUsage = event.message.usage;
							tokenMonitor.updateCurrentContext(
								msgUsage.input_tokens ?? 0,
								msgUsage.cache_read_input_tokens ?? 0,
							);
						}
					}

					yield agentMessage;
				}
			} catch (error) {
				// Print token summary even on error
				if (tokenMonitor) {
					tokenMonitor.printSummary();
				}

				// Yield error message
				yield {
					type: "ErrorMessage",
					error: {
						message: error instanceof Error ? error.message : String(error),
					},
				};
			}
		},

		async cleanup(): Promise<void> {
			// Abort the query if still running
			if (abortController && !abortController.signal.aborted) {
				abortController.abort();
			}
			currentQuery = null;
			abortController = null;
			tokenMonitor = null;
		},

		getProcess(): null {
			// SDK doesn't expose subprocess
			return null;
		},
	};
}

/**
 * Convert SDK message to AgentMessage format
 */
function convertSdkMessage(message: SDKMessage): AgentMessage {
	const msgType = message.type;

	// Handle assistant messages
	if (msgType === "assistant") {
		const assistantMsg = message as SDKAssistantMessage;
		const content = assistantMsg.message?.content;
		const messageContent: MessageContent[] = [];

		if (Array.isArray(content)) {
			for (const block of content) {
				if (block.type === "text") {
					messageContent.push({
						type: "TextBlock",
						text: (block as any).text ?? "",
					});
				} else if (block.type === "tool_use") {
					const toolBlock = block as any;
					messageContent.push({
						type: "ToolUseBlock",
						name: toolBlock.name,
						input: toolBlock.input,
					});
				}
			}
		}

		return {
			type: "AssistantMessage",
			content: messageContent,
			session_id: assistantMsg.session_id,
		};
	}

	// Handle user messages (tool results)
	if (msgType === "user") {
		const userMsg = message as SDKUserMessage;
		const content = userMsg.message?.content;
		const messageContent: MessageContent[] = [];

		if (Array.isArray(content)) {
			for (const block of content) {
				if (block.type === "tool_result") {
					const resultBlock = block as any;
					messageContent.push({
						type: "ToolResultBlock",
						content:
							typeof resultBlock.content === "string"
								? resultBlock.content
								: JSON.stringify(resultBlock.content ?? ""),
						is_error: resultBlock.is_error ?? false,
					});
				}
			}
		}

		return {
			type: "UserMessage",
			content: messageContent,
			session_id: userMsg.session_id,
		};
	}

	// Handle system messages (including compaction events)
	if (msgType === "system") {
		const sysMsg = message as any;
		const subtype = sysMsg.subtype;

		// Handle compact boundary message (when compaction occurs)
		if (subtype === "compact_boundary") {
			const compactMeta = sysMsg.compact_metadata;
			const preTokens = compactMeta?.pre_tokens;
			const postTokens = compactMeta?.post_tokens;
			const trigger = compactMeta?.trigger ?? "unknown";

			console.log("\n" + "═".repeat(60));
			console.log("[Context Compaction] Automatic compaction triggered");
			console.log("═".repeat(60));
			console.log(`  Trigger:      ${trigger}`);
			if (preTokens !== undefined) {
				console.log(`  Before:       ${preTokens.toLocaleString()} tokens`);
			}
			if (postTokens !== undefined) {
				console.log(`  After:        ${postTokens.toLocaleString()} tokens`);
				if (preTokens !== undefined && preTokens > 0) {
					const reduction = ((preTokens - postTokens) / preTokens * 100).toFixed(1);
					console.log(`  Reduction:    ${reduction}%`);
				}
			}
			// Log any other metadata fields for debugging
			if (compactMeta) {
				const knownKeys = ["trigger", "pre_tokens", "post_tokens"];
				const otherKeys = Object.keys(compactMeta).filter(k => !knownKeys.includes(k));
				if (otherKeys.length > 0) {
					console.log(`  Other info:   ${JSON.stringify(Object.fromEntries(otherKeys.map(k => [k, compactMeta[k]])))}`);
				}
			}
			console.log("═".repeat(60) + "\n");

			return {
				type: "SystemMessage",
				subtype: "compact_boundary",
				session_id: sysMsg.session_id,
				compact_metadata: compactMeta,
			};
		}

		// Handle status message (compacting status)
		if (subtype === "status") {
			const status = sysMsg.status;
			if (status === "compacting") {
				console.log("\n[Context Compaction] Compacting conversation...");
			}
			return {
				type: "SystemMessage",
				subtype: "status",
				session_id: sysMsg.session_id,
			};
		}

		return {
			type: "SystemMessage",
			subtype,
			session_id: sysMsg.session_id,
		};
	}

	// Handle tool progress messages
	if (msgType === "tool_progress") {
		const progressMsg = message as any;
		return {
			type: "ToolProgressMessage",
			tool_name: progressMsg.tool_name,
			session_id: progressMsg.session_id,
		};
	}

	// Handle stream events (partial messages)
	if (msgType === "stream_event") {
		const streamMsg = message as any;
		const event = streamMsg.event;

		// Handle content block delta (streaming text)
		if (event?.type === "content_block_delta") {
			const delta = event.delta;
			if (delta?.type === "text_delta" && delta.text) {
				return {
					type: "AssistantMessage",
					content: [{ type: "TextBlock", text: delta.text }],
					session_id: streamMsg.session_id,
				};
			}
		}

		// Return minimal message for other stream events
		return {
			type: "StreamEvent",
			subtype: event?.type,
			session_id: streamMsg.session_id,
		};
	}

	// Handle result messages
	if (msgType === "result") {
		const resultMsg = message as SDKResultMessage;
		return {
			type: "ResultMessage",
			usage: {
				input_tokens: resultMsg.usage?.input_tokens ?? 0,
				output_tokens: resultMsg.usage?.output_tokens ?? 0,
				cache_creation_input_tokens:
					resultMsg.usage?.cache_creation_input_tokens ?? 0,
				cache_read_input_tokens: resultMsg.usage?.cache_read_input_tokens ?? 0,
			},
			total_cost_usd: resultMsg.total_cost_usd ?? null,
			duration_ms: resultMsg.duration_ms ?? 0,
			num_turns: resultMsg.num_turns ?? 0,
			session_id: resultMsg.session_id,
		};
	}

	// Default: return as-is with type info
	return {
		type: msgType,
		session_id: (message as any).session_id,
	};
}
