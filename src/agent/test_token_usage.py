#!/usr/bin/env python3
"""
Test script for token usage tracking functionality.
"""

import sys
import tempfile
from pathlib import Path

# Add parent directory to path for imports when running as script
_SCRIPT_DIR = Path(__file__).parent.absolute()
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from token_usage import PricingCalculator, TokenUsageTracker, CostReportGenerator


def test_pricing_calculator():
    """Test PricingCalculator functionality."""
    print("\n" + "=" * 70)
    print("  TEST 1: PricingCalculator")
    print("=" * 70)

    calculator = PricingCalculator()

    # Test model: Claude Sonnet 4.5
    model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

    # Test token usage
    tokens = {
        "input_tokens": 1000,
        "output_tokens": 2000,
        "cache_creation_tokens": 500,
        "cache_read_tokens": 800,
    }

    print(f"\nModel: {model}")
    print(f"Tokens: {tokens}")

    # Get rates
    print("\n[Step 1] Getting pricing rates...")
    rates = calculator.get_rates(model)
    print(f"Rates: {rates}")

    # Calculate costs
    print("\n[Step 2] Calculating costs...")
    costs = calculator.calculate_cost(tokens, model)
    print(f"Costs: {costs}")

    # Verify calculations
    expected_input_cost = (1000 / 1_000_000) * rates["input_rate"]
    expected_output_cost = (2000 / 1_000_000) * rates["output_rate"]
    expected_cache_creation_cost = (500 / 1_000_000) * rates["cache_write_rate"]
    expected_cache_read_cost = (800 / 1_000_000) * rates["cache_read_rate"]
    expected_total = (
        expected_input_cost
        + expected_output_cost
        + expected_cache_creation_cost
        + expected_cache_read_cost
    )

    print(f"\nExpected input cost: ${expected_input_cost:.6f}")
    print(f"Actual input cost:   ${costs['input_cost']:.6f}")
    assert abs(costs["input_cost"] - expected_input_cost) < 0.000001

    print(f"\nExpected total cost: ${expected_total:.6f}")
    print(f"Actual total cost:   ${costs['total_cost']:.6f}")
    assert abs(costs["total_cost"] - expected_total) < 0.000001

    print("\n✅ PricingCalculator test PASSED")


def test_token_usage_tracker():
    """Test TokenUsageTracker functionality."""
    print("\n" + "=" * 70)
    print("  TEST 2: TokenUsageTracker")
    print("=" * 70)

    # Create temporary project directory
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        print(f"\nProject directory: {project_dir}")

        calculator = PricingCalculator()
        tracker = TokenUsageTracker(project_dir, calculator)

        # Record first session
        print("\n[Step 1] Recording session 1...")
        session1 = tracker.record_session(
            session_id="test-session-1",
            session_type="test_planner",
            model="claude-sonnet-4-5-20250929",
            duration_ms=15000,
            num_turns=5,
            tokens={
                "input_tokens": 1500,
                "output_tokens": 2200,
                "cache_creation_tokens": 500,
                "cache_read_tokens": 800,
            },
        )
        print(f"Session 1 total cost: ${session1['costs']['total_cost']:.4f}")

        # Record second session
        print("\n[Step 2] Recording session 2...")
        session2 = tracker.record_session(
            session_id="test-session-2",
            session_type="test_executor",
            model="claude-sonnet-4-5-20250929",
            duration_ms=8500,
            num_turns=3,
            tokens={
                "input_tokens": 1200,
                "output_tokens": 1800,
                "cache_creation_tokens": 300,
                "cache_read_tokens": 600,
            },
        )
        print(f"Session 2 total cost: ${session2['costs']['total_cost']:.4f}")

        # Get summary
        print("\n[Step 3] Getting summary...")
        summary = tracker.get_summary()
        print(f"Total sessions: {summary['total_sessions']}")
        print(f"Total tokens: {summary['total_tokens']:,}")
        print(f"Total cost: ${summary['total_cost_usd']:.4f}")

        assert summary["total_sessions"] == 2
        assert summary["total_input_tokens"] == 2700
        assert summary["total_output_tokens"] == 4000

        # Display session stats
        print("\n[Step 4] Displaying session stats...")
        tracker.display_session_stats(session2)

        # Verify persistence
        stats_file = project_dir / "usage_statistics.json"
        assert stats_file.exists(), "Statistics file should exist"
        print(f"\n✅ Statistics file created: {stats_file}")

        print("\n✅ TokenUsageTracker test PASSED")


def test_cost_report_generator():
    """Test CostReportGenerator functionality."""
    print("\n" + "=" * 70)
    print("  TEST 3: CostReportGenerator")
    print("=" * 70)

    # Create temporary project directory
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)

        calculator = PricingCalculator()
        tracker = TokenUsageTracker(project_dir, calculator)

        # Record some sessions
        print("\n[Step 1] Recording test sessions...")
        for i in range(3):
            tracker.record_session(
                session_id=f"test-session-{i+1}",
                session_type="test_executor" if i > 0 else "test_planner",
                model="claude-sonnet-4-5-20250929",
                duration_ms=10000 + i * 1000,
                num_turns=3 + i,
                tokens={
                    "input_tokens": 1000 + i * 100,
                    "output_tokens": 2000 + i * 200,
                    "cache_creation_tokens": 300 + i * 50,
                    "cache_read_tokens": 500 + i * 100,
                },
            )

        # Generate report
        print("\n[Step 2] Generating cost report...")
        generator = CostReportGenerator(tracker)
        report = generator.generate_markdown_report()

        print(f"\nReport length: {len(report)} characters")

        # Verify report contains expected sections
        assert "# Cost Statistics Report" in report
        assert "## Executive Summary" in report
        assert "## Token Usage Breakdown" in report
        assert "## Session Details" in report
        assert "## Cost Optimization Recommendations" in report

        # Save report to file
        report_file = project_dir / "cost_report_test.md"
        report_file.write_text(report)
        print(f"\n✅ Report saved to: {report_file}")

        # Display first 500 characters of report
        print("\n--- Report Preview ---")
        print(report[:500])
        print("...")

        print("\n✅ CostReportGenerator test PASSED")


def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("  TOKEN USAGE TRACKING - TEST SUITE")
    print("=" * 70)

    try:
        test_pricing_calculator()
        test_token_usage_tracker()
        test_cost_report_generator()

        print("\n" + "=" * 70)
        print("  ALL TESTS PASSED ✅")
        print("=" * 70)
        print()

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
