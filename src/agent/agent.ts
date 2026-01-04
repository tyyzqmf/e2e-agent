/**
 * Agent Session Logic
 * ====================
 *
 * Core agent interaction functions for running autonomous coding sessions.
 * Uses Claude Agent SDK directly without wrapper abstraction.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
import type { AgentOptions } from "./config.ts";
import {
	AUTO_CONTINUE_DELAY_MS,
	CONTEXT_WINDOW,
	DEFAULT_MODEL,
	ENABLE_1M_CONTEXT,
} from "./config.ts";
import { createSdkOptions } from "./sdk-utils.ts";
import {
	CostReportGenerator,
	getTestExecutorPrompt,
	getTestPlannerPrompt,
	ProgressTracker,
	printTestProgressSummary,
	printTestSessionHeader,
	setupProjectDirectory,
	TokenUsageTracker,
	updateHtmlReportCostStatistics,
} from "./services/index.ts";
import { PricingCalculator } from "./services/pricing.ts";
import {
	type SessionResult,
	SessionStatus,
	type UsageData,
} from "./types/index.ts";

// ====================================
// Utility Functions
// ====================================

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ====================================
// Context Usage Tracker
// ====================================

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
	if (!text) return 0;
	// Use a simple heuristic: ~4 characters per token for English text
	// This is a rough estimate; actual tokenization may vary
	return Math.ceil(text.length / 4);
}

/**
 * Real-time context usage tracker for displaying progress during tool calls
 */
class ContextUsageTracker {
	private inputTokens: number = 0;
	private outputTokens: number = 0;
	private turnCount: number = 0;
	private readonly contextWindow: number;

	constructor(contextWindow: number) {
		this.contextWindow = contextWindow;
	}

	/**
	 * Add estimated tokens from assistant output (text and tool calls)
	 */
	addOutputTokens(text: string): void {
		this.outputTokens += estimateTokens(text);
	}

	/**
	 * Add estimated tokens from tool result (input to next turn)
	 */
	addInputTokens(text: string): void {
		this.inputTokens += estimateTokens(text);
	}

	/**
	 * Increment turn count
	 */
	incrementTurn(): void {
		this.turnCount++;
	}

	/**
	 * Get current estimated context usage
	 */
	getUsage(): { tokens: number; percent: number; turns: number } {
		const totalTokens = this.inputTokens + this.outputTokens;
		const percent = (totalTokens / this.contextWindow) * 100;
		return {
			tokens: totalTokens,
			percent,
			turns: this.turnCount,
		};
	}

	/**
	 * Display current context usage
	 */
	displayUsage(): void {
		const usage = this.getUsage();
		const tokensK = (usage.tokens / 1000).toFixed(0);
		const windowK = (this.contextWindow / 1000).toFixed(0);
		console.log(
			`   [Context] ~${tokensK}K / ${windowK}K tokens (~${usage.percent.toFixed(1)}%) | Turn ${usage.turns}`,
		);
	}
}

/**
 * Format and print tool use information
 */
function formatToolUseOutput(
	toolName: string,
	thinkingTime: number,
	toolInput?: unknown,
	maxInputLen: number = 200,
): void {
	console.log(
		`\n[Tool: ${toolName}] (after ${thinkingTime.toFixed(1)}s thinking)`,
	);

	if (toolInput !== undefined) {
		const inputStr = JSON.stringify(toolInput);
		if (inputStr.length > maxInputLen) {
			console.log(`   Input: ${inputStr.slice(0, maxInputLen)}...`);
		} else {
			console.log(`   Input: ${inputStr}`);
		}
	}
}

/**
 * Format and print tool result information
 */
function formatToolResultOutput(
	resultContent: string,
	isError: boolean,
	executionTime?: number,
	maxLen: number = 500,
): void {
	const timeSuffix =
		executionTime !== undefined ? ` (took ${executionTime.toFixed(1)}s)` : "";

	if (resultContent.toLowerCase().includes("blocked")) {
		const truncated =
			resultContent.length > maxLen
				? `${resultContent.slice(0, maxLen)}...`
				: resultContent;
		console.log(`   [BLOCKED]${timeSuffix} ${truncated}`);
	} else if (isError) {
		const truncated =
			resultContent.length > maxLen
				? `${resultContent.slice(0, maxLen)}...`
				: resultContent;
		console.log(`   [Error]${timeSuffix} ${truncated}`);
	} else {
		console.log(`   [Done]${timeSuffix}`);
	}
}

