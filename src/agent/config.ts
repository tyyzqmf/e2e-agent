/**
 * Agent Configuration
 * ====================
 *
 * Configuration constants and utilities for the autonomous testing agent.
 */

import { dirname, join } from "path";

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
}

/**
 * Check if a value indicates AWS Bedrock should be used
 */
export function isBedrockEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return BEDROCK_ENV_VALUES.includes(
    value.toLowerCase() as (typeof BEDROCK_ENV_VALUES)[number]
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
