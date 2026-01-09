/**
 * E2E CLI - Test Executor Service
 *
 * Standalone test executor using SQLite-based job queue, replacing run_executor.py
 */

import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Subprocess, spawn } from "bun";
import {
	colors,
	DATA_DIR,
	EXECUTOR_PID_FILE,
	getExecutablePath,
	isCompiledBinary,
	PROJECT_ROOT,
	removePidFile,
	writePid,
} from "../utils.ts";
import { type Job, JobService } from "./job.ts";

// ====================================
// Security Utilities
// ====================================

/**
 * Sanitize command string for logging by filtering out sensitive credentials.
 * This prevents credential exposure in log files.
 */
function sanitizeCommandForLogging(cmd: string[]): string {
	return cmd
		.map((arg) => {
			// Filter out values after credential-related flags
			if (
				arg.includes("ANTHROPIC_API_KEY=") ||
				arg.includes("AWS_SECRET_ACCESS_KEY=") ||
				arg.includes("AWS_ACCESS_KEY_ID=") ||
				arg.includes("API_KEY=") ||
				arg.includes("SECRET=") ||
				arg.includes("TOKEN=") ||
				arg.includes("PASSWORD=")
			) {
				const parts = arg.split("=");
				return `${parts[0]}=***`;
			}
			return arg;
		})
		.join(" ");
}

// ====================================
// Configuration
// ====================================

interface ExecutorConfig {
	baseDir: string;
	reportsDir: string;
	pollInterval: number;
	stopCheckInterval: number;
	maxExecutionTime: number;
}

const defaultConfig: ExecutorConfig = {
	baseDir: PROJECT_ROOT,
	reportsDir: join(DATA_DIR, "reports"),
	pollInterval: 5000, // 5 seconds
	stopCheckInterval: 2000, // 2 seconds
	maxExecutionTime: 3600000, // 1 hour
};

// ====================================
// Logger
// ====================================

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
	const timestamp = new Date().toISOString();
	const color =
		level === "ERROR"
			? colors.red
			: level === "WARN"
				? colors.yellow
				: colors.blue;
	console.log(`${timestamp} [${color}${level}${colors.reset}] ${message}`);
}

// ====================================
// TestExecutor Class
// ====================================

export class TestExecutor {
	private jobService: JobService;
	private config: ExecutorConfig;
	private running: boolean = false;
	private currentJobId: string | null = null;
	private currentProcess: Subprocess | null = null;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private stopCheckTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(jobService: JobService, config: Partial<ExecutorConfig> = {}) {
		this.jobService = jobService;
		this.config = { ...defaultConfig, ...config };

		// Ensure reports directory exists
		if (!existsSync(this.config.reportsDir)) {
			mkdirSync(this.config.reportsDir, { recursive: true });
		}

		log("INFO", "TestExecutor initialized");
	}

	async start(): Promise<void> {
		if (this.running) {
			log("WARN", "TestExecutor is already running");
			return;
		}

		this.running = true;
		log("INFO", "TestExecutor started");

		// Main loop
		this.scheduleNextPoll();
	}

	stop(): void {
		if (!this.running) return;

		log("INFO", "Stopping TestExecutor...");
		this.running = false;

		// Clear timers
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.stopCheckTimer) {
			clearTimeout(this.stopCheckTimer);
			this.stopCheckTimer = null;
		}

		// Stop current job
		if (this.currentProcess) {
			log("INFO", "Terminating current job process...");
			this.currentProcess.kill("SIGTERM");
		}

