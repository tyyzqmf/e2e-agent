/**
 * Agent Session
 * =============
 *
 * Core session execution logic for running agent queries.
 */

import {
	type Query,
	query,
	type SDKAssistantMessage,
	type SDKCompactBoundaryMessage,
	type Options as SDKOptions,
	type SDKResultMessage,
	type SDKSystemMessage,
	type SDKToolProgressMessage,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { CONTEXT_WINDOW, ENABLE_1M_CONTEXT } from "./config.ts";
import {
	handleAssistantMessage,
	handleCompactBoundary,
	handleUserMessage,
} from "./handlers/index.ts";
import {
	type SessionResult,
	SessionStatus,
	type UsageData,
} from "./types/index.ts";
import { ContextUsageTracker } from "./utils/context-tracker.ts";

/**
 * Run a single agent session using Claude Agent SDK directly.
 *
 * @param sdkOptions - SDK options for the query
 * @param message - The prompt to send
 * @param abortController - Controller for cancelling the query
 * @returns Session result with status, response, and usage data
 */
export async function runAgentSession(
	sdkOptions: SDKOptions,
	message: string,
	abortController: AbortController,
): Promise<{ result: SessionResult; sessionId: string | undefined }> {
	console.log("Sending prompt to Claude Agent SDK...\n");

	// Create the SDK query
	const startTime = Date.now();
	const q: Query = query({
		prompt: message,
		options: {
			...sdkOptions,
			abortController,
		},
	});

	const queryTime = (Date.now() - startTime) / 1000;
	console.log(`[Query sent in ${queryTime.toFixed(1)}s]\n`);

	// Track state
	let responseText = "";
	const lastEventTime = { value: Date.now() };
	let toolStartTime: number | null = null;
	let usageData: UsageData | null = null;
	let sessionId: string | undefined;
	let errorOccurred = false;
	let errorMessage = "";

	// Create context usage tracker for real-time progress display
	const contextWindow = ENABLE_1M_CONTEXT
		? CONTEXT_WINDOW.EXTENDED_1M
		: CONTEXT_WINDOW.DEFAULT;
	const contextTracker = new ContextUsageTracker(contextWindow);

	try {
		for await (const msg of q) {
			const msgType = msg.type;

			// Handle system messages (init, compact_boundary, status)
			if (msgType === "system") {
				const sysMsg = msg as SDKSystemMessage | SDKCompactBoundaryMessage;

				if ("subtype" in sysMsg) {
					if (sysMsg.subtype === "init") {
						sessionId = sysMsg.session_id;
						console.log(`\n[Session] Session ID: ${sessionId}`);
					} else if (sysMsg.subtype === "compact_boundary") {
						handleCompactBoundary(sysMsg as SDKCompactBoundaryMessage);
					} else if (sysMsg.subtype === "status") {
						const statusMsg = sysMsg as { status: string | null };
						if (statusMsg.status === "compacting") {
							console.log("\n[Context Compaction] Compacting conversation...");
						}
					}
				}
			}

			// Handle assistant messages (text and tool use)
			else if (msgType === "assistant") {
				const assistantMsg = msg as SDKAssistantMessage;

				// Check for API errors (authentication_failed, billing_error, rate_limit, etc.)
				if (assistantMsg.error) {
					errorOccurred = true;
					const errorType = assistantMsg.error;
					errorMessage = `API Error [${errorType}]`;

					// Provide helpful context for specific error types
					if (errorType === "authentication_failed") {
						errorMessage += ": Check your API key or AWS credentials";
					} else if (errorType === "billing_error") {
						errorMessage += ": Check your billing/quota settings";
					} else if (errorType === "rate_limit") {
						errorMessage += ": Rate limit exceeded, consider adding delays";
					} else if (errorType === "invalid_request") {
						errorMessage += ": Invalid request parameters";
					}

					console.error(errorMessage);
					continue;
				}

				const result = handleAssistantMessage(
					assistantMsg,
					lastEventTime,
					contextTracker,
				);
				responseText += result.text;
				if (result.toolStartTime !== null) {
					toolStartTime = result.toolStartTime;
				}
			}

			// Handle user messages (tool results)
			else if (msgType === "user") {
				const userMsg = msg as SDKUserMessage;
				handleUserMessage(
					userMsg,
					toolStartTime,
					lastEventTime,
					contextTracker,
				);
				toolStartTime = null;
			}

			// Handle result message (final message with usage stats)
			else if (msgType === "result") {
				const resultMsg = msg as SDKResultMessage;
				if (msg.usage) {
					// Calculate context window usage
					// Total processed input = input_tokens (new/uncached) + cache_read_input_tokens (cached)
					const inputTokens = resultMsg.usage.input_tokens ?? 0;
					const cacheReadTokens = resultMsg.usage.cache_read_input_tokens ?? 0;
					const outputTokens = resultMsg.usage.output_tokens ?? 0;
					const totalProcessedInput = inputTokens + cacheReadTokens;
					const contextUsage = totalProcessedInput + outputTokens;

					// Get context window size
					const ctxWindow = ENABLE_1M_CONTEXT
						? CONTEXT_WINDOW.EXTENDED_1M
						: CONTEXT_WINDOW.DEFAULT;
					const contextUsagePercent = (contextUsage / ctxWindow) * 100;

					console.log(
						`\n[Context Usage]: ${(contextUsage / 1000).toFixed(0)}K / ${(ctxWindow / 1000).toFixed(0)}K tokens (${contextUsagePercent.toFixed(1)}%)`,
					);
				}

				// Check for errors in result
				if (resultMsg.subtype !== "success") {
					errorOccurred = true;
					const errors = "errors" in resultMsg ? resultMsg.errors : [];
					errorMessage = `Session ended with ${resultMsg.subtype}: ${errors.join(", ")}`;
					console.error(errorMessage);
				}

				usageData = {
					usage: {
						inputTokens: resultMsg.usage.input_tokens,
						outputTokens: resultMsg.usage.output_tokens,
						cacheCreationTokens: resultMsg.usage.cache_creation_input_tokens,
						cacheReadTokens: resultMsg.usage.cache_read_input_tokens,
					},
					totalCostUsd: resultMsg.total_cost_usd,
					durationMs: resultMsg.duration_ms,
					numTurns: resultMsg.num_turns,
					sessionId: resultMsg.session_id,
				};
			}

			// Handle tool progress messages
			else if (msgType === "tool_progress") {
				const progressMsg = msg as SDKToolProgressMessage;
				// Show progress for long-running tools (>5s)
				if (progressMsg.elapsed_time_seconds > 5) {
					console.log(
						`   [${progressMsg.tool_name}] Running... (${progressMsg.elapsed_time_seconds.toFixed(0)}s)`,
					);
				}
			}

			// Handle stream events (ignore for now)
			else if (msgType === "stream_event") {
				// Stream events can be used for real-time updates if needed
			}
		}
	} catch (error) {
		errorOccurred = true;
		errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`\nAPI Error: ${errorMessage}`);
	}

	console.log(`\n${"-".repeat(70)}\n`);

	// Determine session status based on errors
	if (errorOccurred) {
		// Check for context overflow
		if (
			errorMessage.includes("Input is too long") ||
			errorMessage.includes("CONTEXT_LENGTH_EXCEEDED") ||
			errorMessage.includes("context_length_exceeded") ||
			errorMessage.includes("maximum context length")
		) {
			console.error("\n[Context Overflow] Context length exceeded!");
			console.error(
				"Consider: 1) Triggering /compact, 2) Starting a fresh session",
			);
			return {
				result: {
					status: SessionStatus.CONTEXT_OVERFLOW,
					responseText: errorMessage,
					usageData,
				},
				sessionId,
			};
		}

		return {
			result: {
				status: SessionStatus.ERROR,
				responseText: errorMessage,
				usageData,
			},
			sessionId,
		};
	}

	return {
		result: {
			status: SessionStatus.CONTINUE,
			responseText,
			usageData,
		},
		sessionId,
	};
}
