/**
 * Pricing Calculator
 * ===================
 *
 * Calculates token costs based on pricing data from LiteLLM API.
 * Implements local caching with 24-hour validity.
 */

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	CostBreakdown,
	LiteLLMModelPricing,
	PricingCache,
	PricingRates,
	TokenUsage,
} from "../types/index.ts";
import { FALLBACK_PRICING } from "../types/pricing.ts";

// Configuration Constants
const LITELLM_PRICING_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const DEFAULT_CACHE_DIR = join(homedir(), ".cache", "e2e-agent");
const CACHE_FILENAME = "litellm_pricing_cache.json";
const DEFAULT_CACHE_VALIDITY_HOURS = 24;

/**
 * Pricing Calculator class
 *
 * Calculates token costs based on pricing data from LiteLLM API.
 */
export class PricingCalculator {
	private cacheDir: string;
	private cacheValidityHours: number;
	private cacheFile: string;

	constructor(cacheDir?: string) {
		this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
		this.cacheValidityHours = parseInt(
			process.env.PRICING_CACHE_HOURS ?? String(DEFAULT_CACHE_VALIDITY_HOURS),
			10,
		);
		this.cacheFile = join(this.cacheDir, CACHE_FILENAME);
	}

	/**
	 * Calculate cost breakdown for given token usage.
	 *
	 * @param tokens - Token usage object
	 * @param model - Model ID
	 * @returns Cost breakdown
	 */
	calculateCost(tokens: TokenUsage, model: string): CostBreakdown {
		const cleanModel = this.cleanModelId(model);
		const rates = this.getRates(cleanModel);

		const inputCost = this.calculateTokenCost(
			tokens.inputTokens ?? 0,
			rates.inputRate,
		);
		const outputCost = this.calculateTokenCost(
			tokens.outputTokens ?? 0,
			rates.outputRate,
		);
		const cacheCreationCost = this.calculateTokenCost(
			tokens.cacheCreationTokens ?? 0,
			rates.cacheWriteRate,
		);
		const cacheReadCost = this.calculateTokenCost(
			tokens.cacheReadTokens ?? 0,
			rates.cacheReadRate,
		);

		const totalCost =
			inputCost + outputCost + cacheCreationCost + cacheReadCost;

		return {
			inputCost: Math.round(inputCost * 1000000) / 1000000,
			outputCost: Math.round(outputCost * 1000000) / 1000000,
			cacheCreationCost: Math.round(cacheCreationCost * 1000000) / 1000000,
			cacheReadCost: Math.round(cacheReadCost * 1000000) / 1000000,
			totalCost: Math.round(totalCost * 1000000) / 1000000,
		};
	}

	/**
	 * Try to get rates from cache (valid or expired).
	 * @returns Rates and source info, or null if not available
	 */
	private tryGetCachedRates(
		model: string,
		allowExpired: boolean,
	): { rates: PricingRates; source: "valid_cache" | "expired_cache" } | null {
		const isValid = this.isCacheValid();
		if (!isValid && !allowExpired) {
			return null;
		}

		const cachedPrices = this.loadCachedPrices();
		if (!cachedPrices) {
			return null;
		}

		const rates = this.extractModelRates(cachedPrices, model);
		if (!rates) {
			return null;
		}

		return {
			rates,
			source: isValid ? "valid_cache" : "expired_cache",
		};
	}

	/**
	 * Get pricing rates with automatic cache management.
	 *
	 * Priority order:
	 * 1. Cached rates (if valid and < 24 hours old)
	 * 2. Fresh rates from LiteLLM API
	 * 3. Expired cache (if API unavailable)
	 * 4. Fallback hardcoded rates (last resort)
	 */
	getRates(model: string): PricingRates {
		// Try valid cache first
		const validCache = this.tryGetCachedRates(model, false);
		if (validCache) {
			console.log(`[Pricing] Using cached rates for ${model}`);
			return validCache.rates;
		}

		// Cache is stale or missing - try to update from API (sync version)
		console.warn(
			`[Pricing] Cache is stale or missing, using fallback rates...`,
		);
		console.warn(
			`[Pricing] Cost calculations may be inaccurate. Run with network access to update pricing cache.`,
		);

		// Try expired cache
		const expiredCache = this.tryGetCachedRates(model, true);
		if (expiredCache) {
			console.warn(`[Pricing] WARNING: Using expired cache for ${model}`);
			return expiredCache.rates;
		}

		// No cache - use fallback
		console.warn(
			`[Pricing] WARNING: No cache available, using hardcoded fallback rates for ${model}`,
		);
		console.warn(
			`[Pricing] This may result in significantly inaccurate cost estimates.`,
		);
		return this.getFallbackRates(model);
	}

