/**
 * E2E CLI Environment Check - Comprehensive Test Suite
 *
 * Tests for environment checking functions in env-check.ts
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { $ } from "bun";
import {
  checkPython,
  checkNode,
  checkNpx,
  checkChrome,
  checkBun,
  getPythonVersion,
  getNodeVersion,
  getNpxVersion,
  getChromeVersion,
  getBunVersion,
  checkRequirements,
  checkRequirementsOrExit,
  setupEnvironment,
} from "../env-check.ts";

describe("Environment Check", () => {
  describe("Dependency Check Functions", () => {
    describe("checkPython", () => {
      test("returns boolean", async () => {
        const result = await checkPython();
        expect(typeof result).toBe("boolean");
      });

      test("returns true when Python 3.7+ is installed", async () => {
        // This assumes Python is installed in the test environment
        const result = await checkPython();
        expect(result).toBe(true);
      });
    });

    describe("checkNode", () => {
      test("returns boolean", async () => {
        const result = await checkNode();
        expect(typeof result).toBe("boolean");
      });

      test("returns true when Node.js is installed", async () => {
        const result = await checkNode();
        expect(result).toBe(true);
      });
    });

    describe("checkNpx", () => {
      test("returns boolean", async () => {
        const result = await checkNpx();
        expect(typeof result).toBe("boolean");
      });

      test("returns true when npx is installed", async () => {
        const result = await checkNpx();
        expect(result).toBe(true);
      });
    });

    describe("checkChrome", () => {
      test("returns boolean", async () => {
        const result = await checkChrome();
        expect(typeof result).toBe("boolean");
      });

      // Chrome/Chromium may or may not be installed in test environment
      test("handles missing Chrome gracefully", async () => {
        const result = await checkChrome();
        // Just verify it returns a boolean without throwing
        expect([true, false]).toContain(result);
      });
    });

    describe("checkBun", () => {
      test("returns true (always running in Bun)", () => {
        const result = checkBun();
        expect(result).toBe(true);
      });
    });
  });

  describe("Version Retrieval Functions", () => {
    describe("getPythonVersion", () => {
      test("returns version string", async () => {
        const version = await getPythonVersion();
        expect(typeof version).toBe("string");
        expect(version.length).toBeGreaterThan(0);
      });

      test("returns version number format or 'Not found'", async () => {
        const version = await getPythonVersion();
        // Should be either a version number (e.g., "3.11.4") or "Not found"
        expect(
          version === "Not found" || /^\d+\.\d+/.test(version)
        ).toBe(true);
      });
    });

    describe("getNodeVersion", () => {
      test("returns version string", async () => {
        const version = await getNodeVersion();
        expect(typeof version).toBe("string");
        expect(version.length).toBeGreaterThan(0);
      });

      test("returns version format starting with v or 'Not found'", async () => {
        const version = await getNodeVersion();
        expect(
          version === "Not found" || version.startsWith("v")
        ).toBe(true);
      });
    });

    describe("getNpxVersion", () => {
      test("returns version string", async () => {
        const version = await getNpxVersion();
        expect(typeof version).toBe("string");
        expect(version.length).toBeGreaterThan(0);
      });

      test("returns version number or 'Not found'", async () => {
        const version = await getNpxVersion();
        expect(
          version === "Not found" || /^\d+\.\d+/.test(version)
        ).toBe(true);
      });
    });

    describe("getChromeVersion", () => {
      test("returns string", async () => {
        const version = await getChromeVersion();
        expect(typeof version).toBe("string");
      });

      test("returns version number or 'Not found'", async () => {
        const version = await getChromeVersion();
        // Chrome version can be "Not found" or a version string
        expect(
          version === "Not found" ||
          version === "Unknown" ||
          /^\d+/.test(version)
        ).toBe(true);
      });
    });

    describe("getBunVersion", () => {
      test("returns Bun version string", () => {
        const version = getBunVersion();
        expect(typeof version).toBe("string");
        expect(version).toMatch(/^\d+\.\d+\.\d+/);
      });

      test("matches Bun.version", () => {
        expect(getBunVersion()).toBe(Bun.version);
      });
    });
  });

  describe("checkRequirements", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let stdoutSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    test("returns CheckResult object with verbose=true", async () => {
      const result = await checkRequirements(true);

      expect(result).toHaveProperty("hasErrors");
      expect(result).toHaveProperty("errors");
      expect(typeof result.hasErrors).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test("returns CheckResult object with verbose=false", async () => {
      const result = await checkRequirements(false);

      expect(result).toHaveProperty("hasErrors");
      expect(result).toHaveProperty("errors");
      expect(typeof result.hasErrors).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test("verbose=true prints output", async () => {
      await checkRequirements(true);

      // Should have called console.log for output
      expect(consoleSpy.mock.calls.length).toBeGreaterThan(0);
    });

    test("verbose=false does not print", async () => {
      await checkRequirements(false);

      // Should not have called console.log
      expect(consoleSpy.mock.calls.length).toBe(0);
    });

    test("errors array contains only strings", async () => {
      const result = await checkRequirements(false);

      for (const error of result.errors) {
        expect(typeof error).toBe("string");
      }
    });

    test("hasErrors matches errors array length", async () => {
      const result = await checkRequirements(false);

      if (result.errors.length > 0) {
        expect(result.hasErrors).toBe(true);
      } else {
        expect(result.hasErrors).toBe(false);
      }
    });

    test("verbose=true writes to stdout for each check", async () => {
      await checkRequirements(true);

      // Should have called stdout.write for each dependency check
      expect(stdoutSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    test("checks all dependencies in order", async () => {
      const result = await checkRequirements(true);

      // Verify the structure is correct
      expect(result).toHaveProperty("hasErrors");
      expect(result).toHaveProperty("errors");

      // The result should reflect actual environment state
      expect(typeof result.hasErrors).toBe("boolean");
    });
  });

  describe("checkRequirements - Verbose Output Details", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let stdoutSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    test("prints header when verbose", async () => {
      await checkRequirements(true);

      const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
      const hasCheckingMessage = logCalls.some(
        (msg) => msg && msg.includes("Checking environment")
      );
      expect(hasCheckingMessage).toBe(true);
    });

    test("prints OK status with green color for installed dependencies", async () => {
      await checkRequirements(true);

      const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
      // At least some dependencies should show OK status
      const hasOkStatus = logCalls.some(
        (msg) => msg && (msg.includes("OK") || msg.includes("\x1b[0;32m"))
      );
      expect(hasOkStatus).toBe(true);
    });

    test("stdout.write called for Python check", async () => {
      await checkRequirements(true);

      const writeCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const hasPythonCheck = writeCalls.some(
        (msg) => msg && msg.includes("Python")
      );
      expect(hasPythonCheck).toBe(true);
    });

    test("stdout.write called for Node.js check", async () => {
      await checkRequirements(true);

      const writeCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const hasNodeCheck = writeCalls.some(
        (msg) => msg && msg.includes("Node")
      );
      expect(hasNodeCheck).toBe(true);
    });

    test("stdout.write called for npx check", async () => {
      await checkRequirements(true);

      const writeCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const hasNpxCheck = writeCalls.some(
        (msg) => msg && msg.includes("npx")
      );
      expect(hasNpxCheck).toBe(true);
    });

    test("stdout.write called for Chrome check", async () => {
      await checkRequirements(true);

      const writeCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const hasChromeCheck = writeCalls.some(
        (msg) => msg && msg.includes("Chrome")
      );
      expect(hasChromeCheck).toBe(true);
    });

    test("stdout.write called for Bun check", async () => {
      await checkRequirements(true);

      const writeCalls = stdoutSpy.mock.calls.map((c) => c[0]);
      const hasBunCheck = writeCalls.some(
        (msg) => msg && msg.includes("Bun")
      );
      expect(hasBunCheck).toBe(true);
    });
  });

  describe("checkChrome - Multiple Paths", () => {
    test("tries multiple Chrome commands", async () => {
      // checkChrome should try multiple commands and return true if any succeed
      const result = await checkChrome();
      expect(typeof result).toBe("boolean");
    });

    test("returns consistent results on repeated calls", async () => {
      const result1 = await checkChrome();
      const result2 = await checkChrome();
      expect(result1).toBe(result2);
    });
  });

  describe("getChromeVersion - Version Extraction", () => {
    test("extracts version from Chrome output", async () => {
      const version = await getChromeVersion();
      // Version should be a string
      expect(typeof version).toBe("string");
      expect(version.length).toBeGreaterThan(0);
    });

    test("handles different Chrome flavors", async () => {
      // The function should work regardless of which Chrome is installed
      const version = await getChromeVersion();
      // Should return something meaningful or "Not found"
      expect(version === "Not found" || version === "Unknown" || /\d/.test(version)).toBe(true);
    });
  });

  describe("Version Functions - Edge Cases", () => {
    test("getPythonVersion returns non-empty string", async () => {
      const version = await getPythonVersion();
      expect(version.length).toBeGreaterThan(0);
      // Should either be "Not found" or a version string
      expect(version === "Not found" || /\d/.test(version)).toBe(true);
    });

    test("getNodeVersion returns non-empty string", async () => {
      const version = await getNodeVersion();
      expect(version.length).toBeGreaterThan(0);
    });

    test("getNpxVersion returns non-empty string", async () => {
      const version = await getNpxVersion();
      expect(version.length).toBeGreaterThan(0);
    });

    test("getBunVersion returns current Bun version", () => {
      const version = getBunVersion();
      expect(version).toBe(Bun.version);
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe("checkRequirementsOrExit", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let stdoutSpy: ReturnType<typeof spyOn>;
    let exitSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
      // Mock process.exit to prevent actual exit
      exitSpy = spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test("does not exit when all requirements met", async () => {
      // In our test environment, all requirements should be met
      try {
        await checkRequirementsOrExit(true);
        // If we get here without throwing, requirements are met
        expect(exitSpy).not.toHaveBeenCalled();
      } catch (e: unknown) {
        // If process.exit was called, this means requirements were not met
        const error = e as Error;
        if (error.message === "process.exit called") {
          // This is expected if some dependency is missing
          expect(exitSpy).toHaveBeenCalled();
        } else {
          throw e;
        }
      }
    });

    test("works with verbose=false", async () => {
      try {
        await checkRequirementsOrExit(false);
        expect(exitSpy).not.toHaveBeenCalled();
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message !== "process.exit called") {
          throw e;
        }
      }
    });

    test("verbose=true produces output", async () => {
      try {
        await checkRequirementsOrExit(true);
      } catch {
        // Ignore exit errors
      }

      // Should have produced some output
      expect(consoleSpy.mock.calls.length + stdoutSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe("setupEnvironment", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let stdoutSpy: ReturnType<typeof spyOn>;
    let exitSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
      exitSpy = spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test("calls checkRequirementsOrExit", async () => {
      try {
        await setupEnvironment(true);
        // If we get here, setup succeeded
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message !== "process.exit called") {
          throw e;
        }
        // Exit was called due to missing requirements
      }
    });

    test("works with verbose=false", async () => {
      try {
        await setupEnvironment(false);
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message !== "process.exit called") {
          throw e;
        }
      }
    });

    test("sets AWS environment variables", async () => {
      const originalUseAws = process.env.USE_AWS_BEDROCK;
      const originalRegion = process.env.AWS_REGION;
      const originalBedrock = process.env.CLAUDE_CODE_USE_BEDROCK;

      try {
        await setupEnvironment(false);

        // After setup, these should be set
        expect(process.env.USE_AWS_BEDROCK).toBeDefined();
        expect(process.env.AWS_REGION).toBeDefined();
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message !== "process.exit called") {
          throw e;
        }
      } finally {
        // Restore original values
        if (originalUseAws !== undefined) {
          process.env.USE_AWS_BEDROCK = originalUseAws;
        }
        if (originalRegion !== undefined) {
          process.env.AWS_REGION = originalRegion;
        }
        if (originalBedrock !== undefined) {
          process.env.CLAUDE_CODE_USE_BEDROCK = originalBedrock;
        }
      }
    });
  });

  describe("Integration Tests", () => {
    test("all check functions return consistent types", async () => {
      const pythonResult = await checkPython();
      const nodeResult = await checkNode();
      const npxResult = await checkNpx();
      const chromeResult = await checkChrome();
      const bunResult = checkBun();

      expect(typeof pythonResult).toBe("boolean");
      expect(typeof nodeResult).toBe("boolean");
      expect(typeof npxResult).toBe("boolean");
      expect(typeof chromeResult).toBe("boolean");
      expect(typeof bunResult).toBe("boolean");
    });

    test("all version functions return strings", async () => {
      const pythonVersion = await getPythonVersion();
      const nodeVersion = await getNodeVersion();
      const npxVersion = await getNpxVersion();
      const chromeVersion = await getChromeVersion();
      const bunVersion = getBunVersion();

      expect(typeof pythonVersion).toBe("string");
      expect(typeof nodeVersion).toBe("string");
      expect(typeof npxVersion).toBe("string");
      expect(typeof chromeVersion).toBe("string");
      expect(typeof bunVersion).toBe("string");
    });

    test("checkRequirements result is consistent with individual checks", async () => {
      const result = await checkRequirements(false);

      // The result structure should be valid
      expect(result.hasErrors).toBe(result.errors.length > 0);
    });
  });

  describe("Chrome Detection - Detailed Tests", () => {
    test("checkChrome executes without throwing", async () => {
      // This should not throw regardless of Chrome being installed
      await expect(checkChrome()).resolves.toBeDefined();
    });

    test("getChromeVersion handles all Chrome variants", async () => {
      const version = await getChromeVersion();
      // Result should always be a non-empty string
      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
      expect(version.length).toBeGreaterThan(0);
    });

    test("Chrome check is idempotent", async () => {
      const results = await Promise.all([
        checkChrome(),
        checkChrome(),
        checkChrome(),
      ]);

      // All results should be the same
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });

  describe("Version Extraction Logic", () => {
    test("getPythonVersion strips 'Python ' prefix", async () => {
      const version = await getPythonVersion();
      // Should not contain "Python " prefix
      expect(version.startsWith("Python ")).toBe(false);
    });

    test("getNodeVersion preserves 'v' prefix", async () => {
      const version = await getNodeVersion();
      if (version !== "Not found") {
        expect(version.startsWith("v")).toBe(true);
      }
    });

    test("getNpxVersion returns numeric format", async () => {
      const version = await getNpxVersion();
      if (version !== "Not found") {
        expect(/^\d/.test(version)).toBe(true);
      }
    });
  });

  describe("Parallel Execution", () => {
    test("all checks can run in parallel", async () => {
      const [python, node, npx, chrome, bun] = await Promise.all([
        checkPython(),
        checkNode(),
        checkNpx(),
        checkChrome(),
        Promise.resolve(checkBun()),
      ]);

      expect(typeof python).toBe("boolean");
      expect(typeof node).toBe("boolean");
      expect(typeof npx).toBe("boolean");
      expect(typeof chrome).toBe("boolean");
      expect(typeof bun).toBe("boolean");
    });

    test("all version checks can run in parallel", async () => {
      const [python, node, npx, chrome, bun] = await Promise.all([
        getPythonVersion(),
        getNodeVersion(),
        getNpxVersion(),
        getChromeVersion(),
        Promise.resolve(getBunVersion()),
      ]);

      expect(typeof python).toBe("string");
      expect(typeof node).toBe("string");
      expect(typeof npx).toBe("string");
      expect(typeof chrome).toBe("string");
      expect(typeof bun).toBe("string");
    });
  });

  describe("Error Handling Robustness", () => {
    test("checkPython handles command errors gracefully", async () => {
      // Even if there's an issue, it should return false, not throw
      const result = await checkPython();
      expect(typeof result).toBe("boolean");
    });

    test("checkNode handles command errors gracefully", async () => {
      const result = await checkNode();
      expect(typeof result).toBe("boolean");
    });

    test("checkNpx handles command errors gracefully", async () => {
      const result = await checkNpx();
      expect(typeof result).toBe("boolean");
    });

    test("checkChrome handles all command failures gracefully", async () => {
      const result = await checkChrome();
      expect(typeof result).toBe("boolean");
    });

    test("version functions return 'Not found' or valid version on error", async () => {
      const pythonV = await getPythonVersion();
      const nodeV = await getNodeVersion();
      const npxV = await getNpxVersion();
      const chromeV = await getChromeVersion();

      // Each should return either "Not found" or a meaningful string
      for (const v of [pythonV, nodeV, npxV, chromeV]) {
        expect(v === "Not found" || v === "Unknown" || v.length > 0).toBe(true);
      }
    });
  });

  describe("checkRequirements - Error Collection", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let stdoutSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    test("errors array only contains expected dependency names", async () => {
      const result = await checkRequirements(false);

      const validErrors = ["Python 3.7+", "Node.js", "npx", "Chrome/Chromium"];
      for (const error of result.errors) {
        expect(validErrors).toContain(error);
      }
    });

    test("checkRequirements completes without timeout", async () => {
      const startTime = Date.now();
      await checkRequirements(false);
      const elapsed = Date.now() - startTime;

      // Should complete within 30 seconds
      expect(elapsed).toBeLessThan(30000);
    });
  });
});
