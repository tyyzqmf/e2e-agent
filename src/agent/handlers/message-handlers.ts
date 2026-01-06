/**
 * SDK Message Handlers
 * ====================
 *
 * Handlers for processing different types of SDK messages during agent sessions.
 */

import type {
	SDKAssistantMessage,
	SDKCompactBoundaryMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	formatToolResultOutput,
	formatToolUseOutput,
} from "../utils/formatting.ts";

/**
 * Handle assistant message (text, thinking, and tool use blocks)
 */
export function handleAssistantMessage(
	msg: SDKAssistantMessage,
	lastEventTime: { value: number },
): { text: string; toolStartTime: number | null } {
	let text = "";
	let toolStartTime: number | null = null;

	const content = msg.message?.content;
	if (!Array.isArray(content)) return { text, toolStartTime };

	for (const block of content) {
		if (block.type === "thinking") {
			// Thinking blocks contain Claude's reasoning (extended thinking)
			// We skip displaying these as they can be very long
		} else if (block.type === "text") {
			const textBlock = block as { type: "text"; text: string };
			text += textBlock.text;
			process.stdout.write(textBlock.text);
		} else if (block.type === "tool_use") {
			const toolBlock = block as {
				type: "tool_use";
				name: string;
				input: unknown;
			};
			const thinkingTime = (Date.now() - lastEventTime.value) / 1000;
			formatToolUseOutput(toolBlock.name, thinkingTime, toolBlock.input);
			toolStartTime = Date.now();
		}
	}

	return { text, toolStartTime };
}

/**
 * Handle user message (tool results)
 */
export function handleUserMessage(
	msg: SDKUserMessage,
	toolStartTime: number | null,
	lastEventTime: { value: number },
): void {
	const content = msg.message?.content;
	if (!Array.isArray(content)) return;

	for (const block of content) {
		if (block.type === "tool_result") {
			const resultBlock = block as {
				type: "tool_result";
				content?: string | Array<{ type: string; text?: string }>;
				is_error?: boolean;
			};

			// Extract content string
			let contentStr = "";
			if (typeof resultBlock.content === "string") {
				contentStr = resultBlock.content;
			} else if (Array.isArray(resultBlock.content)) {
				contentStr = resultBlock.content
					.filter((c) => c.type === "text" && c.text)
					.map((c) => c.text)
					.join("");
			}

			const isError = resultBlock.is_error ?? false;
			let executionTime: number | undefined;
			if (toolStartTime !== null) {
				executionTime = (Date.now() - toolStartTime) / 1000;
			}

			formatToolResultOutput(contentStr, isError, executionTime);
			lastEventTime.value = Date.now();
		}
	}
}

/**
 * Handle compact boundary message (context compaction)
 *
 * This is called when context compaction completes and provides
 * details about the compaction that was performed.
 */
export function handleCompactBoundary(msg: SDKCompactBoundaryMessage): void {
	const metadata = msg.compact_metadata;
	const preTokensK = (metadata.pre_tokens / 1000).toFixed(1);

	console.log(`\n${"═".repeat(60)}`);
	console.log("[Context Compaction] Compaction Complete");
	console.log("═".repeat(60));
	console.log(`  Trigger Type:         ${metadata.trigger === "auto" ? "Automatic (context limit reached)" : "Manual (/compact command)"}`);
	console.log(`  Pre-compaction:       ${preTokensK}K tokens (${metadata.pre_tokens.toLocaleString()} tokens)`);
	console.log(`  Session ID:           ${msg.session_id}`);
	console.log("─".repeat(60));
	console.log("  Note: Conversation history has been summarized to reduce context.");
	console.log("  The agent will continue with a fresh context window.");
	console.log(`${"═".repeat(60)}\n`);
}
