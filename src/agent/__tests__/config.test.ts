/**
 * Unit Tests for Agent Configuration
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL,
  DEFAULT_PROJECT_DIR,
  GENERATIONS_DIR,
  SETTINGS_FILENAME,
  BEDROCK_ENV_VALUES,
  MAX_TURNS,
  AUTO_CONTINUE_DELAY_MS,
  DEFAULT_SYSTEM_PROMPT,
  AGENT_PATHS,
  isBedrockEnabled,
  normalizeProjectPath,
} from "../config.ts";

describe("Agent Configuration Constants", () => {
  test("DEFAULT_MODEL is defined", () => {
    expect(DEFAULT_MODEL).toBeDefined();
    expect(DEFAULT_MODEL).toContain("claude");
  });

  test("DEFAULT_PROJECT_DIR is defined", () => {
    expect(DEFAULT_PROJECT_DIR).toBe("autonomous_test_project");
  });

  test("GENERATIONS_DIR is defined", () => {
    expect(GENERATIONS_DIR).toBe("generations");
  });

  test("SETTINGS_FILENAME is defined", () => {
    expect(SETTINGS_FILENAME).toBe(".claude_settings.json");
  });

  test("BEDROCK_ENV_VALUES contains expected values", () => {
    expect(BEDROCK_ENV_VALUES).toContain("true");
    expect(BEDROCK_ENV_VALUES).toContain("1");
    expect(BEDROCK_ENV_VALUES).toContain("yes");
  });

  test("MAX_TURNS is a reasonable number", () => {
    expect(MAX_TURNS).toBeGreaterThan(0);
    expect(MAX_TURNS).toBeLessThanOrEqual(200);
  });

  test("AUTO_CONTINUE_DELAY_MS is defined", () => {
    expect(AUTO_CONTINUE_DELAY_MS).toBeGreaterThan(0);
    expect(AUTO_CONTINUE_DELAY_MS).toBe(3000);
  });

  test("DEFAULT_SYSTEM_PROMPT is defined", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_SYSTEM_PROMPT).toContain("developer");
  });

  test("AGENT_PATHS contains required paths", () => {
    expect(AGENT_PATHS.moduleDir).toBeDefined();
    expect(AGENT_PATHS.promptsDir).toBeDefined();
    expect(AGENT_PATHS.templatesDir).toBeDefined();
    expect(AGENT_PATHS.utilsDir).toBeDefined();
    expect(AGENT_PATHS.pluginsDir).toBeDefined();
    expect(AGENT_PATHS.projectRoot).toBeDefined();
  });

  test("AGENT_PATHS paths are consistent", () => {
    expect(AGENT_PATHS.promptsDir).toContain(AGENT_PATHS.moduleDir);
    expect(AGENT_PATHS.templatesDir).toContain(AGENT_PATHS.moduleDir);
    expect(AGENT_PATHS.utilsDir).toContain(AGENT_PATHS.moduleDir);
    expect(AGENT_PATHS.pluginsDir).toContain(AGENT_PATHS.moduleDir);
  });
});

describe("isBedrockEnabled", () => {
  test("returns false for undefined", () => {
    expect(isBedrockEnabled(undefined)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isBedrockEnabled("")).toBe(false);
  });

  test("returns true for 'true'", () => {
    expect(isBedrockEnabled("true")).toBe(true);
    expect(isBedrockEnabled("TRUE")).toBe(true);
    expect(isBedrockEnabled("True")).toBe(true);
  });

  test("returns true for '1'", () => {
    expect(isBedrockEnabled("1")).toBe(true);
  });

  test("returns true for 'yes'", () => {
    expect(isBedrockEnabled("yes")).toBe(true);
    expect(isBedrockEnabled("YES")).toBe(true);
    expect(isBedrockEnabled("Yes")).toBe(true);
  });

  test("returns false for 'false'", () => {
    expect(isBedrockEnabled("false")).toBe(false);
  });

  test("returns false for '0'", () => {
    expect(isBedrockEnabled("0")).toBe(false);
  });

  test("returns false for 'no'", () => {
    expect(isBedrockEnabled("no")).toBe(false);
  });

  test("returns false for random strings", () => {
    expect(isBedrockEnabled("random")).toBe(false);
    expect(isBedrockEnabled("enabled")).toBe(false);
    expect(isBedrockEnabled("on")).toBe(false);
  });
});

describe("normalizeProjectPath", () => {
  test("preserves absolute paths", () => {
    expect(normalizeProjectPath("/absolute/path")).toBe("/absolute/path");
    expect(normalizeProjectPath("/home/user/project")).toBe(
      "/home/user/project"
    );
  });

  test("preserves paths already under generations/", () => {
    expect(normalizeProjectPath("generations/my-project")).toBe(
      "generations/my-project"
    );
    expect(normalizeProjectPath("generations/nested/path")).toBe(
      "generations/nested/path"
    );
  });

  test("adds generations/ prefix to relative paths", () => {
    expect(normalizeProjectPath("my-project")).toBe("generations/my-project");
    expect(normalizeProjectPath("test")).toBe("generations/test");
  });

  test("handles nested relative paths", () => {
    expect(normalizeProjectPath("nested/path")).toBe("generations/nested/path");
  });
});
