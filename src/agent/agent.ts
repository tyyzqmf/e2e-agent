/**
 * Autonomous Testing Agent
 * ========================
 *
 * Main entry point for running the autonomous testing agent loop.
 * Uses Claude Agent SDK to execute test planning and test execution sessions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
 * Format duration from milliseconds to human-readable string (e.g., "6m 2s")
 */
export function formatDuration(totalMs: number): string {
	const totalSeconds = Math.floor(totalMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Format token count to human-readable string (e.g., "1.34M", "500K")
 */
export function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(2)}M`;
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(0)}K`;
	}
	return tokens.toString();
}

/**
 * Update HTML report with final cost statistics from usage_statistics.json.
 * This is called after the test_report session completes to ensure accurate costs.
 *
 * @param projectDir - Project directory path
 */
export async function updateHtmlReportCosts(projectDir: string): Promise<void> {
	try {
		// Read usage statistics
		const usageStatsFile = join(projectDir, "usage_statistics.json");
		if (!existsSync(usageStatsFile)) {
			console.log(
				"[Warning] usage_statistics.json not found, skipping HTML cost update",
			);
			return;
		}

		const usageStats = JSON.parse(readFileSync(usageStatsFile, "utf-8"));
		const summary = usageStats.summary;

		// Find the latest test-reports directory
		const testReportsDir = join(projectDir, "test-reports");
		if (!existsSync(testReportsDir)) {
			console.log(
				"[Warning] test-reports directory not found, skipping HTML cost update",
			);
			return;
		}

		// Look for Test_Report_Viewer.html directly in test-reports/ (flat structure per CLAUDE.md)
		const htmlReportFile = join(testReportsDir, "Test_Report_Viewer.html");

		if (!existsSync(htmlReportFile)) {
			console.log(
				"[Warning] Test_Report_Viewer.html not found, skipping cost update",
			);
			return;
		}

		// Read HTML content
		let htmlContent = readFileSync(htmlReportFile, "utf-8");

		// Calculate total duration from all sessions
		const totalDurationMs = usageStats.sessions.reduce(
			(sum: number, s: { durationMs: number }) => sum + s.durationMs,
			0,
		);

		// Prepare replacement values
		const totalCost = `$${summary.totalCostUsd.toFixed(2)}`;
		const totalTokens = formatTokenCount(summary.totalTokens);
		const totalDuration = formatDuration(totalDurationMs);
		const totalSessions = summary.totalSessions.toString();

		// Replace entire cost-grid section to handle any malformed AI-generated HTML
		// This is more robust than trying to match individual cost-value/cost-label pairs
		const costGridHtml = `<div class="cost-grid">
                    <div class="cost-item">
                        <div class="cost-value">${totalCost}</div>
                        <div class="cost-label">Total Cost</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-value">${totalTokens}</div>
                        <div class="cost-label">Total Tokens</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-value">${totalDuration}</div>
                        <div class="cost-label">Duration</div>
                    </div>
                    <div class="cost-item">
                        <div class="cost-value">${totalSessions}</div>
                        <div class="cost-label">Sessions</div>
                    </div>
                </div>`;

		// Match the entire cost-grid div and replace it
		// Structure: <div class="cost-grid">..items..</div></div></section>
		// (cost-grid closes, then cost-card closes, then section closes)
		htmlContent = htmlContent.replace(
			/<div class="cost-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
			`${costGridHtml}\n            </div>\n        </section>`,
		);

		// Write updated HTML
		writeFileSync(htmlReportFile, htmlContent, "utf-8");

		console.log(`[Report Update] Updated HTML report costs:`);
		console.log(`  - Total Cost: ${totalCost}`);
		console.log(`  - Total Tokens: ${totalTokens}`);
		console.log(`  - Duration: ${totalDuration}`);
		console.log(`  - Sessions: ${totalSessions}`);
	} catch (error) {
		console.log(`[Warning] Failed to update HTML report costs: ${error}`);
	}
}

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

	// Initialize token usage tracking with cache refresh
	const pricingCalculator = new PricingCalculator();
	// Pre-refresh pricing cache if stale (async fetch not possible in sync calculateCost)
	if (!pricingCalculator.isCacheValid()) {
		await pricingCalculator.updatePriceCache();
	}
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

			// Update HTML report with final cost statistics (including test_report session)
			await updateHtmlReportCosts(projectDir);
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
