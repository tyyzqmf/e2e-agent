#!/usr/bin/env python3
"""
Token Usage Statistics Viewer
==============================

View token usage and cost statistics for a test project, even if testing was interrupted.

Usage:
    python show_token_stats.py <project-dir>
    python show_token_stats.py generations/my_test_project

Options:
    --generate-report    Generate a full cost report (cost_statistics.md)
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports when running as script
_SCRIPT_DIR = Path(__file__).parent.absolute()
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from token_usage import TokenUsageTracker, PricingCalculator, CostReportGenerator


def print_summary(project_dir: Path):
    """Print usage summary to terminal."""
    stats_file = project_dir / "usage_statistics.json"

    if not stats_file.exists():
        print(f"❌ No statistics file found at: {stats_file}")
        print("\nMake sure you've run at least one test session.")
        return False

    try:
        with open(stats_file) as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"❌ Failed to read statistics file: {e}")
        return False

    sessions = data.get("sessions", [])
    summary = data.get("summary", {})

    if not sessions:
        print("📊 No sessions recorded yet.")
        return False

    print("\n" + "=" * 70)
    print("  TOKEN USAGE STATISTICS")
    print("=" * 70)
    print(f"\nProject: {project_dir.name}")
    print(f"Statistics file: {stats_file}")
    print(f"Last updated: {summary.get('last_updated', 'Unknown')}")

    print("\n" + "-" * 70)
    print("  SUMMARY")
    print("-" * 70)
    print(f"Total Sessions:      {summary.get('total_sessions', 0)}")
    print(f"Total Tokens:        {summary.get('total_tokens', 0):,}")
    print(f"  - Input:           {summary.get('total_input_tokens', 0):,}")
    print(f"  - Output:          {summary.get('total_output_tokens', 0):,}")
    print(f"  - Cache Creation:  {summary.get('total_cache_creation_tokens', 0):,}")
    print(f"  - Cache Read:      {summary.get('total_cache_read_tokens', 0):,}")
    print(f"\nTotal Cost:          ${summary.get('total_cost_usd', 0):.4f} USD")
    if summary.get('total_sessions', 0) > 0:
        avg_cost = summary.get('total_cost_usd', 0) / summary['total_sessions']
        print(f"Avg Cost/Session:    ${avg_cost:.4f} USD")

    print("\n" + "-" * 70)
    print("  SESSION DETAILS")
    print("-" * 70)
    print(f"{'#':<4} {'Type':<15} {'Duration':<10} {'Tokens':<12} {'Cost':<10}")
    print("-" * 70)

    for i, session in enumerate(sessions, 1):
        session_type = session.get('session_type', 'unknown')
        duration = session.get('duration_ms', 0) / 1000
        tokens = session.get('tokens', {}).get('total_tokens', 0)
        cost = session.get('costs', {}).get('total_cost', 0)

        print(f"{i:<4} {session_type:<15} {duration:<10.1f}s {tokens:<12,} ${cost:<10.4f}")

    print("=" * 70)

    # Show latest session details
    if sessions:
        latest = sessions[-1]
        print("\n" + "-" * 70)
        print("  LATEST SESSION BREAKDOWN")
        print("-" * 70)
        tokens = latest.get('tokens', {})
        costs = latest.get('costs', {})

        print(f"Session ID:      {latest.get('session_id', 'unknown')}")
        print(f"Type:            {latest.get('session_type', 'unknown')}")
        print(f"Model:           {latest.get('model', 'unknown')}")
        print(f"Timestamp:       {latest.get('timestamp', 'unknown')}")
        print(f"Duration:        {latest.get('duration_ms', 0) / 1000:.1f}s")
        print(f"Turns:           {latest.get('num_turns', 0)}")

        print(f"\nToken Usage:")
        print(f"  Input:         {tokens.get('input_tokens', 0):>10,}  (${costs.get('input_cost', 0):.4f})")
        print(f"  Output:        {tokens.get('output_tokens', 0):>10,}  (${costs.get('output_cost', 0):.4f})")
        print(f"  Cache Write:   {tokens.get('cache_creation_tokens', 0):>10,}  (${costs.get('cache_creation_cost', 0):.4f})")
        print(f"  Cache Read:    {tokens.get('cache_read_tokens', 0):>10,}  (${costs.get('cache_read_cost', 0):.4f})")
        print(f"  {'─' * 50}")
        print(f"  Total:         {tokens.get('total_tokens', 0):>10,}  (${costs.get('total_cost', 0):.4f})")
        print("=" * 70)

    print()
    return True


def generate_report(project_dir: Path):
    """Generate full cost report."""
    print("\n📝 Generating cost report...")

    try:
        pricing_calculator = PricingCalculator()
        usage_tracker = TokenUsageTracker(project_dir, pricing_calculator)
        report_generator = CostReportGenerator(usage_tracker)

        report = report_generator.generate_markdown_report()

        # Save to project directory
        report_path = project_dir / "cost_statistics.md"
        report_path.write_text(report)

        print(f"✅ Cost report generated: {report_path}")
        print(f"\nView the report:")
        print(f"  cat {report_path}")
        print(f"  # or")
        print(f"  open {report_path}  # on macOS")
        print()

    except Exception as e:
        print(f"❌ Failed to generate report: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="View token usage statistics for a test project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # View summary
  python show_token_stats.py generations/my_test_project

  # Generate full report
  python show_token_stats.py generations/my_test_project --generate-report
        """,
    )

    parser.add_argument(
        "project_dir",
        type=Path,
        help="Project directory (e.g., generations/my_test_project)",
    )

    parser.add_argument(
        "--generate-report",
        action="store_true",
        help="Generate a full cost report (cost_statistics.md)",
    )

    args = parser.parse_args()

    # Resolve project directory
    project_dir = args.project_dir.resolve()

    if not project_dir.exists():
        print(f"❌ Project directory not found: {project_dir}")
        sys.exit(1)

    # Print summary
    success = print_summary(project_dir)

    # Generate report if requested
    if args.generate_report and success:
        generate_report(project_dir)


if __name__ == "__main__":
    main()
