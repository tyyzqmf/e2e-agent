/**
 * Unit Tests for Agent Configuration
 */

import { describe, expect, test } from "bun:test";
import {
	AGENT_PATHS,
	AUTO_CONTINUE_DELAY_MS,
	DEFAULT_MODEL,
	DEFAULT_PROJECT_DIR,
	DEFAULT_SYSTEM_PROMPT,
	GENERATIONS_DIR,
	MAX_TURNS,
	normalizeProjectPath,
	SETTINGS_FILENAME,
} from "../config.ts";

describe("Agent Configuration Constants", () => {
	test("DEFAULT_MODEL is defined", () => {
		expect(DEFAULT_MODEL).toBeDefined();
		expect(DEFAULT_MODEL).toContain("claude");
	});

	test("DEFAULT_PROJECT_DIR is defined", () => {
		expect(DEFAULT_PROJECT_DIR).toBe("autonomous_test_project");
	});

	test("GENERATIONS_DIR is defined", () => {
		expect(GENERATIONS_DIR).toBe("generations");
	});

	test("SETTINGS_FILENAME is defined", () => {
		expect(SETTINGS_FILENAME).toBe(".claude_settings.json");
	});

	test("MAX_TURNS is a reasonable number", () => {
		expect(MAX_TURNS).toBeGreaterThan(0);
		expect(MAX_TURNS).toBeLessThanOrEqual(200);
	});

	test("AUTO_CONTINUE_DELAY_MS is defined", () => {
		expect(AUTO_CONTINUE_DELAY_MS).toBeGreaterThan(0);
		expect(AUTO_CONTINUE_DELAY_MS).toBe(3000);
	});

	test("DEFAULT_SYSTEM_PROMPT is defined", () => {
		expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
		expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
		expect(DEFAULT_SYSTEM_PROMPT).toContain("developer");
	});

	test("AGENT_PATHS contains required paths", () => {
		expect(AGENT_PATHS.moduleDir).toBeDefined();
		expect(AGENT_PATHS.promptsDir).toBeDefined();
		expect(AGENT_PATHS.templatesDir).toBeDefined();
		expect(AGENT_PATHS.utilsDir).toBeDefined();
		expect(AGENT_PATHS.pluginsDir).toBeDefined();
		expect(AGENT_PATHS.projectRoot).toBeDefined();
	});

	test("AGENT_PATHS paths are consistent", () => {
		expect(AGENT_PATHS.promptsDir).toContain(AGENT_PATHS.moduleDir);
		expect(AGENT_PATHS.templatesDir).toContain(AGENT_PATHS.moduleDir);
		expect(AGENT_PATHS.utilsDir).toContain(AGENT_PATHS.moduleDir);
		expect(AGENT_PATHS.pluginsDir).toContain(AGENT_PATHS.moduleDir);
	});
});

describe("normalizeProjectPath", () => {
	test("preserves absolute paths", () => {
		expect(normalizeProjectPath("/absolute/path")).toBe("/absolute/path");
		expect(normalizeProjectPath("/home/user/project")).toBe(
			"/home/user/project",
		);
	});

	test("preserves paths already under generations/", () => {
		expect(normalizeProjectPath("generations/my-project")).toBe(
			"generations/my-project",
		);
		expect(normalizeProjectPath("generations/nested/path")).toBe(
			"generations/nested/path",
		);
	});

	test("adds generations/ prefix to relative paths", () => {
		expect(normalizeProjectPath("my-project")).toBe("generations/my-project");
		expect(normalizeProjectPath("test")).toBe("generations/test");
	});

	test("handles nested relative paths", () => {
		expect(normalizeProjectPath("nested/path")).toBe("generations/nested/path");
	});
});
