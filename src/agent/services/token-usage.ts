/**
 * Token Usage Tracker
 * ====================
 *
 * Manages session-level and project-level token usage tracking.
 * Persists data to usage_statistics.json in the project directory.
 */

import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import type {
	SessionRecord,
	TokenUsage,
	UsageStatistics,
	UsageSummary,
} from "../types/index.ts";
import { PricingCalculator } from "./pricing.ts";

/**
 * Token Usage Tracker class
 *
 * Manages session-level and project-level token usage tracking.
 */
export class TokenUsageTracker {
	private pricingCalculator: PricingCalculator;
	private data: UsageStatistics;
	private statsFile: string;

	constructor(projectDir: string, pricingCalculator?: PricingCalculator) {
		this.projectDir = projectDir;
		this.pricingCalculator = pricingCalculator ?? new PricingCalculator();
		this.statsFile = join(projectDir, "usage_statistics.json");
		this.data = this.loadOrInitialize();
	}

	/**
	 * Record a completed session's usage data.
	 *
	 * @param params.sdkCostUsd - Optional cost from SDK (preferred over local calculation)
	 *                           SDK's total_cost_usd is more accurate as it uses Anthropic's
	 *                           official pricing. Local calculation is used as fallback.
	 */
	recordSession(params: {
		sessionId: string;
		sessionType: "test_planner" | "test_executor";
		model: string;
		durationMs: number;
		numTurns: number;
		tokens: TokenUsage;
		sdkCostUsd?: number | null;
	}): SessionRecord {
		// Use SDK cost if available, otherwise calculate locally (fallback)
		const useLocalCalculation =
			params.sdkCostUsd === undefined || params.sdkCostUsd === null;

		// Calculate costs locally (needed for breakdown even when using SDK total)
		const localCosts = this.pricingCalculator.calculateCost(
			params.tokens,
			params.model,
		);

		// Use SDK total cost if available, otherwise use local calculation
		const costs = useLocalCalculation
			? localCosts
			: {
					...localCosts,
					// Override total with SDK value (more accurate)
					totalCost: params.sdkCostUsd,
				};

		if (!useLocalCalculation) {
			console.log(
				`[Cost] Using SDK-provided cost: $${params.sdkCostUsd?.toFixed(4)}`,
			);
		}

		// Calculate context window usage (actual tokens processed)
		// Note: cache_creation_input_tokens is a SUBSET of input_tokens (tokens written to cache)
		//       so we should NOT add it again to avoid double-counting
		// Formula: Context = (input_tokens + cache_read_tokens) + output_tokens
		//          where (input_tokens + cache_read_tokens) = total processed input
		const totalTokens =
			(params.tokens.inputTokens ?? 0) +
			(params.tokens.outputTokens ?? 0) +
			(params.tokens.cacheReadTokens ?? 0);

		// Create session record
		const sessionRecord: SessionRecord = {
			sessionId: params.sessionId,
			timestamp: new Date().toISOString(),
			sessionType: params.sessionType,
			model: params.model,
			durationMs: params.durationMs,
			numTurns: params.numTurns,
			tokens: {
				inputTokens: params.tokens.inputTokens ?? 0,
				outputTokens: params.tokens.outputTokens ?? 0,
				cacheCreationTokens: params.tokens.cacheCreationTokens ?? 0,
				cacheReadTokens: params.tokens.cacheReadTokens ?? 0,
				totalTokens,
			},
			costs,
		};

		// Append to sessions list
		this.data.sessions.push(sessionRecord);

		// Update summary
		this.updateSummary();

		// Save to file
		this.saveToFile();

		return sessionRecord;
	}

	/**
	 * Get cumulative summary statistics.
	 */
	getSummary(): UsageSummary {
		return this.data.summary;
	}

	/**
	 * Get list of all recorded sessions.
	 */
	getSessionHistory(): SessionRecord[] {
		return this.data.sessions;
	}

	/**
	 * Display formatted session statistics to terminal.
	 */
	displaySessionStats(sessionData: SessionRecord): void {
		const { tokens, costs } = sessionData;
		const summary = this.getSummary();

		console.log(`\n${"=".repeat(70)}`);
		console.log("  SESSION STATISTICS");
		console.log("=".repeat(70));
		console.log(`\nSession Type: ${sessionData.sessionType}`);
		console.log(`Duration: ${(sessionData.durationMs / 1000).toFixed(1)}s`);
		console.log(`Turns: ${sessionData.numTurns}`);
		console.log(`\nToken Usage:`);
		console.log(
			`  Input:         ${tokens.inputTokens.toLocaleString().padStart(10)}  ($${costs.inputCost.toFixed(4)})`,
		);
		console.log(
			`  Output:        ${tokens.outputTokens.toLocaleString().padStart(10)}  ($${costs.outputCost.toFixed(4)})`,
		);
		console.log(
			`  Cache Write:   ${tokens.cacheCreationTokens.toLocaleString().padStart(10)}  ($${costs.cacheCreationCost.toFixed(4)})`,
		);
		console.log(
			`  Cache Read:    ${tokens.cacheReadTokens.toLocaleString().padStart(10)}  ($${costs.cacheReadCost.toFixed(4)})`,
		);
		console.log(`  ${"─".repeat(50)}`);
		console.log(
			`  Total:         ${tokens.totalTokens.toLocaleString().padStart(10)}  ($${costs.totalCost.toFixed(4)})`,
		);

		console.log(`\nProject Totals:`);
		console.log(`  Sessions:      ${summary.totalSessions}`);
		console.log(`  Total Tokens:  ${summary.totalTokens.toLocaleString()}`);
		console.log(`  Total Cost:    $${summary.totalCostUsd.toFixed(4)}`);
		console.log(
			`  Avg/Session:   $${(summary.totalCostUsd / summary.totalSessions).toFixed(4)}`,
		);
		console.log(`${"=".repeat(70)}\n`);
	}

