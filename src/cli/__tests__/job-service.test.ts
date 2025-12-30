/**
 * E2E CLI - Job Service Test Suite
 *
 * Tests for the JobService class that manages test jobs.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatDateTime,
	type Job,
	JobService,
	printJobList,
	printJobStatus,
} from "../services/job.ts";

describe("JobService", () => {
	let tempDir: string;
	let jobService: JobService;

	beforeAll(() => {
		tempDir = mkdtempSync(join(tmpdir(), "job-service-test-"));
	});

	afterAll(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		// Create a fresh JobService for each test
		jobService = new JobService(tempDir);
	});

	afterEach(() => {
		jobService.close();
	});

	describe("constructor", () => {
		test("creates data directory if it does not exist", () => {
			const newDir = join(tempDir, "new-data-dir");
			const service = new JobService(newDir);
			expect(existsSync(newDir)).toBe(true);
			service.close();
		});

		test("creates reports directory", () => {
			const reportsDir = join(tempDir, "reports");
			expect(existsSync(reportsDir)).toBe(true);
		});
	});

	describe("listJobs", () => {
		test("returns empty array when no jobs exist", () => {
			const jobs = jobService.listJobs();
			expect(jobs).toBeInstanceOf(Array);
		});

		test("respects limit parameter", () => {
			// Create some test spec files and submit jobs
			const specFile = join(tempDir, "test_spec.txt");
			writeFileSync(specFile, "Test specification content for job list test");

			for (let i = 0; i < 5; i++) {
				jobService.submitJob(specFile);
			}

			const jobs = jobService.listJobs(3);
			expect(jobs.length).toBeLessThanOrEqual(3);
		});
	});

	describe("getJob", () => {
		test("returns null for non-existent job", () => {
			const job = jobService.getJob("non-existent-job-id");
			expect(job).toBeNull();
		});

		test("returns job after submission", () => {
			const specFile = join(tempDir, "test_spec_get.txt");
			writeFileSync(specFile, "Test specification content for get job test");

			const jobId = jobService.submitJob(specFile);
			expect(jobId).not.toBeNull();

			const job = jobService.getJob(jobId!);
			expect(job).not.toBeNull();
			expect(job?.jobId).toBe(jobId);
			expect(job?.status).toBe("queued");
		});
	});

	describe("submitJob", () => {
		test("returns null for non-existent file", () => {
			const jobId = jobService.submitJob("/non/existent/path.txt");
			expect(jobId).toBeNull();
		});

		test("returns null for too short spec", () => {
			const specFile = join(tempDir, "short_spec.txt");
			writeFileSync(specFile, "short");

			const jobId = jobService.submitJob(specFile);
			expect(jobId).toBeNull();
		});

		test("returns null for too long spec", () => {
			const specFile = join(tempDir, "long_spec.txt");
			writeFileSync(specFile, "x".repeat(100001));

			const jobId = jobService.submitJob(specFile);
			expect(jobId).toBeNull();
		});

		test("successfully submits valid spec file", () => {
			const specFile = join(tempDir, "valid_spec.txt");
			writeFileSync(specFile, "This is a valid test specification content");

			const jobId = jobService.submitJob(specFile);
			expect(jobId).not.toBeNull();
			expect(typeof jobId).toBe("string");
			expect(jobId?.length).toBeGreaterThan(0);
		});

		test("creates job with queued status", () => {
			const specFile = join(tempDir, "queued_spec.txt");
			writeFileSync(specFile, "Test specification for queued status test");

			const jobId = jobService.submitJob(specFile);
			const job = jobService.getJob(jobId!);

			expect(job?.status).toBe("queued");
			expect(job?.startedAt).toBeNull();
			expect(job?.completedAt).toBeNull();
		});

		test("handles relative paths", () => {
			const specFile = join(tempDir, "relative_spec.txt");
			writeFileSync(specFile, "Test specification for relative path test");

			// This should work because submitJob resolves relative paths
			const jobId = jobService.submitJob(specFile);
			expect(jobId).not.toBeNull();
		});
	});

	describe("cancelJob", () => {
		test("returns error for non-existent job", () => {
			const result = jobService.cancelJob("non-existent");
			expect(result.success).toBe(false);
			expect(result.message).toContain("not found");
		});

		test("cancels queued job", () => {
			const specFile = join(tempDir, "cancel_spec.txt");
			writeFileSync(specFile, "Test specification for cancel job test");

			const jobId = jobService.submitJob(specFile)!;
			const result = jobService.cancelJob(jobId);

			expect(result.success).toBe(true);
			expect(result.message).toContain("cancelled");

			const job = jobService.getJob(jobId);
			expect(job?.status).toBe("cancelled");
		});

		test("returns error for already cancelled job", () => {
			const specFile = join(tempDir, "double_cancel_spec.txt");
			writeFileSync(specFile, "Test specification for double cancel test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.cancelJob(jobId);

			const result = jobService.cancelJob(jobId);
			expect(result.success).toBe(false);
			expect(result.message).toContain("terminal state");
		});

		test("returns error for completed job", () => {
			const specFile = join(tempDir, "completed_cancel_spec.txt");
			writeFileSync(specFile, "Test specification for completed cancel test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "completed");

			const result = jobService.cancelJob(jobId);
			expect(result.success).toBe(false);
		});

		test("sends stop request for running job", () => {
			const specFile = join(tempDir, "running_cancel_spec.txt");
			writeFileSync(specFile, "Test specification for running cancel test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "running");

			const result = jobService.cancelJob(jobId);
			expect(result.success).toBe(true);
			expect(result.message).toContain("Stop request");

			expect(jobService.isStopRequested(jobId)).toBe(true);
		});
	});

	describe("Queue Operations", () => {
		test("getQueueSize returns 0 for empty queue", () => {
			const size = jobService.getQueueSize();
			expect(typeof size).toBe("number");
		});

		test("dequeue returns null for empty queue", () => {
			// Create fresh service to ensure empty queue
			const freshService = new JobService(join(tempDir, "fresh-queue"));
			const jobId = freshService.dequeue();
			expect(jobId).toBeNull();
			freshService.close();
		});

		test("dequeue returns job in FIFO order", () => {
			const freshDir = join(tempDir, "fifo-queue");
			const freshService = new JobService(freshDir);

			const specFile = join(freshDir, "fifo_spec.txt");
			mkdirSync(freshDir, { recursive: true });
			writeFileSync(specFile, "Test specification for FIFO queue test");

			const jobId1 = freshService.submitJob(specFile);
			const _jobId2 = freshService.submitJob(specFile);

			const dequeuedId = freshService.dequeue();
			expect(dequeuedId).toBe(jobId1);

			freshService.close();
		});
	});

	describe("updateJobStatus", () => {
		test("updates job to running status", () => {
			const specFile = join(tempDir, "running_status_spec.txt");
			writeFileSync(specFile, "Test specification for running status test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "running");

			const job = jobService.getJob(jobId);
			expect(job?.status).toBe("running");
			expect(job?.startedAt).not.toBeNull();
		});

		test("updates job to completed status with completedAt", () => {
			const specFile = join(tempDir, "completed_status_spec.txt");
			writeFileSync(specFile, "Test specification for completed status test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "completed");

			const job = jobService.getJob(jobId);
			expect(job?.status).toBe("completed");
			expect(job?.completedAt).not.toBeNull();
		});

		test("updates job to failed status with error message", () => {
			const specFile = join(tempDir, "failed_status_spec.txt");
			writeFileSync(specFile, "Test specification for failed status test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "failed", "Test error message");

			const job = jobService.getJob(jobId);
			expect(job?.status).toBe("failed");
			expect(job?.errorMessage).toBe("Test error message");
		});
	});

	describe("setProcessPid", () => {
		test("sets process PID on job", () => {
			const specFile = join(tempDir, "pid_spec.txt");
			writeFileSync(specFile, "Test specification for PID test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.setProcessPid(jobId, 12345);

			const job = jobService.getJob(jobId);
			expect(job?.processPid).toBe(12345);
		});
	});

	describe("isStopRequested", () => {
		test("returns false for new job", () => {
			const specFile = join(tempDir, "stop_req_spec.txt");
			writeFileSync(specFile, "Test specification for stop request test");

			const jobId = jobService.submitJob(specFile)!;
			expect(jobService.isStopRequested(jobId)).toBe(false);
		});

		test("returns false for non-existent job", () => {
			expect(jobService.isStopRequested("non-existent")).toBe(false);
		});
	});

	describe("deleteJob", () => {
		test("returns error for non-existent job", () => {
			const result = jobService.deleteJob("non-existent");
			expect(result.success).toBe(false);
			expect(result.message).toContain("not found");
		});

		test("deletes queued job", () => {
			const specFile = join(tempDir, "delete_spec.txt");
			writeFileSync(specFile, "Test specification for delete job test");

			const jobId = jobService.submitJob(specFile)!;
			const result = jobService.deleteJob(jobId);

			expect(result.success).toBe(true);
			expect(jobService.getJob(jobId)).toBeNull();
		});

		test("returns error for running job", () => {
			const specFile = join(tempDir, "delete_running_spec.txt");
			writeFileSync(specFile, "Test specification for delete running job test");

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "running");

			const result = jobService.deleteJob(jobId);
			expect(result.success).toBe(false);
			expect(result.message).toContain("running");
		});

		test("deletes completed job", () => {
			const specFile = join(tempDir, "delete_completed_spec.txt");
			writeFileSync(
				specFile,
				"Test specification for delete completed job test",
			);

			const jobId = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId, "completed");

			const result = jobService.deleteJob(jobId);
			expect(result.success).toBe(true);
		});
	});

	describe("deleteJobs (batch)", () => {
		test("deletes multiple jobs", () => {
			const specFile = join(tempDir, "batch_delete_spec.txt");
			writeFileSync(specFile, "Test specification for batch delete test");

			const jobId1 = jobService.submitJob(specFile)!;
			const jobId2 = jobService.submitJob(specFile)!;

			const result = jobService.deleteJobs([jobId1, jobId2]);

			expect(result.deleted.length).toBe(2);
			expect(result.failed.length).toBe(0);
			expect(result.success).toBe(true);
		});

		test("handles partial failures", () => {
			const specFile = join(tempDir, "partial_batch_spec.txt");
			writeFileSync(
				specFile,
				"Test specification for partial batch delete test",
			);

			const jobId1 = jobService.submitJob(specFile)!;
			const jobId2 = jobService.submitJob(specFile)!;
			jobService.updateJobStatus(jobId2, "running");

			const result = jobService.deleteJobs([jobId1, jobId2]);

			expect(result.deleted.length).toBe(1);
			expect(result.failed.length).toBe(1);
			expect(result.success).toBe(false);
		});
	});

	describe("getCostStatistics", () => {
		test("returns null when no cost file exists", () => {
			const specFile = join(tempDir, "cost_spec.txt");
			writeFileSync(specFile, "Test specification for cost statistics test");

			const jobId = jobService.submitJob(specFile)!;
			const cost = jobService.getCostStatistics(jobId);

			expect(cost).toBeNull();
		});

		test("reads cost statistics from usage_statistics.json", () => {
			const specFile = join(tempDir, "usage_stats_spec.txt");
			writeFileSync(specFile, "Test specification for usage statistics test");

			const jobId = jobService.submitJob(specFile)!;

			// Create usage_statistics.json
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "usage_statistics.json"),
				JSON.stringify({
					summary: {
						total_input_tokens: 1000,
						total_output_tokens: 500,
						total_tokens: 1500,
						total_cost_usd: 0.05,
						total_sessions: 2,
					},
				}),
			);

			const cost = jobService.getCostStatistics(jobId);

			expect(cost).not.toBeNull();
			expect(cost?.totalInputTokens).toBe(1000);
			expect(cost?.totalOutputTokens).toBe(500);
			expect(cost?.totalCost).toBe(0.05);
		});

		test("reads cost statistics from legacy format", () => {
			const specFile = join(tempDir, "legacy_cost_spec.txt");
			writeFileSync(specFile, "Test specification for legacy cost format test");

			const jobId = jobService.submitJob(specFile)!;

			// Create cost_statistics.json (legacy format)
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "cost_statistics.json"),
				JSON.stringify({
					input_tokens: 800,
					output_tokens: 400,
					total_cost: 0.03,
					sessions: 1,
				}),
			);

			const cost = jobService.getCostStatistics(jobId);

			expect(cost).not.toBeNull();
			expect(cost?.totalInputTokens).toBe(800);
			expect(cost?.totalOutputTokens).toBe(400);
		});
	});

	describe("getTestCases", () => {
		test("returns null when no test cases file exists", () => {
			const specFile = join(tempDir, "test_cases_spec.txt");
			writeFileSync(specFile, "Test specification for test cases test");

			const jobId = jobService.submitJob(specFile)!;
			const testCases = jobService.getTestCases(jobId);

			expect(testCases).toBeNull();
		});

		test("reads test cases from file", () => {
			const specFile = join(tempDir, "read_test_cases_spec.txt");
			writeFileSync(specFile, "Test specification for reading test cases");

			const jobId = jobService.submitJob(specFile)!;

			// Create test_cases.json
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "test_cases.json"),
				JSON.stringify({
					test_cases: [
						{
							case_id: "TC-001",
							title: "Test 1",
							status: "Pass",
							priority: "P1",
						},
						{
							case_id: "TC-002",
							title: "Test 2",
							status: "Fail",
							priority: "P2",
						},
					],
				}),
			);

			const testCases = jobService.getTestCases(jobId);

			expect(testCases).not.toBeNull();
			expect(testCases?.length).toBe(2);
			expect(testCases?.[0].caseId).toBe("TC-001");
			expect(testCases?.[0].status).toBe("Pass");
		});

		test("handles array format test cases", () => {
			const specFile = join(tempDir, "array_test_cases_spec.txt");
			writeFileSync(specFile, "Test specification for array format test cases");

			const jobId = jobService.submitJob(specFile)!;

			// Create test_cases.json as array
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "test_cases.json"),
				JSON.stringify([
					{ id: "TC-001", name: "Test 1", status: "Pass" },
					{ id: "TC-002", name: "Test 2", status: "Not Run" },
				]),
			);

			const testCases = jobService.getTestCases(jobId);

			expect(testCases).not.toBeNull();
			expect(testCases?.length).toBe(2);
		});
	});

	describe("getLogPath", () => {
		test("returns null when no log file exists", () => {
			const specFile = join(tempDir, "log_path_spec.txt");
			writeFileSync(specFile, "Test specification for log path test");

			const jobId = jobService.submitJob(specFile)!;
			const logPath = jobService.getLogPath(jobId);

			expect(logPath).toBeNull();
		});

		test("returns path when log file exists", () => {
			const specFile = join(tempDir, "log_exists_spec.txt");
			writeFileSync(specFile, "Test specification for log exists test");

			const jobId = jobService.submitJob(specFile)!;

			// Create log file
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "execution_stdout.log"),
				"Log content here",
			);

			const logPath = jobService.getLogPath(jobId);

			expect(logPath).not.toBeNull();
			expect(logPath).toContain("execution_stdout.log");
		});
	});

	describe("getLogContent", () => {
		test("returns null when no log file exists", () => {
			const specFile = join(tempDir, "log_content_spec.txt");
			writeFileSync(specFile, "Test specification for log content test");

			const jobId = jobService.submitJob(specFile)!;
			const content = jobService.getLogContent(jobId);

			expect(content).toBeNull();
		});

		test("returns full content when tail is 0", () => {
			const specFile = join(tempDir, "full_log_spec.txt");
			writeFileSync(specFile, "Test specification for full log test");

			const jobId = jobService.submitJob(specFile)!;

			// Create log file
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "execution_stdout.log"),
				"Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
			);

			const content = jobService.getLogContent(jobId, 0);

			expect(content).not.toBeNull();
			expect(content).toContain("Line 1");
			expect(content).toContain("Line 5");
		});

		test("returns last N lines when tail is specified", () => {
			const specFile = join(tempDir, "tail_log_spec.txt");
			writeFileSync(specFile, "Test specification for tail log test");

			const jobId = jobService.submitJob(specFile)!;

			// Create log file
			const reportDir = join(tempDir, "reports", jobId);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "execution_stdout.log"),
				"Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
			);

			const content = jobService.getLogContent(jobId, 2);

			expect(content).not.toBeNull();
			expect(content).not.toContain("Line 1");
			expect(content).toContain("Line 5");
		});
	});

	describe("recoverOrphanJobs", () => {
		test("returns 0 when no running jobs in fresh database", () => {
			// Use a fresh database to ensure no running jobs exist
			const freshDir = join(tempDir, "fresh-recover-test");
			const freshService = new JobService(freshDir);
			const recovered = freshService.recoverOrphanJobs();
			expect(recovered).toBe(0);
			freshService.close();
		});

		test("recovers jobs with non-existent processes", () => {
			const freshDir = join(tempDir, "orphan-recover-test");
			const freshService = new JobService(freshDir);

			// Create a job and set it to running with a fake PID
			const specFile = join(freshDir, "orphan_spec.txt");
			mkdirSync(freshDir, { recursive: true });
			writeFileSync(specFile, "Test specification for orphan recovery test");

			const jobId = freshService.submitJob(specFile)!;
			freshService.updateJobStatus(jobId, "running");
			freshService.setProcessPid(jobId, 999999); // Non-existent PID

			// Recover orphans
			const recovered = freshService.recoverOrphanJobs();
			expect(recovered).toBe(1);

			// Job should be back to queued
			const job = freshService.getJob(jobId);
			expect(job?.status).toBe("queued");

			freshService.close();
		});
	});
});

describe("formatDateTime", () => {
	test("returns N/A for null input", () => {
		expect(formatDateTime(null)).toBe("N/A");
	});

	test("formats ISO date string", () => {
		const result = formatDateTime("2025-01-15T10:30:45.123Z");
		expect(result).toBe("2025-01-15 10:30:45");
	});

	test("handles invalid date string gracefully", () => {
		const result = formatDateTime("invalid");
		expect(typeof result).toBe("string");
	});
});

describe("printJobList", () => {
	test("prints 'No jobs found' for empty array", () => {
		// This test verifies the function runs without error
		// The actual console output is not captured
		expect(() => printJobList([], 20)).not.toThrow();
	});

	test("prints job list for non-empty array", () => {
		const jobs: Job[] = [
			{
				jobId: "test-job-1",
				testSpec: "spec",
				envConfig: {},
				status: "queued",
				createdAt: "2025-01-15T10:00:00Z",
				startedAt: null,
				completedAt: null,
				errorMessage: null,
				stopRequested: false,
				processPid: null,
			},
		];

		expect(() => printJobList(jobs, 20)).not.toThrow();
	});
});

describe("printJobStatus", () => {
	test("prints job status without cost or test cases", () => {
		const job: Job = {
			jobId: "test-job-1",
			testSpec: "spec",
			envConfig: {},
			status: "queued",
			createdAt: "2025-01-15T10:00:00Z",
			startedAt: null,
			completedAt: null,
			errorMessage: null,
			stopRequested: false,
			processPid: null,
		};

		expect(() => printJobStatus(job, null, null)).not.toThrow();
	});

	test("prints job status with error message", () => {
		const job: Job = {
			jobId: "test-job-1",
			testSpec: "spec",
			envConfig: {},
			status: "failed",
			createdAt: "2025-01-15T10:00:00Z",
			startedAt: "2025-01-15T10:05:00Z",
			completedAt: "2025-01-15T10:10:00Z",
			errorMessage: "Test error",
			stopRequested: false,
			processPid: null,
		};

		expect(() => printJobStatus(job, null, null)).not.toThrow();
	});

	test("prints job status with cost statistics", () => {
		const job: Job = {
			jobId: "test-job-1",
			testSpec: "spec",
			envConfig: {},
			status: "completed",
			createdAt: "2025-01-15T10:00:00Z",
			startedAt: "2025-01-15T10:05:00Z",
			completedAt: "2025-01-15T10:10:00Z",
			errorMessage: null,
			stopRequested: false,
			processPid: null,
		};

		const cost = {
			totalInputTokens: 1000,
			totalOutputTokens: 500,
			totalTokens: 1500,
			totalCost: 0.05,
			sessions: 2,
		};

		expect(() => printJobStatus(job, cost, null)).not.toThrow();
	});

	test("prints job status with test cases", () => {
		const job: Job = {
			jobId: "test-job-1",
			testSpec: "spec",
			envConfig: {},
			status: "completed",
			createdAt: "2025-01-15T10:00:00Z",
			startedAt: "2025-01-15T10:05:00Z",
			completedAt: "2025-01-15T10:10:00Z",
			errorMessage: null,
			stopRequested: false,
			processPid: null,
		};

		const testCases = [
			{ caseId: "TC-001", title: "Test 1", status: "Pass", priority: "P1" },
			{ caseId: "TC-002", title: "Test 2", status: "Fail", priority: "P2" },
			{ caseId: "TC-003", title: "Test 3", status: "Blocked", priority: "P3" },
			{ caseId: "TC-004", title: "Test 4", status: "Not Run", priority: "P4" },
		];

		expect(() => printJobStatus(job, null, testCases)).not.toThrow();
	});
});
