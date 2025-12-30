/**
 * Pricing Types
 * ==============
 *
 * Type definitions for token pricing and cost tracking.
 */

/**
 * Pricing rates per million tokens
 */
export interface PricingRates {
	inputRate: number;
	outputRate: number;
	cacheWriteRate: number;
	cacheReadRate: number;
}

/**
 * Cost breakdown for a session
 */
export interface CostBreakdown {
	inputCost: number;
	outputCost: number;
	cacheCreationCost: number;
	cacheReadCost: number;
	totalCost: number;
}

/**
 * Token counts for a session
 */
export interface TokenCounts {
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalTokens: number;
}

/**
 * A record of a single session's usage
 */
export interface SessionRecord {
	sessionId: string;
	timestamp: string;
	sessionType: "test_planner" | "test_executor";
	model: string;
	durationMs: number;
	numTurns: number;
	tokens: TokenCounts;
	costs: CostBreakdown;
}

/**
 * Summary of usage across all sessions
 */
export interface UsageSummary {
	totalSessions: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCacheCreationTokens: number;
	totalCacheReadTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	lastUpdated: string;
}

/**
 * Complete usage statistics file format
 */
export interface UsageStatistics {
	sessions: SessionRecord[];
	summary: UsageSummary;
}

/**
 * Cached pricing data from LiteLLM API
 */
export interface PricingCache {
	fetchedAt: number;
	sourceUrl: string;
	pricing: Record<string, LiteLLMModelPricing>;
}

/**
 * LiteLLM model pricing format
 */
export interface LiteLLMModelPricing {
	input_cost_per_token?: number;
	output_cost_per_token?: number;
	cache_creation_input_token_cost?: number;
	cache_read_input_token_cost?: number;
	max_tokens?: number;
	max_input_tokens?: number;
	max_output_tokens?: number;
	litellm_provider?: string;
	mode?: string;
}

/**
 * Fallback pricing rates (per million tokens)
 * Source: LiteLLM pricing as of 2025-12-12
 */
export const FALLBACK_PRICING: Record<string, PricingRates> = {
	// Sonnet 4.5
	"claude-sonnet-4-5-20250929": {
		inputRate: 3.0,
		outputRate: 15.0,
		cacheWriteRate: 3.75,
		cacheReadRate: 0.3,
	},
	// Opus 4.5
	"claude-opus-4-5-20251101": {
		inputRate: 5.0,
		outputRate: 25.0,
		cacheWriteRate: 6.25,
		cacheReadRate: 0.5,
	},
	// Opus 4
	"claude-opus-4-20250514": {
		inputRate: 15.0,
		outputRate: 75.0,
		cacheWriteRate: 18.75,
		cacheReadRate: 1.5,
	},
	// Haiku 4.5
	"claude-haiku-4-5-20251001": {
		inputRate: 1.0,
		outputRate: 5.0,
		cacheWriteRate: 1.25,
		cacheReadRate: 0.1,
	},
	// Sonnet 3.5
	"claude-3-5-sonnet-20241022": {
		inputRate: 3.0,
		outputRate: 15.0,
		cacheWriteRate: 3.75,
		cacheReadRate: 0.3,
	},
	// Haiku 3.5
	"claude-3-5-haiku-20241022": {
		inputRate: 0.8,
		outputRate: 4.0,
		cacheWriteRate: 1.0,
		cacheReadRate: 0.08,
	},
};
