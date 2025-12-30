/**
 * JobManager Tests
 *
 * Tests for the JobManager service using bun:test
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobManager } from "../services/JobManager.ts";

describe("JobManager", () => {
	let tempDir: string;
	let jobManager: JobManager;

	beforeEach(() => {
		// Create a temporary directory for the test database
		tempDir = mkdtempSync(join(tmpdir(), "jobmanager-test-"));
		jobManager = new JobManager(tempDir);
	});

	afterEach(() => {
		// Clean up
		jobManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("createJob", () => {
		it("should create a new job with queued status", () => {
			const testSpec = "Test specification content with at least 10 characters";
			const job = jobManager.createJob(testSpec);

			expect(job).toBeDefined();
			expect(job.jobId).toMatch(/^[a-f0-9-]{36}$/);
			expect(job.status).toBe("queued");
			expect(job.testSpec).toBe(testSpec);
			expect(job.createdAt).toBeDefined();
		});

		it("should create job with environment config", () => {
			const testSpec = "Test spec with at least 10 characters for validation";
			const envConfig = { APP_URL: "http://localhost:3000", USERNAME: "test" };

			const job = jobManager.createJob(testSpec, envConfig);

			expect(job.envConfig).toEqual(envConfig);
		});

		it("should add job to queue", () => {
			const job = jobManager.createJob("Test spec with at least 10 characters");

			expect(jobManager.getQueueSize()).toBe(1);
			expect(jobManager.getJob(job.jobId)?.status).toBe("queued");
		});

		it("should throw error for empty test spec", () => {
			expect(() => jobManager.createJob("")).toThrow(
				"test_spec cannot be empty",
			);
		});

		it("should throw error for test spec exceeding size limit", () => {
			const largeSpec = "x".repeat(200000); // 200KB - exceeds TEST_SPEC_MAX_LENGTH (100000)
			expect(() => jobManager.createJob(largeSpec)).toThrow(
				"test_spec exceeds size limit",
			);
		});
	});

	describe("getJob", () => {
		it("should retrieve existing job", () => {
			const original = jobManager.createJob(
				"Test spec with at least 10 characters",
			);
			const retrieved = jobManager.getJob(original.jobId);

			expect(retrieved).toBeDefined();
			expect(retrieved?.jobId).toBe(original.jobId);
			expect(retrieved?.testSpec).toBe(original.testSpec);
		});

		it("should return null for non-existent job", () => {
			const job = jobManager.getJob("non-existent-id");
			expect(job).toBeNull();
		});
	});

	describe("listJobs", () => {
		it("should list all jobs", () => {
			jobManager.createJob("Spec 1 with enough characters");
			jobManager.createJob("Spec 2 with enough characters");
			jobManager.createJob("Spec 3 with enough characters");

			const jobs = jobManager.listJobs();

			expect(jobs.length).toBe(3);
		});

		it("should respect limit parameter", () => {
			for (let i = 0; i < 10; i++) {
				jobManager.createJob(
					`Spec ${i} with enough characters to pass validation`,
				);
			}

			const jobs = jobManager.listJobs(5);

			expect(jobs.length).toBe(5);
		});

		it("should return empty array when no jobs", () => {
			const jobs = jobManager.listJobs();
			expect(jobs).toEqual([]);
		});
	});

	describe("dequeue", () => {
		it("should return job ID from queue", () => {
			const job = jobManager.createJob("Test spec with at least 10 characters");
			const dequeuedId = jobManager.dequeue();

			expect(dequeuedId).toBe(job.jobId);
		});

		it("should return null when queue is empty", () => {
			const id = jobManager.dequeue();
			expect(id).toBeNull();
		});

		it("should dequeue in FIFO order", () => {
			const job1 = jobManager.createJob("Spec 1 with enough characters");
			const job2 = jobManager.createJob("Spec 2 with enough characters");

			const first = jobManager.dequeue();
			const second = jobManager.dequeue();

			expect(first).toBe(job1.jobId);
			expect(second).toBe(job2.jobId);
		});
	});

	describe("markJobStarted", () => {
		it("should update job status to running", () => {
			const job = jobManager.createJob("Test spec with at least 10 characters");
			jobManager.dequeue();
			jobManager.markJobStarted(job.jobId);

			const updated = jobManager.getJob(job.jobId);

			expect(updated?.status).toBe("running");
			expect(updated?.startedAt).toBeDefined();
		});
	});

	describe("updateJobStatus", () => {
		it("should update status to completed", () => {
			const job = jobManager.createJob("Test spec with at least 10 characters");
			jobManager.updateJobStatus(job.jobId, "completed");

			const updated = jobManager.getJob(job.jobId);

			expect(updated?.status).toBe("completed");
			expect(updated?.completedAt).toBeDefined();
		});

		it("should update status with error message", () => {
			const job = jobManager.createJob("Test spec with at least 10 characters");
			const errorMsg = "Test failed";
			jobManager.updateJobStatus(job.jobId, "failed", errorMsg);

			const updated = jobManager.getJob(job.jobId);

			expect(updated?.status).toBe("failed");
			expect(updated?.errorMessage).toBe(errorMsg);
		});
	});

	describe("stopJob", () => {
		it("should mark queued job as cancelled", () => {
			const job = jobManager.createJob("Test spec with enough chars");
			const result = jobManager.stopJob(job.jobId);

			expect(result.success).toBe(true);
			expect(jobManager.getJob(job.jobId)?.status).toBe("cancelled");
		});

		it("should set stop request for running job", () => {
			const job = jobManager.createJob("Test spec with enough characters");
			jobManager.dequeue();
			jobManager.markJobStarted(job.jobId);

			const result = jobManager.stopJob(job.jobId);

			expect(result.success).toBe(true);
			expect(jobManager.isStopRequested(job.jobId)).toBe(true);
		});

		it("should fail for already completed job", () => {
			const job = jobManager.createJob("Test spec with enough characters");
			jobManager.updateJobStatus(job.jobId, "completed");

			const result = jobManager.stopJob(job.jobId);

			expect(result.success).toBe(false);
		});

		it("should fail for non-existent job", () => {
			const result = jobManager.stopJob("non-existent");

			expect(result.success).toBe(false);
		});
	});

	describe("setProcessPid", () => {
		it("should store process PID", () => {
			const job = jobManager.createJob("Test spec with enough characters");
			const pid = 12345;

			jobManager.setProcessPid(job.jobId, pid);

			expect(jobManager.getProcessPid(job.jobId)).toBe(pid);
		});
	});

	describe("getQueueSize", () => {
		it("should return correct queue size", () => {
			expect(jobManager.getQueueSize()).toBe(0);

			jobManager.createJob("Spec 1 with enough characters");
			expect(jobManager.getQueueSize()).toBe(1);

			jobManager.createJob("Spec 2 with enough characters");
			expect(jobManager.getQueueSize()).toBe(2);

			jobManager.dequeue();
			expect(jobManager.getQueueSize()).toBe(1);
		});
	});

	describe("deleteJob", () => {
		it("should delete a queued job", () => {
			const job = jobManager.createJob(
				"Test spec to delete with enough characters",
			);
			const result = jobManager.deleteJob(job.jobId);

			expect(result.success).toBe(true);
			expect(result.message).toContain("deleted");
			expect(jobManager.getJob(job.jobId)).toBeNull();
			expect(jobManager.getQueueSize()).toBe(0);
		});

		it("should delete a completed job", () => {
			const job = jobManager.createJob(
				"Test spec for completed with enough characters",
			);
			jobManager.updateJobStatus(job.jobId, "completed");

			const result = jobManager.deleteJob(job.jobId);

			expect(result.success).toBe(true);
			expect(jobManager.getJob(job.jobId)).toBeNull();
		});

		it("should delete a failed job", () => {
			const job = jobManager.createJob(
				"Test spec for failed with enough characters",
			);
			jobManager.updateJobStatus(job.jobId, "failed", "Test error");

			const result = jobManager.deleteJob(job.jobId);

			expect(result.success).toBe(true);
			expect(jobManager.getJob(job.jobId)).toBeNull();
		});

		it("should not delete a running job", () => {
			const job = jobManager.createJob(
				"Test spec for running with enough characters",
			);
			jobManager.dequeue();
			jobManager.markJobStarted(job.jobId);

			const result = jobManager.deleteJob(job.jobId);

			expect(result.success).toBe(false);
			expect(result.message).toContain("running");
			expect(jobManager.getJob(job.jobId)).not.toBeNull();
		});

		it("should return error for non-existent job", () => {
			const result = jobManager.deleteJob("non-existent-id");

			expect(result.success).toBe(false);
			expect(result.message).toContain("not found");
		});

		it("should clean up job files when deleting", () => {
			const job = jobManager.createJob(
				"Test spec for file cleanup with enough characters",
			);

			// Create mock job and report directories
			const jobDir = join(tempDir, "jobs", job.jobId);
			const reportDir = join(tempDir, "reports", job.jobId);
			mkdirSync(jobDir, { recursive: true });
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(join(jobDir, "test.txt"), "test content");
			writeFileSync(join(reportDir, "report.html"), "<html></html>");

			// Verify directories exist
			expect(existsSync(jobDir)).toBe(true);
			expect(existsSync(reportDir)).toBe(true);

			// Delete job
			const result = jobManager.deleteJob(job.jobId);

			expect(result.success).toBe(true);
			// Verify directories are cleaned up
			expect(existsSync(jobDir)).toBe(false);
			expect(existsSync(reportDir)).toBe(false);
		});
	});

	describe("deleteJobs", () => {
		it("should delete multiple jobs", () => {
			const job1 = jobManager.createJob(
				"Spec 1 for batch delete with enough chars",
			);
			const job2 = jobManager.createJob(
				"Spec 2 for batch delete with enough chars",
			);
			const job3 = jobManager.createJob(
				"Spec 3 for batch delete with enough chars",
			);

			const result = jobManager.deleteJobs([
				job1.jobId,
				job2.jobId,
				job3.jobId,
			]);

			expect(result.success).toBe(true);
			expect(result.deleted.length).toBe(3);
			expect(result.failed.length).toBe(0);
			expect(jobManager.listJobs().length).toBe(0);
		});

		it("should handle partial failures in batch delete", () => {
			const job1 = jobManager.createJob(
				"Spec 1 for partial batch with enough chars",
			);
			const job2 = jobManager.createJob(
				"Spec 2 for partial batch with enough chars",
			);

			// Make job2 running so it can't be deleted
			jobManager.dequeue();
			jobManager.dequeue();
			jobManager.markJobStarted(job2.jobId);

			const result = jobManager.deleteJobs([
				job1.jobId,
				job2.jobId,
				"non-existent",
			]);

			expect(result.success).toBe(false);
			expect(result.deleted.length).toBe(1);
			expect(result.deleted).toContain(job1.jobId);
			expect(result.failed.length).toBe(2);
		});

		it("should return success for empty array", () => {
			const result = jobManager.deleteJobs([]);

			expect(result.success).toBe(true);
			expect(result.deleted.length).toBe(0);
			expect(result.failed.length).toBe(0);
		});
	});
});
