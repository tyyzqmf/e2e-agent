/**
 * Token Usage Tracker
 * ====================
 *
 * Manages session-level and project-level token usage tracking.
 * Persists data to usage_statistics.json in the project directory.
 */

import { join } from "path";
import { existsSync, renameSync } from "fs";
import type {
  TokenUsage,
  SessionRecord,
  UsageSummary,
  UsageStatistics,
  CostBreakdown,
} from "../types/index.ts";
import { PricingCalculator } from "./pricing.ts";

/**
 * Token Usage Tracker class
 *
 * Manages session-level and project-level token usage tracking.
 */
export class TokenUsageTracker {
  private projectDir: string;
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
   */
  recordSession(params: {
    sessionId: string;
    sessionType: "test_planner" | "test_executor";
    model: string;
    durationMs: number;
    numTurns: number;
    tokens: TokenUsage;
  }): SessionRecord {
    // Calculate costs
    const costs = this.pricingCalculator.calculateCost(params.tokens, params.model);

    // Calculate total tokens
    const totalTokens =
      (params.tokens.inputTokens ?? 0) +
      (params.tokens.outputTokens ?? 0) +
      (params.tokens.cacheCreationTokens ?? 0) +
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

    console.log("\n" + "=".repeat(70));
    console.log("  SESSION STATISTICS");
    console.log("=".repeat(70));
    console.log(`\nSession Type: ${sessionData.sessionType}`);
    console.log(`Duration: ${(sessionData.durationMs / 1000).toFixed(1)}s`);
    console.log(`Turns: ${sessionData.numTurns}`);
    console.log(`\nToken Usage:`);
    console.log(
      `  Input:         ${tokens.inputTokens.toLocaleString().padStart(10)}  ($${costs.inputCost.toFixed(4)})`
    );
    console.log(
      `  Output:        ${tokens.outputTokens.toLocaleString().padStart(10)}  ($${costs.outputCost.toFixed(4)})`
    );
    console.log(
      `  Cache Write:   ${tokens.cacheCreationTokens.toLocaleString().padStart(10)}  ($${costs.cacheCreationCost.toFixed(4)})`
    );
    console.log(
      `  Cache Read:    ${tokens.cacheReadTokens.toLocaleString().padStart(10)}  ($${costs.cacheReadCost.toFixed(4)})`
    );
    console.log(`  ${"─".repeat(50)}`);
    console.log(
      `  Total:         ${tokens.totalTokens.toLocaleString().padStart(10)}  ($${costs.totalCost.toFixed(4)})`
    );

    console.log(`\nProject Totals:`);
    console.log(`  Sessions:      ${summary.totalSessions}`);
    console.log(`  Total Tokens:  ${summary.totalTokens.toLocaleString()}`);
    console.log(`  Total Cost:    $${summary.totalCostUsd.toFixed(4)}`);
    console.log(
      `  Avg/Session:   $${(summary.totalCostUsd / summary.totalSessions).toFixed(4)}`
    );
    console.log("=".repeat(70) + "\n");
  }

