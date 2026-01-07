/**
 * Prompt Loading Utilities
 * =========================
 *
 * Functions for loading prompt templates from the prompts directory.
 * Templates are embedded at compile time for single-binary support.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Embed templates at compile time for single-binary support
import testReportViewerHtml from "../templates/Test_Report_Viewer.html" with { type: "text" };
import defectReportMd from "../templates/defect-report.md" with { type: "text" };
import testCaseReportMd from "../templates/test-case-report.md" with { type: "text" };
import testSummaryReportMd from "../templates/test-summary-report.md" with { type: "text" };

// Embed prompts at compile time
import testPlannerPromptMd from "../prompts/test_planner_prompt.md" with { type: "text" };
import testExecutorPromptMd from "../prompts/test_executor_prompt.md" with { type: "text" };
import testReportPromptMd from "../prompts/test_report_prompt.md" with { type: "text" };

/**
 * Embedded templates map
 */
const EMBEDDED_TEMPLATES: Record<string, string> = {
	"Test_Report_Viewer.html": testReportViewerHtml,
	"defect-report.md": defectReportMd,
	"test-case-report.md": testCaseReportMd,
	"test-summary-report.md": testSummaryReportMd,
};

/**
 * Embedded prompts map
 */
const EMBEDDED_PROMPTS: Record<string, string> = {
	"test_planner_prompt": testPlannerPromptMd,
	"test_executor_prompt": testExecutorPromptMd,
	"test_report_prompt": testReportPromptMd,
};

// Get the directory where this module is located
const MODULE_DIR = dirname(new URL(import.meta.url).pathname);

// Check if running as compiled binary
const IS_COMPILED = MODULE_DIR.includes("/$bunfs/") || !MODULE_DIR.includes("/src/agent/");

// Directory Constants (only used in development mode)
export const PROMPTS_DIR = join(MODULE_DIR, "..", "prompts");
export const TEMPLATES_DIR = join(MODULE_DIR, "..", "templates");
export const UTILS_DIR = join(MODULE_DIR, "..", "utils");
export const ROOT_DIR = join(MODULE_DIR, "..", "..", ".."); // Project root

/**
 * Validate that the project directory is within expected boundaries.
 *
 * @param projectDir - The project directory path to validate
 * @returns Resolved absolute path
 * @throws Error if the path is outside expected boundaries
 */
export function validateProjectDirectory(projectDir: string): string {
	const resolvedPath = resolve(projectDir);
	const cwd = resolve(process.cwd());

	const expectedParents = [
		join(cwd, "generations"),
		join(cwd, "autonomous_demo_project"),
		join(cwd, "data", "reports"),
		cwd,
	];

	const isValid = expectedParents.some((parent) =>
		resolvedPath.startsWith(parent),
	);

	if (!isValid) {
		throw new Error(
			`Invalid project directory: ${projectDir}\n` +
				`Project directory must be within: ${expectedParents.join(", ")}`,
		);
	}

	return resolvedPath;
}

/**
 * Validate destination name to prevent path traversal attacks.
 *
 * @param destName - The destination filename or directory name
 * @returns Validated destination name
 * @throws Error if destName contains path traversal sequences or invalid characters
 */
export function validateDestName(destName: string): string {
	// Check for path traversal sequences
	if (destName.includes("..")) {
		throw new Error(`Path traversal detected in destName: ${destName}`);
	}

	// Check for absolute paths
	if (destName.startsWith("/") || destName.startsWith("\\")) {
		throw new Error(`Absolute paths not allowed in destName: ${destName}`);
	}

	// Check for null bytes
	if (destName.includes("\x00")) {
		throw new Error(`Null bytes not allowed in destName: ${destName}`);
	}

	// Check for other dangerous characters
	const dangerousChars = ["<", ">", ":", '"', "|", "?", "*"];
	for (const char of dangerousChars) {
		if (destName.includes(char)) {
			throw new Error(`Invalid character '${char}' in destName: ${destName}`);
		}
	}

	return destName;
}

/**
 * Load a prompt template from the prompts directory.
 * Uses embedded prompts in compiled mode.
 *
 * @param name - Name of the prompt file (without .md extension)
 * @returns Content of the prompt template
 */
export async function loadPrompt(name: string): Promise<string> {
	// Use embedded prompt in compiled mode
	if (IS_COMPILED && EMBEDDED_PROMPTS[name]) {
		return EMBEDDED_PROMPTS[name];
	}

	// Fall back to file system in development mode
	const promptPath = join(PROMPTS_DIR, `${name}.md`);
	const file = Bun.file(promptPath);
	return await file.text();
}

/**
 * Load the test planner prompt.
 *
 * @returns Test planner prompt content
 */
