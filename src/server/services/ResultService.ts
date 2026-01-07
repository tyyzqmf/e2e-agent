/**
 * E2E Agent Web Service - Result Service
 *
 * Handles test result retrieval, report access, and ZIP downloads.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { config } from "../config.ts";
import type { CostStatistics, TestCase } from "../types/index.ts";
import { logger } from "../utils/logger.ts";

/**
 * ResultService manages access to test results and reports
 */
export class ResultService {
	private dataDir: string;

	constructor(dataDir?: string) {
		this.dataDir = dataDir ?? config.DATA_DIR;
	}

	/**
	 * Get the path to the HTML report for a job
	 *
	 * @param jobId - Job ID
	 * @returns Path to HTML report or null if not found
	 */
	getReportHtmlPath(jobId: string): string | null {
		// Path structure: data/reports/{jobId}/generations/{jobId}/test-reports/{timestamp}/Test_Report_Viewer.html
		const reportBaseDir = join(
			this.dataDir,
			"reports",
			jobId,
			"generations",
			jobId,
			"test-reports",
		);

		if (!existsSync(reportBaseDir)) {
			// Try alternative path without generations subdirectory
			const altPath = join(this.dataDir, "reports", jobId, "test-reports");
			if (!existsSync(altPath)) {
				logger.debug(`Report directory not found: ${reportBaseDir}`);
				return null;
			}
			return this.findHtmlReport(altPath);
		}

		return this.findHtmlReport(reportBaseDir);
	}

	/**
	 * Find HTML report in a directory (handles timestamp subdirectories)
	 *
	 * @param baseDir - Base directory to search
	 * @returns Path to HTML report or null
	 */
	private findHtmlReport(baseDir: string): string | null {
		try {
			const entries = readdirSync(baseDir, { withFileTypes: true });

			// Sort directories by name descending (newest timestamp first)
			const dirs = entries
				.filter((e) => e.isDirectory())
				.map((e) => e.name)
				.sort()
				.reverse();

			// Check each timestamp directory for the report
			for (const dir of dirs) {
				const htmlPath = join(baseDir, dir, "Test_Report_Viewer.html");
				if (existsSync(htmlPath)) {
					return htmlPath;
				}
			}

			// Check for report directly in base directory
			const directPath = join(baseDir, "Test_Report_Viewer.html");
			if (existsSync(directPath)) {
				return directPath;
			}

			return null;
		} catch (error) {
			logger.error(`Error finding HTML report in ${baseDir}`, error);
			return null;
		}
	}

