/**
 * E2E CLI - Job Management Commands
 *
 * Commands for managing test jobs using the TypeScript JobService.
 */

import { JobService, printJobList, printJobStatus } from "../services/job.ts";
import {
	DATA_DIR,
	isExecutorRunning,
	printError,
	printInfo,
	printSuccess,
} from "../utils.ts";
import { startExecutor } from "./services.ts";

/**
 * Submit a new test job from spec file
 */
export async function submitJob(specFile: string): Promise<void> {
	if (!specFile) {
		printError("Usage: e2e job submit <spec_file>");
		process.exit(1);
	}

	printInfo(`Submitting job from: ${specFile}`);

	const jobService = new JobService(DATA_DIR);

	try {
		const jobId = jobService.submitJob(specFile);

		if (jobId) {
			printSuccess("Job submitted successfully");
			console.log("");
			console.log(`Job ID: ${jobId}`);
			console.log("Status: queued");
			console.log("");
			console.log(`Check status: e2e job status ${jobId}`);

			// Check if executor is running
			if (!(await isExecutorRunning())) {
				console.log("");
				printInfo("Executor is not running");
				printInfo("Starting executor automatically...");
				await startExecutor();
			}
		} else {
			process.exit(1);
		}
	} finally {
		jobService.close();
	}
}

/**
 * Cancel a job by ID
 */
export async function cancelJob(jobId: string): Promise<void> {
	if (!jobId) {
		printError("Usage: e2e job cancel <job_id>");
		process.exit(1);
	}

	printInfo(`Cancelling job: ${jobId}`);

	const jobService = new JobService(DATA_DIR);

	try {
		const result = jobService.cancelJob(jobId);

		if (result.success) {
			printSuccess(result.message);
		} else {
			printError(result.message);
			process.exit(1);
		}
	} finally {
		jobService.close();
	}
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<void> {
	if (!jobId) {
		printError("Usage: e2e job status <job_id>");
		process.exit(1);
	}

	const jobService = new JobService(DATA_DIR);

	try {
		const job = jobService.getJob(jobId);

		if (!job) {
			printError(`Job not found: ${jobId}`);
			process.exit(1);
		}

		const cost = jobService.getCostStatistics(jobId);
		const testCases = jobService.getTestCases(jobId);

		printJobStatus(job, cost, testCases);
	} finally {
		jobService.close();
	}
}

/**
 * List all jobs
 */
export async function listJobs(limit: number = 20): Promise<void> {
	const jobService = new JobService(DATA_DIR);

	try {
		const jobs = jobService.listJobs(limit);
		printJobList(jobs, limit);
	} finally {
		jobService.close();
	}
}

/**
 * Get job execution log
 */
export async function getJobLog(
	jobId: string,
	options: { tail?: number; follow?: boolean } = {},
): Promise<void> {
	if (!jobId) {
		printError("Usage: e2e job log <job_id> [--tail <n>] [--follow]");
		process.exit(1);
	}

	const jobService = new JobService(DATA_DIR);

	try {
		const job = jobService.getJob(jobId);

		if (!job) {
			printError(`Job not found: ${jobId}`);
			process.exit(1);
		}

		const logPath = jobService.getLogPath(jobId);

		if (!logPath) {
			printError(`No log file found for job: ${jobId}`);
			printInfo(`Job status: ${job.status}`);
			if (job.status === "queued") {
				printInfo(
					"Job has not started yet. Logs will be available after execution begins.",
				);
			}
			process.exit(1);
		}

		// Follow mode: use tail -f
		if (options.follow) {
			printInfo(`Following log file: ${logPath}`);
			printInfo("Press Ctrl+C to stop\n");

			const proc = Bun.spawn(["tail", "-f", logPath], {
				stdout: "inherit",
				stderr: "inherit",
			});

			// Handle SIGINT to clean up
			process.on("SIGINT", () => {
				proc.kill();
				process.exit(0);
			});

			await proc.exited;
			return;
		}

		// Normal mode: read content
		const content = jobService.getLogContent(jobId, options.tail ?? 0);

		if (!content) {
			printError("Failed to read log file");
			process.exit(1);
		}

		// Print header
		console.log(`\nJob Log: ${jobId}`);
		console.log(`Status: ${job.status}`);
		console.log(`Log file: ${logPath}`);
		if (options.tail) {
			console.log(`(showing last ${options.tail} lines)`);
		}
		console.log("=".repeat(80));
		console.log(content);
	} finally {
		jobService.close();
	}
}

/**
 * Delete job(s) by ID - supports single or batch deletion
 */
export async function deleteJob(jobIds: string[]): Promise<void> {
	if (jobIds.length === 0) {
		printError("Usage: e2e job delete <job_id> [job_id2] [job_id3] ...");
		process.exit(1);
	}

	const jobService = new JobService(DATA_DIR);

	try {
		if (jobIds.length === 1) {
			// Single delete
			printInfo(`Deleting job: ${jobIds[0]}`);
			const result = jobService.deleteJob(jobIds[0]);

			if (result.success) {
				printSuccess(result.message);
			} else {
				printError(result.message);
				process.exit(1);
			}
		} else {
			// Batch delete
			printInfo(`Deleting ${jobIds.length} jobs...`);
			const result = jobService.deleteJobs(jobIds);

			if (result.deleted.length > 0) {
				printSuccess(`Successfully deleted ${result.deleted.length} job(s)`);
				for (const jobId of result.deleted) {
					console.log(`  - ${jobId}`);
				}
			}

			if (result.failed.length > 0) {
				console.log("");
				printError(`Failed to delete ${result.failed.length} job(s):`);
				for (const fail of result.failed) {
					console.log(`  - ${fail.jobId}: ${fail.reason}`);
				}
				process.exit(1);
			}
		}
	} finally {
		jobService.close();
	}
}

/**
 * Parse log command options
 */
function parseLogOptions(args: string[]): {
	jobId: string;
	tail?: number;
	follow?: boolean;
} {
	const options: { jobId: string; tail?: number; follow?: boolean } = {
		jobId: "",
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--tail" || arg === "-n") {
			const nextArg = args[i + 1];
			if (nextArg && !nextArg.startsWith("-")) {
				options.tail = parseInt(nextArg, 10);
				i++;
			}
		} else if (arg === "--follow" || arg === "-f") {
			options.follow = true;
		} else if (!arg.startsWith("-") && !options.jobId) {
			options.jobId = arg;
		}
	}

	return options;
}

/**
 * Handle job command
 */
export async function handleJobCommand(
	action: string,
	args: string[],
): Promise<void> {
	switch (action) {
		case "submit":
			await submitJob(args[0]);
			break;

		case "cancel":
			await cancelJob(args[0]);
			break;

		case "status":
			await getJobStatus(args[0]);
			break;

		case "list": {
			const limit = args[0] ? parseInt(args[0], 10) : 20;
			await listJobs(limit);
			break;
		}

		case "delete":
			await deleteJob(args);
			break;

		case "log": {
			const options = parseLogOptions(args);
			const logOptions: { tail?: number; follow?: boolean } = {};
			if (options.tail !== undefined) logOptions.tail = options.tail;
			if (options.follow !== undefined) logOptions.follow = options.follow;
			await getJobLog(options.jobId, logOptions);
			break;
		}

		default:
			printError(`Unknown job action: ${action}`);
			console.log(
				"Usage: e2e job <submit|cancel|status|list|delete|log> [args]",
			);
			process.exit(1);
	}
}
