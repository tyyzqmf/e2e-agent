/**
 * Progress Tracking Utilities
 * ============================
 *
 * Functions for tracking and displaying progress of the autonomous testing agent.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TestCase, TestCaseStats, TestCasesFile } from "../types/index.ts";
import {
	getCompletedCount,
	getCompletionRate,
	getPassRate,
} from "../types/test-case.ts";

// Security constants
const MAX_JSON_FILE_SIZE = 20 * 1024 * 1024; // 20MB maximum file size limit

/**
 * Load test cases from JSON file.
 *
 * @param testCasesFile - Path to test_cases.json
 * @returns Array of test case objects
 * @throws Error if file doesn't exist, JSON is invalid, or file is too large
 */
export async function loadTestCases(
	testCasesFile: string,
): Promise<TestCase[]> {
	// Security check: validate file size to prevent DoS attacks
	try {
		const stats = statSync(testCasesFile);
		if (stats.size > MAX_JSON_FILE_SIZE) {
			throw new Error(
				`JSON file too large: ${stats.size} bytes ` +
					`(max: ${MAX_JSON_FILE_SIZE} bytes / ${MAX_JSON_FILE_SIZE / 1024 / 1024}MB)`,
			);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`File not found: ${testCasesFile}`);
		}
		throw error;
	}

	const file = Bun.file(testCasesFile);
	const content = await file.text();

	let data;
	try {
		data = JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to parse JSON in ${testCasesFile}: ${error}`);
	}

	// Handle both dictionary format and list format
	if (Array.isArray(data)) {
		return data as TestCase[];
	} else if (data && typeof data === "object") {
		return (data as TestCasesFile).testCases ?? data.test_cases ?? [];
	}

	console.warn(`test_cases.json has unexpected format: ${typeof data}`);
	return [];
}

/**
 * Count test cases by status in test_cases.json.
 *
 * @param projectDir - Directory containing test_cases.json
 * @returns Statistics object with counts
 */
export async function countTestCases(
	projectDir: string,
): Promise<TestCaseStats> {
	const testCasesFile = join(projectDir, "test_cases.json");

	if (!existsSync(testCasesFile)) {
		return {
			total: 0,
			passed: 0,
			failed: 0,
			blocked: 0,
			notRun: 0,
		};
	}

	try {
		const testCases = await loadTestCases(testCasesFile);

		return {
			total: testCases.length,
			passed: testCases.filter((tc) => tc.status === "Pass").length,
			failed: testCases.filter((tc) => tc.status === "Fail").length,
			blocked: testCases.filter((tc) => tc.status === "Blocked").length,
			notRun: testCases.filter((tc) => tc.status === "Not Run").length,
		};
	} catch (error) {
		console.error(`Error reading ${testCasesFile}: ${error}`);
		return {
			total: 0,
			passed: 0,
			failed: 0,
			blocked: 0,
			notRun: 0,
		};
	}
}

/**
 * Count total defects reported in test-reports directories.
 *
 * @param projectDir - Directory containing test-reports
 * @returns Number of defect reports found
 */
export async function countDefects(projectDir: string): Promise<number> {
	const testReportsDir = join(projectDir, "test-reports");

	if (!existsSync(testReportsDir)) {
		return 0;
	}

	// Use glob to find defect reports
	const glob = new Bun.Glob("**/defect-reports/DEFECT-*.md");
	const matches = glob.scanSync({ cwd: testReportsDir });

	let count = 0;
	for (const _ of matches) {
		count++;
	}

	return count;
}

/**
 * Print a formatted header for the test session.
 *
 * @param sessionNum - Session number
 * @param isPlanner - Whether this is a test planner session
 */
export function printTestSessionHeader(
	sessionNum: number,
	isPlanner: boolean,
): void {
	const sessionType = isPlanner ? "TEST PLANNER" : "TEST EXECUTOR";
	console.log(`\n${"=".repeat(70)}`);
	console.log(`  SESSION ${sessionNum}: ${sessionType}`);
	console.log("=".repeat(70));
	console.log();
}

/**
 * Print a summary of test execution progress.
 *
 * @param projectDir - Project directory containing test_cases.json
 */
export async function printTestProgressSummary(
	projectDir: string,
): Promise<void> {
	const stats = await countTestCases(projectDir);

	if (stats.total === 0) {
		console.log("\nTest Progress: test_cases.json not yet created");
		return;
	}

	const completed = getCompletedCount(stats);
	const completionRate = getCompletionRate(stats);
	const passRate = getPassRate(stats);

	console.log(`\nTest Execution Progress:`);
	console.log(`  Total test cases: ${stats.total}`);
	console.log(`  Completed: ${completed} (${completionRate.toFixed(1)}%)`);
	console.log(
		`  └─ Passed: ${stats.passed} (${passRate.toFixed(1)}% of completed)`,
	);
	console.log(`  └─ Failed: ${stats.failed}`);
	console.log(`  └─ Blocked: ${stats.blocked}`);
	console.log(`  Not Run: ${stats.notRun}`);

	// Count and display defects
	const defectCount = await countDefects(projectDir);
	if (defectCount > 0) {
		console.log(`  Total Defects Reported: ${defectCount}`);
	}
}

/**
 * Progress Tracker class for managing test execution progress.
 */
export class ProgressTracker {
	private projectDir: string;

	constructor(projectDir: string) {
		this.projectDir = projectDir;
	}

	/**
	 * Count test cases by status
	 */
	async countTestCases(): Promise<TestCaseStats> {
		return countTestCases(this.projectDir);
	}

	/**
	 * Count defect reports
	 */
	async countDefects(): Promise<number> {
		return countDefects(this.projectDir);
	}

	/**
	 * Print session header
	 */
	printSessionHeader(sessionNum: number, isPlanner: boolean): void {
		printTestSessionHeader(sessionNum, isPlanner);
	}

	/**
	 * Print progress summary
	 */
	async printSummary(): Promise<void> {
		return printTestProgressSummary(this.projectDir);
	}

	/**
	 * Check if all tests are completed
	 */
	async isComplete(): Promise<boolean> {
		const stats = await this.countTestCases();
		return stats.notRun === 0 && stats.total > 0;
	}

	/**
	 * Check if all tests are blocked
	 */
	async isAllBlocked(): Promise<boolean> {
		const stats = await this.countTestCases();
		return stats.blocked === stats.total && stats.total > 0;
	}
}