	/**
	 * Persist statistics to usage_statistics.json.
	 */
	saveToFile(): void {
		try {
			const tempFile = `${this.statsFile}.tmp`;
			require("node:fs").writeFileSync(
				tempFile,
				JSON.stringify(this.data, null, 2),
				"utf-8",
			);
			renameSync(tempFile, this.statsFile);
		} catch (error) {
			console.error(`[Error] Failed to save usage statistics: ${error}`);
		}
	}

	/**
	 * Load existing statistics or create new structure.
	 */
	private loadOrInitialize(): UsageStatistics {
		if (existsSync(this.statsFile)) {
			try {
				const content = require("node:fs").readFileSync(
					this.statsFile,
					"utf-8",
				);
				return JSON.parse(content) as UsageStatistics;
			} catch (error) {
				console.warn(`[Warning] Could not load statistics: ${error}`);
				console.warn(`[Warning] Starting with fresh statistics`);
			}
		}

		// Initialize new structure
		return {
			sessions: [],
			summary: {
				totalSessions: 0,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				totalCacheCreationTokens: 0,
				totalCacheReadTokens: 0,
				totalTokens: 0,
				totalCostUsd: 0.0,
				lastUpdated: new Date().toISOString(),
			},
		};
	}

	/**
	 * Update cumulative summary from all sessions.
	 */
	private updateSummary(): void {
		const sessions = this.data.sessions;

		const totalInput = sessions.reduce(
			(sum, s) => sum + s.tokens.inputTokens,
			0,
		);
		const totalOutput = sessions.reduce(
			(sum, s) => sum + s.tokens.outputTokens,
			0,
		);
		const totalCacheCreation = sessions.reduce(
			(sum, s) => sum + s.tokens.cacheCreationTokens,
			0,
		);
		const totalCacheRead = sessions.reduce(
			(sum, s) => sum + s.tokens.cacheReadTokens,
			0,
		);
		const totalCost = sessions.reduce((sum, s) => sum + s.costs.totalCost, 0);

		this.data.summary = {
			totalSessions: sessions.length,
			totalInputTokens: totalInput,
			totalOutputTokens: totalOutput,
			totalCacheCreationTokens: totalCacheCreation,
			totalCacheReadTokens: totalCacheRead,
			// Context window usage = input + cache_read + output
			// (cache_creation is subset of input, not added to avoid double-counting)
			totalTokens: totalInput + totalOutput + totalCacheRead,
			totalCostUsd: Math.round(totalCost * 10000) / 10000,
			lastUpdated: new Date().toISOString(),
		};
	}
}

/**
 * Cost Report Generator
 *
 * Generates formatted cost reports in markdown format.
 */
export class CostReportGenerator {
	private usageTracker: TokenUsageTracker;

	constructor(usageTracker: TokenUsageTracker) {
		this.usageTracker = usageTracker;
	}

