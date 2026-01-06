/**
 * Unit Tests for Output Formatting Utilities
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	formatToolResultOutput,
	formatToolUseOutput,
	sleep,
} from "../utils/formatting.ts";

describe("formatToolUseOutput", () => {
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

	test("formats basic tool use with thinking time", () => {
		formatToolUseOutput("Read", 1.5);

		expect(consoleLogs.some((log) => log.includes("[Tool: Read]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("1.5s thinking"))).toBe(true);
	});

	test("formats tool use with small input", () => {
		formatToolUseOutput("Write", 2.0, { path: "/test.txt", content: "hello" });

		expect(consoleLogs.some((log) => log.includes("[Tool: Write]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Input size:"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Input:"))).toBe(true);
	});

	test("truncates large input", () => {
		const largeInput = { data: "x".repeat(500) };
		formatToolUseOutput("Bash", 0.5, largeInput, 100);

		const inputLog = consoleLogs.find((log) => log.includes("Input:"));
		expect(inputLog).toBeDefined();
		expect(inputLog).toContain("...");
	});

	test("shows input size in bytes", () => {
		formatToolUseOutput("Edit", 1.0, { file: "test.ts" });

		expect(consoleLogs.some((log) => log.includes("Input size:"))).toBe(true);
	});

	test("handles undefined input", () => {
		formatToolUseOutput("Glob", 0.1);

		expect(consoleLogs.some((log) => log.includes("[Tool: Glob]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Input:"))).toBe(false);
	});

	test("formats input size correctly for KB", () => {
		const mediumInput = { data: "x".repeat(2000) };
		formatToolUseOutput("Write", 1.0, mediumInput);

		expect(consoleLogs.some((log) => log.includes("KB"))).toBe(true);
	});
});

describe("formatToolResultOutput", () => {
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

	test("formats successful result", () => {
		formatToolResultOutput("File written successfully", false, 0.5);

		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("0.5s"))).toBe(true);
	});

	test("formats error result", () => {
		formatToolResultOutput("File not found", true, 0.1);

		expect(consoleLogs.some((log) => log.includes("[Error]"))).toBe(true);
	});

	test("formats blocked result", () => {
		formatToolResultOutput("Permission blocked by sandbox", false, 0.2);

		expect(consoleLogs.some((log) => log.includes("[BLOCKED]"))).toBe(true);
	});

	test("truncates long result content for errors", () => {
		const longError = `Error: ${"x".repeat(600)}`;
		formatToolResultOutput(longError, true, 0.1, 100);

		const errorLog = consoleLogs.find((log) => log.includes("[Error]"));
		expect(errorLog).toBeDefined();
		expect(errorLog).toContain("...");
	});

	test("truncates long blocked content", () => {
		const longBlocked = `blocked ${"x".repeat(600)}`;
		formatToolResultOutput(longBlocked, false, 0.1, 100);

		const blockedLog = consoleLogs.find((log) => log.includes("[BLOCKED]"));
		expect(blockedLog).toBeDefined();
		expect(blockedLog).toContain("...");
	});

	test("handles missing execution time", () => {
		formatToolResultOutput("Success", false);

		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("took"))).toBe(false);
	});

	test("shows output size", () => {
		formatToolResultOutput("Some output content", false, 1.0);

		expect(consoleLogs.some((log) => log.includes("Output size:"))).toBe(true);
	});

	test("case insensitive blocked detection", () => {
		formatToolResultOutput("BLOCKED by policy", false);

		expect(consoleLogs.some((log) => log.includes("[BLOCKED]"))).toBe(true);
	});
});

describe("sleep", () => {
	test("sleeps for specified duration", async () => {
		const start = Date.now();
		await sleep(100);
		const elapsed = Date.now() - start;

		// Allow some tolerance for timing
		expect(elapsed).toBeGreaterThanOrEqual(90);
		expect(elapsed).toBeLessThan(200);
	});

	test("resolves without value", async () => {
		const result = await sleep(10);
		expect(result).toBeUndefined();
	});

	test("handles zero duration", async () => {
		const start = Date.now();
		await sleep(0);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(50);
	});
});
