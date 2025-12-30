/**
 * E2E Agent Web Service - Job Manager
 *
 * Manages test jobs using SQLite for persistence.
 * Implements CRUD operations with prepared statements for performance.
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { join } from "path";
import { mkdirSync, existsSync, rmSync } from "fs";
import type {
  Job,
  JobRow,
  JobStatus,
  StopJobResult,
} from "../types/index.ts";
import { config } from "../config.ts";
import { logger } from "../utils/logger.ts";

/**
 * JobManager handles all job-related operations
 *
 * Uses prepared statements and transactions following Bun SQLite best practices.
 */
export class JobManager {
  private db: Database;
  private dataDir: string;

  // Prepared statements for performance
  private insertJobStmt!: ReturnType<Database["prepare"]>;
  private insertQueueStmt!: ReturnType<Database["prepare"]>;
  private getJobStmt!: ReturnType<Database["prepare"]>;
  private updateStatusStmt!: ReturnType<Database["prepare"]>;
  private updateStartedStmt!: ReturnType<Database["prepare"]>;
  private setStopRequestedStmt!: ReturnType<Database["prepare"]>;
  private setPidStmt!: ReturnType<Database["prepare"]>;
  private deleteFromQueueStmt!: ReturnType<Database["prepare"]>;
  private dequeueStmt!: ReturnType<Database["prepare"]>;
  private queueSizeStmt!: ReturnType<Database["prepare"]>;

  /**
   * Create a new JobManager
   *
   * @param dataDir - Directory for database file (optional, uses config default)
   */
  constructor(dataDir?: string) {
    const dbDir = dataDir ?? config.DATA_DIR;
    this.dataDir = dbDir;

    // Ensure directory exists
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = join(dbDir, "e2e.db");
    this.db = new Database(dbPath, { create: true });

    // Enable WAL mode for better concurrent access
    this.db.exec("PRAGMA journal_mode = WAL");

    // Initialize schema
    this.initSchema();

    // Initialize prepared statements
    this.initPreparedStatements();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        test_spec TEXT NOT NULL,
        env_config TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        stop_requested INTEGER DEFAULT 0,
        process_pid INTEGER
      );

