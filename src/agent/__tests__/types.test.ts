/**
 * Unit Tests for Agent Types
 */

import { describe, expect, test } from "bun:test";
import {
	type CostBreakdown,
	FALLBACK_PRICING,
	type SessionRecord,
} from "../types/pricing.ts";
import {
	type AgentSessionOptions,
	type SessionResult,
	SessionStatus,
	type TokenUsage,
	type UsageData,
} from "../types/session.ts";
import {
	getCompletedCount,
	getCompletionRate,
	getPassRate,
	type TestCase,
	type TestCaseStats,
} from "../types/test-case.ts";

describe("Session Types", () => {
	test("SessionStatus enum has correct values", () => {
		expect(SessionStatus.CONTINUE).toBe("continue");
		expect(SessionStatus.ERROR).toBe("error");
		expect(SessionStatus.COMPLETED).toBe("completed");
	});

	test("TokenUsage interface can be created", () => {
		const usage: TokenUsage = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheCreationTokens: 100,
			cacheReadTokens: 200,
		};

		expect(usage.inputTokens).toBe(1000);
		expect(usage.outputTokens).toBe(500);
		expect(usage.cacheCreationTokens).toBe(100);
		expect(usage.cacheReadTokens).toBe(200);
	});

	test("UsageData interface can be created", () => {
		const data: UsageData = {
			usage: {
				inputTokens: 1000,
				outputTokens: 500,
			},
			totalCostUsd: 0.05,
			durationMs: 5000,
			numTurns: 3,
			sessionId: "test-session-123",
		};

		expect(data.sessionId).toBe("test-session-123");
		expect(data.durationMs).toBe(5000);
		expect(data.numTurns).toBe(3);
	});

	test("SessionResult interface can be created", () => {
		const result: SessionResult = {
			status: SessionStatus.CONTINUE,
			responseText: "Test response",
			usageData: null,
		};

		expect(result.status).toBe(SessionStatus.CONTINUE);
		expect(result.responseText).toBe("Test response");
		expect(result.usageData).toBeNull();
	});

	test("AgentSessionOptions interface can be created", () => {
		const options: AgentSessionOptions = {
			projectDir: "/path/to/project",
			model: "claude-sonnet-4-5-20250929",
			maxIterations: 10,
		};

		expect(options.projectDir).toBe("/path/to/project");
		expect(options.model).toBe("claude-sonnet-4-5-20250929");
		expect(options.maxIterations).toBe(10);
	});
});

describe("Test Case Types", () => {
	test("TestCaseStats helper functions work correctly", () => {
		const stats: TestCaseStats = {
			total: 50,
			passed: 30,
			failed: 10,
			blocked: 5,
			notRun: 5,
		};

		expect(getCompletedCount(stats)).toBe(45); // 30 + 10 + 5
		expect(getCompletionRate(stats)).toBe(90); // 45/50 * 100
		expect(getPassRate(stats)).toBeCloseTo(66.67, 1); // 30/45 * 100
	});

	test("getCompletionRate handles zero total", () => {
		const stats: TestCaseStats = {
			total: 0,
			passed: 0,
			failed: 0,
			blocked: 0,
			notRun: 0,
		};

		expect(getCompletionRate(stats)).toBe(0);
	});

	test("getPassRate handles zero completed", () => {
		const stats: TestCaseStats = {
			total: 10,
			passed: 0,
			failed: 0,
			blocked: 0,
			notRun: 10,
		};

		expect(getPassRate(stats)).toBe(0);
	});

	test("TestCase interface can be created", () => {
		const testCase: TestCase = {
			caseId: "TC-001",
			title: "Login Test",
			description: "Test user login functionality",
			preconditions: ["User exists", "Application is running"],
			steps: [
				{
					stepNumber: 1,
					action: "Open login page",
					expectedResult: "Page loads",
				},
				{
					stepNumber: 2,
					action: "Enter credentials",
					expectedResult: "Fields filled",
				},
			],
			expectedResult: "User logged in successfully",
			status: "Not Run",
			priority: "High",
			category: "Authentication",
		};

		expect(testCase.caseId).toBe("TC-001");
		expect(testCase.status).toBe("Not Run");
		expect(testCase.steps.length).toBe(2);
	});
});

describe("Pricing Types", () => {
	test("FALLBACK_PRICING contains expected models", () => {
		expect(FALLBACK_PRICING["claude-sonnet-4-5-20250929"]).toBeDefined();
		expect(FALLBACK_PRICING["claude-opus-4-5-20251101"]).toBeDefined();
		expect(FALLBACK_PRICING["claude-haiku-4-5-20251001"]).toBeDefined();
	});

	test("FALLBACK_PRICING has correct rate structure", () => {
		const rates = FALLBACK_PRICING["claude-sonnet-4-5-20250929"];

		expect(rates.inputRate).toBe(3.0);
		expect(rates.outputRate).toBe(15.0);
		expect(rates.cacheWriteRate).toBe(3.75);
		expect(rates.cacheReadRate).toBe(0.3);
	});

	test("CostBreakdown interface can be created", () => {
		const costs: CostBreakdown = {
			inputCost: 0.003,
			outputCost: 0.015,
			cacheCreationCost: 0.001,
			cacheReadCost: 0.0003,
			totalCost: 0.0193,
		};

		expect(costs.totalCost).toBeCloseTo(0.0193, 4);
	});

	test("SessionRecord interface can be created", () => {
		const record: SessionRecord = {
			sessionId: "session-123",
			timestamp: "2025-01-01T00:00:00.000Z",
			sessionType: "test_executor",
			model: "claude-sonnet-4-5-20250929",
			durationMs: 60000,
			numTurns: 5,
			tokens: {
				inputTokens: 1000,
				outputTokens: 500,
				cacheCreationTokens: 100,
				cacheReadTokens: 50,
				totalTokens: 1650,
			},
			costs: {
				inputCost: 0.003,
				outputCost: 0.0075,
				cacheCreationCost: 0.000375,
				cacheReadCost: 0.000015,
				totalCost: 0.01089,
			},
		};

		expect(record.sessionType).toBe("test_executor");
		expect(record.tokens.totalTokens).toBe(1650);
	});
});
