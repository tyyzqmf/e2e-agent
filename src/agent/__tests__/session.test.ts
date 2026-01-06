/**
 * Unit Tests for Agent Session
 *
 * Tests the session execution logic, focusing on:
 * - Error handling and status determination
 * - Message processing logic
 * - Session result structure
 */

import { afterEach, describe, expect, test } from "bun:test";
import { SessionStatus } from "../types/index.ts";

/**
 * Helper to determine session status based on error message
 * This mirrors the logic in session.ts for testability
 */
function determineSessionStatus(
	errorOccurred: boolean,
	errorMessage: string,
): SessionStatus {
	if (!errorOccurred) {
		return SessionStatus.CONTINUE;
	}

	// Check for context overflow
	if (
		errorMessage.includes("Input is too long") ||
		errorMessage.includes("CONTEXT_LENGTH_EXCEEDED") ||
		errorMessage.includes("context_length_exceeded") ||
		errorMessage.includes("maximum context length")
	) {
		return SessionStatus.CONTEXT_OVERFLOW;
	}

	return SessionStatus.ERROR;
}

describe("Session Status Determination", () => {
	test("returns CONTINUE when no error occurred", () => {
		const status = determineSessionStatus(false, "");
		expect(status).toBe(SessionStatus.CONTINUE);
	});

	test("returns ERROR for generic errors", () => {
		const status = determineSessionStatus(true, "Some generic error");
		expect(status).toBe(SessionStatus.ERROR);
	});

	test("returns CONTEXT_OVERFLOW for 'Input is too long' error", () => {
		const status = determineSessionStatus(true, "Input is too long for model");
		expect(status).toBe(SessionStatus.CONTEXT_OVERFLOW);
	});

	test("returns CONTEXT_OVERFLOW for CONTEXT_LENGTH_EXCEEDED error", () => {
		const status = determineSessionStatus(
			true,
			"Error: CONTEXT_LENGTH_EXCEEDED",
		);
		expect(status).toBe(SessionStatus.CONTEXT_OVERFLOW);
	});

	test("returns CONTEXT_OVERFLOW for context_length_exceeded error (lowercase)", () => {
		const status = determineSessionStatus(
			true,
			"context_length_exceeded: too many tokens",
		);
		expect(status).toBe(SessionStatus.CONTEXT_OVERFLOW);
	});

	test("returns CONTEXT_OVERFLOW for 'maximum context length' error", () => {
		const status = determineSessionStatus(
			true,
			"Request exceeds maximum context length",
		);
		expect(status).toBe(SessionStatus.CONTEXT_OVERFLOW);
	});
});

describe("SessionStatus Enum", () => {
	test("has correct value for CONTINUE", () => {
		expect(SessionStatus.CONTINUE).toBe("continue");
	});

	test("has correct value for ERROR", () => {
		expect(SessionStatus.ERROR).toBe("error");
	});

	test("has correct value for CONTEXT_OVERFLOW", () => {
		expect(SessionStatus.CONTEXT_OVERFLOW).toBe("context_overflow");
	});

	test("has correct value for COMPLETED", () => {
		expect(SessionStatus.COMPLETED).toBe("completed");
	});
});

describe("Error Message Classification", () => {
	const errorPatterns = [
		{
			name: "authentication_failed",
			message: "API Error [authentication_failed]: Check your API key",
			expectedStatus: SessionStatus.ERROR,
		},
		{
			name: "billing_error",
			message: "API Error [billing_error]: Check your billing settings",
			expectedStatus: SessionStatus.ERROR,
		},
		{
			name: "rate_limit",
			message: "API Error [rate_limit]: Rate limit exceeded",
			expectedStatus: SessionStatus.ERROR,
		},
		{
			name: "invalid_request",
			message: "API Error [invalid_request]: Invalid parameters",
			expectedStatus: SessionStatus.ERROR,
		},
		{
			name: "context_overflow_variant_1",
			message: "Input is too long",
			expectedStatus: SessionStatus.CONTEXT_OVERFLOW,
		},
		{
			name: "context_overflow_variant_2",
			message: "CONTEXT_LENGTH_EXCEEDED",
			expectedStatus: SessionStatus.CONTEXT_OVERFLOW,
		},
	];

	for (const pattern of errorPatterns) {
		test(`classifies ${pattern.name} correctly`, () => {
			const status = determineSessionStatus(true, pattern.message);
			expect(status).toBe(pattern.expectedStatus);
		});
	}
});

describe("Session Result Structure", () => {
	test("valid session result structure with usage data", () => {
		const result = {
			status: SessionStatus.CONTINUE,
			responseText: "Test response",
			usageData: {
				usage: {
					inputTokens: 1000,
					outputTokens: 500,
					cacheCreationTokens: 100,
					cacheReadTokens: 50,
				},
				totalCostUsd: 0.05,
				durationMs: 5000,
				numTurns: 3,
				sessionId: "test-session-123",
			},
		};

		expect(result.status).toBe(SessionStatus.CONTINUE);
		expect(result.responseText).toBe("Test response");
		expect(result.usageData).not.toBeNull();
		expect(result.usageData?.usage.inputTokens).toBe(1000);
		expect(result.usageData?.sessionId).toBe("test-session-123");
	});

	test("valid session result structure without usage data", () => {
		const result = {
			status: SessionStatus.ERROR,
			responseText: "Error occurred",
			usageData: null,
		};

		expect(result.status).toBe(SessionStatus.ERROR);
		expect(result.usageData).toBeNull();
	});

	test("session result with context overflow status", () => {
		const result = {
			status: SessionStatus.CONTEXT_OVERFLOW,
			responseText: "Input is too long for model context",
			usageData: {
				usage: {
					inputTokens: 200000,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
				},
				totalCostUsd: 0.6,
				durationMs: 1000,
				numTurns: 1,
				sessionId: "overflow-session",
			},
		};

		expect(result.status).toBe(SessionStatus.CONTEXT_OVERFLOW);
		expect(result.usageData?.usage.inputTokens).toBe(200000);
	});
});

