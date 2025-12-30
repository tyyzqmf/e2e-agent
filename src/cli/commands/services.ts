/**
 * E2E CLI - Service Management Commands
 *
 * Commands for starting and stopping services (executor, web).
 */

import { join } from "node:path";
import { spawn } from "bun";
import { setupEnvironment } from "../env-check.ts";
import {
	BUN_PID_FILE,
	DATA_DIR,
	EXECUTOR_PID_FILE,
	findPidsByPattern,
	getTimestamp,
	isProcessRunning,
	LOGS_DIR,
	PROJECT_ROOT,
	printError,
	printHeader,
	printInfo,
	printSuccess,
	printWarning,
	removePidFile,
	safeKill,
	safeReadPid,
	writePid,
} from "../utils.ts";

// ====================================
// Start Commands
// ====================================

export async function startExecutor(): Promise<boolean> {
	printInfo("Starting test executor...");

	// Check if already running
	const oldPid = await safeReadPid(EXECUTOR_PID_FILE);
	if (oldPid && (await isProcessRunning(oldPid))) {
		printWarning(`Executor already running (PID: ${oldPid})`);
		return true;
	}

	// Remove stale PID file
	await removePidFile(EXECUTOR_PID_FILE);

	// Create log file
	const logFile = join(LOGS_DIR, `executor_${getTimestamp()}.log`);

	// Start executor with setsid to create new process group
	try {
		const proc = spawn({
			cmd: ["setsid", "nohup", "bun", "run", "src/cli/run-executor.ts"],
			cwd: PROJECT_ROOT,
			stdout: Bun.file(logFile),
			stderr: Bun.file(logFile),
			stdin: "ignore",
			env: {
				...process.env,
				USE_AWS_BEDROCK: process.env.USE_AWS_BEDROCK ?? "true",
				AWS_REGION: process.env.AWS_REGION ?? "us-west-2",
			},
		});

		// Detach the process
		proc.unref();

		// Wait for startup
		await Bun.sleep(2000);

		// Verify startup by checking PID file
		const newPid = await safeReadPid(EXECUTOR_PID_FILE);
		if (newPid && (await isProcessRunning(newPid))) {
			printSuccess(`Executor started (PID: ${newPid})`);
			printInfo(`Log file: ${logFile}`);
			return true;
		}

		// Retry check
		await Bun.sleep(2000);
		const retryPid = await safeReadPid(EXECUTOR_PID_FILE);
		if (retryPid && (await isProcessRunning(retryPid))) {
			printSuccess(`Executor started (PID: ${retryPid})`);
			printInfo(`Log file: ${logFile}`);
			return true;
		}

		printError(`Failed to start executor. Check log: ${logFile}`);
		return false;
	} catch (error) {
		printError(`Failed to start executor: ${error}`);
		return false;
	}
}

export async function startBun(foreground: boolean = false): Promise<boolean> {
	printInfo("Starting Bun web service...");

	// Check if already running
	const pid = await safeReadPid(BUN_PID_FILE);
	if (pid && (await isProcessRunning(pid))) {
		printWarning(`Bun service already running (PID: ${pid})`);
		return true;
	}

	// Also check by process name
	const bunPids = await findPidsByPattern("bun.*src/server/index.ts");
	if (bunPids.length > 0) {
		printWarning(`Bun service already running (PID: ${bunPids.join(", ")})`);
		return true;
	}

	// Remove stale PID file
	await removePidFile(BUN_PID_FILE);

	const host = process.env.BUN_HOST ?? process.env.HOST ?? "0.0.0.0";
	const port = process.env.BUN_PORT ?? process.env.PORT ?? "3000";

	// Set environment variables
	process.env.PORT = port;
	process.env.HOST = host;
	process.env.DATA_DIR = DATA_DIR;
	process.env.PROJECT_ROOT = PROJECT_ROOT;

	if (foreground) {
		printSuccess(`Bun web service starting on http://${host}:${port}`);
		printInfo("Press Ctrl+C to stop");

		// Run in foreground - use exec to replace current process
		const proc = spawn({
			cmd: ["bun", "run", "src/server/index.ts"],
			cwd: PROJECT_ROOT,
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
			env: {
				...process.env,
				PORT: port,
				HOST: host,
				DATA_DIR,
				PROJECT_ROOT,
			},
		});

		// Wait for the process
		await proc.exited;
		return true;
	}

	// Start in background
	const logFile = join(LOGS_DIR, `bun_${getTimestamp()}.log`);

	try {
		const proc = spawn({
			cmd: ["bun", "run", "src/server/index.ts"],
			cwd: PROJECT_ROOT,
			stdout: Bun.file(logFile),
			stderr: Bun.file(logFile),
			stdin: "ignore",
			env: {
				...process.env,
				PORT: port,
				HOST: host,
				DATA_DIR,
				PROJECT_ROOT,
			},
		});

		const bunPid = proc.pid;
		await writePid(BUN_PID_FILE, bunPid);

		// Detach the process
		proc.unref();

		// Wait for startup
		await Bun.sleep(2000);

		if (await isProcessRunning(bunPid)) {
			printSuccess(`Bun web service started (PID: ${bunPid})`);
			printInfo(`URL: http://${host}:${port}`);
			printInfo(`Log file: ${logFile}`);
			return true;
		}

		printError(`Failed to start Bun service. Check log: ${logFile}`);
		return false;
	} catch (error) {
		printError(`Failed to start Bun service: ${error}`);
		return false;
	}
}