	/**
	 * Create a ZIP archive of the test report
	 *
	 * @param jobId - Job ID
	 * @returns Path to ZIP file or null if creation failed
	 */
	async createReportZip(jobId: string): Promise<string | null> {
		const reportDir = this.getReportDirectory(jobId);
		if (!reportDir) {
			logger.warn(`Report directory not found for job ${jobId}`);
			return null;
		}

		const zipPath = join(this.dataDir, "reports", jobId, `${jobId}_report.zip`);

		try {
			// Remove existing ZIP if present
			if (existsSync(zipPath)) {
				await Bun.file(zipPath).delete();
			}

			// Create ZIP using system zip command
			const proc: Subprocess = Bun.spawn(["zip", "-r", zipPath, "."], {
				cwd: reportDir,
				stdout: "ignore",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const stderrStream = proc.stderr;
				const stderr =
					stderrStream instanceof ReadableStream
						? await new Response(stderrStream).text()
						: "Unknown error";
				logger.error(`ZIP creation failed for job ${jobId}`, stderr);
				return null;
			}

			if (!existsSync(zipPath)) {
				logger.error(`ZIP file was not created for job ${jobId}`);
				return null;
			}

			logger.info(`Created ZIP report for job ${jobId}: ${zipPath}`);
			return zipPath;
		} catch (error) {
			logger.error(`Error creating ZIP for job ${jobId}`, error);
			return null;
		}
	}

	/**
	 * Get cost statistics for a job
	 *
	 * @param jobId - Job ID
	 * @returns Cost statistics or null if not found
	 */
	getCostStatistics(jobId: string): CostStatistics | null {
		// Check usage_statistics.json first (primary location)
		const usageStatsPaths = [
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"usage_statistics.json",
			),
			join(this.dataDir, "reports", jobId, "usage_statistics.json"),
		];

		for (const statsPath of usageStatsPaths) {
			if (existsSync(statsPath)) {
				try {
					const content = readFileSync(statsPath, "utf-8");
					const data = JSON.parse(content);

					// Map usage_statistics.json format to CostStatistics interface
					// Support both camelCase (from agent) and snake_case naming
					if (data.summary) {
						const s = data.summary;
						const inputTokens = s.total_input_tokens ?? s.totalInputTokens ?? 0;
						const outputTokens =
							s.total_output_tokens ?? s.totalOutputTokens ?? 0;
						const totalTokens = s.total_tokens ?? s.totalTokens ?? 0;
						const totalCost = s.total_cost_usd ?? s.totalCostUsd ?? 0;
						const sessions = s.total_sessions ?? s.totalSessions ?? 0;

						// Get cache tokens from summary
						const cacheCreationTokens =
							s.total_cache_creation_tokens ?? s.totalCacheCreationTokens ?? 0;
						const cacheReadTokens =
							s.total_cache_read_tokens ?? s.totalCacheReadTokens ?? 0;

						// Calculate costs from sessions if available
						interface SessionCosts {
							input_cost?: number;
							inputCost?: number;
							output_cost?: number;
							outputCost?: number;
							cache_creation_cost?: number;
							cacheCreationCost?: number;
							cache_read_cost?: number;
							cacheReadCost?: number;
						}

						const inputCost =
							data.sessions?.reduce(
								(sum: number, sess: { costs?: SessionCosts }) =>
									sum + (sess.costs?.input_cost ?? sess.costs?.inputCost ?? 0),
								0,
							) || 0;
						const outputCost =
							data.sessions?.reduce(
								(sum: number, sess: { costs?: SessionCosts }) =>
									sum +
									(sess.costs?.output_cost ?? sess.costs?.outputCost ?? 0),
								0,
							) || 0;
						const cacheCreationCost =
							data.sessions?.reduce(
								(sum: number, sess: { costs?: SessionCosts }) =>
									sum +
									(sess.costs?.cache_creation_cost ??
										sess.costs?.cacheCreationCost ??
										0),
								0,
							) || 0;
						const cacheReadCost =
							data.sessions?.reduce(
								(sum: number, sess: { costs?: SessionCosts }) =>
									sum +
									(sess.costs?.cache_read_cost ??
										sess.costs?.cacheReadCost ??
										0),
								0,
							) || 0;

						return {
							total_input_tokens: inputTokens,
							total_output_tokens: outputTokens,
							total_tokens: totalTokens,
							estimated_cost_usd: totalCost,
							sessions: sessions,
							// Cache tokens
							cache_creation_tokens: cacheCreationTokens,
							cache_read_tokens: cacheReadTokens,
							// Cache costs
							cache_creation_cost: cacheCreationCost,
							cache_read_cost: cacheReadCost,
							// Additional fields for frontend compatibility
							input_tokens: inputTokens,
							output_tokens: outputTokens,
							total_cost: totalCost,
							input_cost: inputCost,
							output_cost: outputCost,
						} as CostStatistics;
					}
				} catch (error) {
					logger.error(
						`Error reading usage statistics from ${statsPath}`,
						error,
					);
				}
			}
		}

		// Fallback: check cost_statistics.json (legacy format)
		const costStatsPaths = [
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"cost_statistics.json",
			),
			join(this.dataDir, "reports", jobId, "cost_statistics.json"),
		];

		for (const costPath of costStatsPaths) {
			if (existsSync(costPath)) {
				try {
					const content = readFileSync(costPath, "utf-8");
					return JSON.parse(content) as CostStatistics;
				} catch (error) {
					logger.error(`Error reading cost statistics from ${costPath}`, error);
				}
			}
		}