	/**
	 * Generate complete markdown cost report.
	 */
	generateMarkdownReport(): string {
		const summary = this.usageTracker.getSummary();
		const sessions = this.usageTracker.getSessionHistory();

		const report: string[] = [];
		report.push("# Cost Statistics Report\n");
		report.push(
			`**Generated:** ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC\n`,
		);
		report.push("\n---\n");

		// Executive Summary
		report.push("\n## Executive Summary\n");
		report.push("| Metric | Value |\n");
		report.push("|--------|-------|\n");
		report.push(`| Total Sessions | ${summary.totalSessions} |\n`);
		report.push(`| Total Tokens | ${summary.totalTokens.toLocaleString()} |\n`);
		report.push(`| Total Cost | $${summary.totalCostUsd.toFixed(4)} |\n`);
		if (summary.totalSessions > 0) {
			const avgCost = summary.totalCostUsd / summary.totalSessions;
			report.push(`| Average Cost per Session | $${avgCost.toFixed(4)} |\n`);
		}

		// Token Usage Breakdown
		report.push("\n---\n");
		report.push("\n## Token Usage Breakdown\n");
		report.push("| Token Type | Count | Percentage | Cost |\n");
		report.push("|------------|-------|------------|------|\n");

		const totalTokens = summary.totalTokens;
		if (totalTokens > 0) {
			const inputPct = (summary.totalInputTokens / totalTokens) * 100;
			const outputPct = (summary.totalOutputTokens / totalTokens) * 100;
			const cacheCreatePct =
				(summary.totalCacheCreationTokens / totalTokens) * 100;
			const cacheReadPct = (summary.totalCacheReadTokens / totalTokens) * 100;

			// Calculate individual costs from sessions
			const inputCost = sessions.reduce((sum, s) => sum + s.costs.inputCost, 0);
			const outputCost = sessions.reduce(
				(sum, s) => sum + s.costs.outputCost,
				0,
			);
			const cacheCreateCost = sessions.reduce(
				(sum, s) => sum + s.costs.cacheCreationCost,
				0,
			);
			const cacheReadCost = sessions.reduce(
				(sum, s) => sum + s.costs.cacheReadCost,
				0,
			);

			report.push(
				`| Input Tokens | ${summary.totalInputTokens.toLocaleString()} | ${inputPct.toFixed(1)}% | $${inputCost.toFixed(4)} |\n`,
			);
			report.push(
				`| Output Tokens | ${summary.totalOutputTokens.toLocaleString()} | ${outputPct.toFixed(1)}% | $${outputCost.toFixed(4)} |\n`,
			);
			report.push(
				`| Cache Creation | ${summary.totalCacheCreationTokens.toLocaleString()} | ${cacheCreatePct.toFixed(1)}% | $${cacheCreateCost.toFixed(4)} |\n`,
			);
			report.push(
				`| Cache Read | ${summary.totalCacheReadTokens.toLocaleString()} | ${cacheReadPct.toFixed(1)}% | $${cacheReadCost.toFixed(4)} |\n`,
			);
			report.push(
				`| **Total** | **${totalTokens.toLocaleString()}** | **100%** | **$${summary.totalCostUsd.toFixed(4)}** |\n`,
			);
		}

		// Session Details
		report.push("\n---\n");
		report.push("\n## Session Details\n");
		report.push("| Session | Type | Duration | Tokens | Cost |\n");
		report.push("|---------|------|----------|--------|------|\n");

		sessions.forEach((session, i) => {
			const duration = session.durationMs / 1000;
			const tokens = session.tokens.totalTokens;
			const cost = session.costs.totalCost;
			const sessionType = session.sessionType
				.replace("test_", "")
				.replace(/^\w/, (c) => c.toUpperCase());
			report.push(
				`| ${i + 1} | ${sessionType} | ${duration.toFixed(1)}s | ${tokens.toLocaleString()} | $${cost.toFixed(4)} |\n`,
			);
		});

		// Recommendations
		report.push("\n---\n");
		report.push("\n## Cost Optimization Recommendations\n");
		const recommendations = this.generateRecommendations(summary, sessions);
		for (const rec of recommendations) {
			report.push(`\n${rec}\n`);
		}

		report.push("\n---\n");
		report.push(
			"\n**Note:** Costs are estimates based on published pricing and may not reflect actual billing.\n",
		);

		return report.join("");
	}

	/**
	 * Generate cost optimization recommendations.
	 */
	private generateRecommendations(
		summary: UsageSummary,
		sessions: SessionRecord[],
	): string[] {
		const recommendations: string[] = [];

		// Cache efficiency
		const totalTokens = summary.totalTokens;
		const cacheRead = summary.totalCacheReadTokens;
		if (totalTokens > 0 && cacheRead > 0) {
			const cachePct = (cacheRead / totalTokens) * 100;
			// Calculate potential savings
			const inputRate = 3.0; // Approximate
			const readRate = 0.3;
			const savingsPerMtok = inputRate - readRate;
			const cacheSavings = (cacheRead / 1_000_000) * savingsPerMtok;
			recommendations.push(
				`**Prompt Caching Efficiency**: ${cachePct.toFixed(1)}% of tokens were cache reads, ` +
					`saving approximately $${cacheSavings.toFixed(4)}. Consider increasing prompt caching coverage for more savings.`,
			);
		}

		// Output token analysis
		if (totalTokens > 0) {
			const outputCost = sessions.reduce(
				(sum, s) => sum + s.costs.outputCost,
				0,
			);
			const totalCost = summary.totalCostUsd;
			if (totalCost > 0) {
				const outputCostPct = (outputCost / totalCost) * 100;
				if (outputCostPct > 70) {
					recommendations.push(
						`**Output Token Optimization**: Output tokens account for ${outputCostPct.toFixed(1)}% of costs. ` +
							`Review test reports for verbosity and consider more concise outputs.`,
					);
				}
			}
		}

		// Session efficiency
		if (sessions.length > 1) {
			const avgDuration =
				sessions.reduce((sum, s) => sum + s.durationMs, 0) /
				sessions.length /
				1000;
			recommendations.push(
				`**Session Duration**: Average session duration is ${avgDuration.toFixed(1)}s. ` +
					`Consider batching test cases to reduce session overhead.`,
			);
		}

		return recommendations;
	}
}
