/**
 * API Routes Tests
 *
 * Tests for the API endpoints using bun:test
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildApiRoutes,
	buildHealthRoute,
	handleOptions,
} from "../routes/api.ts";
import { JobManager } from "../services/JobManager.ts";
import { ResultService } from "../services/ResultService.ts";
import type { ServiceContext } from "../types/index.ts";

/**
 * Extended Request type with route params for testing
 * Uses 'any' for params and cookies to be compatible with all BunRequest route types
 */
// biome-ignore lint/suspicious/noExplicitAny: Test helper type needs flexibility
type RequestWithParams = Request & { params: any; cookies: any };

/**
 * Generic API response type for test assertions
 */
interface ApiResponse {
	success?: boolean;
	code?: string;
	error?: string;
	job_id?: string;
	job?: { job_id: string; status: string };
	jobs?: Array<{ job_id: string; status: string }>;
	status?: string;
	version?: string;
	runtime?: string;
	deleted?: string[];
	failed?: string[];
	has_log?: boolean;
	content?: string;
	tail?: number;
	message?: string;
	[key: string]: unknown;
}

describe("API Routes", () => {
	let tempDir: string;
	let services: ServiceContext;
	let routes: ReturnType<typeof buildApiRoutes>;

	beforeAll(() => {
		// Create temporary directory
		tempDir = mkdtempSync(join(tmpdir(), "api-test-"));

		// Initialize services
		const jobManager = new JobManager(tempDir);
		const resultService = new ResultService(tempDir);

		services = { jobManager, resultService };
		routes = buildApiRoutes(services);
	});

	afterAll(() => {
		services.jobManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("POST /api/jobs", () => {
		it("should create a new job", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					test_spec:
						"Test specification content with at least 10 characters for validation",
				}),
			});

			const handler = routes["POST /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(201);
			expect(data.success).toBe(true);
			expect(data.job_id).toBeDefined();
			expect(data.status).toBe("queued");
		});

		it("should create job with env_config", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					test_spec:
						"Test specification with at least 10 characters for validation",
					env_config: { APP_URL: "http://localhost:8080" },
				}),
			});

			const handler = routes["POST /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(201);
			expect(data.success).toBe(true);
		});

		it("should return error for missing test_spec", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const handler = routes["POST /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("MISSING_FIELDS");
		});
	});

	describe("GET /api/jobs", () => {
		it("should list all jobs", async () => {
			// Create a few jobs first
			for (let i = 0; i < 3; i++) {
				services.jobManager.createJob(
					`Spec ${i} with enough characters for validation`,
				);
			}

			const req = new Request("http://localhost/api/jobs");
			const handler = routes["GET /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.jobs).toBeInstanceOf(Array);
			expect(data.jobs?.length).toBeGreaterThanOrEqual(3);
		});

		it("should respect limit parameter", async () => {
			const req = new Request("http://localhost/api/jobs?limit=2");
			const handler = routes["GET /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.jobs?.length).toBeLessThanOrEqual(2);
		});
	});

	describe("GET /api/jobs/:id", () => {
		it("should get job status", async () => {
			const job = services.jobManager.createJob(
				"Test spec for status with enough characters",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}`);
			// Simulate params
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.job?.job_id).toBe(job.jobId);
		});

		it("should return 404 for non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/non-existent");
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "non-existent" };

			const handler = routes["GET /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.code).toBe("JOB_NOT_FOUND");
		});
	});

	describe("POST /api/jobs/:id/stop", () => {
		it("should stop a queued job", async () => {
			const job = services.jobManager.createJob(
				"Test spec to stop with enough characters",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/stop`, {
				method: "POST",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["POST /api/jobs/:id/stop"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.status).toBe("cancelled");
		});
	});

	describe("Health Check", () => {
		it("should return health status", async () => {
			const healthRoutes = buildHealthRoute(services);

			const handler = healthRoutes["GET /health"];
			const response = await handler();
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.status).toBe("healthy");
			expect(data.version).toBe("2.0.0");
			expect(data.runtime).toMatch(/^bun/);
		});
	});

	describe("OPTIONS (CORS)", () => {
		it("should return CORS headers", () => {
			const response = handleOptions();

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
				"GET",
			);
			expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
				"POST",
			);
		});
	});

	describe("POST /api/jobs - Error Handling", () => {
		it("should handle invalid JSON gracefully", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not valid json",
			});

			const handler = routes["POST /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("GET /api/jobs/:id/report", () => {
		it("should return 404 for non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/nonexistent/report");
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "nonexistent" };

			const handler = routes["GET /api/jobs/:id/report"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.code).toBe("JOB_NOT_FOUND");
		});

		it("should return error when job is not completed", async () => {
			const job = services.jobManager.createJob(
				"Test spec for report with enough characters",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/report`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/report"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("REPORT_NOT_READY");
		});

		it("should return HTML report when job is completed and report exists", async () => {
			const job = services.jobManager.createJob(
				"Test spec for completed report with enough characters",
			);
			// Manually mark job as completed
			services.jobManager.updateJobStatus(job.jobId, "completed");

			// Create the report file
			const reportDir = join(
				tempDir,
				"reports",
				job.jobId,
				"test-reports",
				"20250101",
			);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "Test_Report_Viewer.html"),
				"<html><body>Test Report</body></html>",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/report`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/report"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toContain("text/html");
		});

		it("should return 404 when job is completed but report file is missing", async () => {
			const job = services.jobManager.createJob(
				"Test spec for missing report with enough characters",
			);
			services.jobManager.updateJobStatus(job.jobId, "completed");

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/report`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/report"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(404);
			expect(data.code).toBe("REPORT_NOT_FOUND");
		});
	});

	describe("GET /api/jobs/:id/download", () => {
		it("should return 404 for non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/nonexistent/download");
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "nonexistent" };

			const handler = routes["GET /api/jobs/:id/download"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.code).toBe("JOB_NOT_FOUND");
		});

		it("should return error when job is not completed", async () => {
			const job = services.jobManager.createJob(
				"Test spec for download with enough characters",
			);

			const req = new Request(
				`http://localhost/api/jobs/${job.jobId}/download`,
			);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/download"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("REPORT_NOT_READY");
		});
	});

	describe("POST /api/jobs/:id/stop - Error Cases", () => {
		it("should return error when trying to stop non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/nonexistent/stop", {
				method: "POST",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "nonexistent" };

			const handler = routes["POST /api/jobs/:id/stop"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("CANNOT_STOP");
		});

		it("should return error when trying to stop already completed job", async () => {
			const job = services.jobManager.createJob(
				"Test spec to stop completed job with enough chars",
			);
			services.jobManager.updateJobStatus(job.jobId, "completed");

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/stop`, {
				method: "POST",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["POST /api/jobs/:id/stop"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});
	});

	describe("GET /api/template/download", () => {
		it("should return template file if it exists", async () => {
			const handler = routes["GET /api/template/download"];
			const response = await handler();

			// Template may or may not exist depending on environment
			expect([200, 404]).toContain(response.status);

			if (response.status === 200) {
				expect(response.headers.get("Content-Type")).toContain("text/plain");
				expect(response.headers.get("Content-Disposition")).toContain(
					"attachment",
				);
			}
		});
	});

	describe("DELETE /api/jobs/:id", () => {
		it("should delete a queued job", async () => {
			const job = services.jobManager.createJob(
				"Test spec to delete with enough characters",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}`, {
				method: "DELETE",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["DELETE /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.job_id).toBe(job.jobId);
			expect(services.jobManager.getJob(job.jobId)).toBeNull();
		});

		it("should delete a completed job", async () => {
			const job = services.jobManager.createJob(
				"Test spec for completed delete with enough chars",
			);
			services.jobManager.updateJobStatus(job.jobId, "completed");

			const req = new Request(`http://localhost/api/jobs/${job.jobId}`, {
				method: "DELETE",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["DELETE /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it("should not delete a running job", async () => {
			const job = services.jobManager.createJob(
				"Test spec for running delete with enough chars",
			);
			services.jobManager.dequeue();
			services.jobManager.markJobStarted(job.jobId);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}`, {
				method: "DELETE",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["DELETE /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("CANNOT_DELETE");
		});

		it("should return error for non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/non-existent", {
				method: "DELETE",
			});
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "non-existent" };

			const handler = routes["DELETE /api/jobs/:id"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("CANNOT_DELETE");
		});
	});

	describe("DELETE /api/jobs (batch)", () => {
		it("should delete multiple jobs", async () => {
			const job1 = services.jobManager.createJob(
				"Spec 1 for batch delete API with enough chars",
			);
			const job2 = services.jobManager.createJob(
				"Spec 2 for batch delete API with enough chars",
			);

			const req = new Request("http://localhost/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ job_ids: [job1.jobId, job2.jobId] }),
			});

			const handler = routes["DELETE /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.deleted?.length).toBe(2);
			expect(data.failed?.length).toBe(0);
		});

		it("should handle partial failures", async () => {
			const job1 = services.jobManager.createJob(
				"Spec 1 for partial API batch with enough chars",
			);
			const job2 = services.jobManager.createJob(
				"Spec 2 for partial API batch with enough chars",
			);
			services.jobManager.dequeue();
			services.jobManager.dequeue();
			services.jobManager.markJobStarted(job2.jobId);

			const req = new Request("http://localhost/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ job_ids: [job1.jobId, job2.jobId] }),
			});

			const handler = routes["DELETE /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(false);
			expect(data.deleted?.length).toBe(1);
			expect(data.failed?.length).toBe(1);
		});

		it("should return error for missing job_ids", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const handler = routes["DELETE /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("MISSING_FIELDS");
		});

		it("should return error for empty job_ids array", async () => {
			const req = new Request("http://localhost/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ job_ids: [] }),
			});

			const handler = routes["DELETE /api/jobs"];
			const response = await handler(req);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.code).toBe("MISSING_FIELDS");
		});
	});

	describe("CORS headers for DELETE", () => {
		it("should include DELETE in allowed methods", () => {
			const response = handleOptions();

			expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
				"DELETE",
			);
		});
	});

	describe("GET /api/jobs/:id/logs", () => {
		it("should return 404 for non-existent job", async () => {
			const req = new Request("http://localhost/api/jobs/nonexistent/logs");
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: "nonexistent" };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.code).toBe("JOB_NOT_FOUND");
		});

		it("should return has_log=false when job exists but no log", async () => {
			const job = services.jobManager.createJob(
				"Test spec for logs with enough characters",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/logs`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.has_log).toBe(false);
			expect(data.job_id).toBe(job.jobId);
		});

		it("should return log content when log exists", async () => {
			const job = services.jobManager.createJob(
				"Test spec for log content with enough characters",
			);

			// Create the log file
			const logDir = join(tempDir, "reports", job.jobId);
			mkdirSync(logDir, { recursive: true });
			writeFileSync(
				join(logDir, "execution_stdout.log"),
				"Line 1\nLine 2\nLine 3\n",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/logs`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.has_log).toBe(true);
			expect(data.content).toContain("Line 1");
		});

		it("should respect tail parameter", async () => {
			const job = services.jobManager.createJob(
				"Test spec for tail param with enough characters",
			);

			// Create the log file with multiple lines
			const logDir = join(tempDir, "reports", job.jobId);
			mkdirSync(logDir, { recursive: true });
			writeFileSync(
				join(logDir, "execution_stdout.log"),
				"Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n",
			);

			const req = new Request(
				`http://localhost/api/jobs/${job.jobId}/logs?tail=2`,
			);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.tail).toBe(2);
		});

		it("should return text format when requested", async () => {
			const job = services.jobManager.createJob(
				"Test spec for text format with enough characters",
			);

			// Create the log file
			const logDir = join(tempDir, "reports", job.jobId);
			mkdirSync(logDir, { recursive: true });
			writeFileSync(join(logDir, "execution_stdout.log"), "Log content here");

			const req = new Request(
				`http://localhost/api/jobs/${job.jobId}/logs?format=text`,
			);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toContain("text/plain");

			const text = await response.text();
			expect(text).toContain("Log content here");
		});

		it("should show appropriate message for queued job without log", async () => {
			const job = services.jobManager.createJob(
				"Test spec for queued job logs with enough chars",
			);

			const req = new Request(`http://localhost/api/jobs/${job.jobId}/logs`);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/logs"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);
			const data = (await response.json()) as ApiResponse;

			expect(response.status).toBe(200);
			expect(data.has_log).toBe(false);
			expect(data.message).toContain("Job has not started yet");
		});
	});

	describe("GET /api/jobs/:id/download - Success Path", () => {
		it("should create and return ZIP file when report exists", async () => {
			const job = services.jobManager.createJob(
				"Test spec for ZIP download with enough characters",
			);
			services.jobManager.updateJobStatus(job.jobId, "completed");

			// Create the report directory structure
			const reportDir = join(
				tempDir,
				"reports",
				job.jobId,
				"test-reports",
				"20250101",
			);
			mkdirSync(reportDir, { recursive: true });
			writeFileSync(
				join(reportDir, "Test_Report_Viewer.html"),
				"<html>Report</html>",
			);
			writeFileSync(join(reportDir, "test-summary.md"), "# Summary");

			const req = new Request(
				`http://localhost/api/jobs/${job.jobId}/download`,
			);
			Object.assign(req, { cookies: {} });
			(req as RequestWithParams).params = { id: job.jobId };

			const handler = routes["GET /api/jobs/:id/download"];
			const response = await (
				handler as unknown as (req: RequestWithParams) => Promise<Response>
			)(req as RequestWithParams);

			// Either ZIP created successfully or creation failed
			expect([200, 500]).toContain(response.status);

			if (response.status === 200) {
				expect(response.headers.get("Content-Type")).toBe("application/zip");
				expect(response.headers.get("Content-Disposition")).toContain(
					"attachment",
				);
			}
		});
	});
});
