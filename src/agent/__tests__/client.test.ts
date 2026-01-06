/**
 * Unit Tests for SDK Client Utilities
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildSystemPrompt,
	configureAuthentication,
	writeSecuritySettings,
} from "../client.ts";
import type { SecuritySettings } from "../security/index.ts";

// Store original env vars
const originalEnv: Record<string, string | undefined> = {};

function saveEnvVars() {
	originalEnv.CLAUDE_CODE_USE_BEDROCK = process.env.CLAUDE_CODE_USE_BEDROCK;
	originalEnv.AWS_REGION = process.env.AWS_REGION;
	originalEnv.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION;
	originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
}

function restoreEnvVars() {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe("buildSystemPrompt", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));
	});

	afterEach(() => {
		console.log = originalLog;
	});

	test("returns default prompt when no options provided", () => {
		const prompt = buildSystemPrompt({});

		expect(prompt).toContain("expert full-stack developer");
		expect(prompt).toContain("QA engineer");
	});

	test("includes base prompt when provided", () => {
		const prompt = buildSystemPrompt({
			base: "You are a specialized testing agent.",
		});

		expect(prompt).toContain("specialized testing agent");
	});

	test("includes append content when provided", () => {
		const prompt = buildSystemPrompt({
			append: "Additional instructions here.",
		});

		expect(prompt).toContain("Additional instructions here.");
	});

	test("includes skill content when provided", () => {
		const prompt = buildSystemPrompt({
			skillContent: "# Skill Instructions\nDo something special.",
		});

		expect(prompt).toContain("Skill Instructions");
		expect(prompt).toContain("Do something special");
	});

	test("includes context management guidelines", () => {
		const prompt = buildSystemPrompt({});

		expect(prompt).toContain("Context Management");
	});

	test("combines all parts correctly", () => {
		const prompt = buildSystemPrompt({
			base: "Base prompt.",
			append: "Append content.",
			skillContent: "Skill content.",
		});

		expect(prompt).toContain("Base prompt.");
		expect(prompt).toContain("Append content.");
		expect(prompt).toContain("Skill content.");
	});

	test("logs prompt cache information", () => {
		buildSystemPrompt({});

		expect(consoleLogs.some((log) => log.includes("[Prompt Cache]"))).toBe(
			true,
		);
		expect(consoleLogs.some((log) => log.includes("tokens"))).toBe(true);
	});

	test("logs cache eligibility status", () => {
		buildSystemPrompt({});

		expect(consoleLogs.some((log) => log.includes("Cache eligible:"))).toBe(
			true,
		);
	});
});

describe("writeSecuritySettings", () => {
	const testDir = join(tmpdir(), `e2e-client-test-${Date.now()}`);

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("creates directory if not exists", () => {
		const projectDir = join(testDir, "new-project");
		const settings: SecuritySettings = {
			sandbox: {
				enabled: true,
				autoAllowBashIfSandboxed: true,
			},
			permissions: {
				defaultMode: "allow",
				allow: ["Read(./**)"],
			},
		};

		writeSecuritySettings(projectDir, settings);

		expect(existsSync(projectDir)).toBe(true);
	});

	test("writes settings file with correct content", () => {
		mkdirSync(testDir, { recursive: true });
		const settings: SecuritySettings = {
			sandbox: {
				enabled: true,
				autoAllowBashIfSandboxed: true,
			},
			permissions: {
				defaultMode: "allow",
				allow: ["Read(./**)", "Write(./**)"],
			},
		};

		const filePath = writeSecuritySettings(testDir, settings);

		expect(existsSync(filePath)).toBe(true);
		expect(filePath).toContain(".claude_settings.json");

		const content = JSON.parse(readFileSync(filePath, "utf-8"));
		expect(content.sandbox.enabled).toBe(true);
		expect(content.permissions.allow).toContain("Read(./**)");
	});

	test("returns correct file path", () => {
		mkdirSync(testDir, { recursive: true });
		const settings: SecuritySettings = {
			sandbox: { enabled: true, autoAllowBashIfSandboxed: false },
			permissions: { defaultMode: "deny", allow: [] },
		};

		const filePath = writeSecuritySettings(testDir, settings);

		expect(filePath).toBe(join(testDir, ".claude_settings.json"));
	});

	test("overwrites existing settings file", () => {
		mkdirSync(testDir, { recursive: true });

		const settings1: SecuritySettings = {
			sandbox: { enabled: true, autoAllowBashIfSandboxed: true },
			permissions: { defaultMode: "allow", allow: ["Read(./**)"] },
		};
		writeSecuritySettings(testDir, settings1);

		const settings2: SecuritySettings = {
			sandbox: { enabled: false, autoAllowBashIfSandboxed: false },
			permissions: { defaultMode: "deny", allow: [] },
		};
		writeSecuritySettings(testDir, settings2);

		const filePath = join(testDir, ".claude_settings.json");
		const content = JSON.parse(readFileSync(filePath, "utf-8"));
		expect(content.sandbox.enabled).toBe(false);
	});
});

describe("configureAuthentication", () => {
	beforeEach(() => {
		saveEnvVars();
	});

	afterEach(() => {
		restoreEnvVars();
	});

	test("returns Anthropic config when API key is set", async () => {
		delete process.env.CLAUDE_CODE_USE_BEDROCK;
		process.env.ANTHROPIC_API_KEY = "test-api-key";

		const config = await configureAuthentication();

		expect(config.useBedrock).toBe(false);
		expect(config.awsRegion).toBeNull();
		expect(Object.keys(config.envVars).length).toBe(0);
	});

	test("throws when no API key and not using Bedrock", async () => {
		delete process.env.CLAUDE_CODE_USE_BEDROCK;
		delete process.env.ANTHROPIC_API_KEY;

		await expect(configureAuthentication()).rejects.toThrow(
			"ANTHROPIC_API_KEY",
		);
	});

	test("throws when using Bedrock without region", async () => {
		process.env.CLAUDE_CODE_USE_BEDROCK = "1";
		delete process.env.AWS_REGION;
		delete process.env.AWS_DEFAULT_REGION;

		await expect(configureAuthentication()).rejects.toThrow("AWS_REGION");
	});

	test("uses AWS_DEFAULT_REGION as fallback", async () => {
		process.env.CLAUDE_CODE_USE_BEDROCK = "1";
		delete process.env.AWS_REGION;
		process.env.AWS_DEFAULT_REGION = "eu-west-1";

		// This will fail on credential validation, but should not fail on region
		try {
			await configureAuthentication();
		} catch (error) {
			// Should fail on credentials, not region
			expect(String(error)).not.toContain("AWS_REGION");
		}
	});
});

describe("configureAuthentication - Environment Variables", () => {
	beforeEach(() => {
		saveEnvVars();
	});

	afterEach(() => {
		restoreEnvVars();
	});

	test("Anthropic mode does not set environment variables", async () => {
		delete process.env.CLAUDE_CODE_USE_BEDROCK;
		process.env.ANTHROPIC_API_KEY = "test-key";

		const config = await configureAuthentication();

		expect(config.envVars).toEqual({});
	});
});

describe("AuthConfig Type", () => {
	test("Anthropic config has correct structure", async () => {
		saveEnvVars();
		delete process.env.CLAUDE_CODE_USE_BEDROCK;
		process.env.ANTHROPIC_API_KEY = "test-key";

		const config = await configureAuthentication();

		expect(typeof config.useBedrock).toBe("boolean");
		expect(config.awsRegion === null || typeof config.awsRegion === "string").toBe(true);
		expect(typeof config.envVars).toBe("object");

		restoreEnvVars();
	});
});
