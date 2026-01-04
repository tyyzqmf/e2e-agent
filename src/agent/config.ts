/**
 * Agent Configuration
 * ====================
 *
 * Configuration constants and utilities for the autonomous testing agent.
 */

import { dirname, join } from "node:path";

// Get the directory where this module is located
const MODULE_DIR = dirname(new URL(import.meta.url).pathname);

/**
 * Default model to use for the agent
 * This is an inference profile ID for AWS Bedrock
 */
export const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

/**
 * Default project directory name
 */
export const DEFAULT_PROJECT_DIR = "autonomous_test_project";

/**
 * Directory for generated test projects
 */
export const GENERATIONS_DIR = "generations";

/**
 * Settings filename for security configuration
 */
export const SETTINGS_FILENAME = ".claude_settings.json";

/**
 * Environment variable values that enable AWS Bedrock
 */
export const BEDROCK_ENV_VALUES = ["true", "1", "yes"] as const;

/**
 * Maximum number of agent turns per session
 * With 1M context window enabled, we can handle more turns
 */
export const MAX_TURNS = 100;

/**
 * Auto-continue delay between sessions (milliseconds)
 */
export const AUTO_CONTINUE_DELAY_MS = 3000;

// ====================================
// Context Window Configuration
// ====================================

/**
 * Context window sizes for different models (in tokens)
 */
export const CONTEXT_WINDOW = {
	/** Default context window (200K) */
	DEFAULT: 200_000,
	/** Extended context window with 1M beta */
	EXTENDED_1M: 1_000_000,
} as const;

/**
 * Context compression threshold percentage (display only)
 *
 * NOTE: The Claude Agent SDK handles compaction automatically when context
 * usage exceeds ~85-90% of the context window. This value is only used for
 * display purposes and token monitoring warnings.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/context-editing
 */
export const CONTEXT_COMPRESSION_THRESHOLD = 0.85;

/**
 * Whether to enable the 1M context window beta
 * When true, uses 'context-1m-2025-08-07' beta for extended context
 */
export const ENABLE_1M_CONTEXT = false;

// ====================================
// Prompt Caching Configuration
// ====================================

/**
 * Enable prompt caching to reduce costs
 * Caches system prompt and stable context for reuse across turns
 */
export const ENABLE_PROMPT_CACHING = true;

/**
 * Isolate cache per session to prevent cross-session cache accumulation
 *
 * When enabled, adds a unique session ID to the system prompt prefix,
 * ensuring each session starts with a fresh cache and avoiding the
 * "Input is too long" error caused by accumulated cache_read tokens.
 *
 * Trade-off:
 * - Enabled (true): Prevents context overflow, but loses cache cost savings between sessions
 * - Disabled (false): Better cost efficiency within 5-min TTL, but risks context overflow
 *
 * Recommended: Enable for long-running multi-session tasks
 */
export const ISOLATE_SESSION_CACHE = true;

/**
 * Minimum tokens required for caching (Anthropic requirement)
 * System prompt must be at least this many tokens to benefit from caching
 */
export const MIN_CACHEABLE_TOKENS = 1024;

/**
 * Cache TTL in seconds (5 minutes default for Anthropic)
 * Cached prompts are reused within this time window
 */
export const CACHE_TTL_SECONDS = 300;

/**
 * Prompt caching cost savings estimate
 * - Cache write: 25% more expensive than base input
 * - Cache read: 90% cheaper than base input
 * Break-even after ~2 cache hits
 */
export const CACHE_COST_MULTIPLIERS = {
	/** Cache creation cost multiplier (1.25x base input cost) */
	WRITE: 1.25,
	/** Cache read cost multiplier (0.1x base input cost) */
	READ: 0.1,
} as const;

/**
 * Default system prompt for the agent
 */
export const DEFAULT_SYSTEM_PROMPT =
	"You are an expert full-stack developer and QA engineer " +
	"with deep expertise in end-to-end testing.";

/**
 * Agent paths configuration
 */
export const AGENT_PATHS = {
	/** Root directory of the agent module */
	moduleDir: MODULE_DIR,
	/** Prompts directory */
	promptsDir: join(MODULE_DIR, "prompts"),
	/** Templates directory */
	templatesDir: join(MODULE_DIR, "templates"),
	/** Utils directory */
	utilsDir: join(MODULE_DIR, "utils"),
	/** Plugins directory */
	pluginsDir: join(MODULE_DIR, "plugins"),
	/** Project root (parent of src/) */
	projectRoot: join(MODULE_DIR, "..", ".."),
} as const;

/**
 * Agent options interface
 */
export interface AgentOptions {
	/** Directory for the testing project */
	projectDir: string;
	/** Claude model to use */
	model?: string;
	/** Maximum number of iterations (null for unlimited) */
	maxIterations?: number | null;
}

/**
 * Client configuration options
 */
export interface ClientOptions {
	/** Directory for the project */
	projectDir: string;
	/** Claude model to use */
	model: string;
	/** Custom system prompt (replaces default) */
	systemPrompt?: string;
	/** Text to append to the system prompt */
	appendSystemPrompt?: string;
	/** List of skill names to load */
	skills?: string[];
	/** Additional plugin directories */
	pluginDirs?: string[];
	/** Skill content (SKILL.md) to embed in system prompt */
	skillContent?: string;
	/** Whether to load default skills (default: true) */
	loadDefaultSkills?: boolean;
	/** Session ID to resume (for session continuity) */
	resumeSessionId?: string;
}

/**
 * Check if a value indicates AWS Bedrock should be used
 */
export function isBedrockEnabled(value: string | undefined): boolean {
	if (!value) return false;
	return BEDROCK_ENV_VALUES.includes(
		value.toLowerCase() as (typeof BEDROCK_ENV_VALUES)[number],
	);
}

/**
 * Normalize project directory path.
 * Places relative paths under generations/ directory.
 *
 * @param projectDir - Input project directory path
 * @returns Normalized path
 */
export function normalizeProjectPath(projectDir: string): string {
	// If already under generations/ or is absolute, use as-is
	if (
		projectDir.startsWith(`${GENERATIONS_DIR}/`) ||
		projectDir.startsWith("/")
	) {
		return projectDir;
	}

	// Place relative paths under generations/
	return join(GENERATIONS_DIR, projectDir);
}
