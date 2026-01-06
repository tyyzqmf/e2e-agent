/**
 * Unit Tests for Security Configuration
 */

import { describe, expect, test } from "bun:test";
import {
	CONTEXT_MANAGEMENT_PROMPT,
	createContextManagementHooks,
	MAX_SNAPSHOT_LENGTH,
	MAX_TOOL_OUTPUT_LENGTH,
	preCompactHandler,
	truncateLargeToolOutput,
} from "../security/hooks.ts";
import {
	CHROME_EXECUTABLE_PATH,
	createCustomMcpServer,
	DEFAULT_CHROME_ARGS,
	getChromeDevtoolsConfig,
	getDefaultMcpServers,
} from "../security/mcp-servers.ts";
import {
	BUILTIN_TOOLS,
	CHROME_DEVTOOLS_TOOLS,
	createSecuritySettings,
	getAllAllowedTools,
	getBuiltinTools,
	getChromeDevtoolsTools,
	getDefaultPermissions,
	getSkillTools,
	SKILL_TOOLS,
} from "../security/tools.ts";

describe("Tools Configuration", () => {
	test("BUILTIN_TOOLS contains expected tools", () => {
		expect(BUILTIN_TOOLS).toContain("Read");
		expect(BUILTIN_TOOLS).toContain("Write");
		expect(BUILTIN_TOOLS).toContain("Edit");
		expect(BUILTIN_TOOLS).toContain("Glob");
		expect(BUILTIN_TOOLS).toContain("Grep");
		expect(BUILTIN_TOOLS).toContain("Bash");
	});

	test("CHROME_DEVTOOLS_TOOLS contains expected tools", () => {
		expect(CHROME_DEVTOOLS_TOOLS).toContain(
			"mcp__chrome-devtools__navigate_page",
		);
		expect(CHROME_DEVTOOLS_TOOLS).toContain(
			"mcp__chrome-devtools__take_screenshot",
		);
		expect(CHROME_DEVTOOLS_TOOLS).toContain("mcp__chrome-devtools__click");
		expect(CHROME_DEVTOOLS_TOOLS).toContain("mcp__chrome-devtools__fill");
	});

	test("SKILL_TOOLS contains Skill tool", () => {
		expect(SKILL_TOOLS).toContain("Skill");
	});

	test("getBuiltinTools returns copy of array", () => {
		const tools = getBuiltinTools();
		expect(tools).toEqual([...BUILTIN_TOOLS]);
		// Modifying returned array shouldn't affect original
		tools.push("NewTool");
		expect(BUILTIN_TOOLS).not.toContain("NewTool");
	});

	test("getChromeDevtoolsTools returns copy of array", () => {
		const tools = getChromeDevtoolsTools();
		expect(tools.length).toBe(CHROME_DEVTOOLS_TOOLS.length);
	});

	test("getSkillTools returns copy of array", () => {
		const tools = getSkillTools();
		expect(tools).toEqual([...SKILL_TOOLS]);
	});

	test("getAllAllowedTools combines all tools", () => {
		const allTools = getAllAllowedTools();

		expect(allTools.length).toBe(
			BUILTIN_TOOLS.length + CHROME_DEVTOOLS_TOOLS.length + SKILL_TOOLS.length,
		);

		// Check that all tools are included
		for (const tool of BUILTIN_TOOLS) {
			expect(allTools).toContain(tool);
		}
		for (const tool of CHROME_DEVTOOLS_TOOLS) {
			expect(allTools).toContain(tool);
		}
		for (const tool of SKILL_TOOLS) {
			expect(allTools).toContain(tool);
		}
	});

	test("getDefaultPermissions returns correct permissions", () => {
		const permissions = getDefaultPermissions();

		expect(permissions).toContain("Read(./**)");
		expect(permissions).toContain("Write(./**)");
		expect(permissions).toContain("Edit(./**)");
		expect(permissions).toContain("Glob(./**)");
		expect(permissions).toContain("Grep(./**)");
		expect(permissions).toContain("Bash(*)");
		expect(permissions).toContain("mcp__chrome-devtools__navigate_page");
	});

	test("createSecuritySettings returns correct structure", () => {
		const settings = createSecuritySettings("/test/project");

		expect(settings.sandbox.enabled).toBe(true);
		expect(settings.sandbox.autoAllowBashIfSandboxed).toBe(true);
		expect(settings.permissions.defaultMode).toBe("allow");
		expect(Array.isArray(settings.permissions.allow)).toBe(true);
	});
});