// ====================================
// SDK Message Handlers
// ====================================

/**
 * Handle assistant message (text, thinking, and tool use blocks)
 */
function handleAssistantMessage(
	msg: SDKAssistantMessage,
	lastEventTime: { value: number },
	contextTracker?: ContextUsageTracker,
): { text: string; toolStartTime: number | null } {
	let text = "";
	let toolStartTime: number | null = null;

	const content = msg.message?.content;
	if (!Array.isArray(content)) return { text, toolStartTime };

	for (const block of content) {
		if (block.type === "thinking") {
		} else if (block.type === "text") {
			const textBlock = block as { type: "text"; text: string };
			text += textBlock.text;
			process.stdout.write(textBlock.text);
			// Track output tokens
			if (contextTracker) {
				contextTracker.addOutputTokens(textBlock.text);
			}
		} else if (block.type === "tool_use") {
			const toolBlock = block as {
				type: "tool_use";
				name: string;
				input: unknown;
			};
			const thinkingTime = (Date.now() - lastEventTime.value) / 1000;
			formatToolUseOutput(toolBlock.name, thinkingTime, toolBlock.input);
			toolStartTime = Date.now();
			// Track tool call as output tokens
			if (contextTracker) {
				contextTracker.addOutputTokens(JSON.stringify(toolBlock.input || {}));
			}
		}
	}

	return { text, toolStartTime };
}

/**
 * Handle user message (tool results)
 */
function handleUserMessage(
	msg: SDKUserMessage,
	toolStartTime: number | null,
	lastEventTime: { value: number },
	contextTracker?: ContextUsageTracker,
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

			// Track tool result tokens and display context usage
			if (contextTracker) {
				contextTracker.addInputTokens(contentStr);
				contextTracker.incrementTurn();
				contextTracker.displayUsage();
			}
		}
	}
}

/**
 * Handle compact boundary message (context compaction)
 */
function handleCompactBoundary(msg: SDKCompactBoundaryMessage): void {
	const metadata = msg.compact_metadata;
	console.log(`\n${"═".repeat(60)}`);
	console.log("[Context Compaction] Automatic compaction triggered");
	console.log("═".repeat(60));
	console.log(`  Trigger: ${metadata.trigger}`);
	console.log(
		`  Pre-compaction tokens: ${metadata.pre_tokens.toLocaleString()}`,
	);
	console.log(`${"═".repeat(60)}\n`);
}

// ====================================
// Agent Session
// ====================================

/**
 * Run a single agent session using Claude Agent SDK directly.
 *
 * @param sdkOptions - SDK options for the query
 * @param message - The prompt to send
 * @param abortController - Controller for cancelling the query
 * @returns Session result with status, response, and usage data
 */