		return null;
	}

	/**
	 * Get test cases for a job
	 *
	 * @param jobId - Job ID
	 * @returns Array of test cases or null if not found
	 */
	getTestCases(jobId: string): TestCase[] | null {
		const paths = [
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"test_cases.json",
			),
			join(this.dataDir, "reports", jobId, "test_cases.json"),
		];

		for (const testCasesPath of paths) {
			if (existsSync(testCasesPath)) {
				try {
					const content = readFileSync(testCasesPath, "utf-8");
					const data = JSON.parse(content);
					return data.test_cases ?? data ?? [];
				} catch (error) {
					logger.error(`Error reading test cases from ${testCasesPath}`, error);
				}
			}
		}

		return null;
	}

	/**
	 * Get test summary statistics
	 *
	 * @param jobId - Job ID
	 * @returns Test summary or null
	 */
	getTestSummary(jobId: string): {
		total: number;
		passed: number;
		failed: number;
		blocked: number;
		not_run: number;
	} | null {
		const testCases = this.getTestCases(jobId);
		if (!testCases) return null;

		const summary = {
			total: testCases.length,
			passed: 0,
			failed: 0,
			blocked: 0,
			not_run: 0,
		};

		for (const tc of testCases) {
			switch (tc.status) {
				case "Pass":
					summary.passed++;
					break;
				case "Fail":
					summary.failed++;
					break;
				case "Blocked":
					summary.blocked++;
					break;
				default:
					summary.not_run++;
			}
		}

		return summary;
	}

	/**
	 * Check if report exists for a job
	 *
	 * @param jobId - Job ID
	 * @returns True if report exists
	 */
	hasReport(jobId: string): boolean {
		return this.getReportHtmlPath(jobId) !== null;
	}

	/**
	 * Get execution log file path for a job
	 *
	 * @param jobId - Job ID
	 * @returns Path to log file or null if not found
	 */
	getLogPath(jobId: string): string | null {
		const logPath = join(
			this.dataDir,
			"reports",
			jobId,
			"execution_stdout.log",
		);
		if (existsSync(logPath)) {
			return logPath;
		}
		return null;
	}

	/**
	 * Get execution log content for a job
	 *
	 * @param jobId - Job ID
	 * @param tail - Number of lines from the end (0 = all lines)
	 * @returns Log content or null if not found
	 */
	getLogContent(jobId: string, tail: number = 0): string | null {
		const logPath = this.getLogPath(jobId);
		if (!logPath) {
			return null;
		}

		try {
			const content = readFileSync(logPath, "utf-8");
			if (tail > 0) {
				const lines = content.split("\n");
				return lines.slice(-tail).join("\n");
			}
			return content;
		} catch (error) {
			logger.error(`Error reading log file for job ${jobId}`, error);
			return null;
		}
	}

	/**
	 * Check if log exists for a job
	 *
	 * @param jobId - Job ID
	 * @returns True if log exists
	 */
	hasLog(jobId: string): boolean {
		return this.getLogPath(jobId) !== null;
	}

	/**
	 * Get screenshot file path for a job
	 *
	 * @param jobId - Job ID
	 * @param filename - Screenshot filename
	 * @returns Path to screenshot file or null if not found
	 */
	getScreenshotPath(jobId: string, filename: string): string | null {
		// Prevent directory traversal attacks
		if (
			filename.includes("..") ||
			filename.includes("/") ||
			filename.includes("\\")
		) {
			logger.warn(`Invalid screenshot filename: ${filename}`);
			return null;
		}

		// Check all possible screenshot locations
		const possiblePaths = [
			// Direct in test-reports/screenshots/
			join(
				this.dataDir,
				"reports",
				jobId,
				"test-reports",
				"screenshots",
				filename,
			),
			// In generations subdirectory
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"test-reports",
				"screenshots",
				filename,
			),
		];

		// Also check timestamp subdirectories
		const testReportsPaths = [
			join(this.dataDir, "reports", jobId, "test-reports"),
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"test-reports",
			),
		];

		for (const testReportsPath of testReportsPaths) {
			if (existsSync(testReportsPath)) {
				try {
					const entries = readdirSync(testReportsPath, { withFileTypes: true });
					// Find timestamp directories (format: YYYYMMDD-HHMMSS)
					const timestampDirs = entries
						.filter((e) => e.isDirectory() && /^\d{8}-\d{6}$/.test(e.name))
						.map((e) => e.name)
						.sort()
						.reverse();

					for (const dir of timestampDirs) {
						possiblePaths.push(
							join(testReportsPath, dir, "screenshots", filename),
						);
					}
				} catch {
					// Ignore errors
				}
			}
		}

		// Check each possible path
		for (const path of possiblePaths) {
			if (existsSync(path)) {
				return path;
			}
		}

		logger.debug(`Screenshot not found for job ${jobId}: ${filename}`);
		return null;
	}

	/**
	 * Get the report directory for a job
	 *
	 * @param jobId - Job ID
	 * @returns Report directory path or null
	 */
	private getReportDirectory(jobId: string): string | null {
		const paths = [
			join(
				this.dataDir,
				"reports",
				jobId,
				"generations",
				jobId,
				"test-reports",
			),
			join(this.dataDir, "reports", jobId, "test-reports"),
		];

		for (const path of paths) {
			if (existsSync(path)) {
				// Find the latest timestamp directory (format: YYYYMMDD-HHMMSS)
				try {
					const entries = readdirSync(path, { withFileTypes: true });
					// Only match directories with timestamp format
					const timestampDirs = entries
						.filter((e) => e.isDirectory() && /^\d{8}-\d{6}$/.test(e.name))
						.map((e) => e.name)
						.sort()
						.reverse();

					if (timestampDirs.length > 0) {
						return join(path, timestampDirs[0]);
					}
					// No timestamp directory, return the test-reports directory itself
					return path;
				} catch {
					return path;
				}
			}
		}

		return null;
	}
}
