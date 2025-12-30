#!/usr/bin/env python3
"""
Autonomous Testing Agent Demo
=============================

A minimal harness demonstrating long-running autonomous testing with Claude.
This script implements the two-agent pattern (test planner + test executor) and
incorporates all the strategies from the long-running agents guide.

Example Usage:
    python autonomous_agent_demo.py --project-dir ./my_test_project
    python autonomous_agent_demo.py --project-dir ./my_test_project --max-iterations 5
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports when running as script
_SCRIPT_DIR = Path(__file__).parent.absolute()
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from agent import run_autonomous_testing_agent


# Configuration Constants
DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
DEFAULT_PROJECT_DIR = Path("./autonomous_test_project")
GENERATIONS_DIR = "generations"
BEDROCK_ENV_VARS = ("true", "1", "yes")


def check_aws_bedrock_config() -> bool:
    """
    Check if AWS Bedrock configuration is valid.

    Returns:
        True if AWS Bedrock is configured and valid, False otherwise.
    """
    use_bedrock = os.environ.get("USE_AWS_BEDROCK", "").lower() in BEDROCK_ENV_VARS
    if not use_bedrock:
        return False

    aws_region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if not aws_region:
        print("Error: AWS_REGION or AWS_DEFAULT_REGION environment variable not set")
        print("\nTo use AWS Bedrock, set:")
        print("  export USE_AWS_BEDROCK=true")
        print("  export AWS_REGION=us-east-1  # or your preferred region")
        print("\nAnd configure AWS credentials using:")
        print("  aws configure")
        print("  # or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
        return False

    print("Using AWS Bedrock for Claude API")
    return True


def check_anthropic_api_key() -> bool:
    """
    Check if Anthropic API key is configured.

    Returns:
        True if API key is present, False otherwise.
    """
    if os.environ.get("ANTHROPIC_API_KEY"):
        return True

    print("Error: ANTHROPIC_API_KEY environment variable not set")
    print("\nGet your API key from: https://console.anthropic.com/")
    print("\nThen set it:")
    print("  export ANTHROPIC_API_KEY='your-api-key-here'")
    print("\nAlternatively, to use AWS Bedrock:")
    print("  export USE_AWS_BEDROCK=true")
    print("  export AWS_REGION=us-east-1")
    return False


def normalize_project_path(project_dir: Path) -> Path:
    """
    Normalize project directory path, placing relative paths under generations/.

    Args:
        project_dir: The input project directory path

    Returns:
        Normalized Path object
    """
    # If already under generations/ or is absolute, use as-is
    if str(project_dir).startswith(f"{GENERATIONS_DIR}/") or project_dir.is_absolute():
        return project_dir

    # Place relative paths under generations/
    return Path(GENERATIONS_DIR) / project_dir


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Autonomous Testing Agent Demo - Long-running agent harness for test execution",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start fresh testing project
  python autonomous_agent_demo.py --project-dir ./my_test_project

  # Use a specific model (inference profile ID for Bedrock)
  python autonomous_agent_demo.py --project-dir ./my_test --model us.anthropic.claude-sonnet-4-5-20250929-v1:0

  # Limit iterations for testing
  python autonomous_agent_demo.py --project-dir ./my_test --max-iterations 3

  # Continue existing project
  python autonomous_agent_demo.py --project-dir ./my_test_project

Environment Variables:
  Option 1 - Anthropic API:
    ANTHROPIC_API_KEY    Your Anthropic API key

  Option 2 - AWS Bedrock:
    USE_AWS_BEDROCK=true Set to use AWS Bedrock
    AWS_REGION           AWS region (e.g., us-east-1, us-west-2)
    AWS credentials configured via AWS CLI or environment variables
        """,
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=DEFAULT_PROJECT_DIR,
        help=f"Directory for the testing project (default: {GENERATIONS_DIR}/{DEFAULT_PROJECT_DIR}). "
             f"Relative paths automatically placed in {GENERATIONS_DIR}/ directory.",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Maximum number of agent iterations (default: unlimited)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )

    return parser.parse_args()


def main() -> None:
    """Main entry point."""
    args = parse_args()

    # Validate API credentials (AWS Bedrock or Anthropic API)
    use_bedrock = os.environ.get("USE_AWS_BEDROCK", "").lower() in BEDROCK_ENV_VARS

    if use_bedrock:
        if not check_aws_bedrock_config():
            sys.exit(1)
    else:
        if not check_anthropic_api_key():
            sys.exit(1)

    # Normalize project directory path
    project_dir = normalize_project_path(args.project_dir)

    # Run the testing agent
    try:
        exit_code = asyncio.run(
            run_autonomous_testing_agent(
                project_dir=project_dir,
                model=args.model,
                max_iterations=args.max_iterations,
            )
        )
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        print("To resume, run the same command again")
        sys.exit(130)  # Standard exit code for SIGINT
    except Exception as e:
        print(f"\nFatal error: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