	/**
	 * Get pricing rates asynchronously (with API fetch)
	 */
	async getRatesAsync(model: string): Promise<PricingRates> {
		// Try valid cache first
		const validCache = this.tryGetCachedRates(model, false);
		if (validCache) {
			console.log(`[Pricing] Using cached rates for ${model}`);
			return validCache.rates;
		}

		// Cache is stale or missing - try to update from API
		console.log(
			`[Pricing] Cache is stale or missing, fetching latest prices...`,
		);
		if (await this.updatePriceCache()) {
			const freshCache = this.tryGetCachedRates(model, false);
			if (freshCache) {
				console.log(`[Pricing] Using fresh rates from API for ${model}`);
				return freshCache.rates;
			}
		}

		// API fetch failed - try expired cache
		const expiredCache = this.tryGetCachedRates(model, true);
		if (expiredCache) {
			console.log(
				`[Pricing] WARNING: API unavailable, using expired cache for ${model}`,
			);
			return expiredCache.rates;
		}

		// No cache and API failed - use fallback
		console.log(
			`[Pricing] WARNING: API unavailable and no cache, using hardcoded fallback rates for ${model}`,
		);
		return this.getFallbackRates(model);
	}

	/**
	 * Fetch latest pricing data from LiteLLM GitHub repository.
	 */
	async fetchLatestPrices(): Promise<Record<
		string,
		LiteLLMModelPricing
	> | null> {
		try {
			const response = await fetch(LITELLM_PRICING_URL, {
				signal: AbortSignal.timeout(10000),
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return (await response.json()) as Record<string, LiteLLMModelPricing>;
		} catch (error) {
			console.log(`[Pricing] Failed to fetch from API: ${error}`);
			return null;
		}
	}

	/**
	 * Fetch and cache latest pricing data.
	 */
	async updatePriceCache(): Promise<boolean> {
		const pricingData = await this.fetchLatestPrices();
		if (!pricingData) {
			return false;
		}

		try {
			// Add metadata
			const cacheData: PricingCache = {
				fetchedAt: Date.now(),
				sourceUrl: LITELLM_PRICING_URL,
				pricing: pricingData,
			};

			// Ensure cache directory exists
			if (!existsSync(this.cacheDir)) {
				mkdirSync(this.cacheDir, { recursive: true });
			}

			// Write to cache file atomically
			const tempFile = `${this.cacheFile}.tmp`;
			await Bun.write(tempFile, JSON.stringify(cacheData, null, 2));
			renameSync(tempFile, this.cacheFile);

			console.log(`[Pricing] Cache updated successfully`);
			return true;
		} catch (error) {
			console.log(`[Pricing] Failed to write cache: ${error}`);
			return false;
		}
	}

	/**
	 * Check if cache exists and is less than cacheValidityHours old.
	 */
	isCacheValid(): boolean {
		if (!existsSync(this.cacheFile)) {
			return false;
		}

		try {
			const _file = Bun.file(this.cacheFile);
			// Check file size synchronously isn't easily done with Bun.file
			// Use a simpler approach
			const content = require("node:fs").readFileSync(this.cacheFile, "utf-8");
			const cacheData = JSON.parse(content) as PricingCache & {
				fetched_at?: number;
			};

			// Support both camelCase (new) and snake_case (legacy) field names
			// Also handle seconds vs milliseconds timestamp format
			let fetchedAt = cacheData.fetchedAt ?? cacheData.fetched_at ?? 0;
			// If timestamp looks like seconds (< 10 billion), convert to milliseconds
			if (fetchedAt > 0 && fetchedAt < 10_000_000_000) {
				fetchedAt = fetchedAt * 1000;
			}
			const ageHours = (Date.now() - fetchedAt) / 3600000;

			return ageHours < this.cacheValidityHours;
		} catch (error) {
			console.warn(
				`[Pricing] Failed to validate cache: ${error instanceof Error ? error.message : error}`,
			);
			console.warn(
				`[Pricing] Cache file may be corrupted. Consider deleting: ${this.cacheFile}`,
			);
			return false;
		}
	}

	/**
	 * Load pricing data from cache file.
	 */
	loadCachedPrices(): Record<string, LiteLLMModelPricing> | null {
		if (!existsSync(this.cacheFile)) {
			return null;
		}

		try {
			const content = require("node:fs").readFileSync(this.cacheFile, "utf-8");
			const cacheData = JSON.parse(content) as PricingCache;
			return cacheData.pricing ?? null;
		} catch (error) {
			console.log(`[Pricing] Failed to load cache: ${error}`);
			return null;
		}
	}

	/**
	 * Get hardcoded fallback pricing rates when API is unavailable.
	 */
	getFallbackRates(model: string): PricingRates {
		// Try exact match first
		if (model in FALLBACK_PRICING) {
			return FALLBACK_PRICING[model];
		}

		// Try to find base model name
		const baseModel = this.getBaseModelName(model);
		if (baseModel in FALLBACK_PRICING) {
			return FALLBACK_PRICING[baseModel];
		}

		// Default to Sonnet 4.5 rates as fallback
		console.log(
			`[Pricing] WARNING: Unknown model '${model}', using Claude Sonnet 4.5 rates`,
		);
		return FALLBACK_PRICING["claude-sonnet-4-5-20250929"];
	}

	/**
	 * Extract rates for a specific model from LiteLLM pricing data.
	 */
	private extractModelRates(
		pricingData: Record<string, LiteLLMModelPricing>,
		model: string,
	): PricingRates | null {
		// Try direct lookup
		let modelInfo = pricingData[model];

		// Try common variations
		if (!modelInfo) {
			for (const variant of this.getModelVariants(model)) {
				modelInfo = pricingData[variant];
				if (modelInfo) break;
			}
		}

		if (!modelInfo) {
			return null;
		}

		// Extract token costs (stored per token, convert to per million)
		try {
			return {
				inputRate: (modelInfo.input_cost_per_token ?? 0) * 1_000_000,
				outputRate: (modelInfo.output_cost_per_token ?? 0) * 1_000_000,
				cacheWriteRate:
					(modelInfo.cache_creation_input_token_cost ?? 0) * 1_000_000,
				cacheReadRate: (modelInfo.cache_read_input_token_cost ?? 0) * 1_000_000,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Generate common model ID variants for lookup.
	 */
	private getModelVariants(model: string): string[] {
		const variants = [model];

		// Remove AWS Bedrock prefix
		if (model.startsWith("us.anthropic.")) {
			const base = model.replace("us.anthropic.", "").split("-v")[0];
			variants.push(base);
			variants.push(`bedrock/${model}`);
		}

		if (model.startsWith("anthropic.")) {
			const base = model.replace("anthropic.", "").split("-v")[0];
			variants.push(base);
		}

		return variants;
	}

	/**
	 * Extract base model name from full model ID.
	 */
	private getBaseModelName(model: string): string {
		// Remove provider prefixes
		let base = model.replace("us.anthropic.", "").replace("anthropic.", "");
		// Remove version suffix
		base = base.split("-v")[0];
		return base;
	}

	/**
	 * Calculate cost for a given token count.
	 */
	private calculateTokenCost(
		tokenCount: number,
		ratePerMillion: number,
	): number {
		return (tokenCount / 1_000_000) * ratePerMillion;
	}

	/**
	 * Clean model ID by removing context window suffixes.
	 * AWS Bedrock uses suffixes like [1m] for 1 million context window configuration.
	 * E.g., "us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]" -> "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
	 */
	private cleanModelId(model: string): string {
		// Remove context window suffixes (e.g., [1m] for 1 million, [200k] for 200k)
		return model.replace(/\[\d+[mk]?\]$/gi, "");
	}
}
