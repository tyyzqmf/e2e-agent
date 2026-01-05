/**
 * Autonomous Testing Agent
 * ========================
 *
 * Main entry point for running the autonomous testing agent loop.
 * Uses Claude Agent SDK to execute test planning and test execution sessions.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSdkOptions } from "./client.ts";
import type { AgentOptions } from "./config.ts";
import { AUTO_CONTINUE_DELAY_MS, DEFAULT_MODEL } from "./config.ts";
import {
	getTestExecutorPrompt,
	getTestPlannerPrompt,
	getTestReportPrompt,
	ProgressTracker,
	printTestProgressSummary,
	printTestSessionHeader,
	setupProjectDirectory,
	TokenUsageTracker,
} from "./services/index.ts";
import { PricingCalculator } from "./services/pricing.ts";
import { runAgentSession } from "./session.ts";
import { SessionStatus } from "./types/index.ts";
import { sleep } from "./utils/index.ts";

/**
 * Run the autonomous testing agent loop.
 *
 * @param options - Agent options
 * @returns Exit code: 0 for success, 1 for all tests blocked, 2 for idle loop detected
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

	// Main loop
	let iteration = 0;
	let allTestsBlocked = false;
	let idleLoopDetected = false;
	let consecutiveNoProgress = 0;
	const MAX_NO_PROGRESS_SESSIONS = 3;
	let previousNotRunCount: number | null = null;

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

		// Create SDK options (session resume DISABLED to ensure fresh context each session)
		const { options: sdkOptions } = await createSdkOptions({
			projectDir,
			model,
			// resumeSessionId disabled: each session starts fresh to avoid inheriting
			// incorrect "mission accomplished" state from previous sessions
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
		const { result } = await runAgentSession(
			sdkOptions,
			prompt,
			abortController,
		);

		const { status, usageData } = result;

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

			// Detect idle sessions (no progress made)
			if (previousNotRunCount !== null) {
				if (stats.notRun === previousNotRunCount) {
					consecutiveNoProgress++;
					console.log(
						`\n[Warning] No progress made this session (${consecutiveNoProgress}/${MAX_NO_PROGRESS_SESSIONS} idle sessions)`,
					);

					if (consecutiveNoProgress >= MAX_NO_PROGRESS_SESSIONS) {
						idleLoopDetected = true;
						console.log(`\n${"=".repeat(70)}`);
						console.log("  IDLE LOOP DETECTED!");
						console.log("=".repeat(70));
						console.log(
							`\n  ${MAX_NO_PROGRESS_SESSIONS} consecutive sessions with no test progress.`,
						);
						console.log(`  Remaining "Not Run" tests: ${stats.notRun}`);
						console.log("\n  Possible causes:");
						console.log(
							'    - Agent may be stuck due to "MISSION ACCOMPLISHED" in claude-progress.txt',
						);
						console.log("    - Blocking defects preventing test execution");
						console.log(
							"    - Environment issues preventing browser automation",
						);
						console.log("\n  Recommended actions:");
						console.log(
							"    1. Review claude-progress.txt and remove premature completion claims",
						);
						console.log(
							"    2. Check test_cases.json for remaining Not Run tests",
						);
						console.log("    3. Restart the agent after addressing issues");
						console.log("=".repeat(70));
						break;
					}
				} else {
					// Progress was made, reset counter
					consecutiveNoProgress = 0;
				}
			}
			previousNotRunCount = stats.notRun;

			await sleep(AUTO_CONTINUE_DELAY_MS);
		} else if (status === SessionStatus.CONTEXT_OVERFLOW) {
			console.log("\n[Context Overflow Recovery] Starting fresh session");
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

	// Run report agent to generate final reports (only if tests were executed)
	const finalStats = await progressTracker.countTestCases();
	if (finalStats.total > 0 && finalStats.notRun === 0 && !idleLoopDetected) {
		console.log(`\n${"=".repeat(70)}`);
		console.log("  GENERATING FINAL REPORTS");
		console.log("=".repeat(70));

		try {
			// Create SDK options for report session
			const { options: reportSdkOptions } = await createSdkOptions({
				projectDir,
				model,
			});

			// Get report prompt
			const reportPrompt = await getTestReportPrompt();

			// Create abort controller
			const reportAbortController = new AbortController();

			// Run report session
			const { result: reportResult } = await runAgentSession(
				reportSdkOptions,
				reportPrompt,
				reportAbortController,
			);

			// Record usage statistics for report session
			if (reportResult.usageData?.usage) {
				try {
					const reportSessionRecord = usageTracker.recordSession({
						sessionId: reportResult.usageData.sessionId,
						sessionType: "test_report",
						model,
						durationMs: reportResult.usageData.durationMs,
						numTurns: reportResult.usageData.numTurns,
						tokens: reportResult.usageData.usage,
						sdkCostUsd: reportResult.usageData.totalCostUsd,
					});
					usageTracker.displaySessionStats(reportSessionRecord);
				} catch (error) {
					console.log(
						`[Warning] Failed to record report session usage: ${error}`,
					);
				}
			}

			console.log("\n[Report Generation] Complete");
		} catch (error) {
			console.log(`\n[Warning] Failed to generate reports: ${error}`);
		}
	}

	// Print instructions
	console.log(`\n${"-".repeat(70)}`);
	console.log("  TO VIEW TEST REPORTS:");
	console.log("-".repeat(70));
	console.log(`\n  cd ${projectDir}/test-reports`);
	console.log("  # Open the HTML report viewer in a browser");
	console.log("-".repeat(70));

	console.log("\nDone!");

	// Exit codes: 0 = success, 1 = all tests blocked, 2 = idle loop detected
	if (idleLoopDetected) {
		return 2;
	}
	return allTestsBlocked ? 1 : 0;
}
