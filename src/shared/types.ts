/**
 * Shared Types
 * =============
 *
 * Common type definitions shared between CLI, Server, and Agent modules.
 * This file serves as the single source of truth for core domain types.
 */

// ============================================================================
// Job Types
// ============================================================================

/**
 * Possible states of a test job
 */
export type JobStatus =
	| "queued" // Waiting to execute
	| "running" // Executing
	| "completed" // Execution completed
	| "failed" // Execution failed
	| "stopped" // Stopped by user
	| "cancelled"; // Cancelled from queue

/**
 * Test job entity
 */
export interface Job {
	jobId: string;
	testSpec: string;
	envConfig: Record<string, string>;
	status: JobStatus;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
	errorMessage: string | null;
	stopRequested: boolean;
	processPid: number | null;
}

/**
 * Database row representation of a job
 */
export interface JobRow {
	job_id: string;
	test_spec: string;
	env_config: string | null;
	status: string;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	error_message: string | null;
	stop_requested: number;
	process_pid: number | null;
}

// ============================================================================
// Test Case Types
// ============================================================================

/**
 * Possible status values for a test case.
 * Note: "Running" is used by the server for display purposes during execution.
 */
export type TestCaseStatus =
	| "Not Run"
	| "Pass"
	| "Fail"
	| "Blocked"
	| "Running";

/**
 * Core test status values used by the agent (excludes "Running")
 */
export type TestStatus = "Not Run" | "Pass" | "Fail" | "Blocked";

/**
 * Priority levels for test cases
 */
export type TestPriority = "Critical" | "High" | "Medium" | "Low";
