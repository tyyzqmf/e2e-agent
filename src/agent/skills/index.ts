/**
 * Skills Configuration
 * =====================
 *
 * Configuration and utilities for Claude Code skills/plugins.
 * Skills are modular capabilities that extend Claude's functionality.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Get the directory where this module is located
const MODULE_DIR = dirname(new URL(import.meta.url).pathname);

/**
 * Default plugin directories (plugins are inside src/agent/)
 */
export const DEFAULT_PLUGINS_DIR = join(MODULE_DIR, "..", "plugins");

/**
 * Default skills to load automatically
 */
export const DEFAULT_SKILLS = ["frontend-design"] as const;

/**
 * Get the default plugins directory path
 */
export function getDefaultPluginsDir(): string {
	return DEFAULT_PLUGINS_DIR;
}

/**
 * Get the list of default skills to load
 */
export function getDefaultSkills(): string[] {
	return [...DEFAULT_SKILLS];
}

/**
 * Find the plugin path for a given skill name.
 *
 * @param skillName - Name of the skill to find
 * @param pluginsDir - Optional custom plugins directory
 * @returns Path to the skill plugin directory, or null if not found
 */
export function findSkillPluginPath(
	skillName: string,
	pluginsDir?: string,
): string | null {
	const searchDir = pluginsDir ?? DEFAULT_PLUGINS_DIR;
	const skillPath = join(searchDir, skillName);

	if (existsSync(skillPath)) {
		return skillPath;
	}
	return null;
}

/**
 * Validate that a directory has a valid plugin structure.
 *
 * A valid plugin must have either:
 * - .claude-plugin/plugin.json file
 * - skills/ directory
 *
 * @param pluginPath - Path to the plugin directory
 * @returns True if valid plugin structure, False otherwise
 */
export function validatePluginDirectory(pluginPath: string): boolean {
	if (!existsSync(pluginPath)) {
		return false;
	}

	const pluginJson = join(pluginPath, ".claude-plugin", "plugin.json");
	const skillDir = join(pluginPath, "skills");

	return existsSync(pluginJson) || existsSync(skillDir);
}

/**
 * Options for collecting plugin directories
 */
export interface CollectPluginOptions {
	pluginDirs?: string[];
	loadDefaultSkills?: boolean;
	verbose?: boolean;
}

/**
 * Collect and validate all plugin directories to load.
 *
 * @param options - Options for collecting plugins
 * @returns List of validated plugin directory paths
 */
export function collectPluginDirectories(
	options: CollectPluginOptions = {},
): string[] {
	const { pluginDirs = [], loadDefaultSkills = true, verbose = true } = options;

	const allPluginDirs: string[] = [];

	// Load default skills if enabled
	if (loadDefaultSkills) {
		for (const skillName of DEFAULT_SKILLS) {
			const skillPluginPath = join(DEFAULT_PLUGINS_DIR, skillName);
			if (existsSync(skillPluginPath)) {
				allPluginDirs.push(skillPluginPath);
			} else if (verbose) {
				console.log(
					`Warning: Default skill '${skillName}' not found in ${DEFAULT_PLUGINS_DIR}`,
				);
			}
		}
	}

	// Add user-specified plugin directories
	allPluginDirs.push(...pluginDirs);

	// Validate and deduplicate
	const validatedPluginDirs: string[] = [];
	for (const pluginDir of allPluginDirs) {
		const pluginPath = resolve(pluginDir);

		if (!existsSync(pluginPath)) {
			if (verbose) {
				console.log(`Warning: Plugin directory does not exist: ${pluginPath}`);
			}
			continue;
		}

		if (validatePluginDirectory(pluginPath)) {
			// Avoid duplicates
			if (!validatedPluginDirs.includes(pluginPath)) {
				validatedPluginDirs.push(pluginPath);
				if (verbose) {
					const pluginName = pluginPath.split("/").pop() ?? pluginPath;
					console.log(`   - Loading plugin: ${pluginName}`);
				}
			}
		} else if (verbose) {
			console.log(`Warning: Invalid plugin structure at: ${pluginPath}`);
			console.log(
				`         Expected .claude-plugin/plugin.json or skills/ directory`,
			);
		}
	}

	return validatedPluginDirs;
}

/**
 * Load the SKILL.md content for a given skill.
 *
 * @param skillName - Name of the skill
 * @param pluginsDir - Optional custom plugins directory
 * @returns Content of SKILL.md file, or null if not found
 */
export async function loadSkillContent(
	skillName: string,
	pluginsDir?: string,
): Promise<string | null> {
	const searchDir = pluginsDir ?? DEFAULT_PLUGINS_DIR;

	// Try standard plugin structure: plugins/<skill>/skills/<skill>/SKILL.md
	const skillMdPath = join(
		searchDir,
		skillName,
		"skills",
		skillName,
		"SKILL.md",
	);

	if (existsSync(skillMdPath)) {
		const file = Bun.file(skillMdPath);
		return await file.text();
	}

	// Try alternative structure: plugins/<skill>/SKILL.md
	const altPath = join(searchDir, skillName, "SKILL.md");
	if (existsSync(altPath)) {
		const file = Bun.file(altPath);
		return await file.text();
	}

	return null;
}

/**
 * Find all available skills in the plugins directory
 *
 * @param pluginsDir - Optional custom plugins directory
 * @returns List of skill names
 */
export function findAvailableSkills(pluginsDir?: string): string[] {
	const searchDir = pluginsDir ?? DEFAULT_PLUGINS_DIR;

	if (!existsSync(searchDir)) {
		return [];
	}

	const { readdirSync, statSync } = require("node:fs");
	const entries = readdirSync(searchDir);
	const skills: string[] = [];

	for (const entry of entries) {
		const entryPath = join(searchDir, entry);
		if (statSync(entryPath).isDirectory()) {
			if (validatePluginDirectory(entryPath)) {
				skills.push(entry);
			}
		}
	}

	return skills;
}
