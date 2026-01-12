/**
 * Test Case Types
 * ================
 *
 * Type definitions for test cases and test execution tracking.
 */

/**
 * Possible status values for a test case
 */
export type TestStatus = "Not Run" | "Pass" | "Fail" | "Blocked";

/**
 * Priority levels for test cases
 */
export type TestPriority = "Critical" | "High" | "Medium" | "Low";

/**
 * A single step in a test case (immutable)
 */
export interface TestStep {
	readonly stepNumber: number;
	readonly action: string;
	readonly expectedResult: string;
}

/**
 * A test case definition (immutable except for actualResult and status)
 */
export interface TestCase {
	readonly caseId: string;
	readonly title: string;
	readonly description: string;
	readonly preconditions: readonly string[];
	readonly steps: readonly TestStep[];
	readonly expectedResult: string;
	actualResult?: string; // Mutable: set during execution
	status: TestStatus; // Mutable: updated during execution
	readonly priority: TestPriority;
	readonly category: string;
}

/**
 * Statistics for test case execution (snapshot, immutable after creation)
 */
export interface TestCaseStats {
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly blocked: number;
	readonly notRun: number;
}

/**
 * Test cases file format (JSON structure)
 */
export interface TestCasesFile {
	readonly testSuite?: string;
	readonly generatedAt?: string;
	readonly testCases?: readonly TestCase[];
	// Alternative format: array at root level
}

/**
 * Calculate completion rate from stats
 */
export function getCompletionRate(stats: TestCaseStats): number {
	if (stats.total === 0) return 0;
	const completed = stats.passed + stats.failed + stats.blocked;
	return (completed / stats.total) * 100;
}

/**
 * Calculate pass rate from stats
 */
export function getPassRate(stats: TestCaseStats): number {
	const completed = stats.passed + stats.failed + stats.blocked;
	if (completed === 0) return 0;
	return (stats.passed / completed) * 100;
}

/**
 * Get completed count from stats
 */
export function getCompletedCount(stats: TestCaseStats): number {
	return stats.passed + stats.failed + stats.blocked;
}
