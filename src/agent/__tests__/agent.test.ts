/**
 * Unit Tests for Autonomous Testing Agent
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatDuration,
	formatTokenCount,
	updateHtmlReportCosts,
} from "../agent.ts";

describe("formatDuration", () => {
	test("formats seconds only when under 1 minute", () => {
		expect(formatDuration(0)).toBe("0s");
		expect(formatDuration(1000)).toBe("1s");
		expect(formatDuration(30000)).toBe("30s");
		expect(formatDuration(59000)).toBe("59s");
	});

	test("formats minutes and seconds when 1 minute or more", () => {
		expect(formatDuration(60000)).toBe("1m 0s");
		expect(formatDuration(90000)).toBe("1m 30s");
		expect(formatDuration(120000)).toBe("2m 0s");
		expect(formatDuration(362000)).toBe("6m 2s");
	});

	test("handles large durations", () => {
		expect(formatDuration(3600000)).toBe("60m 0s"); // 1 hour
		expect(formatDuration(3661000)).toBe("61m 1s"); // 1 hour 1 min 1 sec
	});

	test("rounds down milliseconds", () => {
		expect(formatDuration(1500)).toBe("1s"); // 1.5s -> 1s
		expect(formatDuration(61999)).toBe("1m 1s"); // 61.999s -> 1m 1s
	});

	test("handles zero", () => {
		expect(formatDuration(0)).toBe("0s");
	});
});

describe("formatTokenCount", () => {
	test("formats small counts as raw numbers", () => {
		expect(formatTokenCount(0)).toBe("0");
		expect(formatTokenCount(100)).toBe("100");
		expect(formatTokenCount(999)).toBe("999");
	});

	test("formats thousands as K", () => {
		expect(formatTokenCount(1000)).toBe("1K");
		expect(formatTokenCount(1500)).toBe("2K"); // Rounds to nearest
		expect(formatTokenCount(50000)).toBe("50K");
		expect(formatTokenCount(999999)).toBe("1000K");
	});

	test("formats millions as M with 2 decimal places", () => {
		expect(formatTokenCount(1000000)).toBe("1.00M");
		expect(formatTokenCount(1340000)).toBe("1.34M");
		expect(formatTokenCount(10500000)).toBe("10.50M");
	});

	test("handles boundary values", () => {
		expect(formatTokenCount(999)).toBe("999");
		expect(formatTokenCount(1000)).toBe("1K");
		expect(formatTokenCount(999999)).toBe("1000K");
		expect(formatTokenCount(1000000)).toBe("1.00M");
	});
});

describe("updateHtmlReportCosts", () => {
	const testDir = join(tmpdir(), `e2e-agent-test-${Date.now()}`);
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));
	});

	afterEach(() => {
		console.log = originalLog;
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("warns when usage_statistics.json not found", async () => {
		await updateHtmlReportCosts(testDir);

		expect(
			consoleLogs.some((log) =>
				log.includes("usage_statistics.json not found"),
			),
		).toBe(true);
	});

	test("warns when test-reports directory not found", async () => {
		// Create usage stats but no test-reports
		const usageStats = {
			summary: { totalCostUsd: 1.5, totalTokens: 50000, totalSessions: 3 },
			sessions: [{ durationMs: 60000 }],
		};
		writeFileSync(
			join(testDir, "usage_statistics.json"),
			JSON.stringify(usageStats),
			"utf-8",
		);

		await updateHtmlReportCosts(testDir);

		expect(
			consoleLogs.some((log) =>
				log.includes("test-reports directory not found"),
			),
		).toBe(true);
	});

	test("warns when Test_Report_Viewer.html not found", async () => {
		// Create usage stats and test-reports directory without HTML file (flat structure)
		const usageStats = {
			summary: { totalCostUsd: 1.5, totalTokens: 50000, totalSessions: 3 },
			sessions: [{ durationMs: 60000 }],
		};
		writeFileSync(
			join(testDir, "usage_statistics.json"),
			JSON.stringify(usageStats),
			"utf-8",
		);
		mkdirSync(join(testDir, "test-reports"), { recursive: true });

		await updateHtmlReportCosts(testDir);

		expect(
			consoleLogs.some((log) =>
				log.includes("Test_Report_Viewer.html not found"),
			),
		).toBe(true);
	});

	test("updates HTML report with cost statistics", async () => {
		// Create flat directory structure (per CLAUDE.md)
		const reportDir = join(testDir, "test-reports");
		mkdirSync(reportDir, { recursive: true });

		// Create usage stats
		const usageStats = {
			summary: { totalCostUsd: 2.5, totalTokens: 150000, totalSessions: 5 },
			sessions: [
				{ durationMs: 120000 },
				{ durationMs: 180000 },
				{ durationMs: 60000 },
			],
		};
		writeFileSync(
			join(testDir, "usage_statistics.json"),
			JSON.stringify(usageStats),
			"utf-8",
		);

		// Create HTML file with placeholders
		const htmlContent = `
			<html>
			<body>
				<div class="cost-value">$0.00</div>
				<div class="cost-label">Total Cost</div>
				<div class="cost-value">0K</div>
				<div class="cost-label">Total Tokens</div>
				<div class="cost-value">0m 0s</div>
				<div class="cost-label">Duration</div>
				<div class="cost-value">0</div>
				<div class="cost-label">Sessions</div>
			</body>
			</html>
		`;
		writeFileSync(join(reportDir, "Test_Report_Viewer.html"), htmlContent);

		await updateHtmlReportCosts(testDir);

		expect(
			consoleLogs.some((log) => log.includes("Updated HTML report costs")),
		).toBe(true);
		expect(consoleLogs.some((log) => log.includes("$2.50"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("150K"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("6m 0s"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Sessions: 5"))).toBe(true);
	});

	test("handles JSON parse error gracefully", async () => {
		// Create invalid JSON in usage stats
		writeFileSync(
			join(testDir, "usage_statistics.json"),
			"{ invalid json",
			"utf-8",
		);

		await updateHtmlReportCosts(testDir);

		expect(
			consoleLogs.some((log) => log.includes("Failed to update HTML report")),
		).toBe(true);
	});

	test("calculates total duration from all sessions", async () => {
		// Create flat directory structure (per CLAUDE.md)
		const reportDir = join(testDir, "test-reports");
		mkdirSync(reportDir, { recursive: true });

		// Create usage stats with multiple sessions
		const usageStats = {
			summary: { totalCostUsd: 1.0, totalTokens: 10000, totalSessions: 3 },
			sessions: [
				{ durationMs: 60000 }, // 1 min
				{ durationMs: 120000 }, // 2 min
				{ durationMs: 180000 }, // 3 min
			],
		};
		writeFileSync(
			join(testDir, "usage_statistics.json"),
			JSON.stringify(usageStats),
			"utf-8",
		);

		const htmlContent = `
			<div class="cost-value">0m 0s</div>
			<div class="cost-label">Duration</div>
		`;
		writeFileSync(join(reportDir, "Test_Report_Viewer.html"), htmlContent);

		await updateHtmlReportCosts(testDir);

		// Total: 60000 + 120000 + 180000 = 360000ms = 6m 0s
		expect(consoleLogs.some((log) => log.includes("6m 0s"))).toBe(true);
	});
});
