/**
 * Security Module
 * ================
 *
 * Re-exports all security configuration components.
 */

// Hooks configuration
export {
	CONTEXT_MANAGEMENT_PROMPT,
	createContextManagementHooks,
	type HookDecision,
	type HookMatcher,
	type HookOutput,
	MAX_SNAPSHOT_LENGTH,
	MAX_TOOL_OUTPUT_LENGTH,
	type PostToolUseHookInput,
	type PreCompactHookInput,
	preCompactHandler,
	TRUNCATION_NOTICE,
	truncateLargeToolOutput,
} from "./hooks.ts";

// MCP servers configuration
export {
	CHROME_EXECUTABLE_PATH,
	type ChromeDevtoolsOptions,
	createCustomMcpServer,
	DEFAULT_CHROME_ARGS,
	getChromeDevtoolsConfig,
	getDefaultMcpServers,
	type McpServerConfig,
} from "./mcp-servers.ts";
// Tools configuration
export {
	BUILTIN_TOOLS,
	type BuiltinTool,
	CHROME_DEVTOOLS_TOOLS,
	type ChromeDevtoolsTool,
	createSecuritySettings,
	getAllAllowedTools,
	getBuiltinTools,
	getChromeDevtoolsTools,
	getDefaultPermissions,
	getSkillTools,
	type SecuritySettings,
	SKILL_TOOLS,
	type SkillTool,
} from "./tools.ts";
