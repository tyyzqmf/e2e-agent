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

// Enable verbose logging for debugging with E2E_DEBUG=1
const DEBUG_LOGGING = process.env.E2E_DEBUG === "1";

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

	try {
		for await (const msg of q) {
			const msgType = msg.type;

			// Handle system messages (init, compact_boundary, status)
			if (msgType === "system") {
				const sysMsg = msg as SDKSystemMessage | SDKCompactBoundaryMessage;

				// Debug logging for all system messages
				if (DEBUG_LOGGING) {
					const subtypeInfo = "subtype" in sysMsg ? sysMsg.subtype : "unknown";
					console.log(
						`\n[DEBUG] System message received: subtype=${subtypeInfo}`,
					);
					if (subtypeInfo === "compact_boundary") {
						console.log(
							`[DEBUG] compact_metadata: ${JSON.stringify((sysMsg as SDKCompactBoundaryMessage).compact_metadata)}`,
						);
					}
				}

				if ("subtype" in sysMsg) {
					if (sysMsg.subtype === "init") {
						sessionId = sysMsg.session_id;
						console.log(`\n[Session] Session ID: ${sessionId}`);
					} else if (sysMsg.subtype === "compact_boundary") {
						handleCompactBoundary(sysMsg as SDKCompactBoundaryMessage);
					} else if (sysMsg.subtype === "status") {
						const statusMsg = sysMsg as {
							status: string | null;
							uuid?: string;
							session_id?: string;
						};
						if (statusMsg.status === "compacting") {
							console.log(`\n${"─".repeat(60)}`);
							console.log(
								"[Context Compaction] Starting context compaction...",
							);
							console.log("─".repeat(60));
							console.log("  Status: Compacting conversation history");
							console.log(
								"  Note: This reduces context size to continue execution",
							);
							console.log("─".repeat(60));
						} else if (statusMsg.status !== null) {
							// Log other status messages for debugging
							console.log(`\n[Status] ${statusMsg.status}`);
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

					// Log full assistant message for debugging
					if (DEBUG_LOGGING) {
						console.error(
							`\n[DEBUG] Full error message: ${JSON.stringify(assistantMsg, null, 2)}`,
						);
					}

					// Log any additional error details from the message
					const msgAny = assistantMsg as Record<string, unknown>;
					if (msgAny.error_details) {
						console.error(
							`\nError details: ${JSON.stringify(msgAny.error_details, null, 2)}`,
						);
					}
					if (msgAny.error_message) {
						console.error(`Error message: ${msgAny.error_message}`);
					}
					continue;
				}

				const result = handleAssistantMessage(assistantMsg, lastEventTime);
				responseText += result.text;
				if (result.toolStartTime !== null) {
					toolStartTime = result.toolStartTime;
				}
			}

			// Handle user messages (tool results)
			else if (msgType === "user") {
				const userMsg = msg as SDKUserMessage;
				handleUserMessage(userMsg, toolStartTime, lastEventTime);
				toolStartTime = null;
			}

			// Handle result message (final message with usage stats)
			else if (msgType === "result") {
				const resultMsg = msg as SDKResultMessage;

				// Display context usage from modelUsage (accurate SDK data)
				if (resultMsg.modelUsage) {
					// Autocompact buffer is fixed at 45k tokens (system default)
					const AUTOCOMPACT_BUFFER = 45000;

					for (const [modelName, usage] of Object.entries(
						resultMsg.modelUsage,
					)) {
						// Actual usage = input tokens only (not output)
						const actualUsed =
							usage.inputTokens +
							usage.cacheCreationInputTokens +
							usage.cacheReadInputTokens;
						// Total occupied = actual usage + autocompact buffer
						const totalOccupied = actualUsed + AUTOCOMPACT_BUFFER;
						const ctxWindow = usage.contextWindow;
						const usagePercent =
							ctxWindow > 0 ? (totalOccupied / ctxWindow) * 100 : 0;

						console.log(
							`\n[Context] ${modelName}: ${(totalOccupied / 1000).toFixed(0)}K / ${(ctxWindow / 1000).toFixed(0)}K tokens (${usagePercent.toFixed(1)}%) [actual: ${(actualUsed / 1000).toFixed(0)}K + 45K buffer]`,
						);
						console.log(
							`[Tokens] input: ${usage.inputTokens}, output: ${(usage.outputTokens / 1000).toFixed(1)}K, cache_read: ${(usage.cacheReadInputTokens / 1000).toFixed(0)}K, cache_write: ${(usage.cacheCreationInputTokens / 1000).toFixed(0)}K`,
						);
					}
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

		// Log full stack trace for debugging
		if (error instanceof Error && error.stack) {
			console.error(`\nStack trace:\n${error.stack}`);
		}

		// Log additional error details if available (e.g., from SDK errors)
		if (error && typeof error === "object") {
			const errObj = error as Record<string, unknown>;
			if (errObj.cause) {
				console.error(`\nCaused by: ${JSON.stringify(errObj.cause, null, 2)}`);
			}
			if (errObj.code) {
				console.error(`Error code: ${errObj.code}`);
			}
			if (errObj.status) {
				console.error(`HTTP status: ${errObj.status}`);
			}
			if (errObj.response) {
				console.error(`Response: ${JSON.stringify(errObj.response, null, 2)}`);
			}
		}
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
