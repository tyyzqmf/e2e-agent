/**
 * Unit Tests for SDK Message Handlers
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SDKAssistantMessage,
	SDKCompactBoundaryMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	handleAssistantMessage,
	handleCompactBoundary,
	handleUserMessage,
} from "../handlers/message-handlers.ts";

describe("handleAssistantMessage", () => {
	let stdoutWrites: string[];
	let originalWrite: typeof process.stdout.write;
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		stdoutWrites = [];
		consoleLogs = [];
		originalWrite = process.stdout.write;
		originalLog = console.log;

		process.stdout.write = ((
			str: string | Uint8Array,
			..._args: unknown[]
		): boolean => {
			stdoutWrites.push(String(str));
			return true;
		}) as typeof process.stdout.write;

		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));
	});

	afterEach(() => {
		process.stdout.write = originalWrite;
		console.log = originalLog;
	});

	test("returns empty result for non-array content", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: undefined,
		} as unknown as SDKAssistantMessage;

		const result = handleAssistantMessage(msg, { value: Date.now() });

		expect(result.text).toBe("");
		expect(result.toolStartTime).toBeNull();
	});

	test("handles text blocks", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: {
				content: [{ type: "text", text: "Hello, world!" }],
			},
		} as unknown as SDKAssistantMessage;

		const result = handleAssistantMessage(msg, { value: Date.now() });

		expect(result.text).toBe("Hello, world!");
		expect(stdoutWrites).toContain("Hello, world!");
	});

	test("handles multiple text blocks", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: {
				content: [
					{ type: "text", text: "First " },
					{ type: "text", text: "Second" },
				],
			},
		} as unknown as SDKAssistantMessage;

		const result = handleAssistantMessage(msg, { value: Date.now() });

		expect(result.text).toBe("First Second");
	});

	test("handles tool_use blocks", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: {
				content: [
					{
						type: "tool_use",
						name: "Read",
						input: { path: "/test.txt" },
					},
				],
			},
		} as unknown as SDKAssistantMessage;

		const lastEventTime = { value: Date.now() - 1000 };
		const result = handleAssistantMessage(msg, lastEventTime);

		expect(result.toolStartTime).not.toBeNull();
		expect(consoleLogs.some((log) => log.includes("[Tool: Read]"))).toBe(true);
	});

	test("ignores thinking blocks", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: {
				content: [
					{ type: "thinking", text: "Internal reasoning..." },
					{ type: "text", text: "Visible output" },
				],
			},
		} as unknown as SDKAssistantMessage;

		const result = handleAssistantMessage(msg, { value: Date.now() });

		expect(result.text).toBe("Visible output");
		expect(stdoutWrites).not.toContain("Internal reasoning...");
	});

	test("handles mixed content blocks", () => {
		const msg: SDKAssistantMessage = {
			type: "assistant",
			message: {
				content: [
					{ type: "text", text: "Starting task..." },
					{ type: "tool_use", name: "Bash", input: { command: "ls" } },
				],
			},
		} as unknown as SDKAssistantMessage;

		const result = handleAssistantMessage(msg, { value: Date.now() - 500 });

		expect(result.text).toBe("Starting task...");
		expect(result.toolStartTime).not.toBeNull();
	});
});

describe("handleUserMessage", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));
	});

	afterEach(() => {
		console.log = originalLog;
	});

	test("returns early for non-array content", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: undefined,
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, null, lastEventTime);

		// Should not throw or log anything
		expect(consoleLogs.length).toBe(0);
	});

	test("handles string tool_result content", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: "File contents here",
						is_error: false,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, Date.now() - 500, lastEventTime);

		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
	});

	test("handles array tool_result content", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: [
							{ type: "text", text: "Part 1" },
							{ type: "text", text: " Part 2" },
						],
						is_error: false,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, Date.now() - 100, lastEventTime);

		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
	});

	test("handles error tool_result", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: "Command failed with exit code 1",
						is_error: true,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, Date.now() - 200, lastEventTime);

		expect(consoleLogs.some((log) => log.includes("[Error]"))).toBe(true);
	});

	test("updates lastEventTime after processing", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: "Success",
						is_error: false,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const initialTime = Date.now() - 1000;
		const lastEventTime = { value: initialTime };

		handleUserMessage(msg, null, lastEventTime);

		expect(lastEventTime.value).toBeGreaterThan(initialTime);
	});

	test("handles tool_result without execution time", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: "Result",
						is_error: false,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, null, lastEventTime);

		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("took"))).toBe(false);
	});

	test("filters non-text content in array", () => {
		const msg: SDKUserMessage = {
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						content: [
							{ type: "text", text: "Text content" },
							{ type: "image", data: "base64..." },
						],
						is_error: false,
					},
				],
			},
		} as unknown as SDKUserMessage;

		const lastEventTime = { value: Date.now() };
		handleUserMessage(msg, null, lastEventTime);

		// Should still succeed
		expect(consoleLogs.some((log) => log.includes("[Done]"))).toBe(true);
	});
});

describe("handleCompactBoundary", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) =>
			consoleLogs.push(args.map(String).join(" "));
	});

	afterEach(() => {
		console.log = originalLog;
	});

	test("formats auto-triggered compaction", () => {
		const msg: SDKCompactBoundaryMessage = {
			type: "system",
			subtype: "compact_boundary",
			session_id: "test-session-123",
			compact_metadata: {
				trigger: "auto",
				pre_tokens: 150000,
			},
		} as SDKCompactBoundaryMessage;

		handleCompactBoundary(msg);

		expect(consoleLogs.some((log) => log.includes("Compaction Complete"))).toBe(
			true,
		);
		expect(
			consoleLogs.some((log) =>
				log.includes("Automatic (context limit reached)"),
			),
		).toBe(true);
		expect(consoleLogs.some((log) => log.includes("150.0K tokens"))).toBe(true);
		expect(consoleLogs.some((log) => log.includes("test-session-123"))).toBe(
			true,
		);
	});

	test("formats manual-triggered compaction", () => {
		const msg: SDKCompactBoundaryMessage = {
			type: "system",
			subtype: "compact_boundary",
			session_id: "session-456",
			compact_metadata: {
				trigger: "manual",
				pre_tokens: 80000,
			},
		} as SDKCompactBoundaryMessage;

		handleCompactBoundary(msg);

		expect(
			consoleLogs.some((log) => log.includes("Manual (/compact command)")),
		).toBe(true);
		expect(consoleLogs.some((log) => log.includes("80.0K tokens"))).toBe(true);
	});

	test("displays helpful notes about compaction", () => {
		const msg: SDKCompactBoundaryMessage = {
			type: "system",
			subtype: "compact_boundary",
			session_id: "session-789",
			compact_metadata: {
				trigger: "auto",
				pre_tokens: 100000,
			},
		} as SDKCompactBoundaryMessage;

		handleCompactBoundary(msg);

		expect(
			consoleLogs.some((log) =>
				log.includes("Conversation history has been summarized"),
			),
		).toBe(true);
		expect(
			consoleLogs.some((log) => log.includes("fresh context window")),
		).toBe(true);
	});

	test("formats token count with locale separators", () => {
		const msg: SDKCompactBoundaryMessage = {
			type: "system",
			subtype: "compact_boundary",
			session_id: "session-abc",
			compact_metadata: {
				trigger: "auto",
				pre_tokens: 123456,
			},
		} as SDKCompactBoundaryMessage;

		handleCompactBoundary(msg);

		// Should include formatted token count
		expect(consoleLogs.some((log) => log.includes("123,456 tokens"))).toBe(
			true,
		);
	});
});