// Alias for backward compatibility
export const startWeb = startBun;

export async function startAll(): Promise<void> {
	printHeader("Starting E2E Testing Services");
	console.log("");

	await setupEnvironment(true);

	console.log("");
	console.log("AWS Bedrock Configuration:");
	console.log(`  USE_AWS_BEDROCK=${process.env.USE_AWS_BEDROCK}`);
	console.log(`  AWS_REGION=${process.env.AWS_REGION}`);
	console.log("");

	// Start executor in background
	await startExecutor();
	console.log("");

	const host = process.env.BUN_HOST ?? process.env.HOST ?? "0.0.0.0";
	const port = process.env.BUN_PORT ?? process.env.PORT ?? "5000";

	printSuccess("All services starting");
	console.log("");
	console.log(`Web Service: http://${host}:${port}`);
	console.log(`Executor logs: ${LOGS_DIR}/executor_*.log`);
	console.log("");
	console.log("Press Ctrl+C to stop web service (executor will continue)");
	console.log("Use 'e2e stop' to stop all services");
	console.log("");

	// Setup cleanup handler
	const cleanup = async () => {
		console.log("");
		printInfo("Stopping web service...");

		const bunPids = await findPidsByPattern("bun.*src/server/index.ts");
		for (const pid of bunPids) {
			await safeKill(pid);
		}

		if (bunPids.length > 0) {
			printSuccess("Web service stopped");
		}

		const executorPid = await safeReadPid(EXECUTOR_PID_FILE);
		if (executorPid && (await isProcessRunning(executorPid))) {
			printInfo(`Executor still running (PID: ${executorPid})`);
			console.log("Use 'e2e stop executor' to stop it");
		}

		process.exit(0);
	};

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);

	// Set environment and start Bun in foreground
	process.env.PORT = port;
	process.env.HOST = host;
	process.env.DATA_DIR = DATA_DIR;
	process.env.PROJECT_ROOT = PROJECT_ROOT;

	// Start Bun web service in foreground (replaces current process)
	const proc = spawn({
		cmd: ["bun", "run", "src/server/index.ts"],
		cwd: PROJECT_ROOT,
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
		env: {
			...process.env,
			PORT: port,
			HOST: host,
			DATA_DIR,
			PROJECT_ROOT,
		},
	});

	await proc.exited;
}

// ====================================
// Stop Commands
// ====================================

export async function stopExecutor(): Promise<void> {
	printInfo("Stopping test executor...");

	let stopped = false;

	// Try PID file first
	const pid = await safeReadPid(EXECUTOR_PID_FILE);
	if (pid && (await isProcessRunning(pid))) {
		await safeKill(pid);

		// Wait for graceful shutdown
		for (let i = 0; i < 5; i++) {
			if (!(await isProcessRunning(pid))) {
				break;
			}
			await Bun.sleep(1000);
		}

		// Force kill if needed
		if (await isProcessRunning(pid)) {
			printWarning("Force killing executor...");
			await safeKill(pid, "9");
		}
		stopped = true;
	}
	await removePidFile(EXECUTOR_PID_FILE);

	// Also check by process name (both Python and TypeScript)
	const executorPids = await findPidsByPattern("cli/run-executor");
	for (const execPid of executorPids) {
		await safeKill(execPid);
		stopped = true;
	}

	if (stopped) {
		printSuccess("Executor stopped");
	} else {
		printInfo("Executor was not running");
	}

	// Cleanup child processes
	await cleanupChildProcesses();
}

export async function stopBun(): Promise<void> {
	printInfo("Stopping Bun web service...");

	let stopped = false;

	// Check PID file
	const pid = await safeReadPid(BUN_PID_FILE);
	if (pid && (await isProcessRunning(pid))) {
		await safeKill(pid);
		stopped = true;
	}
	await removePidFile(BUN_PID_FILE);

	// Also check by process name
	const bunPids = await findPidsByPattern("bun.*src/server/index.ts");
	for (const bunPid of bunPids) {
		await safeKill(bunPid);
		stopped = true;
	}

	if (stopped) {
		printSuccess("Bun web service stopped");
	} else {
		printInfo("Bun web service was not running");
	}
}

// Alias for backward compatibility
export const stopWeb = stopBun;

async function cleanupChildProcesses(): Promise<void> {
	printInfo("Cleaning up related processes...");

	// Cleanup TypeScript agent processes (spawned by the executor)
	const agentPids = await findPidsByPattern("bun.*agent");
	for (const pid of agentPids) {
		await safeKill(pid);
	}

	// Cleanup chrome-devtools-mcp processes
	const mcpPids = await findPidsByPattern("chrome-devtools-mcp");
	for (const pid of mcpPids) {
		await safeKill(pid);
	}

	// Cleanup Chrome processes
	const chromePids = await findPidsByPattern("chrome.*remote-debugging-port");
	for (const pid of chromePids) {
		await safeKill(pid);
	}
}

export async function stopAll(): Promise<void> {
	printHeader("Stopping E2E Testing Services");
	console.log("");

	await stopBun();
	console.log("");
	await stopExecutor();
	console.log("");

	printSuccess("All services stopped");
}