		log("INFO", "TestExecutor stopped");
	}

	private scheduleNextPoll(): void {
		if (!this.running) return;

		this.pollTimer = setTimeout(async () => {
			await this.pollQueue();
			this.scheduleNextPoll();
		}, this.config.pollInterval);
	}

	private async pollQueue(): Promise<void> {
		if (!this.running || this.currentJobId) return;

		try {
			const jobId = this.jobService.dequeue();

			if (jobId) {
				log("INFO", `Starting execution of job ${jobId}`);
				await this.executeTest(jobId);
			}
		} catch (error) {
			log("ERROR", `Error in executor loop: ${error}`);
		}
	}

	private async executeTest(jobId: string): Promise<void> {
		try {
			const job = this.jobService.getJob(jobId);
			if (!job) {
				log("ERROR", `Job ${jobId} not found`);
				return;
			}

			// Update status to running
			this.jobService.updateJobStatus(jobId, "running");
			this.currentJobId = jobId;

			// Prepare workspace
			const projectDir = this.prepareWorkspace(job);

			// Build command - use internal agent in compiled mode, bun run in dev mode
			let cmd: string[];
			if (isCompiledBinary()) {
				// In compiled mode, use the executable with --internal-agent
				cmd = [
					getExecutablePath(),
					"--internal-agent",
					"--project-dir",
					projectDir,
					"--max-iterations",
					"50",
				];
			} else {
				// In development mode, use bun run
				cmd = [
					"bun",
					"run",
					join(this.config.baseDir, "src", "agent", "index.ts"),
					"--project-dir",
					projectDir,
					"--max-iterations",
					"50",
				];
			}

			log("INFO", `Executing: ${sanitizeCommandForLogging(cmd)}`);

			// Prepare environment - ensure AWS Bedrock settings are passed
			const env = { ...process.env };
			// Set defaults for AWS Bedrock if not already set (using official CLAUDE_CODE_USE_BEDROCK)
			if (!env.CLAUDE_CODE_USE_BEDROCK) {
				env.CLAUDE_CODE_USE_BEDROCK = "1";
			}
			if (!env.AWS_REGION) {
				env.AWS_REGION = "us-west-2";
			}

			// Setup log files
			const logDir = join(this.config.reportsDir, jobId);
			mkdirSync(logDir, { recursive: true });

			const stdoutPath = join(logDir, "execution_stdout.log");
			const stderrPath = join(logDir, "execution_stderr.log");

			// Ensure log files exist with secure permissions (owner read/write only)
			// This prevents credential exposure if environment variables are logged
			if (!existsSync(stdoutPath)) {
				writeFileSync(stdoutPath, "", { mode: 0o600 });
			}
			if (!existsSync(stderrPath)) {
				writeFileSync(stderrPath, "", { mode: 0o600 });
			}
			// Ensure permissions are correct even for existing files
			try {
				chmodSync(stdoutPath, 0o600);
				chmodSync(stderrPath, 0o600);
			} catch {
				// Ignore permission errors (may not be supported on all platforms)
			}

			// Create write streams for incremental logging (ensures all output is captured even on crash)
			const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
			const stderrStream = createWriteStream(stderrPath, { flags: "a" });

			// Start process with pipe mode for proper output capture
			this.currentProcess = spawn({
				cmd,
				cwd: this.config.baseDir,
				env,
				stdout: "pipe",
				stderr: "pipe",
				stdin: "ignore",
			});

			// Save PID
			this.jobService.setProcessPid(jobId, this.currentProcess.pid);
			log("INFO", `Job ${jobId} started with PID ${this.currentProcess.pid}`);

			// Stream stdout to file incrementally
			const streamStdout = async () => {
				const stdout = this.currentProcess?.stdout;
				if (!stdout || typeof stdout === "number") return;
				try {
					for await (const chunk of stdout) {
						stdoutStream.write(chunk);
					}
				} catch {
					// Stream closed, ignore
				}
			};

			// Stream stderr to file incrementally
			const streamStderr = async () => {
				const stderr = this.currentProcess?.stderr;
				if (!stderr || typeof stderr === "number") return;
				try {
					for await (const chunk of stderr) {
						stderrStream.write(chunk);
					}
				} catch {
					// Stream closed, ignore
				}
			};

			// Start streaming (non-blocking)
			const stdoutPromise = streamStdout();
			const stderrPromise = streamStderr();

			// Start stop check timer
			this.startStopCheck(jobId);

			// Wait for process and streams to complete
			const exitCode = await this.currentProcess.exited;

			// Wait for streams to finish flushing with timeout (5 seconds)
			// This prevents hanging if streams don't close properly
			const streamTimeout = new Promise<void>((resolve) =>
				setTimeout(() => {
					log("WARN", `Job ${jobId} stream flush timeout, forcing closure`);
					resolve();
				}, 5000),
			);

			await Promise.race([
				Promise.allSettled([stdoutPromise, stderrPromise]),
				streamTimeout,
			]);

			// Close streams
			stdoutStream.end();
			stderrStream.end();

			// Clear stop check timer
			if (this.stopCheckTimer) {
				clearTimeout(this.stopCheckTimer);
				this.stopCheckTimer = null;
			}

			log("INFO", `Job ${jobId} process finished with exit code ${exitCode}`);

			// Read stderr
			let stderr = "";
			if (existsSync(stderrPath)) {
				try {
					stderr = readFileSync(stderrPath, "utf-8");
				} catch {
					// Ignore
				}
			}

			// Update status based on return code
			if (exitCode === 0) {
				this.jobService.updateJobStatus(jobId, "completed");
				log("INFO", `Job ${jobId} completed successfully`);
			} else if (exitCode === 1) {
				const errorMsg = this.getMeaningfulErrorMessage(
					jobId,
					stderr,
					exitCode,
				);
				this.jobService.updateJobStatus(jobId, "failed", errorMsg);
				log("WARN", `Job ${jobId} failed: ${errorMsg}`);
			} else {
				const errorMsg = this.getMeaningfulErrorMessage(
					jobId,
					stderr,
					exitCode,
				);
				this.jobService.updateJobStatus(jobId, "failed", errorMsg);
				log(
					"ERROR",
					`Job ${jobId} failed with exit code ${exitCode}: ${errorMsg}`,
				);
			}
		} catch (error) {
			log("ERROR", `Failed to execute job ${jobId}: ${error}`);
			this.jobService.updateJobStatus(
				jobId,
				"failed",
				`Execution error: ${error}`,
			);
		} finally {
			this.currentJobId = null;
			this.currentProcess = null;
		}
	}

	private startStopCheck(jobId: string): void {
		const check = () => {
			if (!this.running || !this.currentProcess || this.currentJobId !== jobId)
				return;

			if (this.jobService.isStopRequested(jobId)) {
				log("INFO", `Stop requested for job ${jobId}`);
				this.stopCurrentProcess(jobId);
				return;
			}

			this.stopCheckTimer = setTimeout(check, this.config.stopCheckInterval);
		};

		this.stopCheckTimer = setTimeout(check, this.config.stopCheckInterval);
	}

	private async stopCurrentProcess(jobId: string): Promise<void> {
		if (!this.currentProcess) return;

		log("INFO", `Stopping process for job ${jobId}`);
		const pid = this.currentProcess.pid;

		try {
			// Send SIGTERM
			this.currentProcess.kill("SIGTERM");
			log("INFO", `Sent SIGTERM to process ${pid}`);

			// Wait for process with timeout
			const timeoutPromise = new Promise<boolean>((resolve) =>
				setTimeout(() => resolve(false), 10000),
			);
			const exitPromise = this.currentProcess.exited.then(() => true);

			const exited = await Promise.race([exitPromise, timeoutPromise]);

			if (!exited) {
				// Force kill
				log("WARN", `Process ${pid} did not terminate, sending SIGKILL`);
				this.currentProcess.kill("SIGKILL");
			}

			// Cleanup chrome-devtools-mcp processes
			try {
				const cleanup = spawn({
					cmd: ["pkill", "-f", "chrome-devtools-mcp"],
					stdout: "ignore",
					stderr: "ignore",
				});
				await cleanup.exited;
				log("INFO", "Cleaned up chrome-devtools-mcp processes");
			} catch {
				// Ignore
			}

			// Update job status
			this.jobService.updateJobStatus(jobId, "stopped", "User stopped");
			log("INFO", `Job ${jobId} stopped successfully`);
		} catch (error) {
			log("ERROR", `Failed to stop process for job ${jobId}: ${error}`);
		}
	}

	private getMeaningfulErrorMessage(
		jobId: string,
		stderr: string,
		exitCode: number,
	): string {
		// Try to read from test_cases.json
		try {
			const testCasesFile = join(
				this.config.reportsDir,
				jobId,
				"test_cases.json",
			);

			if (existsSync(testCasesFile)) {
				const testCases = JSON.parse(readFileSync(testCasesFile, "utf-8"));
				const cases = Array.isArray(testCases)
					? testCases
					: (testCases.test_cases ?? []);

				const stats: Record<string, number> = {
					Pass: 0,
					Fail: 0,
					Blocked: 0,
					"Not Run": 0,
				};
				const failedCases: string[] = [];

				for (const tc of cases) {
					const status = tc.status ?? "Not Run";
					stats[status] = (stats[status] ?? 0) + 1;

					if (status === "Fail") {
						const caseId = tc.case_id ?? tc.id ?? "Unknown";
						const title = tc.title ?? tc.name ?? "Unknown";
						const actual = (tc.actual_result ?? "").slice(0, 200);
						failedCases.push(`${caseId}: ${title} - ${actual}`);
					}
				}

				const total = cases.length;

				if (failedCases.length > 0) {
					return `Tests Failed (${stats.Fail}/${total}). Passed: ${stats.Pass}, Blocked: ${stats.Blocked}. First failure: ${failedCases[0]}`.slice(
						0,
						500,
					);
				}
				if (stats.Blocked === total && total > 0) {
					return `All tests blocked (${stats.Blocked}/${total}). Review defect reports and resolve blockers.`;
				}
				if (stats.Blocked > 0) {
					return `Some tests blocked (${stats.Blocked}/${total}). Check environment configuration.`;
				}
			}
		} catch {
			// Ignore
		}

		// Process stderr
		if (stderr) {
			const lines = stderr.split("\n");
			const errorLines = lines.filter(
				(line) =>
					line.includes("ERROR") ||
					line.includes("WARN") ||
					line.includes("CRITICAL") ||
					(line.trim() && !line.trim().startsWith("INFO:")),
			);

			if (errorLines.length > 0) {
				return errorLines.slice(0, 5).join("\n").slice(0, 500);
			}
		}

		return `Process exited with code ${exitCode}. Check job logs for details.`;
	}

	private prepareWorkspace(job: Job): string {
		const projectDir = join(this.config.reportsDir, job.jobId);
		mkdirSync(projectDir, { recursive: true });

		// Merge test_spec and env_config
		let testSpecContent = job.testSpec;

		if (
			job.envConfig &&
			Object.keys(job.envConfig).length > 0 &&
			!testSpecContent.includes("## Environment Configuration")
		) {
			let envSection = "\n\n## Environment Configuration\n\n";

			// Application access
			const appUrl =
				job.envConfig.PORTAL_URL ?? job.envConfig.APPLICATION_URL ?? "";
			if (appUrl) {
				envSection += "### Application Access\n";
				envSection += `- **Application URL**: ${appUrl}\n`;
				if (job.envConfig.API_BASE_URL) {
					envSection += `- **API Base URL**: ${job.envConfig.API_BASE_URL}\n`;
				}
				envSection += "\n";
			}

			// Test accounts
			const username = job.envConfig.USER ?? job.envConfig.USERNAME ?? "";
			if (username) {
				envSection += "### Test Accounts\n\n";
				envSection += "- **Test User**:\n";
				envSection += `  - Username: ${username}\n`;
				if (job.envConfig.PASSWORD) {
					envSection += `  - Password: ${job.envConfig.PASSWORD}\n`;
				}
				envSection += "\n";
			}

			// Browser settings
			envSection += "### Browser Settings\n";
			envSection += "- **Default Viewport**: 1920x1080 (desktop)\n";
			envSection += "- **Mobile Viewport**: 375x667 (mobile)\n";
			envSection += "- **Default Timeout**: 30000ms (30 seconds)\n\n";

			// Other configs
			const skipKeys = [
				"PORTAL_URL",
				"APPLICATION_URL",
				"API_BASE_URL",
				"USER",
				"USERNAME",
				"PASSWORD",
			];
			const otherConfigs = Object.entries(job.envConfig).filter(
				([k]) => !skipKeys.includes(k),
			);
			if (otherConfigs.length > 0) {
				envSection += "### Additional Configuration\n";
				for (const [key, value] of otherConfigs) {
					envSection += `- **${key}**: ${value}\n`;
				}
			}

			testSpecContent += envSection;
		}

		// Write test_spec.txt
		const testSpecFile = join(projectDir, "test_spec.txt");
		writeFileSync(testSpecFile, testSpecContent, "utf-8");
		log("INFO", `Created test_spec.txt for job ${job.jobId}`);

		return projectDir;
	}
}

