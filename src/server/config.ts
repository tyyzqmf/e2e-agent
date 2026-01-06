/**
 * E2E Agent Web Service - Configuration
 *
 * Centralized configuration management using Bun.env with sensible defaults.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./types/index.ts";

// Get the directory of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve project root directory
 * src/server/config.ts -> project root (2 levels up)
 */
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Parse environment variable as integer with default
 */
function envInt(key: string, defaultValue: number): number {
	const value = Bun.env[key];
	if (value === undefined) return defaultValue;
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as boolean
 */
function envBool(key: string, defaultValue: boolean): boolean {
	const value = Bun.env[key]?.toLowerCase();
	if (value === undefined) return defaultValue;
	return value === "true" || value === "1" || value === "yes";
}

/**
 * Application configuration object
 *
 * All configuration is read from environment variables with sensible defaults.
 * This follows the 12-factor app methodology.
 */
export const config: AppConfig = {
	// Server configuration
	PORT: envInt("PORT", 5000),
	HOST: Bun.env.HOST ?? "0.0.0.0",

	// Path configuration
	PROJECT_ROOT,
	DATA_DIR: Bun.env.DATA_DIR ?? join(PROJECT_ROOT, "data"),
	DATABASE_PATH: Bun.env.DATABASE_PATH ?? join(PROJECT_ROOT, "data", "e2e.db"),
	LOGS_DIR: Bun.env.LOGS_DIR ?? join(PROJECT_ROOT, "logs"),

	// Execution configuration
	MAX_EXECUTION_TIME_MS: envInt("MAX_EXECUTION_TIME_MS", 2 * 60 * 60 * 1000), // 2 hours
	EXECUTOR_POLL_INTERVAL_MS: envInt("EXECUTOR_POLL_INTERVAL_MS", 5000), // 5 seconds
	STOP_GRACE_PERIOD_MS: envInt("STOP_GRACE_PERIOD_MS", 10000), // 10 seconds

	// Validation configuration
	TEST_SPEC_MIN_LENGTH: envInt("TEST_SPEC_MIN_LENGTH", 10),
	TEST_SPEC_MAX_LENGTH: envInt("TEST_SPEC_MAX_LENGTH", 100000),

	// Logging configuration
	LOG_LEVEL: (Bun.env.LOG_LEVEL as AppConfig["LOG_LEVEL"]) ?? "info",

	// Feature flags
	ENABLE_CORS: envBool("ENABLE_CORS", true),
	NODE_ENV: (Bun.env.NODE_ENV as AppConfig["NODE_ENV"]) ?? "development",
};

/**
 * Validate configuration on startup
 *
 * @returns Array of error messages, empty if valid
 */
export function validateConfig(): string[] {
	const errors: string[] = [];

	if (config.PORT < 1 || config.PORT > 65535) {
		errors.push(`Invalid PORT: ${config.PORT}`);
	}

	if (config.TEST_SPEC_MIN_LENGTH >= config.TEST_SPEC_MAX_LENGTH) {
		errors.push("TEST_SPEC_MIN_LENGTH must be less than TEST_SPEC_MAX_LENGTH");
	}

	if (config.EXECUTOR_POLL_INTERVAL_MS < 1000) {
		errors.push("EXECUTOR_POLL_INTERVAL_MS must be at least 1000ms");
	}

	return errors;
}

/**
 * Print configuration (with sensitive values masked)
 */
export function printConfig(): void {
	console.log("=".repeat(60));
	console.log("E2E Agent Web Service Configuration");
	console.log("=".repeat(60));
	console.log(`  Runtime:     Bun ${Bun.version}`);
	console.log(`  Environment: ${config.NODE_ENV}`);
	console.log(`  Server:      ${config.HOST}:${config.PORT}`);
	console.log(`  Data Dir:    ${config.DATA_DIR}`);
	console.log(`  Database:    ${config.DATABASE_PATH}`);
	console.log(`  Log Level:   ${config.LOG_LEVEL}`);
	console.log("=".repeat(60));
}

export default config;
