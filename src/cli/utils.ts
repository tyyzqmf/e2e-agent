/**
 * E2E CLI - Utility Functions
 *
 * Common utilities for CLI operations using Bun's native APIs.
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ====================================
// Path Configuration
// ====================================

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..", "..");
export const DATA_DIR = join(PROJECT_ROOT, "data");
export const LOGS_DIR = join(PROJECT_ROOT, "logs");
export const EXECUTOR_PID_FILE = join(DATA_DIR, "executor.pid");
export const BUN_PID_FILE = join(DATA_DIR, "bun.pid");

// ====================================
// ANSI Color Codes
// ====================================

export const colors = {
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[0;33m",
  blue: "\x1b[0;34m",
  reset: "\x1b[0m",
} as const;

// ====================================
// Printing Functions
// ====================================

export function printHeader(message: string): void {
  console.log(`${colors.blue}======================================${colors.reset}`);
  console.log(`${colors.blue}${message}${colors.reset}`);
  console.log(`${colors.blue}======================================${colors.reset}`);
}

export function printSuccess(message: string): void {
  console.log(`${colors.green}[OK]${colors.reset} ${message}`);
}

export function printError(message: string): void {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

export function printWarning(message: string): void {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

export function printInfo(message: string): void {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

// ====================================
// PID Management Functions
// ====================================

/**
 * Validate that a value is a valid PID (positive integer)
 */
export function validatePid(pid: string | number): boolean {
  const numPid = typeof pid === "string" ? parseInt(pid, 10) : pid;
  return !isNaN(numPid) && numPid > 0 && Number.isInteger(numPid);
}

/**
 * Safely read PID from file
 * @returns PID number if valid, null otherwise
 */
export async function safeReadPid(pidFile: string): Promise<number | null> {
  try {
    const file = Bun.file(pidFile);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    const pid = content.trim();

    if (validatePid(pid)) {
      return parseInt(pid, 10);
    }

    // Invalid PID, remove the file
    await $`rm -f ${pidFile}`.quiet();
    return null;
  } catch {
    return null;
  }
}

/**
 * Write PID to file
 */
export async function writePid(pidFile: string, pid: number): Promise<void> {
  await Bun.write(pidFile, String(pid));
}

/**
 * Remove PID file
 */
export async function removePidFile(pidFile: string): Promise<void> {
  try {
    await $`rm -f ${pidFile}`.quiet();
  } catch {
    // Ignore errors
  }
}

// ====================================
// Process Management Functions
// ====================================

/**
 * Check if a process with given PID is running
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
  if (!validatePid(pid)) {
    return false;
  }

  try {
    const result = await $`ps -p ${pid}`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Safely kill a process
 * @param pid Process ID to kill
 * @param signal Signal to send (default: TERM)
 */
export async function safeKill(pid: number, signal: string = "TERM"): Promise<boolean> {
  if (!validatePid(pid)) {
    return false;
  }

  try {
    await $`kill -${signal} ${pid}`.quiet().nothrow();
    return true;
  } catch {
    return false;
  }
}

/**
 * Find PIDs by process name pattern
 */
export async function findPidsByPattern(pattern: string): Promise<number[]> {
  try {
    const result = await $`ps aux`.quiet().text();
    const lines = result.split("\n");
    const pids: number[] = [];

    for (const line of lines) {
      // Check if pattern matches (excluding grep itself)
      if (line.includes(pattern) && !line.includes("grep")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid = parseInt(parts[1], 10);
          if (validatePid(pid)) {
            pids.push(pid);
          }
        }
      }
    }

    return pids;
  } catch {
    return [];
  }
}

/**
 * Check if executor is running
 */
export async function isExecutorRunning(): Promise<boolean> {
  // Check via PID file
  const pid = await safeReadPid(EXECUTOR_PID_FILE);
  if (pid && (await isProcessRunning(pid))) {
    return true;
  }

  // Check by process name (TypeScript executor)
  const pids = await findPidsByPattern("cli/run-executor");
  return pids.length > 0;
}

/**
 * Check if Bun web service is running
 */
export async function isBunServiceRunning(): Promise<boolean> {
  // Check via PID file
  const pid = await safeReadPid(BUN_PID_FILE);
  if (pid && (await isProcessRunning(pid))) {
    return true;
  }

  // Check by process name
  const pids = await findPidsByPattern("bun.*src/server/index.ts");
  return pids.length > 0;
}

// ====================================
// Directory Management
// ====================================

/**
 * Ensure required directories exist
 */
export async function ensureDirectories(): Promise<void> {
  await $`mkdir -p ${DATA_DIR} ${LOGS_DIR} ${join(DATA_DIR, "reports")}`.quiet();
}

/**
 * Generate timestamp string for log files
 */
export function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
}

/**
 * Find the latest log file matching a pattern
 */
export async function findLatestLog(prefix: string): Promise<string | null> {
  try {
    const result = await $`ls -t ${LOGS_DIR}/${prefix}_*.log 2>/dev/null | head -1`.quiet().text();
    const logFile = result.trim();
    return logFile || null;
  } catch {
    return null;
  }
}
