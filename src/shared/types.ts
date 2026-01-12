/**
 * Shared Types
 * =============
 *
 * Common type definitions shared between CLI, Server, and Agent modules.
 * This file serves as the single source of truth for core domain types.
 */

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Brand symbol for creating nominal types
 */
declare const __brand: unique symbol;

/**
 * Create a branded type for enhanced type safety
 */
type Brand<T, B> = T & { readonly [__brand]: B };

/**
 * UUID string type (branded for type safety)
 * Use createJobId() to create valid instances
 */
export type UUID = Brand<string, "UUID">;

/**
 * ISO 8601 timestamp string type (branded for type safety)
 * Use createTimestamp() to create valid instances
 */
export type ISOTimestamp = Brand<string, "ISOTimestamp">;

/**
 * Create a UUID (validates format)
 */
export function createUUID(value: string): UUID {
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidPattern.test(value)) {
		throw new Error(`Invalid UUID format: ${value}`);
	}
	return value as UUID;
}

/**
 * Create an ISO timestamp (validates format)
 */
export function createISOTimestamp(value: string): ISOTimestamp {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid ISO timestamp: ${value}`);
	}
	return value as ISOTimestamp;
}

/**
 * Get current timestamp as ISOTimestamp
 */
export function nowTimestamp(): ISOTimestamp {
	return new Date().toISOString() as ISOTimestamp;
}

// ============================================================================
// Result Type (for explicit error handling)
// ============================================================================

/**
 * Success result container
 */
export interface Success<T> {
	readonly success: true;
	readonly value: T;
}

/**
 * Failure result container
 */
export interface Failure<E = Error> {
	readonly success: false;
	readonly error: E;
}

/**
 * Result type for operations that can fail
 * Use instead of returning null or throwing exceptions
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Create a success result
 */
export function success<T>(value: T): Success<T> {
	return { success: true, value };
}

/**
 * Create a failure result
 */
export function failure<E = Error>(error: E): Failure<E> {
	return { success: false, error };
}

/**
 * Check if a result is successful (type guard)
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
	return result.success;
}

/**
 * Check if a result is a failure (type guard)
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
	return !result.success;
}

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
 * Test job entity (immutable after creation)
 */
export interface Job {
	readonly jobId: string;
	readonly testSpec: string;
	readonly envConfig: Readonly<Record<string, string>>;
	readonly status: JobStatus;
	readonly createdAt: string;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly errorMessage: string | null;
	readonly stopRequested: boolean;
	readonly processPid: number | null;
}

/**
 * Database row representation of a job (read from database)
 */
export interface JobRow {
	readonly job_id: string;
	readonly test_spec: string;
	readonly env_config: string | null;
	readonly status: string;
	readonly created_at: string;
	readonly started_at: string | null;
	readonly completed_at: string | null;
	readonly error_message: string | null;
	readonly stop_requested: number;
	readonly process_pid: number | null;
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