async function runAgentSession(
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
					const contextWindow = ENABLE_1M_CONTEXT
						? CONTEXT_WINDOW.EXTENDED_1M
						: CONTEXT_WINDOW.DEFAULT;
					const contextUsagePercent = (contextUsage / contextWindow) * 100;

					console.log(
						`\n[Context Usage]: ${(contextUsage / 1000).toFixed(0)}K / ${(contextWindow / 1000).toFixed(0)}K tokens (${contextUsagePercent.toFixed(1)}%)`,
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

// ====================================
// Autonomous Testing Agent
// ====================================

/**
 * Run the autonomous testing agent loop.
 *
 * @param options - Agent options
 * @returns Exit code: 0 for success, 1 for all tests blocked, 2 for other failures
 */
export async function runAutonomousTestingAgent(
	options: AgentOptions,
): Promise<number> {
	const { projectDir, model = DEFAULT_MODEL, maxIterations = null } = options;

	console.log(`\n${"=".repeat(70)}`);
	console.log("  AUTONOMOUS TESTING AGENT (TypeScript)");
	console.log("=".repeat(70));
	console.log(`\nProject directory: ${projectDir}`);
	console.log(`Model: ${model}`);
	if (maxIterations) {
		console.log(`Max iterations: ${maxIterations}`);
	} else {
		console.log("Max iterations: Unlimited (will run until completion)");
	}
	console.log();

	// Create project directory
	if (!existsSync(projectDir)) {
		mkdirSync(projectDir, { recursive: true });
	}

	// Initialize token usage tracking
	const pricingCalculator = new PricingCalculator();
	const usageTracker = new TokenUsageTracker(projectDir, pricingCalculator);

	// Check if this is a fresh start or continuation
	const testCasesFile = join(projectDir, "test_cases.json");
	let isFirstRun = !existsSync(testCasesFile);

	if (isFirstRun) {
		console.log("Fresh start - will use test planner agent");
		console.log();
		console.log("=".repeat(70));
		console.log("  NOTE: First session takes 5-10 minutes!");
		console.log("  The agent is generating 50 detailed test cases.");
		console.log(
			"  This may appear to hang - it's working. Watch for [Tool: ...] output.",
		);
		console.log("=".repeat(70));
		console.log();
		setupProjectDirectory(projectDir);
	} else {
		console.log("Continuing existing testing project");
		await printTestProgressSummary(projectDir);
	}

	// Initialize progress tracker
	const progressTracker = new ProgressTracker(projectDir);

	// Session tracking for resume capability
	let currentSessionId: string | undefined;

	// Main loop
	let iteration = 0;
	let allTestsBlocked = false;

	while (true) {
		iteration++;

		// Check max iterations
		if (maxIterations && iteration > maxIterations) {
			console.log(`\nReached max iterations (${maxIterations})`);
			console.log("To continue, run the script again without --max-iterations");
			break;
		}

		// Print session header
		printTestSessionHeader(iteration, isFirstRun);

		// Create SDK options (with session resume support)
		const shouldResume = !isFirstRun && currentSessionId !== undefined;
		const { options: sdkOptions } = await createSdkOptions({
			projectDir,
			model,
			resumeSessionId: shouldResume ? currentSessionId : undefined,
		});

		// Choose prompt based on session type
		const currentSessionType = isFirstRun ? "test_planner" : "test_executor";
		let prompt: string;

		if (isFirstRun) {
			prompt = await getTestPlannerPrompt();
			isFirstRun = false;
		} else {
			prompt = await getTestExecutorPrompt();
		}

		// Create abort controller
		const abortController = new AbortController();

		// Run session
		const { result, sessionId } = await runAgentSession(
			sdkOptions,
			prompt,
			abortController,
		);

		const { status, usageData } = result;

		// Capture session ID only on success
		if (status === SessionStatus.CONTINUE && sessionId) {
			currentSessionId = sessionId;
			console.log(
				`[Session] Session ID captured for resume: ${currentSessionId.slice(0, 16)}...`,
			);
		} else {
			console.log(
				`[Session] Skipping session ID capture due to status: ${status}`,
			);
		}

		// Give processes time to terminate gracefully
		await sleep(500);

		// Record usage statistics if available
		if (usageData?.usage) {
			try {
				const sessionRecord = usageTracker.recordSession({
					sessionId: usageData.sessionId,
					sessionType: currentSessionType as "test_planner" | "test_executor",
					model,
					durationMs: usageData.durationMs,
					numTurns: usageData.numTurns,
					tokens: usageData.usage,
					sdkCostUsd: usageData.totalCostUsd,
				});
				usageTracker.displaySessionStats(sessionRecord);
			} catch (error) {
				console.log(`[Warning] Failed to record usage statistics: ${error}`);
			}
		} else {
			console.log("[Warning] No usage data available for this session");
		}

		// Handle status
		if (status === SessionStatus.CONTINUE) {
			console.log(
				`\nAgent will auto-continue in ${AUTO_CONTINUE_DELAY_MS / 1000}s...`,
			);
			await printTestProgressSummary(projectDir);

			// Check if all tests are completed
			const stats = await progressTracker.countTestCases();

			if (stats.notRun === 0 && stats.total > 0) {
				if (stats.blocked === stats.total) {
					allTestsBlocked = true;
					console.log(`\n${"=".repeat(70)}`);
					console.log("  ALL TESTS BLOCKED!");
					console.log("=".repeat(70));
					console.log(`\n  Total: ${stats.total}`);
					console.log(`  Blocked: ${stats.blocked}`);
					console.log("\n  Cannot proceed due to blocking issues.");
					console.log("=".repeat(70));
					break;
				}

				console.log(`\n${"=".repeat(70)}`);
				console.log("  ALL TESTS COMPLETED!");
				console.log("=".repeat(70));
				console.log(`\n  Total: ${stats.total}`);
				console.log(`  Passed: ${stats.passed}`);
				console.log(`  Failed: ${stats.failed}`);
				console.log(`  Blocked: ${stats.blocked}`);
				console.log("\n  All test cases have been executed.");
				console.log("=".repeat(70));
				break;
			}

			await sleep(AUTO_CONTINUE_DELAY_MS);
		} else if (status === SessionStatus.CONTEXT_OVERFLOW) {
			console.log("\n[Context Overflow Recovery] Starting fresh session");
			currentSessionId = undefined;
			await sleep(AUTO_CONTINUE_DELAY_MS);
		} else if (status === SessionStatus.ERROR) {
			console.log("\nSession encountered an error");
			console.log("Will retry with a fresh session...");
			currentSessionId = undefined;
			await sleep(AUTO_CONTINUE_DELAY_MS);
		}

		// Small delay between sessions
		if (maxIterations === null || iteration < maxIterations) {
			console.log("\nPreparing next session...\n");
			await sleep(1000);
		}
	}

	// Final summary
	console.log(`\n${"=".repeat(70)}`);
	console.log("  TESTING SESSION COMPLETE");
	console.log("=".repeat(70));
	console.log(`\nProject directory: ${projectDir}`);
	await printTestProgressSummary(projectDir);

	// Generate cost report
	try {
		const reportGenerator = new CostReportGenerator(usageTracker);
		const costReport = reportGenerator.generateMarkdownReport();

		const testReportsDir = join(projectDir, "test-reports");
		if (existsSync(testReportsDir)) {
			const { readdirSync, statSync, writeFileSync } = require("node:fs");
			const reportDirs = readdirSync(testReportsDir)
				.map((name: string) => join(testReportsDir, name))
				.filter((path: string) => statSync(path).isDirectory())
				.sort(
					(a: string, b: string) =>
						statSync(b).mtime.getTime() - statSync(a).mtime.getTime(),
				);

			if (reportDirs.length > 0) {
				const latestReportDir = reportDirs[0];
				const costReportPath = join(latestReportDir, "cost_statistics.md");
				writeFileSync(costReportPath, costReport, "utf-8");
				console.log(`\n[Cost Report] Saved to: ${costReportPath}`);
			} else {
				const costReportPath = join(projectDir, "cost_statistics.md");
				writeFileSync(costReportPath, costReport, "utf-8");
				console.log(`\n[Cost Report] Saved to: ${costReportPath}`);
			}
		} else {
			const costReportPath = join(projectDir, "cost_statistics.md");
			require("node:fs").writeFileSync(costReportPath, costReport, "utf-8");
			console.log(`\n[Cost Report] Saved to: ${costReportPath}`);
		}
	} catch (error) {
		console.log(`\n[Warning] Failed to generate cost report: ${error}`);
	}

	// Post-process HTML report
	try {
		await updateHtmlReportCostStatistics(projectDir);
	} catch (error) {
		console.log(
			`\n[Warning] Failed to update HTML report cost statistics: ${error}`,
		);
	}

	// Print instructions
	console.log(`\n${"-".repeat(70)}`);
	console.log("  TO VIEW TEST REPORTS:");
	console.log("-".repeat(70));
	console.log(`\n  cd ${projectDir}/test-reports`);
	console.log("  # Open the HTML report viewer in a browser");
	console.log("-".repeat(70));

	console.log("\nDone!");

	return allTestsBlocked ? 1 : 0;
}
