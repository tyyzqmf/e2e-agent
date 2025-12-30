/**
 * Tools Configuration
 * ====================
 *
 * Configuration for Claude Code built-in tools and permissions.
 */

/**
 * Built-in tools available to Claude
 */
export const BUILTIN_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"Glob",
	"Grep",
	"Bash",
] as const;

export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];

/**
 * Chrome DevTools MCP tools for browser automation
 */
export const CHROME_DEVTOOLS_TOOLS = [
	"mcp__chrome-devtools__navigate_page",
	"mcp__chrome-devtools__take_screenshot",
	"mcp__chrome-devtools__take_snapshot",
	"mcp__chrome-devtools__click",
	"mcp__chrome-devtools__fill",
	"mcp__chrome-devtools__fill_form",
	"mcp__chrome-devtools__wait_for",
	"mcp__chrome-devtools__list_network_requests",
	"mcp__chrome-devtools__get_network_request",
	"mcp__chrome-devtools__list_console_messages",
	"mcp__chrome-devtools__get_console_message",
	"mcp__chrome-devtools__list_pages",
	"mcp__chrome-devtools__new_page",
	"mcp__chrome-devtools__select_page",
	"mcp__chrome-devtools__close_page",
	"mcp__chrome-devtools__resize_page",
	"mcp__chrome-devtools__hover",
	"mcp__chrome-devtools__drag",
	"mcp__chrome-devtools__press_key",
	"mcp__chrome-devtools__handle_dialog",
	"mcp__chrome-devtools__evaluate_script",
	"mcp__chrome-devtools__emulate",
	"mcp__chrome-devtools__upload_file",
] as const;

export type ChromeDevtoolsTool = (typeof CHROME_DEVTOOLS_TOOLS)[number];

/**
 * Additional tools for skills support
 */
export const SKILL_TOOLS = ["Skill"] as const;

export type SkillTool = (typeof SKILL_TOOLS)[number];

/**
 * Get the list of built-in tools
 */
export function getBuiltinTools(): string[] {
	return [...BUILTIN_TOOLS];
}

/**
 * Get the list of Chrome DevTools MCP tools
 */
export function getChromeDevtoolsTools(): string[] {
	return [...CHROME_DEVTOOLS_TOOLS];
}

/**
 * Get the list of skill-related tools
 */
export function getSkillTools(): string[] {
	return [...SKILL_TOOLS];
}

/**
 * Get all tools that should be allowed by default
 */
export function getAllAllowedTools(): string[] {
	return [...BUILTIN_TOOLS, ...CHROME_DEVTOOLS_TOOLS, ...SKILL_TOOLS];
}

/**
 * Get default permission rules for the security settings
 *
 * @param chromeDevtoolsTools - Optional list of Chrome DevTools tools to include
 * @returns List of permission rules
 */
export function getDefaultPermissions(
	chromeDevtoolsTools: readonly string[] = CHROME_DEVTOOLS_TOOLS,
): string[] {
	return [
		// Allow all file operations within the project directory
		"Read(./**)",
		"Write(./**)",
		"Edit(./**)",
		"Glob(./**)",
		"Grep(./**)",
		// Bash permission
		"Bash(*)",
		// Chrome DevTools MCP tools for browser automation
		...chromeDevtoolsTools,
	];
}

/**
 * Security settings structure for .claude_settings.json
 */
export interface SecuritySettings {
	sandbox: {
		enabled: boolean;
		autoAllowBashIfSandboxed: boolean;
	};
	permissions: {
		defaultMode: "allow" | "deny";
		allow: string[];
	};
}

/**
 * Create comprehensive security settings for the Claude SDK client
 *
 * @param _projectDir - Project directory path (unused but kept for API consistency)
 * @returns Security settings object
 */
export function createSecuritySettings(_projectDir: string): SecuritySettings {
	return {
		sandbox: {
			enabled: true,
			autoAllowBashIfSandboxed: true,
		},
		permissions: {
			defaultMode: "allow",
			allow: getDefaultPermissions(CHROME_DEVTOOLS_TOOLS),
		},
	};
}
