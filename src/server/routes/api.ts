/**
 * E2E Agent Web Service - API Routes
 *
 * RESTful API endpoints following Bun.serve best practices.
 */

import type { BunRequest } from "bun";
import type {
  ServiceContext,
  JobSubmitRequest,
  JobStatus,
  ErrorResponse,
} from "../types/index.ts";
import { logger } from "../utils/logger.ts";

/**
 * CORS headers for API responses
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Add CORS headers to response
 */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Create JSON response with CORS headers
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return withCors(Response.json(data, { status }));
}

/**
 * Create error response
 */
function errorResponse(
  error: string,
  code: string,
  status: number = 400
): Response {
  const body: ErrorResponse = { success: false, error, code };
  return jsonResponse(body, status);
}

/**
 * Build API route handlers
 *
 * Returns an object suitable for Bun.serve routes option
 */
export function buildApiRoutes(services: ServiceContext) {
  const { jobManager, resultService } = services;

  return {
    /**
     * POST /api/jobs - Submit a new test job
     */
    "POST /api/jobs": async (req: Request) => {
      try {
        const body = (await req.json()) as JobSubmitRequest;
        const { test_spec, env_config = {} } = body;

        if (!test_spec) {
          return errorResponse("test_spec is required", "MISSING_FIELDS");
        }

        const job = jobManager.createJob(test_spec, env_config);

        return jsonResponse(
          {
            success: true,
            job_id: job.jobId,
            message: "Job submitted",
            status: job.status,
            created_at: job.createdAt,
          },
          201
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Submission failed";
        logger.error("Job submission error", error);
        return errorResponse(message, "VALIDATION_ERROR");
      }
    },

    /**
     * GET /api/jobs - List all jobs
     */
    "GET /api/jobs": (req: Request) => {
      try {
        const url = new URL(req.url);
        const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
        const jobs = jobManager.listJobs(Math.min(limit, 1000));

        return jsonResponse({
          success: true,
          jobs: jobs.map((job) => ({
            job_id: job.jobId,
            status: job.status,
            created_at: job.createdAt,
            started_at: job.startedAt,
            completed_at: job.completedAt,
            error_message: job.errorMessage,
          })),
          total: jobs.length,
        });
      } catch (error) {
        logger.error("Job list error", error);
        return errorResponse("Failed to get job list", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * GET /api/jobs/:id - Get job status
     */
    "GET /api/jobs/:id": (req: BunRequest<"/api/jobs/:id">) => {
      try {
        const jobId = req.params.id;
        const job = jobManager.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", "JOB_NOT_FOUND", 404);
        }

        // Add cost and test case info if available
        const cost = resultService.getCostStatistics(jobId);
        const testCases = resultService.getTestCases(jobId);
        const summary = resultService.getTestSummary(jobId);

        return jsonResponse({
          success: true,
          job: {
            job_id: job.jobId,
            status: job.status,
            created_at: job.createdAt,
            started_at: job.startedAt,
            completed_at: job.completedAt,
            error_message: job.errorMessage,
            test_spec: job.testSpec,
            cost,
            test_cases: testCases,
            summary,
          },
        });
      } catch (error) {
        logger.error("Get job status error", error);
        return errorResponse("Failed to get job status", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * GET /api/jobs/:id/logs - Get job execution logs
     */
    "GET /api/jobs/:id/logs": (req: BunRequest<"/api/jobs/:id/logs">) => {
      try {
        const jobId = req.params.id;
        const url = new URL(req.url);
        const tail = parseInt(url.searchParams.get("tail") ?? "0", 10);
        const format = url.searchParams.get("format") ?? "json"; // json or text

        const job = jobManager.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", "JOB_NOT_FOUND", 404);
        }

        const hasLog = resultService.hasLog(jobId);

        if (!hasLog) {
          // Job exists but no log yet
          return jsonResponse({
            success: true,
            job_id: jobId,
            status: job.status,
            has_log: false,
            message: job.status === "queued"
              ? "Job has not started yet, logs will be generated after execution"
              : "Log file does not exist",
          });
        }

        const content = resultService.getLogContent(jobId, tail);

        if (content === null) {
          return errorResponse("Failed to read log", "LOG_READ_ERROR", 500);
        }

        // Return as plain text if requested
        if (format === "text") {
          return withCors(
            new Response(content, {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }

        // Return as JSON (default)
        return jsonResponse({
          success: true,
          job_id: jobId,
          status: job.status,
          has_log: true,
          log_path: resultService.getLogPath(jobId),
          tail: tail > 0 ? tail : null,
          content,
        });
      } catch (error) {
        logger.error("Get job logs error", error);
        return errorResponse("Failed to get logs", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * GET /api/jobs/:id/report - View HTML report
     */
    "GET /api/jobs/:id/report": (req: BunRequest<"/api/jobs/:id/report">) => {
      try {
        const jobId = req.params.id;
        const job = jobManager.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", "JOB_NOT_FOUND", 404);
        }

        const completedStatuses: JobStatus[] = [
          "completed",
          "failed",
          "stopped",
        ];
        if (!completedStatuses.includes(job.status)) {
          return errorResponse(
            `Job not completed yet (current status: ${job.status})`,
            "REPORT_NOT_READY"
          );
        }

        const htmlPath = resultService.getReportHtmlPath(jobId);
        if (!htmlPath) {
          return errorResponse("Report file not found", "REPORT_NOT_FOUND", 404);
        }

        const file = Bun.file(htmlPath);
        return withCors(
          new Response(file, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        );
      } catch (error) {
        logger.error("View report error", error);
        return errorResponse("Failed to get report", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * GET /api/jobs/:id/download - Download ZIP report
     */
    "GET /api/jobs/:id/download": async (
      req: BunRequest<"/api/jobs/:id/download">
    ) => {
      try {
        const jobId = req.params.id;
        const job = jobManager.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", "JOB_NOT_FOUND", 404);
        }

        const completedStatuses: JobStatus[] = [
          "completed",
          "failed",
          "stopped",
        ];
        if (!completedStatuses.includes(job.status)) {
          return errorResponse(
            `Job not completed yet (current status: ${job.status})`,
            "REPORT_NOT_READY"
          );
        }

        const zipPath = await resultService.createReportZip(jobId);
        if (!zipPath) {
          return errorResponse("Unable to create ZIP file", "ZIP_CREATION_FAILED", 500);
        }

        const file = Bun.file(zipPath);
        return withCors(
          new Response(file, {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${jobId}_report.zip"`,
            },
          })
        );
      } catch (error) {
        logger.error("Download report error", error);
        return errorResponse("Failed to download report", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * POST /api/jobs/:id/stop - Stop a job
     */
    "POST /api/jobs/:id/stop": (req: BunRequest<"/api/jobs/:id/stop">) => {
      try {
        const jobId = req.params.id;
        const result = jobManager.stopJob(jobId);

        if (!result.success) {
          return errorResponse(result.message, "CANNOT_STOP");
        }

        return jsonResponse({
          success: true,
          message: result.message,
          job_id: jobId,
          status: result.status,
        });
      } catch (error) {
        logger.error("Stop job error", error);
        return errorResponse("Failed to stop job", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * DELETE /api/jobs/:id - Delete a single job
     */
    "DELETE /api/jobs/:id": (req: BunRequest<"/api/jobs/:id">) => {
      try {
        const jobId = req.params.id;
        const result = jobManager.deleteJob(jobId);

        if (!result.success) {
          return errorResponse(result.message, "CANNOT_DELETE");
        }

        return jsonResponse({
          success: true,
          message: result.message,
          job_id: jobId,
        });
      } catch (error) {
        logger.error("Delete job error", error);
        return errorResponse("Failed to delete job", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * DELETE /api/jobs - Batch delete jobs
     */
    "DELETE /api/jobs": async (req: Request) => {
      try {
        const body = (await req.json()) as { job_ids?: string[] };
        const jobIds = body.job_ids;

        if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
          return errorResponse("job_ids is required and must be a non-empty array", "MISSING_FIELDS");
        }

        const result = jobManager.deleteJobs(jobIds);

        return jsonResponse({
          success: result.success,
          message: result.success
            ? `Successfully deleted ${result.deleted.length} job(s)`
            : `Partial failure: ${result.deleted.length} deleted, ${result.failed.length} failed`,
          deleted: result.deleted,
          failed: result.failed,
        });
      } catch (error) {
        logger.error("Batch delete jobs error", error);
        return errorResponse("Failed to batch delete jobs", "INTERNAL_ERROR", 500);
      }
    },

    /**
     * GET /api/template/download - Download test spec template
     */
    "GET /api/template/download": async () => {
      try {
        const { config } = await import("../config.ts");
        const templatePath = `${config.PROJECT_ROOT}/test_spec.txt.template`;

        const file = Bun.file(templatePath);
        if (!(await file.exists())) {
          return errorResponse("Template file not found", "TEMPLATE_NOT_FOUND", 404);
        }

        return withCors(
          new Response(file, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition":
                'attachment; filename="test_spec.txt.template"',
            },
          })
        );
      } catch (error) {
        logger.error("Download template error", error);
        return errorResponse("Failed to download template", "INTERNAL_ERROR", 500);
      }
    },
  };
}

/**
 * Build health check route
 */
export function buildHealthRoute(services: ServiceContext) {
  return {
    "GET /health": () => {
      // Get running job from database (executor runs independently)
      const runningJob = services.jobManager.getRunningJob();
      return jsonResponse({
        status: "healthy",
        version: "2.0.0",
        runtime: `bun ${Bun.version}`,
        uptime: process.uptime(),
        queue_size: services.jobManager.getQueueSize(),
        current_job: runningJob?.jobId ?? null,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
