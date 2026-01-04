/**
 * Autonomous Testing Agent
 * ========================
 *
 * Main entry point for running the autonomous testing agent loop.
 * Uses Claude Agent SDK to execute test planning and test execution sessions.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AgentOptions } from "./config.ts";
import { AUTO_CONTINUE_DELAY_MS, DEFAULT_MODEL } from "./config.ts";
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
import { runAgentSession } from "./session.ts";
import { SessionStatus } from "./types/index.ts";
import { sleep } from "./utils/index.ts";

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
			writeFileSync(costReportPath, costReport, "utf-8");
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
