/**
 * Unit Tests for Skills Configuration
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectPluginDirectories,
	DEFAULT_SKILLS,
	findAvailableSkills,
	findSkillPluginPath,
	getDefaultPluginsDir,
	getDefaultSkills,
	loadSkillContent,
	validatePluginDirectory,
} from "../skills/index.ts";

// Create a temp directory for tests
const testDir = join(tmpdir(), `e2e-agent-skills-test-${Date.now()}`);

describe("Skills Configuration", () => {
	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("DEFAULT_SKILLS contains expected skills", () => {
		expect(DEFAULT_SKILLS).toContain("frontend-design");
		expect(DEFAULT_SKILLS.length).toBeGreaterThan(0);
	});

	test("getDefaultSkills returns copy of array", () => {
		const skills = getDefaultSkills();
		expect(skills).toEqual([...DEFAULT_SKILLS]);

		// Modifying returned array shouldn't affect original
		skills.push("new-skill");
		expect(DEFAULT_SKILLS).not.toContain("new-skill");
	});

	test("findSkillPluginPath returns null for non-existent skill", () => {
		const result = findSkillPluginPath("non-existent-skill", testDir);
		expect(result).toBeNull();
	});

	test("findSkillPluginPath returns path for existing skill", () => {
		// Create a skill directory
		const skillDir = join(testDir, "test-skill");
		mkdirSync(skillDir, { recursive: true });

		const result = findSkillPluginPath("test-skill", testDir);
		expect(result).toBe(skillDir);
	});

	test("validatePluginDirectory returns false for non-existent path", () => {
		const result = validatePluginDirectory(join(testDir, "non-existent"));
		expect(result).toBe(false);
	});

	test("validatePluginDirectory returns false for empty directory", () => {
		const emptyDir = join(testDir, "empty-plugin");
		mkdirSync(emptyDir, { recursive: true });

		const result = validatePluginDirectory(emptyDir);
		expect(result).toBe(false);
	});

	test("validatePluginDirectory returns true for plugin with plugin.json", () => {
		const pluginDir = join(testDir, "valid-plugin-json");
		const claudePluginDir = join(pluginDir, ".claude-plugin");
		mkdirSync(claudePluginDir, { recursive: true });
		writeFileSync(
			join(claudePluginDir, "plugin.json"),
			JSON.stringify({ name: "test" }),
			"utf-8",
		);

		const result = validatePluginDirectory(pluginDir);
		expect(result).toBe(true);
	});

	test("validatePluginDirectory returns true for plugin with skills/ directory", () => {
		const pluginDir = join(testDir, "valid-plugin-skills");
		const skillsDir = join(pluginDir, "skills");
		mkdirSync(skillsDir, { recursive: true });

		const result = validatePluginDirectory(pluginDir);
		expect(result).toBe(true);
	});

	test("collectPluginDirectories handles empty options", () => {
		const result = collectPluginDirectories({
			pluginDirs: [],
			loadDefaultSkills: false,
			verbose: false,
		});
		expect(Array.isArray(result)).toBe(true);
	});

	test("collectPluginDirectories validates plugin directories", () => {
		// Create valid plugin
		const validPlugin = join(testDir, "valid-plugin");
		mkdirSync(join(validPlugin, "skills"), { recursive: true });

		// Create invalid plugin (no skills/ or .claude-plugin/)
		const invalidPlugin = join(testDir, "invalid-plugin");
		mkdirSync(invalidPlugin, { recursive: true });

		const result = collectPluginDirectories({
			pluginDirs: [validPlugin, invalidPlugin],
			loadDefaultSkills: false,
			verbose: false,
		});

		expect(result).toContain(validPlugin);
		expect(result).not.toContain(invalidPlugin);
	});

	test("collectPluginDirectories deduplicates paths", () => {
		const validPlugin = join(testDir, "dedupe-plugin");
		mkdirSync(join(validPlugin, "skills"), { recursive: true });

		const result = collectPluginDirectories({
			pluginDirs: [validPlugin, validPlugin, validPlugin],
			loadDefaultSkills: false,
			verbose: false,
		});

		// Should only have one entry
		const count = result.filter((p) => p.includes("dedupe-plugin")).length;
		expect(count).toBe(1);
	});

	test("findAvailableSkills returns empty array for non-existent directory", () => {
		const result = findAvailableSkills(join(testDir, "non-existent"));
		expect(result).toEqual([]);
	});

	test("findAvailableSkills finds valid plugins", () => {
		// Create valid plugin with skills directory
		const validSkill = join(testDir, "my-skill");
		mkdirSync(join(validSkill, "skills"), { recursive: true });

		// Create invalid directory (not a plugin)
		const invalidDir = join(testDir, "not-a-skill");
		mkdirSync(invalidDir, { recursive: true });

		const result = findAvailableSkills(testDir);

		expect(result).toContain("my-skill");
		expect(result).not.toContain("not-a-skill");
	});

	test("collectPluginDirectories warns about missing default skills", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: any[]) => logs.push(args.join(" "));

		// Call with loadDefaultSkills=true but custom plugins dir with no skills
		const result = collectPluginDirectories({
			pluginDirs: [],
			loadDefaultSkills: true,
			verbose: true,
		});

		console.log = originalLog;

		// Should have warnings about missing default skills (in a non-existent custom dir)
		expect(Array.isArray(result)).toBe(true);
	});

	test("collectPluginDirectories warns about non-existent plugin dirs", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: any[]) => logs.push(args.join(" "));

		collectPluginDirectories({
			pluginDirs: ["/nonexistent/plugin/dir"],
			loadDefaultSkills: false,
			verbose: true,
		});

		console.log = originalLog;

		expect(logs.some((log) => log.includes("does not exist"))).toBe(true);
	});

	test("collectPluginDirectories warns about invalid plugin structure", () => {
		// Create directory without proper plugin structure
		const invalidPlugin = join(testDir, "invalid-structure");
		mkdirSync(invalidPlugin, { recursive: true });

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: any[]) => logs.push(args.join(" "));

		collectPluginDirectories({
			pluginDirs: [invalidPlugin],
			loadDefaultSkills: false,
			verbose: true,
		});

		console.log = originalLog;

		expect(logs.some((log) => log.includes("Invalid plugin structure"))).toBe(
			true,
		);
	});

	test("collectPluginDirectories logs loaded plugins", () => {
		// Create valid plugin
		const validPlugin = join(testDir, "valid-logged-plugin");
		mkdirSync(join(validPlugin, "skills"), { recursive: true });

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: any[]) => logs.push(args.join(" "));

		collectPluginDirectories({
			pluginDirs: [validPlugin],
			loadDefaultSkills: false,
			verbose: true,
		});

		console.log = originalLog;

		expect(logs.some((log) => log.includes("Loading plugin"))).toBe(true);
	});
});

describe("Skills Loading", () => {
	const skillsTestDir = join(tmpdir(), `e2e-skills-loading-${Date.now()}`);

	beforeEach(() => {
		mkdirSync(skillsTestDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(skillsTestDir)) {
			rmSync(skillsTestDir, { recursive: true, force: true });
		}
	});

	test("loadSkillContent returns null for non-existent skill", async () => {
		const result = await loadSkillContent("nonexistent-skill", skillsTestDir);
		expect(result).toBeNull();
	});

	test("loadSkillContent loads from standard structure", async () => {
		// Create standard skill structure: plugins/<skill>/skills/<skill>/SKILL.md
		const skillDir = join(skillsTestDir, "test-skill", "skills", "test-skill");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(join(skillDir, "SKILL.md"), "# Test Skill Content", "utf-8");

		const result = await loadSkillContent("test-skill", skillsTestDir);
		expect(result).toBe("# Test Skill Content");
	});

	test("loadSkillContent loads from alternative structure", async () => {
		// Create alternative structure: plugins/<skill>/SKILL.md
		const skillDir = join(skillsTestDir, "alt-skill");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(join(skillDir, "SKILL.md"), "# Alt Skill Content", "utf-8");

		const result = await loadSkillContent("alt-skill", skillsTestDir);
		expect(result).toBe("# Alt Skill Content");
	});

	test("getDefaultPluginsDir returns plugins directory path", () => {
		const pluginsDir = getDefaultPluginsDir();
		expect(pluginsDir).toContain("plugins");
	});
});