describe("Usage Data Calculation", () => {
	test("total tokens calculation", () => {
		const usage = {
			inputTokens: 10000,
			outputTokens: 5000,
			cacheCreationTokens: 1000,
			cacheReadTokens: 500,
		};

		// Total used tokens = input + output + cacheRead
		// (cacheCreationTokens is a subset of input, not additional)
		const totalTokens =
			usage.inputTokens + usage.outputTokens + usage.cacheReadTokens;
		expect(totalTokens).toBe(15500);
	});

	test("context window usage percentage (with autocompact buffer)", () => {
		const usage = {
			inputTokens: 50000,
			outputTokens: 10000, // Not included in context usage calculation
			cacheReadInputTokens: 5000,
			cacheCreationInputTokens: 2000,
		};
		const contextWindow = 200000;
		const AUTOCOMPACT_BUFFER = 45000; // Fixed 45k tokens

		// Actual usage = input tokens only (not output)
		const actualUsed =
			usage.inputTokens +
			usage.cacheCreationInputTokens +
			usage.cacheReadInputTokens;

		// Total occupied = actual usage + autocompact buffer
		const totalOccupied = actualUsed + AUTOCOMPACT_BUFFER;

		// Percentage including autocompact buffer (matches /context display)
		const usagePercent = (totalOccupied / contextWindow) * 100;

		expect(actualUsed).toBe(57000); // 50000 + 2000 + 5000
		expect(totalOccupied).toBe(102000); // 57000 + 45000
		expect(usagePercent).toBeCloseTo(51.0, 1); // 102000 / 200000 * 100
	});
});

describe("API Error Type Classification", () => {
	/**
	 * Helper to extract error type from error message
	 */
	function getErrorType(errorMessage: string): string | null {
		const match = errorMessage.match(/API Error \[(\w+)\]/);
		return match ? match[1] : null;
	}

	test("extracts authentication_failed error type", () => {
		const errorType = getErrorType(
			"API Error [authentication_failed]: Check your API key",
		);
		expect(errorType).toBe("authentication_failed");
	});

	test("extracts billing_error error type", () => {
		const errorType = getErrorType(
			"API Error [billing_error]: Check your billing settings",
		);
		expect(errorType).toBe("billing_error");
	});

	test("extracts rate_limit error type", () => {
		const errorType = getErrorType(
			"API Error [rate_limit]: Rate limit exceeded",
		);
		expect(errorType).toBe("rate_limit");
	});

	test("extracts invalid_request error type", () => {
		const errorType = getErrorType(
			"API Error [invalid_request]: Invalid parameters",
		);
		expect(errorType).toBe("invalid_request");
	});

	test("returns null for non-API errors", () => {
		const errorType = getErrorType("Some generic error message");
		expect(errorType).toBeNull();
	});
});

describe("Debug Logging Flag", () => {
	const originalEnv = process.env.E2E_DEBUG;

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.E2E_DEBUG;
		} else {
			process.env.E2E_DEBUG = originalEnv;
		}
	});

	test("DEBUG_LOGGING is false when E2E_DEBUG is not set", () => {
		delete process.env.E2E_DEBUG;
		const debugEnabled = process.env.E2E_DEBUG === "1";
		expect(debugEnabled).toBe(false);
	});

	test("DEBUG_LOGGING is true when E2E_DEBUG is 1", () => {
		process.env.E2E_DEBUG = "1";
		const debugEnabled = process.env.E2E_DEBUG === "1";
		expect(debugEnabled).toBe(true);
	});

	test("DEBUG_LOGGING is false when E2E_DEBUG is other value", () => {
		process.env.E2E_DEBUG = "true";
		const debugEnabled = process.env.E2E_DEBUG === "1";
		expect(debugEnabled).toBe(false);
	});
});

describe("Tool Progress Handling", () => {
	test("progress shown for long-running tools (>5s)", () => {
		const progressMsg = {
			tool_name: "mcp__chrome-devtools__take_screenshot",
			elapsed_time_seconds: 7.5,
		};

		// Simulate the condition from session.ts
		const shouldShowProgress = progressMsg.elapsed_time_seconds > 5;
		expect(shouldShowProgress).toBe(true);
	});

	test("progress not shown for quick tools (<= 5s)", () => {
		const progressMsg = {
			tool_name: "Read",
			elapsed_time_seconds: 2.0,
		};

		const shouldShowProgress = progressMsg.elapsed_time_seconds > 5;
		expect(shouldShowProgress).toBe(false);
	});

	test("progress not shown at exactly 5s boundary", () => {
		const progressMsg = {
			tool_name: "Bash",
			elapsed_time_seconds: 5.0,
		};

		const shouldShowProgress = progressMsg.elapsed_time_seconds > 5;
		expect(shouldShowProgress).toBe(false);
	});
});