      CREATE TABLE IF NOT EXISTS queue (
        job_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_queue_created ON queue(created_at);
    `);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get process PID for a job
   */
  getProcessPid(jobId: string): number | null {
    const job = this.getJob(jobId);
    return job?.processPid ?? null;
  }

  /**
   * Initialize all prepared statements
   */
  private initPreparedStatements(): void {
    // Insert job
    this.insertJobStmt = this.db.prepare(`
      INSERT INTO jobs (job_id, test_spec, env_config, status, created_at)
      VALUES ($jobId, $testSpec, $envConfig, 'queued', $createdAt)
    `);

    // Insert into queue
    this.insertQueueStmt = this.db.prepare(`
      INSERT INTO queue (job_id, created_at) VALUES ($jobId, $createdAt)
    `);

    // Get job by ID
    this.getJobStmt = this.db.prepare(`
      SELECT * FROM jobs WHERE job_id = $jobId
    `);

    // Update job status and completed_at
    this.updateStatusStmt = this.db.prepare(`
      UPDATE jobs
      SET status = $status, completed_at = $completedAt, error_message = $errorMessage
      WHERE job_id = $jobId
    `);

    // Update started_at
    this.updateStartedStmt = this.db.prepare(`
      UPDATE jobs SET status = 'running', started_at = $startedAt WHERE job_id = $jobId
    `);

    // Set stop requested flag
    this.setStopRequestedStmt = this.db.prepare(`
      UPDATE jobs SET stop_requested = 1 WHERE job_id = $jobId
    `);

    // Set process PID
    this.setPidStmt = this.db.prepare(`
      UPDATE jobs SET process_pid = $pid WHERE job_id = $jobId
    `);

    // Delete from queue
    this.deleteFromQueueStmt = this.db.prepare(`
      DELETE FROM queue WHERE job_id = $jobId
    `);

    // Dequeue (get first item)
    this.dequeueStmt = this.db.prepare(`
      SELECT job_id FROM queue ORDER BY created_at ASC LIMIT 1
    `);

    // Queue size
    this.queueSizeStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM queue
    `);
  }

  /**
   * Create a new test job
   *
   * @param testSpec - Test specification content
   * @param envConfig - Environment configuration
   * @returns Created job
   * @throws Error if validation fails
   */
  createJob(testSpec: string, envConfig: Record<string, string> = {}): Job {
    // Validate input
    this.validateTestSpec(testSpec);

    const jobId = randomUUID();
    const createdAt = new Date().toISOString();
    const envConfigJson = JSON.stringify(envConfig);

    // Use transaction to ensure atomicity
    const transaction = this.db.transaction(() => {
      this.insertJobStmt.run({
        $jobId: jobId,
        $testSpec: testSpec,
        $envConfig: envConfigJson,
        $createdAt: createdAt,
      });

      this.insertQueueStmt.run({
        $jobId: jobId,
        $createdAt: createdAt,
      });
    });

    transaction();

    logger.info(`Job created: ${jobId}`);

    return {
      jobId,
      testSpec,
      envConfig,
      status: "queued",
      createdAt,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      stopRequested: false,
      processPid: null,
    };
  }

  /**
   * Get a job by ID
   *
   * @param jobId - Job ID
   * @returns Job or null if not found
   */
  getJob(jobId: string): Job | null {
    const row = this.getJobStmt.get({ $jobId: jobId }) as JobRow | null;
    if (!row) return null;
    return this.rowToJob(row);
  }

  /**
   * List jobs with optional limit
   *
   * @param limit - Maximum number of jobs to return
   * @returns Array of jobs
   */
  listJobs(limit: number = 100): Job[] {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs ORDER BY created_at DESC LIMIT $limit
    `);
    const rows = stmt.all({ $limit: limit }) as JobRow[];
    return rows.map((row) => this.rowToJob(row));
  }

  /**
   * Update job status
   *
   * @param jobId - Job ID
   * @param status - New status
   * @param errorMessage - Optional error message
   */
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    errorMessage?: string
  ): void {
    const isCompleted = ["completed", "failed", "stopped", "cancelled"].includes(
      status
    );
    const completedAt = isCompleted ? new Date().toISOString() : null;

    this.updateStatusStmt.run({
      $jobId: jobId,
      $status: status,
      $completedAt: completedAt,
      $errorMessage: errorMessage ?? null,
    });

    logger.info(`Job ${jobId} status updated to: ${status}`);
  }

  /**
   * Mark job as started (running)
   *
   * @param jobId - Job ID
   */
  markJobStarted(jobId: string): void {
    this.updateStartedStmt.run({
      $jobId: jobId,
      $startedAt: new Date().toISOString(),
    });
    logger.info(`Job ${jobId} started`);
  }

  /**
   * Set process PID for a running job
   *
   * @param jobId - Job ID
   * @param pid - Process ID
   */
  setProcessPid(jobId: string, pid: number): void {
    this.setPidStmt.run({ $jobId: jobId, $pid: pid });
  }

  /**
   * Stop a job
   *
   * For queued jobs: Remove from queue and mark as cancelled
   * For running jobs: Set stop_requested flag
   *
   * @param jobId - Job ID
   * @returns Result of stop operation
   */
  stopJob(jobId: string): StopJobResult {
    const job = this.getJob(jobId);

    if (!job) {
      return { success: false, message: "Job not found" };
    }

    if (job.status === "queued") {
      // Remove from queue and cancel
      const transaction = this.db.transaction(() => {
        this.deleteFromQueueStmt.run({ $jobId: jobId });
        this.updateStatusStmt.run({
          $jobId: jobId,
          $status: "cancelled",
          $completedAt: new Date().toISOString(),
          $errorMessage: "Cancelled by user",
        });
      });
      transaction();

      logger.info(`Job ${jobId} cancelled (was in queue)`);
      return { success: true, message: "Job cancelled", status: "cancelled" };
    }

    if (job.status === "running") {
      // Set stop requested flag
      this.setStopRequestedStmt.run({ $jobId: jobId });
      logger.info(`Job ${jobId} stop requested`);
      return { success: true, message: "Stop request sent", status: "stopping" };
    }

    // Already completed/failed/stopped
    return {
      success: false,
      message: `Job already ${this.getStatusText(job.status)}, cannot stop`,
    };
  }

  /**
   * Dequeue the next job from the queue
   *
   * @returns Job ID or null if queue is empty
   */
  dequeue(): string | null {
    const row = this.dequeueStmt.get() as { job_id: string } | null;
    if (!row) return null;

    // Remove from queue
    this.deleteFromQueueStmt.run({ $jobId: row.job_id });
    return row.job_id;
  }

  /**
   * Get the current queue size
   *
   * @returns Number of jobs in queue
   */
  getQueueSize(): number {
    const row = this.queueSizeStmt.get() as { count: number };
    return row.count;
  }

  /**
   * Get the currently running job (if any)
   *
   * @returns Running job or null
   */
  getRunningJob(): Job | null {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs WHERE status = 'running' LIMIT 1
    `);
    const row = stmt.get() as JobRow | null;
    if (!row) return null;
    return this.rowToJob(row);
  }

  /**
   * Check if a job has stop requested
   *
   * @param jobId - Job ID
   * @returns True if stop was requested
   */
  isStopRequested(jobId: string): boolean {
    const job = this.getJob(jobId);
    return job?.stopRequested ?? false;
  }

  /**
   * Validate test specification
   *
   * @param testSpec - Test specification to validate
   * @throws Error if validation fails
   */
  private validateTestSpec(testSpec: string): void {
    if (!testSpec || testSpec.trim().length === 0) {
      throw new Error("test_spec cannot be empty");
    }

    if (testSpec.trim().length < config.TEST_SPEC_MIN_LENGTH) {
      throw new Error(
        `Test specification requires at least ${config.TEST_SPEC_MIN_LENGTH} characters`
      );
    }

    if (testSpec.length > config.TEST_SPEC_MAX_LENGTH) {
      throw new Error("test_spec exceeds size limit");
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\x00/, // Null byte
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(testSpec)) {
        throw new Error("Unsafe content detected");
      }
    }
  }

  /**
   * Convert database row to Job object
   */
  private rowToJob(row: JobRow): Job {
    return {
      jobId: row.job_id,
      testSpec: row.test_spec,
      envConfig: row.env_config ? JSON.parse(row.env_config) : {},
      status: row.status as JobStatus,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stopRequested: Boolean(row.stop_requested),
      processPid: row.process_pid,
    };
  }

  /**
   * Get human-readable status text
   */
  private getStatusText(status: JobStatus): string {
    const statusMap: Record<JobStatus, string> = {
      queued: "queued",
      running: "running",
      completed: "completed",
      failed: "failed",
      stopped: "stopped",
      cancelled: "cancelled",
    };
    return statusMap[status] ?? status;
  }

  /**
   * Delete a job by ID
   *
   * Cannot delete a running job - must stop it first.
   * Also cleans up associated files in data/jobs and data/reports directories.
   *
   * @param jobId - Job ID to delete
   * @returns Result of delete operation
   */
  deleteJob(jobId: string): { success: boolean; message: string } {
    const job = this.getJob(jobId);

    if (!job) {
      return { success: false, message: "Job not found" };
    }

    if (job.status === "running") {
      return { success: false, message: "Cannot delete a running job, please stop it first" };
    }

    try {
      const transaction = this.db.transaction(() => {
        // Remove from queue if present
        this.deleteFromQueueStmt.run({ $jobId: jobId });
        // Remove from jobs table
        this.db.prepare(`DELETE FROM jobs WHERE job_id = $jobId`).run({ $jobId: jobId });
      });

      transaction();

      // Clean up associated files
      this.cleanupJobFiles(jobId);

      logger.info(`Job ${jobId} deleted`);
      return { success: true, message: "Job deleted" };
    } catch (error) {
      logger.error(`Failed to delete job ${jobId}`, error);
      return { success: false, message: `Delete failed: ${error}` };
    }
  }

  /**
   * Clean up files associated with a job
   *
   * @param jobId - Job ID whose files should be cleaned up
   */
  private cleanupJobFiles(jobId: string): void {
    // Clean up data/jobs/<jobId> directory
    const jobDir = join(this.dataDir, "jobs", jobId);
    if (existsSync(jobDir)) {
      try {
        rmSync(jobDir, { recursive: true, force: true });
        logger.info(`Cleaned up job directory: ${jobDir}`);
      } catch (error) {
        logger.error(`Failed to clean up job directory: ${jobDir}`, error);
      }
    }

    // Clean up data/reports/<jobId> directory
    const reportDir = join(this.dataDir, "reports", jobId);
    if (existsSync(reportDir)) {
      try {
        rmSync(reportDir, { recursive: true, force: true });
        logger.info(`Cleaned up report directory: ${reportDir}`);
      } catch (error) {
        logger.error(`Failed to clean up report directory: ${reportDir}`, error);
      }
    }
  }

  /**
   * Delete multiple jobs by IDs
   *
   * @param jobIds - Array of job IDs to delete
   * @returns Result with deleted and failed job lists
   */
  deleteJobs(jobIds: string[]): {
    success: boolean;
    deleted: string[];
    failed: { jobId: string; reason: string }[];
  } {
    const deleted: string[] = [];
    const failed: { jobId: string; reason: string }[] = [];

    for (const jobId of jobIds) {
      const result = this.deleteJob(jobId);
      if (result.success) {
        deleted.push(jobId);
      } else {
        failed.push({ jobId, reason: result.message });
      }
    }

    logger.info(`Batch delete: ${deleted.length} deleted, ${failed.length} failed`);

    return {
      success: failed.length === 0,
      deleted,
      failed,
    };
  }
}
