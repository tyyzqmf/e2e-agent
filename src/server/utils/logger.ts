/**
 * E2E Agent Web Service - Logger
 *
 * Simple structured logging utility following Bun best practices.
 */

import { config } from "../config.ts";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4, // Suppress all logs
};

/**
 * Get current log level threshold
 * Read directly from env to allow runtime changes (useful for tests)
 */
function getCurrentLogLevel(): number {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
  return LOG_LEVELS[envLevel ?? config.LOG_LEVEL] ?? LOG_LEVELS.info;
}

/**
 * Format log message with timestamp and level
 */
function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `${timestamp} [${level.toUpperCase().padEnd(5)}]`;

  if (data !== undefined) {
    const dataStr = typeof data === "object" ? JSON.stringify(data) : String(data);
    return `${prefix} ${message} ${dataStr}`;
  }

  return `${prefix} ${message}`;
}

/**
 * Log a message at the specified level
 */
function log(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < getCurrentLogLevel()) {
    return;
  }

  const formatted = formatMessage(level, message, data);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Logger instance with methods for each log level
 */
export const logger = {
  debug: (message: string, data?: unknown) => log("debug", message, data),
  info: (message: string, data?: unknown) => log("info", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),

  /**
   * Log an HTTP request
   */
  request: (method: string, path: string, status: number, durationMs: number) => {
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log(level, `${method} ${path} ${status} ${durationMs}ms`);
  },

  /**
   * Log a job event
   */
  job: (jobId: string, event: string, details?: unknown) => {
    log("info", `[Job ${jobId.slice(0, 8)}] ${event}`, details);
  },
};

export default logger;
