/**
 * Agent Session Logic
 * ====================
 *
 * Core agent interaction functions for running autonomous coding sessions.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type ClaudeClient, createClient } from "./client.ts";
import type { AgentOptions } from "./config.ts";
import { AUTO_CONTINUE_DELAY_MS, DEFAULT_MODEL } from "./config.ts";
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
	maxErrorLen: number = 500,
): void {
	const timeSuffix =
		executionTime !== undefined ? ` (took ${executionTime.toFixed(1)}s)` : "";

	// Check if command was blocked by security hook
	if (resultContent.toLowerCase().includes("blocked")) {
		console.log(`   [BLOCKED]${timeSuffix} ${resultContent}`);
	} else if (isError) {
		// Show errors (truncated)
		const errorStr = resultContent.slice(0, maxErrorLen);
		console.log(`   [Error]${timeSuffix} ${errorStr}`);
	} else {
		// Tool succeeded - just show brief confirmation
		console.log(`   [Done]${timeSuffix}`);
	}
}

// ====================================
// Agent Session
// ====================================

/**
 * Run a single agent session using Claude Code SDK.
 *
 * @param client - Claude SDK client
 * @param message - The prompt to send
 * @param projectDir - Project directory path
 * @returns Session result with status, response, and usage data
 */
async function runAgentSession(
	client: ClaudeClient,
	message: string,
	_projectDir: string,
): Promise<SessionResult> {
	console.log("Sending prompt to Claude Agent SDK...\n");

	try {
		// Send the query and measure time
		const startTime = Date.now();
		await client.query(message);
		const queryTime = (Date.now() - startTime) / 1000;
		console.log(`[Query sent in ${queryTime.toFixed(1)}s]\n`);

		// Collect response text and show tool use
		let responseText = "";
		let lastEventTime = Date.now();
		let toolStartTime: number | null = null;
		let usageData: UsageData | null = null;

		for await (const msg of client.receiveResponse()) {
			const msgType = msg.type;

			// Handle ResultMessage (contains usage information)
			if (msgType === "ResultMessage") {
				usageData = {
					usage: msg.usage
						? {
								inputTokens: msg.usage.input_tokens ?? 0,
								outputTokens: msg.usage.output_tokens ?? 0,
								cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
								cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
							}
						: null,
					totalCostUsd: msg.total_cost_usd ?? null,
					durationMs: msg.duration_ms ?? 0,
					numTurns: msg.num_turns ?? 0,
					sessionId: msg.session_id ?? "unknown",
				};
			}

			// Handle AssistantMessage (text and tool use)
			else if (msgType === "AssistantMessage" && msg.content) {
				for (const block of msg.content) {
					const blockType = block.type;

					if (blockType === "TextBlock" && block.text) {
						responseText += block.text;
						process.stdout.write(block.text);
					} else if (blockType === "ToolUseBlock" && block.name) {
						// Calculate thinking time and format output
						const thinkingTime = (Date.now() - lastEventTime) / 1000;
						formatToolUseOutput(block.name, thinkingTime, block.input);
						toolStartTime = Date.now();
					}
				}
			}

			// Handle UserMessage (tool results)
			else if (msgType === "UserMessage" && msg.content) {
				for (const block of msg.content) {
					if (block.type === "ToolResultBlock") {
						const resultContent = block.content ?? "";
						const isError = block.is_error ?? false;

						// Calculate tool execution time
						let executionTime: number | undefined;
						if (toolStartTime !== null) {
							executionTime = (Date.now() - toolStartTime) / 1000;
						}

						formatToolResultOutput(resultContent, isError, executionTime);

						// Update last event time for next thinking time calculation
						lastEventTime = Date.now();
						toolStartTime = null;
					}
				}
			}
		}

		console.log(`\n${"-".repeat(70)}\n`);
		return {
			status: SessionStatus.CONTINUE,
			responseText,
			usageData,
		};
	} catch (error) {
		console.error(`Error during agent session: ${error}`);
		return {
			status: SessionStatus.ERROR,
			responseText: String(error),
			usageData: null,
		};
	}
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
		// Setup project directory with required files
		setupProjectDirectory(projectDir);
	} else {
		console.log("Continuing existing testing project");
		await printTestProgressSummary(projectDir);
	}

	// Initialize progress tracker
	const progressTracker = new ProgressTracker(projectDir);

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

		// Create client (fresh context)
		const client = await createClient({
			projectDir,
			model,
		});

		// Choose prompt based on session type
		const currentSessionType = isFirstRun ? "test_planner" : "test_executor";
		let prompt: string;

		if (isFirstRun) {
			prompt = await getTestPlannerPrompt();
			isFirstRun = false; // Only use test planner once
		} else {
			prompt = await getTestExecutorPrompt();
		}

		// Run session
		const { status, responseText, usageData } = await runAgentSession(
			client,
			prompt,
			projectDir,
		);

		// Cleanup client
		try {
			await client.cleanup();
			console.log("[Cleanup] Client resources released");
		} catch (error) {
			console.log(`[Cleanup] Warning: ${error}`);
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
				// Check if all tests are blocked (critical blocker scenario)
				if (stats.blocked === stats.total) {
					allTestsBlocked = true;
					console.log(`\n${"=".repeat(70)}`);
					console.log("  ALL TESTS BLOCKED!");
					console.log("=".repeat(70));
					console.log(`\n  Total: ${stats.total}`);
					console.log(`  Blocked: ${stats.blocked}`);
					console.log("\n  Cannot proceed due to blocking issues.");
					console.log(
						"  All test cases are blocked by infrastructure or dependencies.",
					);
					console.log(
						"  Review defect reports and resolve blockers before retrying.",
					);
					console.log("=".repeat(70));
					break;
				}

				// Normal completion: at least some tests passed or failed
				console.log(`\n${"=".repeat(70)}`);
				console.log("  ALL TESTS COMPLETED!");
				console.log("=".repeat(70));
				console.log(`\n  Total: ${stats.total}`);
				console.log(`  Passed: ${stats.passed}`);
				console.log(`  Failed: ${stats.failed}`);
				console.log(`  Blocked: ${stats.blocked}`);
				console.log("\n  All test cases have been executed.");
				console.log("  Final reports should have been generated by the agent.");
				console.log("=".repeat(70));
				break;
			}

			await sleep(AUTO_CONTINUE_DELAY_MS);
		} else if (status === SessionStatus.ERROR) {
			console.log("\nSession encountered an error");
			console.log("Will retry with a fresh session...");
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

		// Find latest test-reports directory
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
				// No test reports yet, save to project root
				const costReportPath = join(projectDir, "cost_statistics.md");
				writeFileSync(costReportPath, costReport, "utf-8");
				console.log(`\n[Cost Report] Saved to: ${costReportPath}`);
			}
		} else {
			// No test-reports directory, save to project root
			const costReportPath = join(projectDir, "cost_statistics.md");
			require("node:fs").writeFileSync(costReportPath, costReport, "utf-8");
			console.log(`\n[Cost Report] Saved to: ${costReportPath}`);
		}
	} catch (error) {
		console.log(`\n[Warning] Failed to generate cost report: ${error}`);
	}

	// Post-process HTML report to update cost statistics
	try {
		await updateHtmlReportCostStatistics(projectDir);
	} catch (error) {
		console.log(
			`\n[Warning] Failed to update HTML report cost statistics: ${error}`,
		);
	}

	// Print instructions for viewing test reports
	console.log(`\n${"-".repeat(70)}`);
	console.log("  TO VIEW TEST REPORTS:");
	console.log("-".repeat(70));
	console.log(`\n  cd ${projectDir}/test-reports`);
	console.log("  # Open the HTML report viewer in a browser");
	console.log(
		"  # Or browse the markdown reports in test-case-reports/ and defect-reports/",
	);
	console.log("  # View cost statistics in cost_statistics.md");
	console.log("-".repeat(70));

	console.log("\nDone!");

	// Return appropriate exit code
	if (allTestsBlocked) {
		return 1; // All tests blocked
	}
	return 0; // Success
}
