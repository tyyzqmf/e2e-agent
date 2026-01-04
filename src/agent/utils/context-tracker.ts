/**
 * Context Usage Tracker
 * =====================
 *
 * Real-time tracking of context window usage during agent sessions.
 */

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	// Use a simple heuristic: ~4 characters per token for English text
	// This is a rough estimate; actual tokenization may vary
	return Math.ceil(text.length / 4);
}

/**
 * Real-time context usage tracker for displaying progress during tool calls
 */
export class ContextUsageTracker {
	private inputTokens: number = 0;
	private outputTokens: number = 0;
	private turnCount: number = 0;
	private readonly contextWindow: number;

	constructor(contextWindow: number) {
		this.contextWindow = contextWindow;
	}

	/**
	 * Add estimated tokens from assistant output (text and tool calls)
	 */
	addOutputTokens(text: string): void {
		this.outputTokens += estimateTokens(text);
	}

	/**
	 * Add estimated tokens from tool result (input to next turn)
	 */
	addInputTokens(text: string): void {
		this.inputTokens += estimateTokens(text);
	}

	/**
	 * Increment turn count
	 */
	incrementTurn(): void {
		this.turnCount++;
	}

	/**
	 * Get current estimated context usage
	 */
	getUsage(): { tokens: number; percent: number; turns: number } {
		const totalTokens = this.inputTokens + this.outputTokens;
		const percent = (totalTokens / this.contextWindow) * 100;
		return {
			tokens: totalTokens,
			percent,
			turns: this.turnCount,
		};
	}

	/**
	 * Display current context usage
	 */
	displayUsage(): void {
		const usage = this.getUsage();
		const tokensK = (usage.tokens / 1000).toFixed(0);
		const windowK = (this.contextWindow / 1000).toFixed(0);
		console.log(
			`   [Context] ~${tokensK}K / ${windowK}K tokens (~${usage.percent.toFixed(1)}%) | Turn ${usage.turns}`,
		);
	}
}
