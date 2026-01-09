/**
 * E2E CLI - Job Service
 *
 * Job management service using SQLite, replacing job_cli.py
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { colors, DATA_DIR, PROJECT_ROOT } from "../utils.ts";

// ====================================
// Types
// ====================================

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

export type JobStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "stopped"
	| "cancelled";

interface JobRow {
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

interface CostStatistics {
	totalInputTokens: number;
	totalOutputTokens: number;
	totalTokens: number;
	totalCost: number;
	sessions: number;
}

interface TestCaseSummary {
	caseId: string;
	title: string;
	status: string;
	priority: string;
}

// ====================================
// JobService Class
// ====================================

export class JobService {
	private db: Database;
	private dataDir: string;
	private reportsDir: string;

	constructor(dataDir: string = DATA_DIR) {
		// Ensure directories exist
		if (!existsSync(dataDir)) {
			mkdirSync(dataDir, { recursive: true });
		}

		this.dataDir = dataDir;
		this.reportsDir = join(dataDir, "reports");
		if (!existsSync(this.reportsDir)) {
			mkdirSync(this.reportsDir, { recursive: true });
		}

		const dbPath = join(dataDir, "e2e.db");
		this.db = new Database(dbPath, { create: true });

		// Enable WAL mode
		this.db.exec("PRAGMA journal_mode = WAL");

		// Initialize schema
		this.initSchema();
	}

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

	close(): void {
		this.db.close();
	}

	// ====================================
	// Job Operations
	// ====================================

	listJobs(limit: number = 20): Job[] {
		const stmt = this.db.prepare(`
      SELECT * FROM jobs ORDER BY created_at DESC LIMIT $limit
    `);
		const rows = stmt.all({ $limit: limit }) as JobRow[];
		return rows.map((row) => this.rowToJob(row));
	}

	getJob(jobId: string): Job | null {
		const stmt = this.db.prepare(`SELECT * FROM jobs WHERE job_id = $jobId`);
		const row = stmt.get({ $jobId: jobId }) as JobRow | null;
		if (!row) return null;
		return this.rowToJob(row);
	}

	submitJob(specFile: string): string | null {
		// Resolve path
		const specPath = specFile.startsWith("/")
			? specFile
			: join(PROJECT_ROOT, specFile);

		if (!existsSync(specPath)) {
			console.error(
				`${colors.red}Error:${colors.reset} File not found: ${specFile}`,
			);
			return null;
		}

		try {
			const testSpec = readFileSync(specPath, "utf-8");

			if (testSpec.trim().length < 10) {
				console.error(
					`${colors.red}Error:${colors.reset} Test specification is too short (min 10 characters)`,
				);
				return null;
			}

			if (testSpec.length > 100000) {
				console.error(
					`${colors.red}Error:${colors.reset} Test specification is too long (max 100000 characters)`,
				);
				return null;
			}

			const jobId = randomUUID();
			const createdAt = new Date().toISOString();

			// Use transaction
			const transaction = this.db.transaction(() => {
				this.db
					.prepare(
						`INSERT INTO jobs (job_id, test_spec, env_config, status, created_at)
           VALUES ($jobId, $testSpec, '{}', 'queued', $createdAt)`,
					)
					.run({
						$jobId: jobId,
						$testSpec: testSpec,
						$createdAt: createdAt,
					});

				this.db
					.prepare(
						`INSERT INTO queue (job_id, created_at) VALUES ($jobId, $createdAt)`,
					)
					.run({
						$jobId: jobId,
						$createdAt: createdAt,
					});
			});

			transaction();
			return jobId;
		} catch (error) {
			console.error(
				`${colors.red}Error:${colors.reset} Failed to submit job: ${error}`,
			);
			return null;
		}
	}

	cancelJob(jobId: string): { success: boolean; message: string } {
		const job = this.getJob(jobId);

		if (!job) {
			return { success: false, message: "Job not found" };
		}

		if (["completed", "failed", "stopped", "cancelled"].includes(job.status)) {
			return {
				success: false,
				message: `Job is already in terminal state: ${job.status}`,
			};
		}

		if (job.status === "queued") {
			const completedAt = new Date().toISOString();

			const transaction = this.db.transaction(() => {
				this.db
					.prepare(`DELETE FROM queue WHERE job_id = $jobId`)
					.run({ $jobId: jobId });
				this.db
					.prepare(
						`UPDATE jobs SET status = 'cancelled', completed_at = $completedAt, error_message = 'User cancelled'
           WHERE job_id = $jobId`,
					)
					.run({ $jobId: jobId, $completedAt: completedAt });
			});

			transaction();
			return { success: true, message: "Job cancelled from queue" };
		}

		if (job.status === "running") {
			this.db
				.prepare(`UPDATE jobs SET stop_requested = 1 WHERE job_id = $jobId`)
				.run({
					$jobId: jobId,
				});
			return {
				success: true,
				message: "Stop request sent. Job will terminate at next check.",
			};
		}

		return {
			success: false,
			message: `Cannot cancel job with status: ${job.status}`,
		};
	}

	// ====================================
	// Statistics
	// ====================================

	getCostStatistics(jobId: string): CostStatistics | null {
		const paths = [
			join(
				this.reportsDir,
				jobId,
				"generations",
				jobId,
				"usage_statistics.json",
			),
			join(this.reportsDir, jobId, "usage_statistics.json"),
			join(
				this.reportsDir,
				jobId,
				"generations",
				jobId,
				"cost_statistics.json",
			),
			join(this.reportsDir, jobId, "cost_statistics.json"),
		];

		for (const costFile of paths) {
			if (existsSync(costFile)) {
				try {
					const data = JSON.parse(readFileSync(costFile, "utf-8"));

					if (data.summary) {
						// Support both camelCase (from agent) and snake_case naming
						const s = data.summary;
						return {
							totalInputTokens: s.total_input_tokens ?? s.totalInputTokens ?? 0,
							totalOutputTokens:
								s.total_output_tokens ?? s.totalOutputTokens ?? 0,
							totalTokens: s.total_tokens ?? s.totalTokens ?? 0,
							totalCost: s.total_cost_usd ?? s.totalCostUsd ?? 0,
							sessions: s.total_sessions ?? s.totalSessions ?? 0,
						};
					} else {
						return {
							totalInputTokens: data.input_tokens ?? 0,
							totalOutputTokens: data.output_tokens ?? 0,
							totalTokens: (data.input_tokens ?? 0) + (data.output_tokens ?? 0),
							totalCost: data.total_cost ?? 0,
							sessions: data.sessions ?? 0,
						};
					}
				} catch {
					// Continue to next path
				}
			}
		}
		return null;
	}

	getTestCases(jobId: string): TestCaseSummary[] | null {
		const paths = [
			join(this.reportsDir, jobId, "generations", jobId, "test_cases.json"),
			join(this.reportsDir, jobId, "test_cases.json"),
		];

		for (const testCasesFile of paths) {
			if (existsSync(testCasesFile)) {
				try {
					const data = JSON.parse(readFileSync(testCasesFile, "utf-8"));
					const testCases = Array.isArray(data)
						? data
						: (data.test_cases ?? []);

					return testCases.map((tc: Record<string, unknown>) => ({
						caseId: (tc.case_id ?? tc.id ?? "Unknown") as string,
						title: (tc.title ?? tc.name ?? "Untitled") as string,
						status: (tc.status ?? "Not Run") as string,
						priority: (tc.priority ?? "P3") as string,
					}));
				} catch {
					// Continue to next path
				}
			}
		}
		return null;
	}

	/**
	 * Get execution log file path for a job
	 */
	getLogPath(jobId: string): string | null {
		const logPath = join(this.reportsDir, jobId, "execution_stdout.log");
		if (existsSync(logPath)) {
			return logPath;
		}
		return null;
	}

	/**
	 * Get execution log content for a job
	 * @param jobId - Job ID
	 * @param tail - Number of lines from the end (0 = all)
	 * @param follow - Return file path for tail -f (not content)
	 */
	getLogContent(jobId: string, tail: number = 0): string | null {
		const logPath = this.getLogPath(jobId);
		if (!logPath) {
			return null;
		}

		try {
			const content = readFileSync(logPath, "utf-8");
			if (tail > 0) {
				const lines = content.split("\n");
				return lines.slice(-tail).join("\n");
			}
			return content;
		} catch {
			return null;
		}
	}

	// ====================================
	// Queue Operations
	// ====================================

	dequeue(): string | null {
		const stmt = this.db.prepare(
			`SELECT job_id FROM queue ORDER BY created_at ASC LIMIT 1`,
		);
		const row = stmt.get() as { job_id: string } | null;

		if (!row) return null;

		this.db
			.prepare(`DELETE FROM queue WHERE job_id = $jobId`)
			.run({ $jobId: row.job_id });
		return row.job_id;
	}

	getQueueSize(): number {
		const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM queue`);
		const row = stmt.get() as { count: number };
		return row.count;
	}

	isStopRequested(jobId: string): boolean {
		const job = this.getJob(jobId);
		return job?.stopRequested ?? false;
	}

	updateJobStatus(
		jobId: string,
		status: JobStatus,
		errorMessage?: string,
	): void {
		const isCompleted = [
			"completed",
			"failed",
			"stopped",
			"cancelled",
		].includes(status);
		const now = new Date().toISOString();

		if (status === "running") {
			this.db
				.prepare(
					`UPDATE jobs SET status = 'running', started_at = $now WHERE job_id = $jobId`,
				)
				.run({
					$jobId: jobId,
					$now: now,
				});
		} else if (isCompleted) {
			this.db
				.prepare(
					`UPDATE jobs SET status = $status, completed_at = $now, error_message = $errorMessage WHERE job_id = $jobId`,
				)
				.run({
					$jobId: jobId,
					$status: status,
					$now: now,
					$errorMessage: errorMessage ?? null,
				});
		} else {
			this.db
				.prepare(`UPDATE jobs SET status = $status WHERE job_id = $jobId`)
				.run({
					$jobId: jobId,
					$status: status,
				});
		}
	}

	setProcessPid(jobId: string, pid: number): void {
		this.db
			.prepare(`UPDATE jobs SET process_pid = $pid WHERE job_id = $jobId`)
			.run({
				$jobId: jobId,
				$pid: pid,
			});
	}

	recoverOrphanJobs(): number {
		const stmt = this.db.prepare(
			`SELECT job_id, process_pid FROM jobs WHERE status = 'running'`,
		);
		const runningJobs = stmt.all() as {
			job_id: string;
			process_pid: number | null;
		}[];

		if (runningJobs.length === 0) return 0;

		let recovered = 0;
		const now = new Date().toISOString();

		for (const job of runningJobs) {
			let processAlive = false;

			if (job.process_pid) {
				try {
					process.kill(job.process_pid, 0);
					processAlive = true;
				} catch {
					processAlive = false;
				}
			}

			if (!processAlive) {
				const transaction = this.db.transaction(() => {
					this.db
						.prepare(
							`UPDATE jobs SET status = 'queued', started_at = NULL, completed_at = NULL,
             error_message = NULL, process_pid = NULL WHERE job_id = $jobId`,
						)
						.run({ $jobId: job.job_id });

					this.db
						.prepare(
							`INSERT OR REPLACE INTO queue (job_id, created_at) VALUES ($jobId, $now)`,
						)
						.run({ $jobId: job.job_id, $now: now });
				});

				transaction();
				recovered++;
				console.log(`Recovered orphan job ${job.job_id}`);
			}
		}

		return recovered;
	}

	// ====================================
	// Delete Operations
	// ====================================

	deleteJob(jobId: string): { success: boolean; message: string } {
		const job = this.getJob(jobId);

		if (!job) {
			return { success: false, message: "Job not found" };
		}

		if (job.status === "running") {
			return {
				success: false,
				message: "Cannot delete a running job. Please stop it first.",
			};
		}

		try {
			const transaction = this.db.transaction(() => {
				// Remove from queue if present
				this.db
					.prepare(`DELETE FROM queue WHERE job_id = $jobId`)
					.run({ $jobId: jobId });
				// Remove from jobs table
				this.db
					.prepare(`DELETE FROM jobs WHERE job_id = $jobId`)
					.run({ $jobId: jobId });
			});

			transaction();

			// Clean up associated files
			this.cleanupJobFiles(jobId);

			return { success: true, message: "Job deleted successfully" };
		} catch (error) {
			return { success: false, message: `Failed to delete job: ${error}` };
		}
	}

	/**
	 * Clean up files associated with a job
	 */
	private cleanupJobFiles(jobId: string): void {
		// Clean up data/jobs/<jobId> directory
		const jobDir = join(this.dataDir, "jobs", jobId);
		if (existsSync(jobDir)) {
			try {
				rmSync(jobDir, { recursive: true, force: true });
			} catch (error) {
				console.error(`Failed to clean up job directory: ${jobDir}`, error);
			}
		}

		// Clean up data/reports/<jobId> directory
		const reportDir = join(this.dataDir, "reports", jobId);
		if (existsSync(reportDir)) {
			try {
				rmSync(reportDir, { recursive: true, force: true });
			} catch (error) {
				console.error(
					`Failed to clean up report directory: ${reportDir}`,
					error,
				);
			}
		}
	}

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

		return {
			success: failed.length === 0,
			deleted,
			failed,
		};
	}

	// ====================================
	// Helpers
	// ====================================

	private rowToJob(row: JobRow): Job {
		let envConfig = {};
		if (row.env_config) {
			try {
				envConfig = JSON.parse(row.env_config);
			} catch (error) {
				console.error(`Failed to parse env_config for job ${row.job_id}:`, error);
				// Use empty object as fallback
			}
		}

		return {
			jobId: row.job_id,
			testSpec: row.test_spec,
			envConfig,
			status: row.status as JobStatus,
			createdAt: row.created_at,
			startedAt: row.started_at,
			completedAt: row.completed_at,
			errorMessage: row.error_message,
			stopRequested: Boolean(row.stop_requested),
			processPid: row.process_pid,
		};
	}
}

// ====================================
// CLI Display Functions
// ====================================

export function formatDateTime(isoStr: string | null): string {
	if (!isoStr) return "N/A";
	try {
		return isoStr.slice(0, 19).replace("T", " ");
	} catch {
		return isoStr ?? "N/A";
	}
}

export function printJobList(jobs: Job[], limit: number): void {
	if (jobs.length === 0) {
		console.log("No jobs found.");
		return;
	}

	console.log(`\nJobs (showing up to ${limit}, total: ${jobs.length}):`);
	console.log("=".repeat(80));
	console.log(
		`${"JOB ID".padEnd(36)}  ${"STATUS".padEnd(12)}  ${"CREATED".padEnd(20)}`,
	);
	console.log(
		`${"------".padEnd(36)}  ${"------".padEnd(12)}  ${"-------".padEnd(20)}`,
	);

	for (const job of jobs) {
		console.log(
			`${job.jobId.padEnd(36)}  ${job.status.padEnd(12)}  ${formatDateTime(job.createdAt).padEnd(20)}`,
		);
	}
	console.log();
}

export function printJobStatus(
	job: Job,
	cost: CostStatistics | null,
	testCases: TestCaseSummary[] | null,
): void {
	console.log("\nJob Details:");
	console.log("=".repeat(50));
	console.log(`Job ID:     ${job.jobId}`);
	console.log(`Status:     ${job.status}`);
	console.log(`Created:    ${formatDateTime(job.createdAt)}`);
	console.log(`Started:    ${formatDateTime(job.startedAt)}`);
	console.log(`Completed:  ${formatDateTime(job.completedAt)}`);

	if (job.errorMessage) {
		console.log(`Error:      ${job.errorMessage}`);
	}

	if (testCases && testCases.length > 0) {
		const total = testCases.length;
		const passCount = testCases.filter((tc) => tc.status === "Pass").length;
		const failCount = testCases.filter((tc) => tc.status === "Fail").length;
		const blockedCount = testCases.filter(
			(tc) => tc.status === "Blocked",
		).length;
		const notRun = testCases.filter((tc) => tc.status === "Not Run").length;

		console.log("\nTest Progress:");
		console.log(
			`  Total: ${total} | Pass: ${passCount} | Fail: ${failCount} | Blocked: ${blockedCount} | Not Run: ${notRun}`,
		);
	}

	if (cost) {
		console.log("\nCost:");
		console.log(`  Total Cost: $${cost.totalCost.toFixed(4)}`);
		console.log(`  Input Tokens: ${cost.totalInputTokens}`);
		console.log(`  Output Tokens: ${cost.totalOutputTokens}`);
		console.log(`  Sessions: ${cost.sessions}`);
	}

	console.log();
}
