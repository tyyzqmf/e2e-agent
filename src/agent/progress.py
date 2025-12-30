"""
Progress Tracking Utilities
===========================

Functions for tracking and displaying progress of the autonomous testing agent.
"""

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security constants
MAX_JSON_FILE_SIZE = 20 * 1024 * 1024  # 20MB maximum file size limit


@dataclass
class TestCaseStats:
    """Statistics for test case execution."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    blocked: int = 0
    not_run: int = 0

    @property
    def completed(self) -> int:
        """Number of completed test cases."""
        return self.passed + self.failed + self.blocked

    @property
    def completion_rate(self) -> float:
        """Percentage of completed test cases."""
        return (self.completed / self.total * 100) if self.total > 0 else 0.0

    @property
    def pass_rate(self) -> float:
        """Percentage of passed test cases among completed ones."""
        return (self.passed / self.completed * 100) if self.completed > 0 else 0.0

    def to_dict(self) -> Dict[str, int]:
        """Convert to dictionary format for backwards compatibility."""
        return {
            'total': self.total,
            'passed': self.passed,
            'failed': self.failed,
            'blocked': self.blocked,
            'not_run': self.not_run
        }


def load_test_cases(test_cases_file: Path) -> List[Dict[str, Any]]:
    """
    Load test cases from JSON file.

    Args:
        test_cases_file: Path to test_cases.json

    Returns:
        List of test case dictionaries

    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If JSON is invalid
        ValueError: If file is too large
    """
    # Security check: validate file size to prevent DoS attacks
    try:
        file_size = os.path.getsize(test_cases_file)
        if file_size > MAX_JSON_FILE_SIZE:
            raise ValueError(
                f"JSON file too large: {file_size} bytes "
                f"(max: {MAX_JSON_FILE_SIZE} bytes / {MAX_JSON_FILE_SIZE // 1024 // 1024}MB)"
            )
    except OSError as e:
        logger.error(f"Cannot check file size for {test_cases_file}: {e}")
        raise

    with open(test_cases_file, "r") as f:
        data = json.load(f)

    # Handle both dictionary format and list format
    if isinstance(data, dict):
        # Dictionary format: {"test_suite": "...", "test_cases": [...]}
        return data.get("test_cases", [])
    elif isinstance(data, list):
        # List format: [...]
        return data
    else:
        # Unknown format
        logger.warning(f"test_cases.json has unexpected format: {type(data).__name__}")
        return []


def count_test_cases(project_dir: Path) -> dict:
    """
    Count test cases by status in test_cases.json.

    Args:
        project_dir: Directory containing test_cases.json

    Returns:
        Dictionary with counts for backwards compatibility.
        Use TestCaseStats for type-safe access to stats.
    """
    test_cases_file = project_dir / "test_cases.json"

    if not test_cases_file.exists():
        logger.debug(f"test_cases.json not found at {test_cases_file}")
        return TestCaseStats().to_dict()

    try:
        test_cases = load_test_cases(test_cases_file)

        stats = TestCaseStats(
            total=len(test_cases),
            passed=sum(1 for tc in test_cases if tc.get("status") == "Pass"),
            failed=sum(1 for tc in test_cases if tc.get("status") == "Fail"),
            blocked=sum(1 for tc in test_cases if tc.get("status") == "Blocked"),
            not_run=sum(1 for tc in test_cases if tc.get("status") == "Not Run")
        )

        logger.debug(f"Counted test cases: {stats}")
        return stats.to_dict()

    except (json.JSONDecodeError, IOError, Exception) as e:
        logger.error(f"Error reading {test_cases_file}: {e}")
        return TestCaseStats().to_dict()


def count_defects(project_dir: Path) -> int:
    """
    Count total defects reported in test-reports directories.

    Args:
        project_dir: Directory containing test-reports

    Returns:
        Number of defect reports found
    """
    test_reports_dir = project_dir / "test-reports"

    if not test_reports_dir.exists():
        return 0

    return len(list(test_reports_dir.rglob("defect-reports/DEFECT-*.md")))


def print_test_session_header(session_num: int, is_planner: bool) -> None:
    """
    Print a formatted header for the test session.

    Args:
        session_num: Session number
        is_planner: Whether this is a test planner session
    """
    session_type = "TEST PLANNER" if is_planner else "TEST EXECUTOR"
    print("\n" + "=" * 70)
    print(f"  SESSION {session_num}: {session_type}")
    print("=" * 70)
    print()


def print_test_progress_summary(project_dir: Path) -> None:
    """
    Print a summary of test execution progress.

    Args:
        project_dir: Project directory containing test_cases.json
    """
    stats_dict = count_test_cases(project_dir)

    if stats_dict['total'] == 0:
        print("\nTest Progress: test_cases.json not yet created")
        return

    # Convert to TestCaseStats for cleaner access
    stats = TestCaseStats(**stats_dict)

    print(f"\nTest Execution Progress:")
    print(f"  Total test cases: {stats.total}")
    print(f"  Completed: {stats.completed} ({stats.completion_rate:.1f}%)")
    print(f"  └─ Passed: {stats.passed} ({stats.pass_rate:.1f}% of completed)")
    print(f"  └─ Failed: {stats.failed}")
    print(f"  └─ Blocked: {stats.blocked}")
    print(f"  Not Run: {stats.not_run}")

    # Count and display defects
    defect_count = count_defects(project_dir)
    if defect_count > 0:
        print(f"  Total Defects Reported: {defect_count}")
