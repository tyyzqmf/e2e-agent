/**
 * E2E CLI - Log and Status Commands
 *
 * Commands for viewing logs and service status.
 */

import { $ } from "bun";
import { spawn } from "bun";
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  safeReadPid,
  isProcessRunning,
  findPidsByPattern,
  findLatestLog,
  LOGS_DIR,
  EXECUTOR_PID_FILE,
  BUN_PID_FILE,
} from "../utils.ts";

// ====================================
// Log Commands
// ====================================

/**
 * Tail executor log
 */
export async function logExecutor(): Promise<void> {
  const latestLog = await findLatestLog("executor");

  if (!latestLog) {
    printError(`No executor logs found in ${LOGS_DIR}`);
    process.exit(1);
  }

  printInfo(`Tailing executor log: ${latestLog}`);
  console.log("Press Ctrl+C to stop");
  console.log("");

  // Use spawn for interactive tail
  const proc = spawn({
    cmd: ["tail", "-f", latestLog],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  await proc.exited;
}

/**
 * Tail Bun web service log
 */
export async function logBun(): Promise<void> {
  const latestLog = await findLatestLog("bun");

  if (!latestLog) {
    printError(`No Bun logs found in ${LOGS_DIR}`);
    console.log("Note: Bun logs are only created when running in background mode.");
    process.exit(1);
  }

  printInfo(`Tailing Bun log: ${latestLog}`);
  console.log("Press Ctrl+C to stop");
  console.log("");

  // Use spawn for interactive tail
  const proc = spawn({
    cmd: ["tail", "-f", latestLog],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  await proc.exited;
}

// Alias for backward compatibility
export const logWeb = logBun;

/**
 * Handle log command
 */
export async function handleLogCommand(service: string): Promise<void> {
  switch (service) {
    case "executor":
      await logExecutor();
      break;

    case "web":
    case "bun":
      await logBun();
      break;

    default:
      printError(`Unknown service: ${service}`);
      console.log("Usage: e2e log <executor|web>");
      process.exit(1);
  }
}

// ====================================
// Status Command
// ====================================

export async function showStatus(): Promise<void> {
  printHeader("E2E Testing Services Status");
  console.log("");

  // Check executor
  console.log("Executor:");
  const executorPid = await safeReadPid(EXECUTOR_PID_FILE);

  if (executorPid && (await isProcessRunning(executorPid))) {
    printSuccess(`Running (PID: ${executorPid})`);
  } else if (executorPid) {
    printWarning("PID file exists but process not running");
  } else {
    // Check by process name
    const executorPids = await findPidsByPattern("cli/run_executor.py");
    if (executorPids.length > 0) {
      printSuccess(`Running (PID: ${executorPids.join(", ")})`);
    } else {
      printInfo("Not running");
    }
  }

  console.log("");

  // Check web service (Bun)
  console.log("Web Service (Bun):");
  const bunPid = await safeReadPid(BUN_PID_FILE);
  const port = process.env.PORT ?? "3000";

  if (bunPid && (await isProcessRunning(bunPid))) {
    printSuccess(`Running (PID: ${bunPid})`);
    console.log(`  URL: http://localhost:${port}`);
  } else if (bunPid) {
    printWarning("PID file exists but process not running");
  } else {
    // Check by process name
    const bunPids = await findPidsByPattern("bun.*src/server/index.ts");
    if (bunPids.length > 0) {
      printSuccess(`Running (PID: ${bunPids.join(", ")})`);
      console.log(`  URL: http://localhost:${port}`);
    } else {
      printInfo("Not running");
    }
  }

  console.log("");
}
