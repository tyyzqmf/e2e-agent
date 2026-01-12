/**
 * E2E Agent Web Service - Type Definitions
 *
 * All TypeScript types and interfaces for the Bun-based web service.
 */

// Import shared types for use within this file
import type {
	Job as SharedJob,
	JobRow as SharedJobRow,
	JobStatus as SharedJobStatus,
	TestCaseStatus as SharedTestCaseStatus,
	TestPriority as SharedTestPriority,
	TestStatus as SharedTestStatus,
} from "../../shared/types.ts";

// Re-export shared types for use throughout the server
export type Job = SharedJob;
export type JobRow = SharedJobRow;
export type JobStatus = SharedJobStatus;
export type TestCaseStatus = SharedTestCaseStatus;
export type TestPriority = SharedTestPriority;
export type TestStatus = SharedTestStatus;

// ============================================================================
// API Types
// ============================================================================

/**
 * Request body for job submission
 */
export interface JobSubmitRequest {
	test_spec: string;
	env_config?: Record<string, string>;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	code?: string;
	message?: string;
}

/**
 * Job submission response
 */
export interface JobSubmitResponse {
	success: boolean;
	job_id: string;
	message: string;
	status: JobStatus;
	created_at: string;
}

/**
 * Job status response with optional details
 */
export interface JobStatusResponse {
	success: boolean;
	job: Job & {
		cost?: CostStatistics | null;
		test_cases?: TestCase[] | null;
	};
}

/**
 * Job list response
 */
export interface JobListResponse {
	success: boolean;
	jobs: Job[];
	total: number;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
	status: "healthy" | "unhealthy";
	version: string;
	runtime: string;
	uptime: number;
	queue_size: number;
	current_job: string | null;
	timestamp: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
	success: false;
	error: string;
	code: string;
	details?: Record<string, unknown>;
}

// ============================================================================
// Test Report Types
// ============================================================================

// TestCaseStatus is now imported from shared/types.ts

/**
 * Individual test case (server representation)
 */
export interface TestCase {
	id: string;
	title: string;
	status: TestCaseStatus;
	priority?: string;
	category?: string;
	steps?: string[];
	expected_result?: string;
	actual_result?: string;
	error_message?: string;
	screenshots?: string[];
	duration_ms?: number;
}

/**
 * Cost statistics for a job
 */
export interface CostStatistics {
	// Original fields
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	estimated_cost_usd: number;
	sessions: number;
	// Cache-related token fields
	cache_creation_tokens?: number;
	cache_read_tokens?: number;
	// Cache-related cost fields
	cache_creation_cost?: number;
	cache_read_cost?: number;
	// Frontend-compatible fields (aliases for convenience)
	input_tokens?: number;
	output_tokens?: number;
	total_cost?: number;
	input_cost?: number;
	output_cost?: number;
}

/**
 * Test summary statistics
 */
export interface TestSummary {
	total: number;
	passed: number;
	failed: number;
	blocked: number;
	not_run: number;
	pass_rate: number;
}

// ============================================================================
// Stop Job Types
// ============================================================================

/**
 * Result of a stop job operation
 */
export interface StopJobResult {
	success: boolean;
	message: string;
	status?: JobStatus | "stopping";
}

// ============================================================================
// Service Context Types
// ============================================================================

/**
 * Services available in route handlers
 */
export interface ServiceContext {
	jobManager: import("../services/JobManager").JobManager;
	resultService: import("../services/ResultService").ResultService;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Application configuration
 */
export interface AppConfig {
	// Server
	PORT: number;
	HOST: string;

	// Paths
	PROJECT_ROOT: string;
	DATA_DIR: string;
	DATABASE_PATH: string;
	LOGS_DIR: string;

	// Execution
	MAX_EXECUTION_TIME_MS: number;
	EXECUTOR_POLL_INTERVAL_MS: number;
	STOP_GRACE_PERIOD_MS: number;

	// Validation
	TEST_SPEC_MIN_LENGTH: number;
	TEST_SPEC_MAX_LENGTH: number;
	MAX_REQUEST_BODY_SIZE: number;

	// Logging
	LOG_LEVEL: "debug" | "info" | "warn" | "error" | "silent";

	// Feature flags
	ENABLE_CORS: boolean;
	NODE_ENV: "development" | "production" | "test";
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Extended Request type with route params (used by router)
 */
export type RequestWithParams = Request & { params: Record<string, string> };

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties of T optional except for K
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Extract the type of an array element
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Timestamp in ISO 8601 format
 */
export type ISOTimestamp = string;