  /**
   * Persist statistics to usage_statistics.json.
   */
  saveToFile(): void {
    try {
      const tempFile = this.statsFile + ".tmp";
      require("fs").writeFileSync(
        tempFile,
        JSON.stringify(this.data, null, 2),
        "utf-8"
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
        const content = require("fs").readFileSync(this.statsFile, "utf-8");
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
      0
    );
    const totalOutput = sessions.reduce(
      (sum, s) => sum + s.tokens.outputTokens,
      0
    );
    const totalCacheCreation = sessions.reduce(
      (sum, s) => sum + s.tokens.cacheCreationTokens,
      0
    );
    const totalCacheRead = sessions.reduce(
      (sum, s) => sum + s.tokens.cacheReadTokens,
      0
    );
    const totalCost = sessions.reduce((sum, s) => sum + s.costs.totalCost, 0);

    this.data.summary = {
      totalSessions: sessions.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheCreationTokens: totalCacheCreation,
      totalCacheReadTokens: totalCacheRead,
      totalTokens:
        totalInput + totalOutput + totalCacheCreation + totalCacheRead,
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
      `**Generated:** ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC\n`
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
      const inputCost = sessions.reduce(
        (sum, s) => sum + s.costs.inputCost,
        0
      );
      const outputCost = sessions.reduce(
        (sum, s) => sum + s.costs.outputCost,
        0
      );
      const cacheCreateCost = sessions.reduce(
        (sum, s) => sum + s.costs.cacheCreationCost,
        0
      );
      const cacheReadCost = sessions.reduce(
        (sum, s) => sum + s.costs.cacheReadCost,
        0
      );

      report.push(
        `| Input Tokens | ${summary.totalInputTokens.toLocaleString()} | ${inputPct.toFixed(1)}% | $${inputCost.toFixed(4)} |\n`
      );
      report.push(
        `| Output Tokens | ${summary.totalOutputTokens.toLocaleString()} | ${outputPct.toFixed(1)}% | $${outputCost.toFixed(4)} |\n`
      );
      report.push(
        `| Cache Creation | ${summary.totalCacheCreationTokens.toLocaleString()} | ${cacheCreatePct.toFixed(1)}% | $${cacheCreateCost.toFixed(4)} |\n`
      );
      report.push(
        `| Cache Read | ${summary.totalCacheReadTokens.toLocaleString()} | ${cacheReadPct.toFixed(1)}% | $${cacheReadCost.toFixed(4)} |\n`
      );
      report.push(
        `| **Total** | **${totalTokens.toLocaleString()}** | **100%** | **$${summary.totalCostUsd.toFixed(4)}** |\n`
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
        `| ${i + 1} | ${sessionType} | ${duration.toFixed(1)}s | ${tokens.toLocaleString()} | $${cost.toFixed(4)} |\n`
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
      "\n**Note:** Costs are estimates based on published pricing and may not reflect actual billing.\n"
    );

    return report.join("");
  }

  /**
   * Generate cost optimization recommendations.
   */
  private generateRecommendations(
    summary: UsageSummary,
    sessions: SessionRecord[]
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
          `saving approximately $${cacheSavings.toFixed(4)}. Consider increasing prompt caching coverage for more savings.`
      );
    }

    // Output token analysis
    if (totalTokens > 0) {
      const outputCost = sessions.reduce(
        (sum, s) => sum + s.costs.outputCost,
        0
      );
      const totalCost = summary.totalCostUsd;
      if (totalCost > 0) {
        const outputCostPct = (outputCost / totalCost) * 100;
        if (outputCostPct > 70) {
          recommendations.push(
            `**Output Token Optimization**: Output tokens account for ${outputCostPct.toFixed(1)}% of costs. ` +
              `Review test reports for verbosity and consider more concise outputs.`
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
          `Consider batching test cases to reduce session overhead.`
      );
    }

    return recommendations;
  }
}

/**
 * Update HTML report with cost statistics.
 */
export async function updateHtmlReportCostStatistics(
  projectDir: string
): Promise<boolean> {
  const statsFile = join(projectDir, "usage_statistics.json");
  if (!existsSync(statsFile)) {
    console.log("[Cost Stats] No usage_statistics.json found, skipping HTML update");
    return false;
  }

  // Load statistics
  let summary: UsageSummary;
  let sessions: SessionRecord[];
  try {
    const content = require("fs").readFileSync(statsFile, "utf-8");
    const statsData = JSON.parse(content) as UsageStatistics;
    summary = statsData.summary;
    sessions = statsData.sessions;
  } catch (error) {
    console.log(`[Cost Stats] Failed to read usage statistics: ${error}`);
    return false;
  }

  // Find latest HTML report
  const testReportsDir = join(projectDir, "test-reports");
  if (!existsSync(testReportsDir)) {
    console.log("[Cost Stats] No test-reports directory found");
    return false;
  }

  const { readdirSync, statSync, readFileSync, writeFileSync } = require("fs");
  const reportDirs = readdirSync(testReportsDir)
    .map((name: string) => join(testReportsDir, name))
    .filter((path: string) => statSync(path).isDirectory())
    .sort(
      (a: string, b: string) =>
        statSync(b).mtime.getTime() - statSync(a).mtime.getTime()
    );

  if (reportDirs.length === 0) {
    console.log("[Cost Stats] No report directories found");
    return false;
  }

  const latestReportDir = reportDirs[0];
  const htmlReportPath = join(latestReportDir, "Test_Report_Viewer.html");

  if (!existsSync(htmlReportPath)) {
    console.log(`[Cost Stats] HTML report not found: ${htmlReportPath}`);
    return false;
  }

  // Read HTML content
  let htmlContent: string;
  try {
    htmlContent = readFileSync(htmlReportPath, "utf-8");
  } catch (error) {
    console.log(`[Cost Stats] Failed to read HTML report: ${error}`);
    return false;
  }

  // Prepare replacement values
  const totalCost = summary.totalCostUsd ?? 0;
  const totalTokens = summary.totalTokens ?? 0;
  const totalSessions = summary.totalSessions ?? 0;

  // Calculate duration from sessions
  const totalDurationMs = sessions.reduce(
    (sum, s) => sum + (s.durationMs ?? 0),
    0
  );
  const totalDurationMin = totalDurationMs / 1000 / 60;

  // Format values
  const costStr = `$${totalCost.toFixed(4)}`;
  const tokensStr = totalTokens.toLocaleString();
  const durationStr =
    totalDurationMin >= 1
      ? `~${totalDurationMin.toFixed(0)}min`
      : `~${(totalDurationMs / 1000).toFixed(0)}s`;
  const sessionsStr = String(totalSessions);

  // Replace placeholders
  const replacements: [RegExp, string][] = [
    [/\{\{TOTAL_COST\}\}/g, costStr],
    [/\{\{TOTAL_TOKENS\}\}/g, tokensStr],
    [/\{\{DURATION\}\}/g, durationStr],
    [/\{\{SESSIONS\}\}/g, sessionsStr],
  ];

  let updated = false;
  for (const [pattern, value] of replacements) {
    if (pattern.test(htmlContent)) {
      htmlContent = htmlContent.replace(pattern, value);
      updated = true;
    }
  }

  if (!updated) {
    console.log(
      "[Cost Stats] No cost placeholders found in HTML report"
    );
    return false;
  }

  // Write updated HTML
  try {
    writeFileSync(htmlReportPath, htmlContent, "utf-8");
    console.log(`[Cost Stats] Updated HTML report with cost statistics:`);
    console.log(`  - Total Cost: ${costStr}`);
    console.log(`  - Total Tokens: ${tokensStr}`);
    console.log(`  - Duration: ${durationStr}`);
    console.log(`  - Sessions: ${sessionsStr}`);
    return true;
  } catch (error) {
    console.log(`[Cost Stats] Failed to write updated HTML: ${error}`);
    return false;
  }
}