// ====================================
// Main Entry Point
// ====================================

let executor: TestExecutor | null = null;

function signalHandler(signal: string): void {
	log("INFO", `Received ${signal}, shutting down executor...`);

	if (executor) {
		executor.stop();
	}

	// Remove PID file
	removePidFile(EXECUTOR_PID_FILE);

	process.exit(0);
}

export async function runExecutor(): Promise<void> {
	log("INFO", "=".repeat(50));
	log("INFO", "Starting Test Executor (Bun/TypeScript)");
	log("INFO", "=".repeat(50));

	// Register signal handlers
	process.on("SIGTERM", () => signalHandler("SIGTERM"));
	process.on("SIGINT", () => signalHandler("SIGINT"));

	// Get data directory
	const dataDir = process.env.DATA_DIR ?? DATA_DIR;

	// Initialize job service
	const jobService = new JobService(dataDir);
	log("INFO", `Job service initialized, data dir: ${dataDir}`);

	// Recover orphan jobs
	const recovered = jobService.recoverOrphanJobs();
	if (recovered > 0) {
		log("INFO", `Recovered ${recovered} orphan job(s) from previous run`);
	}

	// Initialize executor
	executor = new TestExecutor(jobService, {
		reportsDir: join(dataDir, "reports"),
	});

	// Write PID file
	await writePid(EXECUTOR_PID_FILE, process.pid);
	log("INFO", `PID file written: ${EXECUTOR_PID_FILE}`);

	// Start executor
	await executor.start();

	log("INFO", "Test executor started and running");
	log("INFO", `Poll interval: ${defaultConfig.pollInterval}ms`);
	log("INFO", `Stop check interval: ${defaultConfig.stopCheckInterval}ms`);

	// Keep process running
	const checkInterval = setInterval(() => {
		const queueSize = jobService.getQueueSize();
		if (queueSize > 0) {
			log("INFO", `Queue status: ${queueSize} job(s) waiting`);
		}
	}, 10000);

	// Handle cleanup on exit
	process.on("beforeExit", () => {
		clearInterval(checkInterval);
		if (executor) {
			executor.stop();
		}
		jobService.close();
		removePidFile(EXECUTOR_PID_FILE);
		log("INFO", "Executor shutdown complete");
	});
}
