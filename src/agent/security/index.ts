/**
 * Security Module
 * ================
 *
 * Re-exports all security configuration components.
 */

// Tools configuration
export {
  BUILTIN_TOOLS,
  CHROME_DEVTOOLS_TOOLS,
  SKILL_TOOLS,
  type BuiltinTool,
  type ChromeDevtoolsTool,
  type SkillTool,
  type SecuritySettings,
  getBuiltinTools,
  getChromeDevtoolsTools,
  getSkillTools,
  getAllAllowedTools,
  getDefaultPermissions,
  createSecuritySettings,
} from "./tools.ts";

// MCP servers configuration
export {
  CHROME_EXECUTABLE_PATH,
  DEFAULT_CHROME_ARGS,
  type McpServerConfig,
  type ChromeDevtoolsOptions,
  getChromeDevtoolsConfig,
  getDefaultMcpServers,
  createCustomMcpServer,
} from "./mcp-servers.ts";

// Hooks configuration
export {
  MAX_SNAPSHOT_LENGTH,
  MAX_TOOL_OUTPUT_LENGTH,
  TRUNCATION_NOTICE,
  CONTEXT_MANAGEMENT_PROMPT,
  type HookDecision,
  type PostToolUseHookInput,
  type PreCompactHookInput,
  type HookOutput,
  type HookMatcher,
  truncateLargeToolOutput,
  preCompactHandler,
  createContextManagementHooks,
} from "./hooks.ts";
