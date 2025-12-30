/**
 * Logger Tests
 *
 * Tests for the logger utility using bun:test
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { logger } from "../utils/logger.ts";

describe("Logger", () => {
	let consoleLogSpy: ReturnType<typeof spyOn>;
	let consoleWarnSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		// Spy on console methods
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		// Restore console methods
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe("log levels", () => {
		it("should have debug method", () => {
			expect(typeof logger.debug).toBe("function");
		});

		it("should have info method", () => {
			expect(typeof logger.info).toBe("function");
		});

		it("should have warn method", () => {
			expect(typeof logger.warn).toBe("function");
		});

		it("should have error method", () => {
			expect(typeof logger.error).toBe("function");
		});
	});

	describe("info logging", () => {
		it("should log info messages to console.log", () => {
			logger.info("Test info message");

			expect(consoleLogSpy).toHaveBeenCalled();
			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("[INFO ]");
			expect(call).toContain("Test info message");
		});

		it("should include timestamp in log message", () => {
			logger.info("Test message");

			const call = consoleLogSpy.mock.calls[0][0] as string;
			// Check for ISO timestamp format pattern
			expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("should log info with data object", () => {
			logger.info("Test message", { key: "value" });

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("Test message");
			expect(call).toContain('"key":"value"');
		});
	});

	describe("warn logging", () => {
		it("should log warn messages to console.warn", () => {
			logger.warn("Test warning");

			expect(consoleWarnSpy).toHaveBeenCalled();
			const call = consoleWarnSpy.mock.calls[0][0] as string;
			expect(call).toContain("[WARN ]");
			expect(call).toContain("Test warning");
		});

		it("should log warn with data", () => {
			logger.warn("Warning message", { count: 42 });

			const call = consoleWarnSpy.mock.calls[0][0] as string;
			expect(call).toContain("Warning message");
			expect(call).toContain("42");
		});
	});

	describe("error logging", () => {
		it("should log error messages to console.error", () => {
			logger.error("Test error");

			expect(consoleErrorSpy).toHaveBeenCalled();
			const call = consoleErrorSpy.mock.calls[0][0] as string;
			expect(call).toContain("[ERROR]");
			expect(call).toContain("Test error");
		});

		it("should log error with Error object", () => {
			const error = new Error("Something went wrong");
			logger.error("Error occurred", error);

			const call = consoleErrorSpy.mock.calls[0][0] as string;
			expect(call).toContain("Error occurred");
		});
	});

	describe("request logging", () => {
		it("should have request method", () => {
			expect(typeof logger.request).toBe("function");
		});

		it("should log successful request as info", () => {
			logger.request("GET", "/api/jobs", 200, 50);

			expect(consoleLogSpy).toHaveBeenCalled();
			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("GET /api/jobs 200 50ms");
		});

		it("should log 4xx request as warn", () => {
			logger.request("POST", "/api/jobs", 400, 10);

			expect(consoleWarnSpy).toHaveBeenCalled();
			const call = consoleWarnSpy.mock.calls[0][0] as string;
			expect(call).toContain("POST /api/jobs 400 10ms");
		});

		it("should log 5xx request as error", () => {
			logger.request("GET", "/api/jobs", 500, 100);

			expect(consoleErrorSpy).toHaveBeenCalled();
			const call = consoleErrorSpy.mock.calls[0][0] as string;
			expect(call).toContain("GET /api/jobs 500 100ms");
		});
	});

	describe("job logging", () => {
		it("should have job method", () => {
			expect(typeof logger.job).toBe("function");
		});

		it("should log job events with truncated job ID", () => {
			const jobId = "12345678-1234-1234-1234-123456789012";
			logger.job(jobId, "started");

			expect(consoleLogSpy).toHaveBeenCalled();
			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("[Job 12345678]");
			expect(call).toContain("started");
		});

		it("should log job events with details", () => {
			const jobId = "abcdefgh-1234-1234-1234-123456789012";
			logger.job(jobId, "completed", { duration: 1000 });

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("[Job abcdefgh]");
			expect(call).toContain("completed");
			expect(call).toContain("1000");
		});
	});

	describe("data formatting", () => {
		it("should stringify object data", () => {
			logger.info("Test", { nested: { key: "value" } });

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain('"nested"');
			expect(call).toContain('"key":"value"');
		});

		it("should convert non-object data to string", () => {
			logger.info("Number test", 42);

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("42");
		});

		it("should handle null data", () => {
			logger.info("Null test", null);

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("null");
		});

		it("should handle undefined data gracefully", () => {
			logger.info("Undefined test");

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("Undefined test");
			// Should not include "undefined" in output when no data provided
			expect(call).not.toContain("undefined");
		});

		it("should handle array data", () => {
			logger.info("Array test", [1, 2, 3]);

			const call = consoleLogSpy.mock.calls[0][0] as string;
			expect(call).toContain("[1,2,3]");
		});
	});
});
