"""
Token Usage and Cost Tracking
==============================

Provides token usage tracking and cost calculation for agent sessions.
Fetches latest pricing from LiteLLM API with local caching.
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import requests


# Configuration Constants
LITELLM_PRICING_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "e2e-agent"
CACHE_FILENAME = "litellm_pricing_cache.json"
DEFAULT_CACHE_VALIDITY_HOURS = 24


# Hardcoded fallback pricing rates (per million tokens)
# Source: LiteLLM pricing as of 2025-12-12
FALLBACK_PRICING = {
    # Sonnet 4.5
    "claude-sonnet-4-5-20250929": {
        "input_rate": 3.00,
        "output_rate": 15.00,
        "cache_write_rate": 3.75,
        "cache_read_rate": 0.30,
    },
    # Opus 4.5
    "claude-opus-4-5-20251101": {
        "input_rate": 5.00,
        "output_rate": 25.00,
        "cache_write_rate": 6.25,
        "cache_read_rate": 0.50,
    },
    # Opus 4
    "claude-opus-4-20250514": {
        "input_rate": 15.00,
        "output_rate": 75.00,
        "cache_write_rate": 18.75,
        "cache_read_rate": 1.50,
    },
    # Haiku 4.5
    "claude-haiku-4-5-20251001": {
        "input_rate": 1.00,
        "output_rate": 5.00,
        "cache_write_rate": 1.25,
        "cache_read_rate": 0.10,
    },
    # Sonnet 3.5
    "claude-3-5-sonnet-20241022": {
        "input_rate": 3.00,
        "output_rate": 15.00,
        "cache_write_rate": 3.75,
        "cache_read_rate": 0.30,
    },
    # Haiku 3.5
    "claude-3-5-haiku-20241022": {
        "input_rate": 0.80,
        "output_rate": 4.00,
        "cache_write_rate": 1.00,
        "cache_read_rate": 0.08,
    },
}


class PricingCalculator:
    """
    Calculates token costs based on pricing data from LiteLLM API.
    Implements local caching with 24-hour validity.
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize pricing calculator.

        Args:
            cache_dir: Directory for caching pricing data (default: ~/.cache/e2e-agent/)
        """
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.cache_validity_hours = int(
            os.environ.get("PRICING_CACHE_HOURS", DEFAULT_CACHE_VALIDITY_HOURS)
        )
        self.cache_file = self.cache_dir / CACHE_FILENAME

    def calculate_cost(self, tokens: Dict, model: str) -> Dict:
        """
        Calculate cost breakdown for given token usage.

        Args:
            tokens: Dict with token counts (input_tokens, output_tokens, etc.)
            model: Model ID

        Returns:
            dict: Cost breakdown with keys:
                - input_cost
                - output_cost
                - cache_creation_cost
                - cache_read_cost
                - total_cost
        """
        rates = self.get_rates(model)

        input_cost = self._calculate_token_cost(
            tokens.get("input_tokens", 0), rates["input_rate"]
        )
        output_cost = self._calculate_token_cost(
            tokens.get("output_tokens", 0), rates["output_rate"]
        )
        cache_creation_cost = self._calculate_token_cost(
            tokens.get("cache_creation_tokens", 0), rates["cache_write_rate"]
        )
        cache_read_cost = self._calculate_token_cost(
            tokens.get("cache_read_tokens", 0), rates["cache_read_rate"]
        )

        total_cost = input_cost + output_cost + cache_creation_cost + cache_read_cost

        return {
            "input_cost": round(input_cost, 6),
            "output_cost": round(output_cost, 6),
            "cache_creation_cost": round(cache_creation_cost, 6),
            "cache_read_cost": round(cache_read_cost, 6),
            "total_cost": round(total_cost, 6),
        }

    def get_rates(self, model: str) -> Dict:
        """
        Get pricing rates with automatic cache management.

        Priority order:
        1. Cached rates (if valid and < 24 hours old)
        2. Fresh rates from LiteLLM API
        3. Expired cache (if API unavailable)
        4. Fallback hardcoded rates (last resort)

        Args:
            model: Model ID

        Returns:
            dict: Rates with keys: input_rate, output_rate, cache_write_rate, cache_read_rate
        """
        # Try to load from cache if valid
        if self.is_cache_valid():
            cached_prices = self.load_cached_prices()
            if cached_prices:
                rates = self._extract_model_rates(cached_prices, model)
                if rates:
                    print(f"[Pricing] Using cached rates for {model}")
                    return rates

        # Cache is stale or missing - try to update from API
        print(f"[Pricing] Cache is stale or missing, fetching latest prices...")
        if self.update_price_cache():
            cached_prices = self.load_cached_prices()
            if cached_prices:
                rates = self._extract_model_rates(cached_prices, model)
                if rates:
                    print(f"[Pricing] Using fresh rates from API for {model}")
                    return rates

        # API fetch failed - check if old cache exists (even if expired)
        cached_prices = self.load_cached_prices()
        if cached_prices:
            rates = self._extract_model_rates(cached_prices, model)
            if rates:
                print(
                    f"[Pricing] WARNING: API unavailable, using expired cache for {model}"
                )
                return rates

        # No cache and API failed - use fallback
        print(
            f"[Pricing] WARNING: API unavailable and no cache, using hardcoded fallback rates for {model}"
        )
        return self.get_fallback_rates(model)

    def fetch_latest_prices(self) -> Optional[Dict]:
        """
        Fetch latest pricing data from LiteLLM GitHub repository.

        Returns:
            dict: Complete pricing data for all models, or None if fetch fails
        """
        try:
            response = requests.get(LITELLM_PRICING_URL, timeout=10)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, json.JSONDecodeError) as e:
            print(f"[Pricing] Failed to fetch from API: {e}")
            return None

    def update_price_cache(self) -> bool:
        """
        Fetch and cache latest pricing data.

        Returns:
            bool: True if cache was updated successfully, False otherwise
        """
        pricing_data = self.fetch_latest_prices()
        if not pricing_data:
            return False

        try:
            # Add metadata
            cache_data = {
                "fetched_at": time.time(),
                "source_url": LITELLM_PRICING_URL,
                "pricing": pricing_data,
            }

            # Write to cache file atomically
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            temp_file = self.cache_file.with_suffix(".tmp")

            with open(temp_file, "w") as f:
                json.dump(cache_data, f, indent=2)

            temp_file.rename(self.cache_file)
            print(f"[Pricing] Cache updated successfully")
            return True

        except IOError as e:
            print(f"[Pricing] Failed to write cache: {e}")
            return False

    def is_cache_valid(self) -> bool:
        """
        Check if cache exists and is less than cache_validity_hours old.

        Returns:
            bool: True if cache is valid, False if stale or missing
        """
        if not self.cache_file.exists():
            return False

        try:
            with open(self.cache_file) as f:
                cache_data = json.load(f)

            fetched_at = cache_data.get("fetched_at", 0)
            age_hours = (time.time() - fetched_at) / 3600

            return age_hours < self.cache_validity_hours

        except (json.JSONDecodeError, IOError):
            return False

    def load_cached_prices(self) -> Optional[Dict]:
        """
        Load pricing data from cache file.

        Returns:
            dict or None: Cached pricing data, or None if cache doesn't exist
        """
        if not self.cache_file.exists():
            return None

        try:
            with open(self.cache_file) as f:
                cache_data = json.load(f)
            return cache_data.get("pricing")
        except (json.JSONDecodeError, IOError) as e:
            print(f"[Pricing] Failed to load cache: {e}")
            return None

    def get_fallback_rates(self, model: str) -> Dict:
        """
        Get hardcoded fallback pricing rates when API is unavailable.

        Args:
            model: Model ID

        Returns:
            dict: Fallback rates
        """
        # Try exact match first
        if model in FALLBACK_PRICING:
            return FALLBACK_PRICING[model]

        # Try to find base model name (strip AWS/Anthropic prefixes and version)
        base_model = self._get_base_model_name(model)
        if base_model in FALLBACK_PRICING:
            return FALLBACK_PRICING[base_model]

        # Default to Sonnet 4.5 rates as fallback
        print(
            f"[Pricing] WARNING: Unknown model '{model}', using Claude Sonnet 4.5 rates"
        )
        return FALLBACK_PRICING["claude-sonnet-4-5-20250929"]

    def _extract_model_rates(self, pricing_data: Dict, model: str) -> Optional[Dict]:
        """
        Extract rates for a specific model from LiteLLM pricing data.

        Args:
            pricing_data: Complete LiteLLM pricing dictionary
            model: Model ID to look up

        Returns:
            dict with rates or None if model not found
        """
        # Try direct lookup
        model_info = pricing_data.get(model)

        # Try common variations
        if not model_info:
            for variant in self._get_model_variants(model):
                model_info = pricing_data.get(variant)
                if model_info:
                    break

        if not model_info:
            return None

        # Extract token costs (stored per token, convert to per million)
        try:
            return {
                "input_rate": model_info.get("input_cost_per_token", 0) * 1_000_000,
                "output_rate": model_info.get("output_cost_per_token", 0) * 1_000_000,
                "cache_write_rate": model_info.get("cache_creation_input_token_cost", 0)
                * 1_000_000,
                "cache_read_rate": model_info.get("cache_read_input_token_cost", 0)
                * 1_000_000,
            }
        except (KeyError, TypeError):
            return None

    def _get_model_variants(self, model: str) -> List[str]:
        """
        Generate common model ID variants for lookup.

        Examples:
            'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
            -> ['claude-sonnet-4-5-20250929',
                'bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
                'anthropic.claude-sonnet-4-5-20250929-v1:0']
        """
        variants = [model]

        # Remove AWS Bedrock prefix
        if model.startswith("us.anthropic."):
            base = model.replace("us.anthropic.", "").split("-v")[0]
            variants.append(base)
            variants.append(f"bedrock/{model}")

        if model.startswith("anthropic."):
            base = model.replace("anthropic.", "").split("-v")[0]
            variants.append(base)

        return variants

    def _get_base_model_name(self, model: str) -> str:
        """
        Extract base model name from full model ID.

        Examples:
            'us.anthropic.claude-sonnet-4-5-20250929-v1:0' -> 'claude-sonnet-4-5-20250929'
            'claude-sonnet-4-5-20250929' -> 'claude-sonnet-4-5-20250929'
        """
        # Remove provider prefixes
        base = model.replace("us.anthropic.", "").replace("anthropic.", "")
        # Remove version suffix
        base = base.split("-v")[0]
        return base

    @staticmethod
    def _calculate_token_cost(token_count: int, rate_per_million: float) -> float:
        """Calculate cost for a given token count."""
        return (token_count / 1_000_000) * rate_per_million


class TokenUsageTracker:
    """
    Manages session-level and project-level token usage tracking.
    Persists data to usage_statistics.json in the project directory.
    """

    def __init__(self, project_dir: Path, pricing_calculator: PricingCalculator):
        """
        Initialize tracker.

        Args:
            project_dir: Project directory path
            pricing_calculator: PricingCalculator instance
        """
        self.project_dir = project_dir
        self.pricing_calculator = pricing_calculator
        self.stats_file = project_dir / "usage_statistics.json"

        # Load existing data or initialize
        self.data = self._load_or_initialize()

    def record_session(
        self,
        session_id: str,
        session_type: str,
        model: str,
        duration_ms: int,
        num_turns: int,
        tokens: Dict,
    ) -> Dict:
        """
        Record a completed session's usage data.

        Args:
            session_id: Unique session identifier
            session_type: 'test_planner' or 'test_executor'
            model: Claude model name
            duration_ms: Session duration in milliseconds
            num_turns: Number of agent turns
            tokens: Token usage dict with keys:
                - input_tokens
                - output_tokens
                - cache_creation_tokens (optional)
                - cache_read_tokens (optional)

        Returns:
            dict: Session record with calculated costs
        """
        # Calculate costs
        costs = self.pricing_calculator.calculate_cost(tokens, model)

        # Calculate total tokens
        total_tokens = (
            tokens.get("input_tokens", 0)
            + tokens.get("output_tokens", 0)
            + tokens.get("cache_creation_tokens", 0)
            + tokens.get("cache_read_tokens", 0)
        )

        # Create session record
        session_record = {
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "session_type": session_type,
            "model": model,
            "duration_ms": duration_ms,
            "num_turns": num_turns,
            "tokens": {
                "input_tokens": tokens.get("input_tokens", 0),
                "output_tokens": tokens.get("output_tokens", 0),
                "cache_creation_tokens": tokens.get("cache_creation_tokens", 0),
                "cache_read_tokens": tokens.get("cache_read_tokens", 0),
                "total_tokens": total_tokens,
            },
            "costs": costs,
        }

        # Append to sessions list
        self.data["sessions"].append(session_record)

        # Update summary
        self._update_summary()

        # Save to file
        self.save_to_file()

        return session_record

    def get_summary(self) -> Dict:
        """Get cumulative summary statistics."""
        return self.data.get("summary", {})

    def get_session_history(self) -> List[Dict]:
        """Get list of all recorded sessions."""
        return self.data.get("sessions", [])

    def display_session_stats(self, session_data: Dict) -> None:
        """
        Display formatted session statistics to terminal.

        Args:
            session_data: Session record from record_session()
        """
        tokens = session_data["tokens"]
        costs = session_data["costs"]
        summary = self.get_summary()

        print("\n" + "=" * 70)
        print("  SESSION STATISTICS")
        print("=" * 70)
        print(f"\nSession Type: {session_data['session_type']}")
        print(f"Duration: {session_data['duration_ms'] / 1000:.1f}s")
        print(f"Turns: {session_data['num_turns']}")
        print(f"\nToken Usage:")
        print(
            f"  Input:         {tokens['input_tokens']:>10,}  (${costs['input_cost']:.4f})"
        )
        print(
            f"  Output:        {tokens['output_tokens']:>10,}  (${costs['output_cost']:.4f})"
        )
        print(
            f"  Cache Write:   {tokens['cache_creation_tokens']:>10,}  (${costs['cache_creation_cost']:.4f})"
        )
        print(
            f"  Cache Read:    {tokens['cache_read_tokens']:>10,}  (${costs['cache_read_cost']:.4f})"
        )
        print(f"  {'─' * 50}")
        print(f"  Total:         {tokens['total_tokens']:>10,}  (${costs['total_cost']:.4f})")

        print(f"\nProject Totals:")
        print(f"  Sessions:      {summary['total_sessions']}")
        print(f"  Total Tokens:  {summary['total_tokens']:,}")
        print(f"  Total Cost:    ${summary['total_cost_usd']:.4f}")
        print(f"  Avg/Session:   ${summary['total_cost_usd'] / summary['total_sessions']:.4f}")
        print("=" * 70 + "\n")

    def save_to_file(self) -> None:
        """Persist statistics to usage_statistics.json."""
        try:
            temp_file = self.stats_file.with_suffix(".tmp")
            with open(temp_file, "w") as f:
                json.dump(self.data, f, indent=2)
            temp_file.rename(self.stats_file)
        except IOError as e:
            print(f"[Error] Failed to save usage statistics: {e}")

    def _load_or_initialize(self) -> Dict:
        """Load existing statistics or create new structure."""
        if self.stats_file.exists():
            try:
                with open(self.stats_file) as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"[Warning] Could not load statistics: {e}")
                print("[Warning] Starting with fresh statistics")

        # Initialize new structure
        return {
            "sessions": [],
            "summary": {
                "total_sessions": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_cache_creation_tokens": 0,
                "total_cache_read_tokens": 0,
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "last_updated": datetime.utcnow().isoformat() + "Z",
            },
        }

    def _update_summary(self) -> None:
        """Update cumulative summary from all sessions."""
        sessions = self.data["sessions"]

        total_input = sum(s["tokens"]["input_tokens"] for s in sessions)
        total_output = sum(s["tokens"]["output_tokens"] for s in sessions)
        total_cache_creation = sum(s["tokens"]["cache_creation_tokens"] for s in sessions)
        total_cache_read = sum(s["tokens"]["cache_read_tokens"] for s in sessions)
        total_cost = sum(s["costs"]["total_cost"] for s in sessions)

        self.data["summary"] = {
            "total_sessions": len(sessions),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_cache_creation_tokens": total_cache_creation,
            "total_cache_read_tokens": total_cache_read,
            "total_tokens": total_input
            + total_output
            + total_cache_creation
            + total_cache_read,
            "total_cost_usd": round(total_cost, 4),
            "last_updated": datetime.utcnow().isoformat() + "Z",
        }


class CostReportGenerator:
    """
    Generates formatted cost reports in markdown format.
    """

    def __init__(self, usage_tracker: TokenUsageTracker):
        """
        Initialize report generator.

        Args:
            usage_tracker: TokenUsageTracker instance
        """
        self.usage_tracker = usage_tracker

    def generate_markdown_report(self) -> str:
        """
        Generate complete markdown cost report.

        Returns:
            str: Formatted markdown content
        """
        summary = self.usage_tracker.get_summary()
        sessions = self.usage_tracker.get_session_history()

        report = []
        report.append("# Cost Statistics Report\n")
        report.append(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC\n")
        report.append(f"**Project:** {self.usage_tracker.project_dir.name}\n")
        report.append("\n---\n")

        # Executive Summary
        report.append("\n## Executive Summary\n")
        report.append("| Metric | Value |\n")
        report.append("|--------|-------|\n")
        report.append(f"| Total Sessions | {summary['total_sessions']} |\n")
        report.append(f"| Total Tokens | {summary['total_tokens']:,} |\n")
        report.append(f"| Total Cost | ${summary['total_cost_usd']:.4f} |\n")
        if summary['total_sessions'] > 0:
            avg_cost = summary['total_cost_usd'] / summary['total_sessions']
            report.append(f"| Average Cost per Session | ${avg_cost:.4f} |\n")

        # Token Usage Breakdown
        report.append("\n---\n")
        report.append("\n## Token Usage Breakdown\n")
        report.append("| Token Type | Count | Percentage | Cost |\n")
        report.append("|------------|-------|------------|------|\n")

        total_tokens = summary['total_tokens']
        if total_tokens > 0:
            input_pct = (summary['total_input_tokens'] / total_tokens) * 100
            output_pct = (summary['total_output_tokens'] / total_tokens) * 100
            cache_create_pct = (summary['total_cache_creation_tokens'] / total_tokens) * 100
            cache_read_pct = (summary['total_cache_read_tokens'] / total_tokens) * 100

            # Calculate individual costs from sessions
            input_cost = sum(s['costs']['input_cost'] for s in sessions)
            output_cost = sum(s['costs']['output_cost'] for s in sessions)
            cache_create_cost = sum(s['costs']['cache_creation_cost'] for s in sessions)
            cache_read_cost = sum(s['costs']['cache_read_cost'] for s in sessions)

            report.append(
                f"| Input Tokens | {summary['total_input_tokens']:,} | {input_pct:.1f}% | ${input_cost:.4f} |\n"
            )
            report.append(
                f"| Output Tokens | {summary['total_output_tokens']:,} | {output_pct:.1f}% | ${output_cost:.4f} |\n"
            )
            report.append(
                f"| Cache Creation | {summary['total_cache_creation_tokens']:,} | {cache_create_pct:.1f}% | ${cache_create_cost:.4f} |\n"
            )
            report.append(
                f"| Cache Read | {summary['total_cache_read_tokens']:,} | {cache_read_pct:.1f}% | ${cache_read_cost:.4f} |\n"
            )
            report.append(
                f"| **Total** | **{total_tokens:,}** | **100%** | **${summary['total_cost_usd']:.4f}** |\n"
            )

        # Session Details
        report.append("\n---\n")
        report.append("\n## Session Details\n")
        report.append("| Session | Type | Duration | Tokens | Cost |\n")
        report.append("|---------|------|----------|--------|------|\n")

        for i, session in enumerate(sessions, 1):
            duration = session['duration_ms'] / 1000
            tokens = session['tokens']['total_tokens']
            cost = session['costs']['total_cost']
            session_type = session['session_type'].replace('test_', '').title()
            report.append(
                f"| {i} | {session_type} | {duration:.1f}s | {tokens:,} | ${cost:.4f} |\n"
            )

        # Recommendations
        report.append("\n---\n")
        report.append("\n## Cost Optimization Recommendations\n")
        recommendations = self._generate_recommendations(summary, sessions)
        for rec in recommendations:
            report.append(f"\n{rec}\n")

        report.append("\n---\n")
        report.append(
            "\n**Note:** Costs are estimates based on published pricing and may not reflect actual billing.\n"
        )

        return "".join(report)

    def _generate_recommendations(self, summary: Dict, sessions: List[Dict]) -> List[str]:
        """
        Generate cost optimization recommendations.

        Args:
            summary: Summary statistics
            sessions: List of session records

        Returns:
            list[str]: Recommendation strings
        """
        recommendations = []

        # Cache efficiency
        total_tokens = summary['total_tokens']
        cache_read = summary['total_cache_read_tokens']
        if total_tokens > 0 and cache_read > 0:
            cache_pct = (cache_read / total_tokens) * 100
            # Calculate potential savings
            input_rate = 3.00  # Approximate
            read_rate = 0.30
            savings_per_mtok = input_rate - read_rate
            cache_savings = (cache_read / 1_000_000) * savings_per_mtok
            recommendations.append(
                f"**Prompt Caching Efficiency**: {cache_pct:.1f}% of tokens were cache reads, "
                f"saving approximately ${cache_savings:.4f}. Consider increasing prompt caching coverage for more savings."
            )

        # Output token analysis
        if total_tokens > 0:
            output_pct = (summary['total_output_tokens'] / total_tokens) * 100
            output_cost = sum(s['costs']['output_cost'] for s in sessions)
            total_cost = summary['total_cost_usd']
            if total_cost > 0:
                output_cost_pct = (output_cost / total_cost) * 100
                if output_cost_pct > 70:
                    recommendations.append(
                        f"**Output Token Optimization**: Output tokens account for {output_cost_pct:.1f}% of costs. "
                        f"Review test reports for verbosity and consider more concise outputs."
                    )

        # Session efficiency
        if len(sessions) > 1:
            avg_duration = sum(s['duration_ms'] for s in sessions) / len(sessions) / 1000
            recommendations.append(
                f"**Session Duration**: Average session duration is {avg_duration:.1f}s. "
                f"Consider batching test cases to reduce session overhead."
            )

        return recommendations


def update_html_report_cost_statistics(project_dir: Path) -> bool:
    """
    Post-process HTML report to update cost statistics placeholders.

    This function reads the latest Test_Report_Viewer.html and replaces
    cost-related placeholders with actual values from usage_statistics.json.

    Args:
        project_dir: Project directory path

    Returns:
        bool: True if successfully updated, False otherwise
    """
    import re

    # Find usage_statistics.json
    stats_file = project_dir / "usage_statistics.json"
    if not stats_file.exists():
        print("[Cost Stats] No usage_statistics.json found, skipping HTML update")
        return False

    # Load statistics
    try:
        with open(stats_file) as f:
            stats_data = json.load(f)
        summary = stats_data.get("summary", {})
        sessions = stats_data.get("sessions", [])
    except (json.JSONDecodeError, IOError) as e:
        print(f"[Cost Stats] Failed to read usage statistics: {e}")
        return False

    # Find latest HTML report
    test_reports_dir = project_dir / "test-reports"
    if not test_reports_dir.exists():
        print("[Cost Stats] No test-reports directory found")
        return False

    report_dirs = sorted(test_reports_dir.glob("*"), key=lambda p: p.stat().st_mtime)
    if not report_dirs:
        print("[Cost Stats] No report directories found")
        return False

    latest_report_dir = report_dirs[-1]
    html_report_path = latest_report_dir / "Test_Report_Viewer.html"

    if not html_report_path.exists():
        print(f"[Cost Stats] HTML report not found: {html_report_path}")
        return False

    # Read HTML content
    try:
        html_content = html_report_path.read_text(encoding="utf-8")
    except IOError as e:
        print(f"[Cost Stats] Failed to read HTML report: {e}")
        return False

    # Prepare replacement values
    total_cost = summary.get("total_cost_usd", 0)
    total_tokens = summary.get("total_tokens", 0)
    total_sessions = summary.get("total_sessions", 0)

    # Calculate duration from sessions
    total_duration_ms = sum(s.get("duration_ms", 0) for s in sessions)
    total_duration_min = total_duration_ms / 1000 / 60

    # Format values
    cost_str = f"${total_cost:.4f}"
    tokens_str = f"{total_tokens:,}"
    duration_str = f"~{total_duration_min:.0f}min" if total_duration_min >= 1 else f"~{total_duration_ms/1000:.0f}s"
    sessions_str = str(total_sessions)

    # Replace placeholders (original mustache syntax)
    replacements = {
        r"\{\{TOTAL_COST\}\}": cost_str,
        r"\{\{TOTAL_TOKENS\}\}": tokens_str,
        r"\{\{DURATION\}\}": duration_str,
        r"\{\{SESSIONS\}\}": sessions_str,
    }

    updated = False
    for pattern, value in replacements.items():
        if re.search(pattern, html_content):
            html_content = re.sub(pattern, value, html_content)
            updated = True

    # Also try to replace common default/placeholder values that Agent might have used
    # HTML structure: <div class="cost-value">VALUE</div>\n<div class="cost-label">LABEL</div>
    default_replacements = [
        # Replace $0.00 or any dollar amount in Total Cost
        (r'(<div class="cost-value">)\$[\d.,]+(</div>\s*<div class="cost-label">Total Cost</div>)',
         rf'\g<1>{cost_str}\g<2>'),
        # Replace token counts (with K suffix, commas, or plain numbers)
        (r'(<div class="cost-value">)(?:~?[\d,]+K?|N/A)(</div>\s*<div class="cost-label">Total Tokens</div>)',
         rf'\g<1>{tokens_str}\g<2>'),
        # Replace duration values
        (r'(<div class="cost-value">)(?:~?[\d.]+(?:min|s)|N/A)(</div>\s*<div class="cost-label">Duration</div>)',
         rf'\g<1>{duration_str}\g<2>'),
        # Replace sessions count
        (r'(<div class="cost-value">)\d+(</div>\s*<div class="cost-label">Sessions</div>)',
         rf'\g<1>{sessions_str}\g<2>'),
    ]

    for pattern, replacement in default_replacements:
        if re.search(pattern, html_content, re.IGNORECASE | re.DOTALL):
            html_content = re.sub(pattern, replacement, html_content, flags=re.IGNORECASE | re.DOTALL)
            updated = True

    if not updated:
        print("[Cost Stats] No cost placeholders or default values found in HTML report")
        return False

    # Write updated HTML
    try:
        html_report_path.write_text(html_content, encoding="utf-8")
        print(f"[Cost Stats] Updated HTML report with cost statistics:")
        print(f"  - Total Cost: {cost_str}")
        print(f"  - Total Tokens: {tokens_str}")
        print(f"  - Duration: {duration_str}")
        print(f"  - Sessions: {sessions_str}")
        return True
    except IOError as e:
        print(f"[Cost Stats] Failed to write updated HTML: {e}")
        return False
