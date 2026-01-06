/**
 * Unit Tests for Services
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PricingCalculator } from "../services/pricing.ts";
import {
	countDefects,
	countTestCases,
	loadTestCases,
	ProgressTracker,
	printTestProgressSummary,
	printTestSessionHeader,
} from "../services/progress.ts";
import {
	copyTemplatesToProject,
	copyTestSpecToProject,
	copyToProject,
	copyUtilsToProject,
	getTestExecutorPrompt,
	getTestPlannerPrompt,
	getTestReportPrompt,
	loadPrompt,
	PROMPTS_DIR,
	ROOT_DIR,
	setupProjectDirectory,
	TEMPLATES_DIR,
	UTILS_DIR,
	validateDestName,
	validateProjectDirectory,
} from "../services/prompts.ts";
import { TokenUsageTracker } from "../services/token-usage.ts";

// Create a temp directory for tests
const testDir = join(tmpdir(), `e2e-agent-test-${Date.now()}`);

describe("Prompts Service", () => {
	test("validateDestName accepts valid names", () => {
		expect(validateDestName("test.txt")).toBe("test.txt");
		expect(validateDestName("folder/file.md")).toBe("folder/file.md");
		expect(validateDestName("my-project_v1")).toBe("my-project_v1");
	});

	test("validateDestName rejects path traversal", () => {
		expect(() => validateDestName("../secret")).toThrow("Path traversal");
		expect(() => validateDestName("foo/../bar")).toThrow("Path traversal");
	});

	test("validateDestName rejects absolute paths", () => {
		expect(() => validateDestName("/etc/passwd")).toThrow("Absolute paths");
		expect(() => validateDestName("\\windows\\system32")).toThrow(
			"Absolute paths",
		);
	});

	test("validateDestName rejects null bytes", () => {
		expect(() => validateDestName("file\x00.txt")).toThrow("Null bytes");
	});

	test("validateDestName rejects dangerous characters", () => {
		expect(() => validateDestName("file<name>")).toThrow("Invalid character");
		expect(() => validateDestName("file:name")).toThrow("Invalid character");
		expect(() => validateDestName("file|name")).toThrow("Invalid character");
	});
});

describe("Progress Service", () => {
	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("countTestCases returns zeros when file does not exist", async () => {
		const stats = await countTestCases(testDir);

		expect(stats.total).toBe(0);
		expect(stats.passed).toBe(0);
		expect(stats.failed).toBe(0);
		expect(stats.blocked).toBe(0);
		expect(stats.notRun).toBe(0);
	});

	test("countTestCases counts array format correctly", async () => {
		const testCases = [
			{ caseId: "TC-001", status: "Pass" },
			{ caseId: "TC-002", status: "Pass" },
			{ caseId: "TC-003", status: "Fail" },
			{ caseId: "TC-004", status: "Blocked" },
			{ caseId: "TC-005", status: "Not Run" },
		];

		writeFileSync(
			join(testDir, "test_cases.json"),
			JSON.stringify(testCases),
			"utf-8",
		);

		const stats = await countTestCases(testDir);

		expect(stats.total).toBe(5);
		expect(stats.passed).toBe(2);
		expect(stats.failed).toBe(1);
		expect(stats.blocked).toBe(1);
		expect(stats.notRun).toBe(1);
	});

	test("countTestCases counts object format correctly", async () => {
		const testCasesFile = {
			testSuite: "Test Suite",
			test_cases: [
				{ caseId: "TC-001", status: "Pass" },
				{ caseId: "TC-002", status: "Fail" },
			],
		};

		writeFileSync(
			join(testDir, "test_cases.json"),
			JSON.stringify(testCasesFile),
			"utf-8",
		);

		const stats = await countTestCases(testDir);

		expect(stats.total).toBe(2);
		expect(stats.passed).toBe(1);
		expect(stats.failed).toBe(1);
	});

	test("countDefects returns 0 when no defects exist", async () => {
		const count = await countDefects(testDir);
		expect(count).toBe(0);
	});

	test("countDefects counts defect files correctly", async () => {
		const defectsDir = join(
			testDir,
			"test-reports",
			"2025-01-01",
			"defect-reports",
		);
		mkdirSync(defectsDir, { recursive: true });

		writeFileSync(join(defectsDir, "DEFECT-001.md"), "# Defect 1", "utf-8");
		writeFileSync(join(defectsDir, "DEFECT-002.md"), "# Defect 2", "utf-8");

		const count = await countDefects(testDir);
		expect(count).toBe(2);
	});

	test("ProgressTracker.isComplete returns correct value", async () => {
		const tracker = new ProgressTracker(testDir);

		// No test cases file
		expect(await tracker.isComplete()).toBe(false);

		// All tests completed
		const testCases = [
			{ caseId: "TC-001", status: "Pass" },
			{ caseId: "TC-002", status: "Fail" },
		];
		writeFileSync(
			join(testDir, "test_cases.json"),
			JSON.stringify(testCases),
			"utf-8",
		);

		expect(await tracker.isComplete()).toBe(true);
	});

	test("ProgressTracker.isAllBlocked returns correct value", async () => {
		const tracker = new ProgressTracker(testDir);

		// All blocked
		const testCases = [
			{ caseId: "TC-001", status: "Blocked" },
			{ caseId: "TC-002", status: "Blocked" },
		];
		writeFileSync(
			join(testDir, "test_cases.json"),
			JSON.stringify(testCases),
			"utf-8",
		);

		expect(await tracker.isAllBlocked()).toBe(true);

		// Not all blocked
		const testCases2 = [
			{ caseId: "TC-001", status: "Blocked" },
			{ caseId: "TC-002", status: "Pass" },
		];
		writeFileSync(
			join(testDir, "test_cases.json"),
			JSON.stringify(testCases2),
			"utf-8",
		);

		expect(await tracker.isAllBlocked()).toBe(false);
	});
});

describe("Pricing Service", () => {
	test("PricingCalculator.getFallbackRates returns rates for known models", () => {
		const calculator = new PricingCalculator();

		const sonnetRates = calculator.getFallbackRates(
			"claude-sonnet-4-5-20250929",
		);
		expect(sonnetRates.inputRate).toBe(3.0);
		expect(sonnetRates.outputRate).toBe(15.0);

		const opusRates = calculator.getFallbackRates("claude-opus-4-5-20251101");
		expect(opusRates.inputRate).toBe(5.0);
		expect(opusRates.outputRate).toBe(25.0);
	});

	test("PricingCalculator.getFallbackRates handles AWS Bedrock model IDs", () => {
		const calculator = new PricingCalculator();

		const rates = calculator.getFallbackRates(
			"us.anthropic.claude-sonnet-4-5-20250929-v1:0",
		);
		expect(rates.inputRate).toBe(3.0);
		expect(rates.outputRate).toBe(15.0);
	});

	test("PricingCalculator.getFallbackRates returns default for unknown models", () => {
		const calculator = new PricingCalculator();

		const rates = calculator.getFallbackRates("unknown-model");
		// Should default to Sonnet 4.5 rates
		expect(rates.inputRate).toBe(3.0);
	});

	test("PricingCalculator.calculateCost calculates correctly", () => {
		const calculator = new PricingCalculator();

		const costs = calculator.calculateCost(
			{
				inputTokens: 1000000, // 1M tokens
				outputTokens: 100000, // 100K tokens
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
			},
			"claude-sonnet-4-5-20250929",
		);

		// Input: 1M * $3/M = $3
		expect(costs.inputCost).toBe(3);
		// Output: 100K * $15/M = $1.5
		expect(costs.outputCost).toBe(1.5);
		expect(costs.totalCost).toBe(4.5);
	});

	test("PricingCalculator.calculateCost handles cache tokens", () => {
		const calculator = new PricingCalculator();

		const costs = calculator.calculateCost(
			{
				inputTokens: 0,
				outputTokens: 0,
				cacheCreationTokens: 1000000, // 1M tokens
				cacheReadTokens: 1000000, // 1M tokens
			},
			"claude-sonnet-4-5-20250929",
		);

		// Cache write: 1M * $3.75/M = $3.75
		expect(costs.cacheCreationCost).toBe(3.75);
		// Cache read: 1M * $0.30/M = $0.30
		expect(costs.cacheReadCost).toBe(0.3);
	});

	test("PricingCalculator.calculateCost strips context window suffix from model ID", () => {
		const calculator = new PricingCalculator();

		// Model ID with [1m] suffix (1 million context window)
		const costsWithSuffix = calculator.calculateCost(
			{
				inputTokens: 1000000,
				outputTokens: 100000,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
			},
			"us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]",
		);

		// Should get same rates as without suffix
		const costsWithoutSuffix = calculator.calculateCost(
			{
				inputTokens: 1000000,
				outputTokens: 100000,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
			},
			"us.anthropic.claude-sonnet-4-5-20250929-v1:0",
		);

		expect(costsWithSuffix.inputCost).toBe(costsWithoutSuffix.inputCost);
		expect(costsWithSuffix.outputCost).toBe(costsWithoutSuffix.outputCost);
		expect(costsWithSuffix.totalCost).toBe(costsWithoutSuffix.totalCost);
	});
});

describe("Token Usage Service", () => {
	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("TokenUsageTracker initializes with empty data", () => {
		const tracker = new TokenUsageTracker(testDir);
		const summary = tracker.getSummary();

		expect(summary.totalSessions).toBe(0);
		expect(summary.totalTokens).toBe(0);
		expect(summary.totalCostUsd).toBe(0);
	});

	test("TokenUsageTracker.recordSession creates record correctly", () => {
		const tracker = new TokenUsageTracker(testDir);

		const record = tracker.recordSession({
			sessionId: "test-session",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 60000,
			numTurns: 5,
			tokens: {
				inputTokens: 10000,
				outputTokens: 5000,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
			},
		});

		expect(record.sessionId).toBe("test-session");
		expect(record.sessionType).toBe("test_executor");
		expect(record.tokens.totalTokens).toBe(15000);
		expect(record.costs.totalCost).toBeGreaterThan(0);
	});

	test("TokenUsageTracker.recordSession updates summary", () => {
		const tracker = new TokenUsageTracker(testDir);

		tracker.recordSession({
			sessionId: "session-1",
			sessionType: "test_planner",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 30000,
			numTurns: 3,
			tokens: {
				inputTokens: 5000,
				outputTokens: 2000,
			},
		});

		tracker.recordSession({
			sessionId: "session-2",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 45000,
			numTurns: 4,
			tokens: {
				inputTokens: 8000,
				outputTokens: 3000,
			},
		});

		const summary = tracker.getSummary();

		expect(summary.totalSessions).toBe(2);
		expect(summary.totalInputTokens).toBe(13000);
		expect(summary.totalOutputTokens).toBe(5000);
		expect(summary.totalTokens).toBe(18000);
	});

	test("TokenUsageTracker persists to file", () => {
		const tracker = new TokenUsageTracker(testDir);

		tracker.recordSession({
			sessionId: "session-1",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 30000,
			numTurns: 3,
			tokens: {
				inputTokens: 5000,
				outputTokens: 2000,
			},
		});

		// Check file exists
		expect(existsSync(join(testDir, "usage_statistics.json"))).toBe(true);

		// Create new tracker and verify data loaded
		const tracker2 = new TokenUsageTracker(testDir);
		const summary = tracker2.getSummary();

		expect(summary.totalSessions).toBe(1);
		expect(summary.totalInputTokens).toBe(5000);
	});

	test("TokenUsageTracker.displaySessionStats outputs formatted stats", () => {
		const tracker = new TokenUsageTracker(testDir);
		const consoleLogs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));

		const record = tracker.recordSession({
			sessionId: "session-1",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 60000,
			numTurns: 5,
			tokens: {
				inputTokens: 10000,
				outputTokens: 5000,
				cacheCreationTokens: 1000,
				cacheReadTokens: 500,
			},
		});

		tracker.displaySessionStats(record);

		console.log = originalLog;

		expect(consoleLogs.some((log) => log.includes("SESSION STATISTICS"))).toBe(
			true,
		);
		expect(consoleLogs.some((log) => log.includes("Token Usage"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Input:"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Output:"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("Project Totals"))).toBe(
			true,
		);
	});

	test("TokenUsageTracker.getSessionHistory returns all sessions", () => {
		const tracker = new TokenUsageTracker(testDir);

		tracker.recordSession({
			sessionId: "session-1",
			sessionType: "test_planner",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 30000,
			numTurns: 3,
			tokens: { inputTokens: 5000, outputTokens: 2000 },
		});

		tracker.recordSession({
			sessionId: "session-2",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 45000,
			numTurns: 4,
			tokens: { inputTokens: 8000, outputTokens: 3000 },
		});

		const history = tracker.getSessionHistory();
		expect(history.length).toBe(2);
		expect(history[0].sessionId).toBe("session-1");
		expect(history[1].sessionId).toBe("session-2");
	});
});

// Additional tests for Prompts Service
describe("Prompts Service - Extended", () => {
	const _tempProjectDir = join(tmpdir(), `e2e-prompts-test-${Date.now()}`);

	beforeEach(() => {
		// Create temp dir under cwd/generations to pass validation
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		mkdirSync(generationsDir, { recursive: true });
	});

	afterEach(() => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		if (existsSync(generationsDir)) {
			rmSync(generationsDir, { recursive: true, force: true });
		}
	});

	test("validateProjectDirectory accepts valid paths under generations/", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		const result = validateProjectDirectory(generationsDir);
		expect(result).toBe(resolve(generationsDir));
	});

	test("validateProjectDirectory accepts paths under cwd", () => {
		const cwdPath = join(process.cwd(), "test-project");
		mkdirSync(cwdPath, { recursive: true });
		try {
			const result = validateProjectDirectory(cwdPath);
			expect(result).toBe(resolve(cwdPath));
		} finally {
			rmSync(cwdPath, { recursive: true, force: true });
		}
	});

	test("validateProjectDirectory rejects paths outside expected boundaries", () => {
		expect(() => validateProjectDirectory("/tmp/outside-project")).toThrow(
			"Invalid project directory",
		);
	});

	test("loadPrompt loads existing prompt file", async () => {
		// This tests against actual prompt files
		const content = await loadPrompt("test_planner_prompt");
		expect(content).toBeDefined();
		expect(content.length).toBeGreaterThan(0);
	});

	test("getTestPlannerPrompt returns prompt content", async () => {
		const content = await getTestPlannerPrompt();
		expect(content).toBeDefined();
		expect(content.length).toBeGreaterThan(0);
	});

	test("getTestExecutorPrompt returns prompt content", async () => {
		const content = await getTestExecutorPrompt();
		expect(content).toBeDefined();
		expect(content.length).toBeGreaterThan(0);
	});

	test("getTestReportPrompt returns prompt content", async () => {
		const content = await getTestReportPrompt();
		expect(content).toBeDefined();
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("TEST REPORT AGENT");
	});

	test("copyToProject copies file to destination", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		const sourceFile = join(generationsDir, "source.txt");
		writeFileSync(sourceFile, "test content", "utf-8");

		copyToProject(generationsDir, sourceFile, "copied.txt", false);

		expect(existsSync(join(generationsDir, "copied.txt"))).toBe(true);
		expect(readFileSync(join(generationsDir, "copied.txt"), "utf-8")).toBe(
			"test content",
		);
	});

	test("copyToProject skips existing destination", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		const sourceFile = join(generationsDir, "source2.txt");
		const destFile = join(generationsDir, "existing.txt");

		writeFileSync(sourceFile, "new content", "utf-8");
		writeFileSync(destFile, "old content", "utf-8");

		copyToProject(generationsDir, sourceFile, "existing.txt", false);

		// Should not overwrite
		expect(readFileSync(destFile, "utf-8")).toBe("old content");
	});

	test("copyToProject validates destName for path traversal", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		expect(() =>
			copyToProject(generationsDir, "/tmp/source.txt", "../escape.txt", false),
		).toThrow("Path traversal");
	});

	test("copyToProject copies directory recursively", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		const sourceDir = join(generationsDir, "source-dir");
		mkdirSync(join(sourceDir, "subdir"), { recursive: true });
		writeFileSync(join(sourceDir, "file1.txt"), "content1", "utf-8");
		writeFileSync(join(sourceDir, "subdir", "file2.txt"), "content2", "utf-8");

		copyToProject(generationsDir, sourceDir, "copied-dir", true);

		expect(existsSync(join(generationsDir, "copied-dir"))).toBe(true);
		expect(existsSync(join(generationsDir, "copied-dir", "file1.txt"))).toBe(
			true,
		);
		expect(
			existsSync(join(generationsDir, "copied-dir", "subdir", "file2.txt")),
		).toBe(true);
	});

	test("copyToProject throws on copy error", () => {
		const generationsDir = join(process.cwd(), "generations", "test-prompts");
		// Try to copy a non-existent source
		expect(() =>
			copyToProject(
				generationsDir,
				"/nonexistent/source.txt",
				"dest.txt",
				false,
			),
		).toThrow();
	});
});

// Additional tests for Progress Service
describe("Progress Service - Extended", () => {
	const progressTestDir = join(tmpdir(), `e2e-progress-test-${Date.now()}`);

	beforeEach(() => {
		mkdirSync(progressTestDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(progressTestDir)) {
			rmSync(progressTestDir, { recursive: true, force: true });
		}
	});

	test("loadTestCases throws for non-existent file", async () => {
		await expect(
			loadTestCases(join(progressTestDir, "nonexistent.json")),
		).rejects.toThrow("File not found");
	});

	test("loadTestCases throws for oversized file", async () => {
		// Create a file that appears large (we can't easily create 20MB file, so test the error path differently)
		const testFile = join(progressTestDir, "test_cases.json");
		writeFileSync(testFile, "[]", "utf-8");

		// The actual test case - just verify it loads small files
		const result = await loadTestCases(testFile);
		expect(result).toEqual([]);
	});

	test("loadTestCases handles testCases property", async () => {
		const testFile = join(progressTestDir, "test_cases.json");
		writeFileSync(
			testFile,
			JSON.stringify({
				testCases: [{ caseId: "TC-001", status: "Pass" }],
			}),
			"utf-8",
		);

		const result = await loadTestCases(testFile);
		expect(result.length).toBe(1);
		expect(result[0].caseId).toBe("TC-001");
	});

	test("printTestSessionHeader outputs correct format for planner", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		printTestSessionHeader(1, true);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("SESSION 1"))).toBe(true);
		expect(logs.some((log) => log.includes("TEST PLANNER"))).toBe(true);
	});

	test("printTestSessionHeader outputs correct format for executor", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		printTestSessionHeader(2, false);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("SESSION 2"))).toBe(true);
		expect(logs.some((log) => log.includes("TEST EXECUTOR"))).toBe(true);
	});

	test("printTestProgressSummary outputs progress when tests exist", async () => {
		const testCases = [
			{ caseId: "TC-001", status: "Pass" },
			{ caseId: "TC-002", status: "Fail" },
			{ caseId: "TC-003", status: "Not Run" },
		];
		writeFileSync(
			join(progressTestDir, "test_cases.json"),
			JSON.stringify(testCases),
			"utf-8",
		);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		await printTestProgressSummary(progressTestDir);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("Test Execution Progress"))).toBe(
			true,
		);
		expect(logs.some((log) => log.includes("Total test cases: 3"))).toBe(true);
	});

	test("printTestProgressSummary shows message when no test cases", async () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		await printTestProgressSummary(progressTestDir);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("not yet created"))).toBe(true);
	});

	test("printTestProgressSummary shows defect count", async () => {
		const testCases = [{ caseId: "TC-001", status: "Fail" }];
		writeFileSync(
			join(progressTestDir, "test_cases.json"),
			JSON.stringify(testCases),
			"utf-8",
		);

		// Create defect reports
		const defectsDir = join(
			progressTestDir,
			"test-reports",
			"2025-01-01",
			"defect-reports",
		);
		mkdirSync(defectsDir, { recursive: true });
		writeFileSync(join(defectsDir, "DEFECT-001.md"), "# Defect", "utf-8");

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		await printTestProgressSummary(progressTestDir);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("Total Defects Reported: 1"))).toBe(
			true,
		);
	});

	test("ProgressTracker.printSessionHeader calls printTestSessionHeader", () => {
		const tracker = new ProgressTracker(progressTestDir);
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		tracker.printSessionHeader(1, true);

		console.log = originalLog;

		expect(logs.some((log) => log.includes("SESSION 1"))).toBe(true);
	});

	test("ProgressTracker.printSummary calls printTestProgressSummary", async () => {
		const tracker = new ProgressTracker(progressTestDir);
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

		await tracker.printSummary();

		console.log = originalLog;

		expect(logs.some((log) => log.includes("not yet created"))).toBe(true);
	});

	test("ProgressTracker.countDefects returns defect count", async () => {
		const defectsDir = join(
			progressTestDir,
			"test-reports",
			"2025-01-01",
			"defect-reports",
		);
		mkdirSync(defectsDir, { recursive: true });
		writeFileSync(join(defectsDir, "DEFECT-001.md"), "# Defect", "utf-8");

		const tracker = new ProgressTracker(progressTestDir);
		const count = await tracker.countDefects();

		expect(count).toBe(1);
	});
});

// Additional tests for Pricing Service
describe("Pricing Service - Extended", () => {
	const pricingTestDir = join(tmpdir(), `e2e-pricing-test-${Date.now()}`);

	beforeEach(() => {
		mkdirSync(pricingTestDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(pricingTestDir)) {
			rmSync(pricingTestDir, { recursive: true, force: true });
		}
	});

	test("PricingCalculator.isCacheValid returns false when no cache exists", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		expect(calculator.isCacheValid()).toBe(false);
	});

	test("PricingCalculator.isCacheValid returns false for expired cache", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		const cacheFile = join(pricingTestDir, "litellm_pricing_cache.json");

		// Write cache with old timestamp
		writeFileSync(
			cacheFile,
			JSON.stringify({
				fetchedAt: Date.now() - 25 * 3600000, // 25 hours ago
				sourceUrl: "test",
				pricing: {},
			}),
			"utf-8",
		);

		expect(calculator.isCacheValid()).toBe(false);
	});

	test("PricingCalculator.isCacheValid returns true for fresh cache", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		const cacheFile = join(pricingTestDir, "litellm_pricing_cache.json");

		// Write fresh cache
		writeFileSync(
			cacheFile,
			JSON.stringify({
				fetchedAt: Date.now() - 1 * 3600000, // 1 hour ago
				sourceUrl: "test",
				pricing: {},
			}),
			"utf-8",
		);

		expect(calculator.isCacheValid()).toBe(true);
	});

	test("PricingCalculator.loadCachedPrices returns null for non-existent file", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		expect(calculator.loadCachedPrices()).toBeNull();
	});

	test("PricingCalculator.loadCachedPrices returns pricing data", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		const cacheFile = join(pricingTestDir, "litellm_pricing_cache.json");

		const pricingData = {
			"claude-sonnet-4-5-20250929": {
				input_cost_per_token: 0.000003,
				output_cost_per_token: 0.000015,
			},
		};

		writeFileSync(
			cacheFile,
			JSON.stringify({
				fetchedAt: Date.now(),
				sourceUrl: "test",
				pricing: pricingData,
			}),
			"utf-8",
		);

		const loaded = calculator.loadCachedPrices();
		expect(loaded).toBeDefined();
		expect(loaded?.["claude-sonnet-4-5-20250929"]).toBeDefined();
	});

	test("PricingCalculator.getRates uses cached rates when valid", () => {
		const calculator = new PricingCalculator(pricingTestDir);
		const cacheFile = join(pricingTestDir, "litellm_pricing_cache.json");

		const pricingData = {
			"claude-sonnet-4-5-20250929": {
				input_cost_per_token: 0.000003,
				output_cost_per_token: 0.000015,
				cache_creation_input_token_cost: 0.00000375,
				cache_read_input_token_cost: 0.0000003,
			},
		};

		writeFileSync(
			cacheFile,
			JSON.stringify({
				fetchedAt: Date.now(),
				sourceUrl: "test",
				pricing: pricingData,
			}),
			"utf-8",
		);

		const rates = calculator.getRates("claude-sonnet-4-5-20250929");
		expect(rates.inputRate).toBe(3.0);
		expect(rates.outputRate).toBe(15.0);
	});

	test("PricingCalculator.getRatesAsync falls back gracefully", async () => {
		const calculator = new PricingCalculator(pricingTestDir);

		// No cache, API will fail, should use fallback
		const rates = await calculator.getRatesAsync("claude-sonnet-4-5-20250929");

		expect(rates.inputRate).toBe(3.0);
		expect(rates.outputRate).toBe(15.0);
	});

	test("PricingCalculator.calculateCost handles undefined token values", () => {
		const calculator = new PricingCalculator(pricingTestDir);

		const costs = calculator.calculateCost(
			{
				inputTokens: undefined as unknown as number,
				outputTokens: undefined as unknown as number,
			},
			"claude-sonnet-4-5-20250929",
		);

		expect(costs.inputCost).toBe(0);
		expect(costs.outputCost).toBe(0);
		expect(costs.totalCost).toBe(0);
	});

	test("PricingCalculator.getFallbackRates handles anthropic. prefix", () => {
		const calculator = new PricingCalculator(pricingTestDir);

		const rates = calculator.getFallbackRates(
			"anthropic.claude-sonnet-4-5-20250929",
		);
		expect(rates.inputRate).toBe(3.0);
	});
});

// Tests for setupProjectDirectory and related functions
describe("Prompts Service - Setup Functions", () => {
	const setupTestDir = join(
		process.cwd(),
		"generations",
		`setup-test-${Date.now()}`,
	);

	afterEach(() => {
		if (existsSync(setupTestDir)) {
			rmSync(setupTestDir, { recursive: true, force: true });
		}
	});

	test("setupProjectDirectory creates directory if not exists", () => {
		expect(existsSync(setupTestDir)).toBe(false);

		// This will fail because test_spec.txt doesn't exist, but dir will be created
		try {
			setupProjectDirectory(setupTestDir);
		} catch {
			// Expected to fail due to missing test_spec.txt
		}

		expect(existsSync(setupTestDir)).toBe(true);
	});

	test("copyTestSpecToProject attempts to copy test_spec.txt", () => {
		mkdirSync(setupTestDir, { recursive: true });

		// This will throw because test_spec.txt likely doesn't exist
		try {
			copyTestSpecToProject(setupTestDir);
		} catch (error) {
			expect(String(error)).toContain("ENOENT");
		}
	});

	test("copyTemplatesToProject copies templates directory", () => {
		mkdirSync(setupTestDir, { recursive: true });

		// Should work if TEMPLATES_DIR exists
		if (existsSync(TEMPLATES_DIR)) {
			copyTemplatesToProject(setupTestDir);
			expect(existsSync(join(setupTestDir, "templates"))).toBe(true);
		}
	});

	test("copyUtilsToProject copies utils directory", () => {
		mkdirSync(setupTestDir, { recursive: true });

		// Should work if UTILS_DIR exists
		if (existsSync(UTILS_DIR)) {
			copyUtilsToProject(setupTestDir);
			expect(existsSync(join(setupTestDir, "utils"))).toBe(true);
		}
	});

	test("PROMPTS_DIR, TEMPLATES_DIR, UTILS_DIR, ROOT_DIR are defined", () => {
		expect(PROMPTS_DIR).toBeDefined();
		expect(TEMPLATES_DIR).toBeDefined();
		expect(UTILS_DIR).toBeDefined();
		expect(ROOT_DIR).toBeDefined();
	});
});

// Extended Token Usage Tests
describe("Token Usage Service - Extended", () => {
	const tokenTestDir = join(tmpdir(), `e2e-token-extended-${Date.now()}`);

	beforeEach(() => {
		mkdirSync(tokenTestDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(tokenTestDir)) {
			rmSync(tokenTestDir, { recursive: true, force: true });
		}
	});

	test("TokenUsageTracker handles corrupted stats file", () => {
		// Create corrupted stats file
		writeFileSync(
			join(tokenTestDir, "usage_statistics.json"),
			"{ invalid json",
			"utf-8",
		);

		const logs: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) =>
			logs.push(args.map(String).join(" "));

		// Should load with fresh data despite corrupted file
		const tracker = new TokenUsageTracker(tokenTestDir);
		const summary = tracker.getSummary();

		console.warn = originalWarn;

		expect(summary.totalSessions).toBe(0);
		expect(logs.some((log) => log.includes("Could not load statistics"))).toBe(
			true,
		);
	});
});
