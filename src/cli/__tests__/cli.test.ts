/**
 * E2E CLI - Test Suite
 *
 * Tests for the Bun-based CLI commands.
 * Note: Python is no longer required - the agent runs on TypeScript/Bun.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import {
	checkBun,
	checkNode,
	checkNpx,
	getBunVersion,
	getNodeVersion,
} from "../env-check.ts";
import { getTimestamp, validatePid } from "../utils.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..", "..");
const CLI_PATH = join(PROJECT_ROOT, "e2e.ts");

describe("E2E CLI", () => {
	describe("help command", () => {
		test("displays help message", async () => {
			const result = await $`bun run ${CLI_PATH} help`.quiet().text();

			expect(result).toContain("E2E Testing Framework CLI");
			expect(result).toContain("Usage: e2e <command>");
			expect(result).toContain("Commands:");
			expect(result).toContain("start");
			expect(result).toContain("stop");
			expect(result).toContain("job");
			expect(result).toContain("status");
		});

		test("-h flag displays help", async () => {
			const result = await $`bun run ${CLI_PATH} -h`.quiet().text();
			expect(result).toContain("E2E Testing Framework CLI");
		});

		test("--help flag displays help", async () => {
			const result = await $`bun run ${CLI_PATH} --help`.quiet().text();
			expect(result).toContain("E2E Testing Framework CLI");
		});
	});

	describe("check command", () => {
		test("checks environment requirements", async () => {
			const result = await $`bun run ${CLI_PATH} check`.quiet().nothrow();

			// Should succeed (exit code 0)
			expect(result.exitCode).toBe(0);

			const output = result.stdout.toString();
			expect(output).toContain("Environment Requirements Check");
			expect(output).toContain("Node.js:");
			expect(output).toContain("Chrome/Chromium:");
			expect(output).toContain("Bun:");
		});
	});

	describe("status command", () => {
		test("shows service status", async () => {
			const result = await $`bun run ${CLI_PATH} status`.quiet().text();

			expect(result).toContain("E2E Testing Services Status");
			expect(result).toContain("Executor:");
			expect(result).toContain("Web Service (Bun):");
		});
	});

	describe("job commands", () => {
		test("job list shows jobs", async () => {
			const result = await $`bun run ${CLI_PATH} job list`.quiet().nothrow();

			// Should succeed even if no jobs exist
			expect(result.exitCode).toBe(0);
		});

		test("job without action shows error", async () => {
			const result = await $`bun run ${CLI_PATH} job`.quiet().nothrow();

			expect(result.exitCode).toBe(1);
		});

		test("job status without id shows error", async () => {
			const result = await $`bun run ${CLI_PATH} job status`.quiet().nothrow();

			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toContain("Usage:");
		});

		test("job delete without id shows error", async () => {
			const result = await $`bun run ${CLI_PATH} job delete`.quiet().nothrow();

			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toContain("Usage:");
		});

		test("job delete with non-existent id shows error", async () => {
			const result = await $`bun run ${CLI_PATH} job delete non-existent-job-id`
				.quiet()
				.nothrow();

			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toContain("not found");
		});
	});

	describe("unknown command", () => {
		test("shows error for unknown command", async () => {
			const result = await $`bun run ${CLI_PATH} unknown-command`
				.quiet()
				.nothrow();

			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toContain("Unknown command");
		});
	});
});

describe("E2E CLI Utils", () => {
	describe("validatePid", () => {
		test("returns true for valid PIDs", () => {
			expect(validatePid(1)).toBe(true);
			expect(validatePid(12345)).toBe(true);
			expect(validatePid("1234")).toBe(true);
		});

		test("returns false for invalid PIDs", () => {
			expect(validatePid(0)).toBe(false);
			expect(validatePid(-1)).toBe(false);
			expect(validatePid("abc")).toBe(false);
			expect(validatePid(1.5)).toBe(false);
		});
	});

	describe("getTimestamp", () => {
		test("returns formatted timestamp", () => {
			const timestamp = getTimestamp();

			// Format: YYYYMMDD_HHMMSS (15 chars)
			expect(timestamp).toMatch(/^\d{8}_\d{6}$/);
		});
	});
});

describe("E2E CLI Environment Check", () => {
	test("checkNode returns boolean", async () => {
		const result = await checkNode();
		expect(typeof result).toBe("boolean");
	});

	test("checkNpx returns boolean", async () => {
		const result = await checkNpx();
		expect(typeof result).toBe("boolean");
	});

	test("checkBun returns true (running in Bun)", () => {
		expect(checkBun()).toBe(true);
	});

	test("getNodeVersion returns version string", async () => {
		const version = await getNodeVersion();
		expect(typeof version).toBe("string");
		expect(version.length).toBeGreaterThan(0);
	});

	test("getBunVersion returns version string", () => {
		const version = getBunVersion();
		expect(typeof version).toBe("string");
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});
