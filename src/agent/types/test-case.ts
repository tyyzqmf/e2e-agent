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
 * A single step in a test case
 */
export interface TestStep {
  stepNumber: number;
  action: string;
  expectedResult: string;
}

/**
 * A test case definition
 */
export interface TestCase {
  caseId: string;
  title: string;
  description: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  actualResult?: string;
  status: TestStatus;
  priority: TestPriority;
  category: string;
}

/**
 * Statistics for test case execution
 */
export interface TestCaseStats {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
}

/**
 * Test cases file format (JSON structure)
 */
export interface TestCasesFile {
  testSuite?: string;
  generatedAt?: string;
  testCases?: TestCase[];
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
