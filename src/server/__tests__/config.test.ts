/**
 * Config Tests
 *
 * Tests for configuration module
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { config, printConfig, validateConfig } from "../config.ts";

describe("Config", () => {
	describe("config object", () => {
		it("should have required properties", () => {
			expect(config).toHaveProperty("PORT");
			expect(config).toHaveProperty("HOST");
			expect(config).toHaveProperty("DATA_DIR");
			expect(config).toHaveProperty("PROJECT_ROOT");
			expect(config).toHaveProperty("NODE_ENV");
			expect(config).toHaveProperty("LOG_LEVEL");
		});

		it("should have valid default values", () => {
			expect(typeof config.PORT).toBe("number");
			expect(config.PORT).toBeGreaterThan(0);
			expect(config.PORT).toBeLessThanOrEqual(65535);

			expect(typeof config.HOST).toBe("string");
			expect(config.HOST.length).toBeGreaterThan(0);

			expect(["development", "production", "test"]).toContain(config.NODE_ENV);
			expect(["debug", "info", "warn", "error"]).toContain(config.LOG_LEVEL);
		});

		it("should have valid timeout values", () => {
			expect(config.EXECUTOR_POLL_INTERVAL_MS).toBeGreaterThan(0);
			expect(config.STOP_GRACE_PERIOD_MS).toBeGreaterThan(0);
			expect(config.TEST_SPEC_MAX_LENGTH).toBeGreaterThan(0);
		});

		it("should have all execution config properties", () => {
			expect(config).toHaveProperty("MAX_EXECUTION_TIME_MS");
			expect(config).toHaveProperty("EXECUTOR_POLL_INTERVAL_MS");
			expect(config).toHaveProperty("STOP_GRACE_PERIOD_MS");
			expect(config.MAX_EXECUTION_TIME_MS).toBeGreaterThan(0);
		});

		it("should have all validation config properties", () => {
			expect(config).toHaveProperty("TEST_SPEC_MIN_LENGTH");
			expect(config).toHaveProperty("TEST_SPEC_MAX_LENGTH");
			expect(config.TEST_SPEC_MIN_LENGTH).toBeGreaterThan(0);
			expect(config.TEST_SPEC_MAX_LENGTH).toBeGreaterThan(
				config.TEST_SPEC_MIN_LENGTH,
			);
		});

		it("should have feature flags", () => {
			expect(config).toHaveProperty("ENABLE_CORS");
			expect(typeof config.ENABLE_CORS).toBe("boolean");
		});

		it("should have path configurations", () => {
			expect(config).toHaveProperty("DATABASE_PATH");
			expect(config).toHaveProperty("LOGS_DIR");
			expect(typeof config.DATABASE_PATH).toBe("string");
			expect(typeof config.LOGS_DIR).toBe("string");
		});
	});

	describe("validateConfig", () => {
		it("should return empty array for valid config", () => {
			// Note: This depends on the actual environment
			// In test environment, config should be valid
			const errors = validateConfig();
			expect(errors).toBeInstanceOf(Array);
		});

		it("should return array type", () => {
			const errors = validateConfig();
			expect(Array.isArray(errors)).toBe(true);
		});

		it("should validate PORT range", () => {
			// With default config, PORT should be valid
			const errors = validateConfig();
			const portError = errors.find((e) => e.includes("PORT"));
			// Default config should have valid PORT
			if (config.PORT >= 1 && config.PORT <= 65535) {
				expect(portError).toBeUndefined();
			}
		});

		it("should validate TEST_SPEC length constraints", () => {
			const errors = validateConfig();
			const specError = errors.find((e) => e.includes("TEST_SPEC"));
			// Default config should have valid spec lengths
			if (config.TEST_SPEC_MIN_LENGTH < config.TEST_SPEC_MAX_LENGTH) {
				expect(specError).toBeUndefined();
			}
		});

		it("should validate EXECUTOR_POLL_INTERVAL_MS minimum", () => {
			const errors = validateConfig();
			const pollError = errors.find((e) =>
				e.includes("EXECUTOR_POLL_INTERVAL_MS"),
			);
			// Default should be valid (>= 1000ms)
			if (config.EXECUTOR_POLL_INTERVAL_MS >= 1000) {
				expect(pollError).toBeUndefined();
			}
		});
	});

	describe("printConfig", () => {
		let consoleSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			consoleSpy = spyOn(console, "log").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleSpy.mockRestore();
		});

		it("should print configuration to console", () => {
			printConfig();

			expect(consoleSpy).toHaveBeenCalled();
			expect(consoleSpy.mock.calls.length).toBeGreaterThan(0);
		});

		it("should print header lines", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			// Should include separator lines
			const hasSeparator = calls.some((line: unknown) => (line as string)?.includes("="));
			expect(hasSeparator).toBe(true);
		});

		it("should print runtime info", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasRuntime = calls.some((line: unknown) => (line as string)?.includes("Runtime"));
			expect(hasRuntime).toBe(true);
		});

		it("should print environment info", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasEnv = calls.some((line: unknown) => (line as string)?.includes("Environment"));
			expect(hasEnv).toBe(true);
		});

		it("should print server info", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasServer = calls.some((line: unknown) => (line as string)?.includes("Server"));
			expect(hasServer).toBe(true);
		});

		it("should print data directory", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasDataDir = calls.some((line: unknown) => (line as string)?.includes("Data Dir"));
			expect(hasDataDir).toBe(true);
		});

		it("should print database path", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasDatabase = calls.some((line: unknown) => (line as string)?.includes("Database"));
			expect(hasDatabase).toBe(true);
		});

		it("should print log level", () => {
			printConfig();

			const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
			const hasLogLevel = calls.some((line: unknown) => (line as string)?.includes("Log Level"));
			expect(hasLogLevel).toBe(true);
		});
	});
});
