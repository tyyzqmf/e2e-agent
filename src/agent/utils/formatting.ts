/**
 * Output Formatting Utilities
 * ===========================
 *
 * Functions for formatting tool use and result output.
 */

/**
 * Format size in human-readable format
 */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/**
 * Format and print tool use information
 */
export function formatToolUseOutput(
	toolName: string,
	thinkingTime: number,
	toolInput?: unknown,
	maxInputLen: number = 200,
): void {
	console.log(
		`\n[Tool: ${toolName}] (after ${thinkingTime.toFixed(1)}s thinking)`,
	);

	if (toolInput !== undefined) {
		const inputStr = JSON.stringify(toolInput);
		const inputSize = Buffer.byteLength(inputStr, "utf8");
		console.log(`   Input size: ${formatSize(inputSize)}`);
		if (inputStr.length > maxInputLen) {
			console.log(`   Input: ${inputStr.slice(0, maxInputLen)}...`);
		} else {
			console.log(`   Input: ${inputStr}`);
		}
	}
}

/**
 * Format and print tool result information
 */
export function formatToolResultOutput(
	resultContent: string,
	isError: boolean,
	executionTime?: number,
	maxLen: number = 500,
): void {
	const timeSuffix =
		executionTime !== undefined ? ` (took ${executionTime.toFixed(1)}s)` : "";
	const outputSize = Buffer.byteLength(resultContent, "utf8");
	console.log(`   Output size: ${formatSize(outputSize)}`);

	if (resultContent.toLowerCase().includes("blocked")) {
		const truncated =
			resultContent.length > maxLen
				? `${resultContent.slice(0, maxLen)}...`
				: resultContent;
		console.log(`   [BLOCKED]${timeSuffix} ${truncated}`);
	} else if (isError) {
		const truncated =
			resultContent.length > maxLen
				? `${resultContent.slice(0, maxLen)}...`
				: resultContent;
		console.log(`   [Error]${timeSuffix} ${truncated}`);
	} else {
		console.log(`   [Done]${timeSuffix}`);
	}
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
