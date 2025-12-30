"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
"""

import asyncio
import time
from enum import Enum
from pathlib import Path
from typing import Optional, Tuple

from claude_agent_sdk import ClaudeSDKClient

from client import create_client
from progress import (
    print_test_session_header,
    print_test_progress_summary,
    count_test_cases,
)
from prompts import (
    get_test_planner_prompt,
    get_test_executor_prompt,
    copy_templates_to_project,
    copy_utils_to_project,
    copy_test_spec_to_project,
)
from token_usage import TokenUsageTracker, PricingCalculator, CostReportGenerator, update_html_report_cost_statistics


# Configuration Constants
AUTO_CONTINUE_DELAY_SECONDS = 3


class SessionStatus(Enum):
    """Status of an agent session."""
    CONTINUE = "continue"
    ERROR = "error"


def format_tool_use_output(
    tool_name: str,
    thinking_time: float,
    tool_input: Optional[object] = None,
    max_input_len: int = 200
) -> None:
    """
    Format and print tool use information.

    Args:
        tool_name: Name of the tool being used
        thinking_time: Time elapsed since last event
        tool_input: Optional tool input to display
        max_input_len: Maximum length of input string to display
    """
    print(f"\n[Tool: {tool_name}] (after {thinking_time:.1f}s thinking)", flush=True)

    if tool_input is not None:
        input_str = str(tool_input)
        if len(input_str) > max_input_len:
            print(f"   Input: {input_str[:max_input_len]}...", flush=True)
        else:
            print(f"   Input: {input_str}", flush=True)


def format_tool_result_output(
    result_content: str,
    is_error: bool,
    execution_time: Optional[float] = None,
    max_error_len: int = 500
) -> None:
    """
    Format and print tool result information.

    Args:
        result_content: The content of the tool result
        is_error: Whether the result is an error
        execution_time: Optional execution time to display
        max_error_len: Maximum length of error string to display
    """
    time_suffix = f" (took {execution_time:.1f}s)" if execution_time is not None else ""

    # Check if command was blocked by security hook
    if "blocked" in str(result_content).lower():
        print(f"   [BLOCKED]{time_suffix} {result_content}", flush=True)
    elif is_error:
        # Show errors (truncated)
        error_str = str(result_content)[:max_error_len]
        print(f"   [Error]{time_suffix} {error_str}", flush=True)
    else:
        # Tool succeeded - just show brief confirmation
        print(f"   [Done]{time_suffix}", flush=True)


async def run_agent_session(
    client: ClaudeSDKClient,
    message: str,
    project_dir: Path,
) -> Tuple[SessionStatus, str, Optional[dict]]:
    """
    Run a single agent session using Claude Agent SDK.

    Args:
        client: Claude SDK client
        message: The prompt to send
        project_dir: Project directory path

    Returns:
        Tuple of (status, response_text, usage_data) where:
        - status indicates whether to continue or if an error occurred
        - response_text is the agent's text response
        - usage_data contains token usage information (or None if unavailable)
    """
    print("Sending prompt to Claude Agent SDK...\n")

    try:
        # Send the query and measure time
        start_time = time.time()
        await client.query(message)
        query_time = time.time() - start_time
        print(f"[Query sent in {query_time:.1f}s]\n")

        # Collect response text and show tool use
        response_text = ""
        last_event_time = time.time()
        tool_start_time: Optional[float] = None
        usage_data = None

        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            # Handle ResultMessage (contains usage information)
            if msg_type == "ResultMessage":
                usage_data = {
                    "usage": getattr(msg, "usage", None),
                    "total_cost_usd": getattr(msg, "total_cost_usd", None),
                    "duration_ms": getattr(msg, "duration_ms", 0),
                    "num_turns": getattr(msg, "num_turns", 0),
                    "session_id": getattr(msg, "session_id", "unknown"),
                }

            # Handle AssistantMessage (text and tool use)
            elif msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        # Calculate thinking time and format output
                        thinking_time = time.time() - last_event_time
                        tool_input = getattr(block, "input", None)
                        format_tool_use_output(block.name, thinking_time, tool_input)
                        tool_start_time = time.time()

            # Handle UserMessage (tool results)
            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    if type(block).__name__ == "ToolResultBlock":
                        result_content = getattr(block, "content", "")
                        is_error = getattr(block, "is_error", False)

                        # Calculate tool execution time
                        execution_time = None
                        if tool_start_time is not None:
                            execution_time = time.time() - tool_start_time

                        format_tool_result_output(result_content, is_error, execution_time)

                        # Update last event time for next thinking time calculation
                        last_event_time = time.time()
                        tool_start_time = None

        print("\n" + "-" * 70 + "\n")
        return SessionStatus.CONTINUE, response_text, usage_data

    except Exception as e:
        print(f"Error during agent session: {e}")
        return SessionStatus.ERROR, str(e), None


async def run_autonomous_testing_agent(
    project_dir: Path,
    model: str,
    max_iterations: Optional[int] = None,
) -> int:
    """
    Run the autonomous testing agent loop.

    Args:
        project_dir: Directory for the testing project
        model: Claude model to use
        max_iterations: Maximum number of iterations (None for unlimited)

    Returns:
        Exit code: 0 for success, 1 for all tests blocked, 2 for other failures
    """
    print("\n" + "=" * 70)
    print("  AUTONOMOUS TESTING AGENT DEMO")
    print("=" * 70)
    print(f"\nProject directory: {project_dir}")
    print(f"Model: {model}")
    if max_iterations:
        print(f"Max iterations: {max_iterations}")
    else:
        print("Max iterations: Unlimited (will run until completion)")
    print()

    # Create project directory
    project_dir.mkdir(parents=True, exist_ok=True)

    # Initialize token usage tracking
    pricing_calculator = PricingCalculator()
    usage_tracker = TokenUsageTracker(project_dir, pricing_calculator)

    # Check if this is a fresh start or continuation
    test_cases_file = project_dir / "test_cases.json"
    is_first_run = not test_cases_file.exists()

    if is_first_run:
        print("Fresh start - will use test planner agent")
        print()
        print("=" * 70)
        print("  NOTE: First session takes 5-10 minutes!")
        print("  The agent is generating 50 detailed test cases.")
        print("  This may appear to hang - it's working. Watch for [Tool: ...] output.")
        print("=" * 70)
        print()
        # Copy the test spec into the project directory for the agent to read
        copy_test_spec_to_project(project_dir)
        copy_templates_to_project(project_dir)
        copy_utils_to_project(project_dir)
    else:
        print("Continuing existing testing project")
        print_test_progress_summary(project_dir)

    # Main loop
    iteration = 0
    all_tests_blocked = False  # Track if all tests are blocked

    while True:
        iteration += 1

        # Check max iterations
        if max_iterations and iteration > max_iterations:
            print(f"\nReached max iterations ({max_iterations})")
            print("To continue, run the script again without --max-iterations")
            break

        # Print session header
        print_test_session_header(iteration, is_first_run)

        # Create client (fresh context)
        client = create_client(project_dir, model)

        # Choose prompt based on session type
        current_session_type = "test_planner" if is_first_run else "test_executor"
        if is_first_run:
            prompt = get_test_planner_prompt()
            is_first_run = False  # Only use test planner once
        else:
            prompt = get_test_executor_prompt()

        # Run session with async context manager
        async with client:
            status, response, usage_data = await run_agent_session(client, prompt, project_dir)

        # Explicitly cleanup client to ensure MCP server processes are terminated
        try:
            await client.cleanup()
            print("[Cleanup] Client resources released")
        except Exception as e:
            print(f"[Cleanup] Warning: {e}")

        # Give processes time to terminate gracefully
        await asyncio.sleep(0.5)

        # Record usage statistics if available
        if usage_data and usage_data.get("usage"):
            try:
                session_record = usage_tracker.record_session(
                    session_id=usage_data["session_id"],
                    session_type=current_session_type,
                    model=model,
                    duration_ms=usage_data["duration_ms"],
                    num_turns=usage_data["num_turns"],
                    tokens=usage_data["usage"],
                )
                usage_tracker.display_session_stats(session_record)
            except Exception as e:
                print(f"[Warning] Failed to record usage statistics: {e}")
        else:
            print("[Warning] No usage data available for this session")

        # Handle status
        if status == SessionStatus.CONTINUE:
            print(f"\nAgent will auto-continue in {AUTO_CONTINUE_DELAY_SECONDS}s...")
            print_test_progress_summary(project_dir)

            # Check if all tests are completed
            stats = count_test_cases(project_dir)

            if stats['not_run'] == 0 and stats['total'] > 0:
                # Check if all tests are blocked (critical blocker scenario)
                if stats['blocked'] == stats['total']:
                    all_tests_blocked = True
                    print("\n" + "=" * 70)
                    print("  ⚠️  ALL TESTS BLOCKED!")
                    print("=" * 70)
                    print(f"\n  Total: {stats['total']}")
                    print(f"  Blocked: {stats['blocked']}")
                    print("\n  ❌ Cannot proceed due to blocking issues.")
                    print("  All test cases are blocked by infrastructure or dependencies.")
                    print("  Review defect reports and resolve blockers before retrying.")
                    print("=" * 70)
                    break

                # Normal completion: at least some tests passed or failed
                print("\n" + "=" * 70)
                print("  ALL TESTS COMPLETED!")
                print("=" * 70)
                print(f"\n  Total: {stats['total']}")
                print(f"  Passed: {stats['passed']}")
                print(f"  Failed: {stats['failed']}")
                print(f"  Blocked: {stats['blocked']}")
                print("\n  All test cases have been executed.")
                print("  Final reports should have been generated by the agent.")
                print("=" * 70)
                break

            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        elif status == SessionStatus.ERROR:
            print("\nSession encountered an error")
            print("Will retry with a fresh session...")
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        # Small delay between sessions
        if max_iterations is None or iteration < max_iterations:
            print("\nPreparing next session...\n")
            await asyncio.sleep(1)

    # Final summary
    print("\n" + "=" * 70)
    print("  TESTING SESSION COMPLETE")
    print("=" * 70)
    print(f"\nProject directory: {project_dir}")
    print_test_progress_summary(project_dir)

    # Generate cost report
    try:
        report_generator = CostReportGenerator(usage_tracker)
        cost_report = report_generator.generate_markdown_report()

        # Find latest test-reports directory
        test_reports_dir = project_dir / "test-reports"
        if test_reports_dir.exists():
            report_dirs = sorted(test_reports_dir.glob("*"), key=lambda p: p.stat().st_mtime)
            if report_dirs:
                latest_report_dir = report_dirs[-1]
                cost_report_path = latest_report_dir / "cost_statistics.md"
                cost_report_path.write_text(cost_report)
                print(f"\n[Cost Report] Saved to: {cost_report_path}")
            else:
                # No test reports yet, save to project root
                cost_report_path = project_dir / "cost_statistics.md"
                cost_report_path.write_text(cost_report)
                print(f"\n[Cost Report] Saved to: {cost_report_path}")
        else:
            # No test-reports directory, save to project root
            cost_report_path = project_dir / "cost_statistics.md"
            cost_report_path.write_text(cost_report)
            print(f"\n[Cost Report] Saved to: {cost_report_path}")
    except Exception as e:
        print(f"\n[Warning] Failed to generate cost report: {e}")

    # Post-process HTML report to update cost statistics
    try:
        update_html_report_cost_statistics(project_dir)
    except Exception as e:
        print(f"\n[Warning] Failed to update HTML report cost statistics: {e}")

    # Print instructions for viewing test reports
    print("\n" + "-" * 70)
    print("  TO VIEW TEST REPORTS:")
    print("-" * 70)
    print(f"\n  cd {project_dir.resolve()}/test-reports")
    print("  # Open the HTML report viewer in a browser")
    print("  # Or browse the markdown reports in test-case-reports/ and defect-reports/")
    print("  # View cost statistics in cost_statistics.md")
    print("-" * 70)

    print("\nDone!")

    # Return appropriate exit code
    if all_tests_blocked:
        return 1  # All tests blocked
    return 0  # Success