export async function getTestPlannerPrompt(): Promise<string> {
	return loadPrompt("test_planner_prompt");
}

/**
 * Load the test executor agent prompt.
 *
 * @returns Test executor prompt content
 */
export async function getTestExecutorPrompt(): Promise<string> {
	return loadPrompt("test_executor_prompt");
}

/**
 * Load the test report agent prompt.
 *
 * @returns Test report prompt content
 */
export async function getTestReportPrompt(): Promise<string> {
	return loadPrompt("test_report_prompt");
}

/**
 * Copy a file or directory to the project directory if it doesn't exist.
 *
 * @param projectDir - Project directory to copy to
 * @param sourcePath - Source file or directory path
 * @param destName - Destination name (relative to projectDir)
 * @param isDirectory - Whether the source is a directory
 */
export function copyToProject(
	projectDir: string,
	sourcePath: string,
	destName: string,
	isDirectory: boolean = false,
): void {
	// Validate project directory
	const validatedDir = validateProjectDirectory(projectDir);

	// Validate destName
	const validatedDestName = validateDestName(destName);

	const destPath = join(validatedDir, validatedDestName);

	// Additional safety check
	const destPathResolved = resolve(destPath);
	const validatedDirResolved = resolve(validatedDir);
	if (!destPathResolved.startsWith(validatedDirResolved)) {
		throw new Error(`Destination path escapes project directory: ${destName}`);
	}

	if (existsSync(destPath)) {
		console.log(`${validatedDestName} already exists in project directory`);
		return;
	}

	try {
		if (isDirectory) {
			cpSync(sourcePath, destPath, { recursive: true });
		} else {
			cpSync(sourcePath, destPath);
		}

		console.log(`Copied ${validatedDestName} to project directory`);
	} catch (error) {
		console.error(`Failed to copy ${validatedDestName}: ${error}`);
		throw error;
	}
}

/**
 * Copy the test spec file into the project directory for the agent to read.
 * In compiled mode or when using executor, test_spec.txt is already in the project dir.
 *
 * @param projectDir - Target project directory
 */
export function copyTestSpecToProject(projectDir: string): void {
	const validatedDir = validateProjectDirectory(projectDir);
	const testSpecPath = join(validatedDir, "test_spec.txt");

	// If test_spec.txt already exists in project dir (e.g., from executor), skip
	if (existsSync(testSpecPath)) {
		console.log("test_spec.txt already exists in project directory");
		return;
	}

	// In compiled mode without existing test_spec, this is an error
	if (IS_COMPILED) {
		console.log("test_spec.txt not found in project directory (compiled mode)");
		return;
	}

	// In development mode, try to copy from root
	copyToProject(
		projectDir,
		join(ROOT_DIR, "test_spec.txt"),
		"test_spec.txt",
		false,
	);
}

/**
 * Copy the templates into the project directory for the agent to read.
 * Uses embedded templates in compiled mode.
 *
 * @param projectDir - Target project directory
 */
export function copyTemplatesToProject(projectDir: string): void {
	const validatedDir = validateProjectDirectory(projectDir);
	const templatesDir = join(validatedDir, "templates");

	if (existsSync(templatesDir)) {
		console.log("templates already exists in project directory");
		return;
	}

	// In compiled mode, write embedded templates
	if (IS_COMPILED) {
		mkdirSync(templatesDir, { recursive: true });
		for (const [filename, content] of Object.entries(EMBEDDED_TEMPLATES)) {
			const destPath = join(templatesDir, filename);
			writeFileSync(destPath, content);
		}
		console.log("Copied templates to project directory (from embedded)");
		return;
	}

	// In development mode, copy from source
	copyToProject(projectDir, TEMPLATES_DIR, "templates", true);
}

/**
 * Copy the utils directory into the project directory for the agent to use.
 * Only copies if the utils directory exists. Skipped in compiled mode.
 *
 * @param projectDir - Target project directory
 */
export function copyUtilsToProject(projectDir: string): void {
	// Skip in compiled mode - utils are not needed
	if (IS_COMPILED) {
		console.log("Utils copy skipped (compiled mode)");
		return;
	}

	if (!existsSync(UTILS_DIR)) {
		console.log("Utils directory not found, skipping copy");
		return;
	}
	copyToProject(projectDir, UTILS_DIR, "utils", true);
}

/**
 * Setup a new project directory with all required files.
 *
 * @param projectDir - Target project directory
 */
export function setupProjectDirectory(projectDir: string): void {
	// Ensure project directory exists
	if (!existsSync(projectDir)) {
		mkdirSync(projectDir, { recursive: true });
	}

	// Copy required files
	copyTestSpecToProject(projectDir);
	copyTemplatesToProject(projectDir);
	copyUtilsToProject(projectDir);
}