describe("MCP Servers Configuration", () => {
	test("CHROME_EXECUTABLE_PATH is defined", () => {
		expect(CHROME_EXECUTABLE_PATH).toBe("/usr/bin/google-chrome");
	});

	test("DEFAULT_CHROME_ARGS contains security flags", () => {
		expect(DEFAULT_CHROME_ARGS).toContain("--no-sandbox");
		expect(DEFAULT_CHROME_ARGS).toContain("--disable-setuid-sandbox");
		expect(DEFAULT_CHROME_ARGS).toContain("--disable-dev-shm-usage");
		expect(DEFAULT_CHROME_ARGS).toContain("--disable-gpu");
	});

	test("getChromeDevtoolsConfig returns correct default config", () => {
		const config = getChromeDevtoolsConfig();

		expect(config.command).toBe("npx");
		expect(config.args).toContain("-y");
		expect(config.args).toContain("chrome-devtools-mcp@latest");
		expect(config.args).toContain("--headless");
		expect(config.args).toContain("--isolated=true");
		expect(config.args.some((arg) => arg.includes("--executablePath"))).toBe(
			true,
		);
	});

	test("getChromeDevtoolsConfig respects options", () => {
		const config = getChromeDevtoolsConfig({
			headless: false,
			isolated: false,
			executablePath: "/custom/chrome",
			extraChromeArgs: ["--custom-arg"],
		});

		expect(config.args).not.toContain("--headless");
		expect(config.args).not.toContain("--isolated=true");
		expect(config.args).toContain("--executablePath=/custom/chrome");
		expect(config.args).toContain("--chromeArg=--custom-arg");
	});

	test("getDefaultMcpServers returns chrome-devtools server", () => {
		const servers = getDefaultMcpServers();

		expect(servers["chrome-devtools"]).toBeDefined();
		expect(servers["chrome-devtools"].command).toBe("npx");
	});

	test("getDefaultMcpServers can exclude chrome-devtools", () => {
		const servers = getDefaultMcpServers({ includeChromeDevtools: false });

		expect(servers["chrome-devtools"]).toBeUndefined();
	});

	test("createCustomMcpServer creates correct config", () => {
		const server = createCustomMcpServer("node", ["server.js"], {
			API_KEY: "test",
		});

		expect(server.command).toBe("node");
		expect(server.args).toEqual(["server.js"]);
		expect(server.env).toEqual({ API_KEY: "test" });
	});
});

describe("Hooks Configuration", () => {
	test("constants are defined correctly", () => {
		expect(MAX_SNAPSHOT_LENGTH).toBe(50000);
		expect(MAX_TOOL_OUTPUT_LENGTH).toBe(100000);
		expect(CONTEXT_MANAGEMENT_PROMPT).toContain(
			"Context Management Guidelines",
		);
	});

	test("truncateLargeToolOutput approves small content", async () => {
		const result = await truncateLargeToolOutput({
			toolName: "mcp__chrome-devtools__take_screenshot",
			toolResult: { content: "small content" },
		});

		expect(result.decision).toBe("approve");
		expect(result.outputToUser).toBeUndefined();
	});

	test("truncateLargeToolOutput handles large snapshot content", async () => {
		const largeContent = "x".repeat(MAX_SNAPSHOT_LENGTH + 1000);
		const result = await truncateLargeToolOutput({
			toolName: "mcp__chrome-devtools__take_snapshot",
			toolResult: { content: largeContent },
		});

		expect(result.decision).toBe("approve");
		expect(result.outputToUser).toContain("Truncated");
	});

	test("preCompactHandler returns custom instructions", async () => {
		const result = await preCompactHandler({
			trigger: "context_limit",
			sessionId: "test-session",
		});

		expect(result.decision).toBe("approve");
		expect(result.customInstructions).toContain("compacting context");
	});

	test("createContextManagementHooks returns correct structure", () => {
		const hooks = createContextManagementHooks();

		expect(hooks.PostToolUse).toBeDefined();
		expect(hooks.PreCompact).toBeDefined();
		expect(hooks.PostToolUse.length).toBe(1);
		expect(hooks.PreCompact.length).toBe(1);
		expect(hooks.PostToolUse[0].matcher).toBe("mcp__chrome-devtools__*");
	});
});
