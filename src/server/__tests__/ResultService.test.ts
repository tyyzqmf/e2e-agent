/**
 * ResultService Tests
 *
 * Tests for the ResultService using bun:test
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ResultService } from "../services/ResultService.ts";

describe("ResultService", () => {
  let tempDir: string;
  let resultService: ResultService;
  let originalLogLevel: string | undefined;

  beforeAll(() => {
    // Suppress expected error logs during tests
    originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "silent";

    // Create temporary directory
    tempDir = mkdtempSync(join(tmpdir(), "result-test-"));
    resultService = new ResultService(tempDir);
  });

  afterAll(() => {
    // Restore original log level
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getReportHtmlPath", () => {
    it("should return null when report does not exist", () => {
      const path = resultService.getReportHtmlPath("non-existent-job");
      expect(path).toBeNull();
    });

    it("should find report in standard path", () => {
      // Create test report structure
      const jobId = "test-job-1";
      const reportDir = join(
        tempDir,
        "reports",
        jobId,
        "generations",
        jobId,
        "test-reports",
        "20250101_120000"
      );
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "Test_Report_Viewer.html"), "<html></html>");

      const path = resultService.getReportHtmlPath(jobId);

      expect(path).not.toBeNull();
      expect(path).toContain("Test_Report_Viewer.html");
    });

    it("should find report in alternative path", () => {
      const jobId = "test-job-2";
      const reportDir = join(tempDir, "reports", jobId, "test-reports", "20250101_120000");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "Test_Report_Viewer.html"), "<html></html>");

      const path = resultService.getReportHtmlPath(jobId);

      expect(path).not.toBeNull();
    });
  });

  describe("getCostStatistics", () => {
    it("should return null when cost file does not exist", () => {
      const cost = resultService.getCostStatistics("non-existent-job");
      expect(cost).toBeNull();
    });

    it("should read cost statistics from file", () => {
      const jobId = "test-job-cost";
      const costDir = join(tempDir, "reports", jobId);
      mkdirSync(costDir, { recursive: true });

      const costData = {
        input_tokens: 1000,
        output_tokens: 500,
        total_cost: 0.05,
      };
      writeFileSync(join(costDir, "cost_statistics.json"), JSON.stringify(costData));

      const cost = resultService.getCostStatistics(jobId);

      expect(cost).not.toBeNull();
      expect(cost?.input_tokens).toBe(1000);
      expect(cost?.output_tokens).toBe(500);
    });
  });

  describe("getTestCases", () => {
    it("should return null when test cases file does not exist", () => {
      const testCases = resultService.getTestCases("non-existent-job");
      expect(testCases).toBeNull();
    });

    it("should read test cases from file", () => {
      const jobId = "test-job-cases";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesData = {
        test_cases: [
          { id: "TC-001", name: "Test 1", status: "Pass" },
          { id: "TC-002", name: "Test 2", status: "Fail" },
        ],
      };
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesData));

      const testCases = resultService.getTestCases(jobId);

      expect(testCases).not.toBeNull();
      expect(testCases?.length).toBe(2);
    });
  });

  describe("getTestSummary", () => {
    it("should return null when no test cases", () => {
      const summary = resultService.getTestSummary("non-existent-job");
      expect(summary).toBeNull();
    });

    it("should calculate summary correctly", () => {
      const jobId = "test-job-summary";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesData = {
        test_cases: [
          { id: "TC-001", status: "Pass" },
          { id: "TC-002", status: "Pass" },
          { id: "TC-003", status: "Fail" },
          { id: "TC-004", status: "Blocked" },
          { id: "TC-005", status: "Not Run" },
        ],
      };
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesData));

      const summary = resultService.getTestSummary(jobId);

      expect(summary).not.toBeNull();
      expect(summary?.total).toBe(5);
      expect(summary?.passed).toBe(2);
      expect(summary?.failed).toBe(1);
      expect(summary?.blocked).toBe(1);
      expect(summary?.not_run).toBe(1);
    });
  });

  describe("hasReport", () => {
    it("should return false when no report", () => {
      expect(resultService.hasReport("non-existent")).toBe(false);
    });

    it("should return true when report exists", () => {
      const jobId = "test-job-has-report";
      const reportDir = join(tempDir, "reports", jobId, "test-reports", "20250101");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "Test_Report_Viewer.html"), "<html></html>");

      expect(resultService.hasReport(jobId)).toBe(true);
    });
  });

  describe("getReportHtmlPath - Additional Cases", () => {
    it("should find report directly in base directory", () => {
      const jobId = "test-job-direct-report";
      const reportDir = join(tempDir, "reports", jobId, "test-reports");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "Test_Report_Viewer.html"), "<html>direct</html>");

      const path = resultService.getReportHtmlPath(jobId);
      expect(path).not.toBeNull();
      expect(path).toContain("Test_Report_Viewer.html");
    });

    it("should return latest timestamp directory when multiple exist", () => {
      const jobId = "test-job-multi-timestamp";
      const baseDir = join(tempDir, "reports", jobId, "test-reports");

      // Create multiple timestamp directories
      const dirs = ["20250101_100000", "20250102_100000", "20250103_100000"];
      for (const dir of dirs) {
        const reportDir = join(baseDir, dir);
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(join(reportDir, "Test_Report_Viewer.html"), `<html>${dir}</html>`);
      }

      const path = resultService.getReportHtmlPath(jobId);
      expect(path).not.toBeNull();
      // Should return the latest (20250103)
      expect(path).toContain("20250103_100000");
    });
  });

  describe("getCostStatistics - Usage Statistics Format", () => {
    it("should read usage_statistics.json format", () => {
      const jobId = "test-job-usage-stats";
      const statsDir = join(tempDir, "reports", jobId);
      mkdirSync(statsDir, { recursive: true });

      const usageData = {
        summary: {
          total_input_tokens: 5000,
          total_output_tokens: 2500,
          total_tokens: 7500,
          total_cost_usd: 0.15,
          total_sessions: 3,
        },
        sessions: [
          { costs: { input_cost: 0.05, output_cost: 0.025 } },
          { costs: { input_cost: 0.05, output_cost: 0.025 } },
        ],
      };
      writeFileSync(join(statsDir, "usage_statistics.json"), JSON.stringify(usageData));

      const cost = resultService.getCostStatistics(jobId);

      expect(cost).not.toBeNull();
      expect(cost?.total_input_tokens).toBe(5000);
      expect(cost?.total_output_tokens).toBe(2500);
      expect(cost?.total_tokens).toBe(7500);
      expect(cost?.estimated_cost_usd).toBe(0.15);
      expect(cost?.sessions).toBe(3);
    });

    it("should handle malformed JSON in cost file", () => {
      const jobId = "test-job-malformed-cost";
      const statsDir = join(tempDir, "reports", jobId);
      mkdirSync(statsDir, { recursive: true });

      writeFileSync(join(statsDir, "cost_statistics.json"), "not valid json");

      const cost = resultService.getCostStatistics(jobId);
      expect(cost).toBeNull();
    });
  });

  describe("getTestCases - Additional Cases", () => {
    it("should handle array format directly (without test_cases wrapper)", () => {
      const jobId = "test-job-array-format";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesArray = [
        { id: "TC-001", name: "Test 1", status: "Pass" },
        { id: "TC-002", name: "Test 2", status: "Fail" },
      ];
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesArray));

      const testCases = resultService.getTestCases(jobId);

      expect(testCases).not.toBeNull();
      expect(testCases?.length).toBe(2);
    });

    it("should read from generations subdirectory path", () => {
      const jobId = "test-job-generations-path";
      const casesDir = join(tempDir, "reports", jobId, "generations", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesData = {
        test_cases: [
          { id: "TC-001", name: "Test 1", status: "Pass" },
        ],
      };
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesData));

      const testCases = resultService.getTestCases(jobId);

      expect(testCases).not.toBeNull();
      expect(testCases?.length).toBe(1);
    });

    it("should handle malformed JSON in test cases file", () => {
      const jobId = "test-job-malformed-cases";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      writeFileSync(join(casesDir, "test_cases.json"), "invalid json {");

      const testCases = resultService.getTestCases(jobId);
      expect(testCases).toBeNull();
    });
  });

  describe("getTestSummary - Additional Status Cases", () => {
    it("should count Running status as not_run", () => {
      const jobId = "test-job-running-status";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesData = {
        test_cases: [
          { id: "TC-001", status: "Running" },
          { id: "TC-002", status: "Not Run" },
        ],
      };
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesData));

      const summary = resultService.getTestSummary(jobId);

      expect(summary).not.toBeNull();
      expect(summary?.not_run).toBe(2);
    });

    it("should handle unknown status as not_run", () => {
      const jobId = "test-job-unknown-status";
      const casesDir = join(tempDir, "reports", jobId);
      mkdirSync(casesDir, { recursive: true });

      const testCasesData = {
        test_cases: [
          { id: "TC-001", status: "SomeUnknownStatus" },
        ],
      };
      writeFileSync(join(casesDir, "test_cases.json"), JSON.stringify(testCasesData));

      const summary = resultService.getTestSummary(jobId);

      expect(summary).not.toBeNull();
      expect(summary?.not_run).toBe(1);
    });
  });

  describe("createReportZip", () => {
    it("should return null when report directory does not exist", async () => {
      const zipPath = await resultService.createReportZip("nonexistent-job-zip");
      expect(zipPath).toBeNull();
    });

    it("should create ZIP when report directory exists", async () => {
      const jobId = "test-job-zip-creation";
      const reportDir = join(tempDir, "reports", jobId, "test-reports", "20250101");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "Test_Report_Viewer.html"), "<html>Report</html>");
      writeFileSync(join(reportDir, "test-summary.md"), "# Summary");

      const zipPath = await resultService.createReportZip(jobId);

      // ZIP creation depends on system 'zip' command availability
      // If zip is available, it should return a path, otherwise null
      if (zipPath) {
        expect(zipPath).toContain(jobId);
        expect(zipPath).toEndWith(".zip");
      }
    });
  });
});
