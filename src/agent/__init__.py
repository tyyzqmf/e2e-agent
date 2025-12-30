"""
E2E Testing Agent Package
=========================

Core agent implementation for autonomous end-to-end testing.
"""

from .agent import run_autonomous_testing_agent
from .client import create_client
from .progress import (
    print_test_session_header,
    print_test_progress_summary,
    count_test_cases,
)
from .prompts import (
    get_test_planner_prompt,
    get_test_executor_prompt,
    copy_templates_to_project,
    copy_utils_to_project,
    copy_test_spec_to_project,
)

__all__ = [
    "run_autonomous_testing_agent",
    "create_client",
    "print_test_session_header",
    "print_test_progress_summary",
    "count_test_cases",
    "get_test_planner_prompt",
    "get_test_executor_prompt",
    "copy_templates_to_project",
    "copy_utils_to_project",
    "copy_test_spec_to_project",
]
