#!/usr/bin/env python3
"""
JSON Helper Utilities for Test Case Management

Provides safe, robust utilities for reading, counting, and updating test_cases.json
without the fragility of grep/sed text processing.
"""

import json
import os
import re
import sys
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Any

# Security constants
MAX_JSON_FILE_SIZE = 20 * 1024 * 1024  # 20MB maximum file size limit
ALLOWED_JSON_FILENAMES = {'test_cases.json', 'test_env.json', 'usage_statistics.json'}


def validate_json_path(json_path: str, allow_write: bool = False) -> Path:
    """
    Validate and sanitize JSON file path to prevent path traversal attacks.

    Args:
        json_path: File path to validate
        allow_write: Whether write operations are allowed

    Returns:
        Validated Path object

    Raises:
        ValueError: If path is invalid or poses security risk
    """
    path = Path(json_path)

    # Check if path contains path traversal sequences
    path_str = str(path)
    if '..' in path_str:
        raise ValueError(f"Path traversal detected in path: {json_path}")

    # Get absolute path
    abs_path = path.resolve()

    # Get current working directory
    cwd = Path.cwd().resolve()

    # Ensure path is within current working directory or its subdirectories
    try:
        abs_path.relative_to(cwd)
    except ValueError:
        raise ValueError(f"Path must be within current working directory: {json_path}")

    # Check if filename is in allowed list (stricter for CLI mode)
    filename = abs_path.name
    if filename not in ALLOWED_JSON_FILENAMES:
        # Allow .bak backup files
        if not filename.endswith('.bak'):
            raise ValueError(f"Invalid filename. Allowed: {', '.join(ALLOWED_JSON_FILENAMES)}")

    return abs_path


def check_file_size(file_path: Path) -> None:
    """
    Check if file size is within allowed limits.

    Args:
        file_path: File path

    Raises:
        ValueError: If file is too large
    """
    if file_path.exists():
        file_size = file_path.stat().st_size
        if file_size > MAX_JSON_FILE_SIZE:
            raise ValueError(
                f"File too large: {file_size} bytes (max: {MAX_JSON_FILE_SIZE} bytes)"
            )


def read_test_cases(json_path: str = "test_cases.json") -> List[Dict[str, Any]]:
    """
    Safely read test_cases.json file.

    Args:
        json_path: Path to test_cases.json (default: ./test_cases.json)

    Returns:
        List of test case dictionaries

    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file is not valid JSON
        ValueError: If path validation fails or file is too large
    """
    # Validate path security
    validated_path = validate_json_path(json_path)

    # Check file size
    check_file_size(validated_path)

    with open(validated_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Validate return data type
    if not isinstance(data, list):
        raise ValueError(f"Expected list of test cases, got {type(data).__name__}")

    return data


def write_test_cases(test_cases: List[Dict[str, Any]], json_path: str = "test_cases.json") -> None:
    """
    Safely write test_cases.json with backup.

    Args:
        test_cases: List of test case dictionaries
        json_path: Path to test_cases.json (default: ./test_cases.json)

    Raises:
        ValueError: If path validation fails
        TypeError: If test_cases is not a list
    """
    # Validate input type
    if not isinstance(test_cases, list):
        raise TypeError(f"test_cases must be a list, got {type(test_cases).__name__}")

    # Validate path security
    validated_path = validate_json_path(json_path, allow_write=True)

    # Create backup before writing
    backup_path = validated_path.with_suffix('.json.bak')
    if validated_path.exists():
        shutil.copy2(validated_path, backup_path)

    # Write with pretty formatting
    with open(validated_path, 'w', encoding='utf-8') as f:
        json.dump(test_cases, f, indent=2, ensure_ascii=False)


def count_by_status(status: str, json_path: str = "test_cases.json") -> int:
    """
    Count test cases by status.

    Args:
        status: Status to count ("Not Run", "Pass", "Fail", "Blocked")
        json_path: Path to test_cases.json

    Returns:
        Count of test cases with specified status
    """
    test_cases = read_test_cases(json_path)
    return sum(1 for tc in test_cases if tc.get('status') == status)


def get_test_case_by_id(case_id: str, json_path: str = "test_cases.json") -> Optional[Dict[str, Any]]:
    """
    Find a test case by case_id.

    Args:
        case_id: Test case ID (e.g., "TC-001")
        json_path: Path to test_cases.json

    Returns:
        Test case dictionary or None if not found
    """
    test_cases = read_test_cases(json_path)
    for tc in test_cases:
        if tc.get('case_id') == case_id:
            return tc
    return None


def update_test_case(
    case_id: str,
    status: Optional[str] = None,
    actual_result: Optional[str] = None,
    defect_ids: Optional[List[str]] = None,
    screenshots: Optional[List[str]] = None,
    logs: Optional[List[str]] = None,
    json_path: str = "test_cases.json"
) -> bool:
    """
    Update a test case by case_id.

    Args:
        case_id: Test case ID to update
        status: New status ("Pass", "Fail", "Blocked", "Not Run")
        actual_result: Description of actual result
        defect_ids: List of associated defect IDs
        screenshots: List of screenshot filenames
        logs: List of log filenames
        json_path: Path to test_cases.json

    Returns:
        True if update succeeded, False if case_id not found
    """
    test_cases = read_test_cases(json_path)

    # Find the test case
    test_case = None
    for tc in test_cases:
        if tc.get('case_id') == case_id:
            test_case = tc
            break

    if not test_case:
        print(f"Error: Test case {case_id} not found", file=sys.stderr)
        return False

    # Update fields (only update if provided)
    if status is not None:
        test_case['status'] = status

    if actual_result is not None:
        test_case['actual_result'] = actual_result

    if defect_ids is not None:
        test_case['defect_ids'] = defect_ids

    # Update evidence
    if 'evidence' not in test_case:
        test_case['evidence'] = {"screenshots": [], "logs": []}

    if screenshots is not None:
        test_case['evidence']['screenshots'] = screenshots

    if logs is not None:
        test_case['evidence']['logs'] = logs

    # Write back to file
    write_test_cases(test_cases, json_path)
    return True


def get_test_statistics(json_path: str = "test_cases.json") -> Dict[str, int]:
    """
    Get comprehensive test statistics.

    Args:
        json_path: Path to test_cases.json

    Returns:
        Dictionary with counts by status
    """
    test_cases = read_test_cases(json_path)

    stats = {
        "total": len(test_cases),
        "Not Run": 0,
        "Pass": 0,
        "Fail": 0,
        "Blocked": 0
    }

    for tc in test_cases:
        status = tc.get('status', 'Not Run')
        if status in stats:
            stats[status] += 1

    return stats


def list_tests_by_status(status: str, json_path: str = "test_cases.json") -> List[str]:
    """
    List test case IDs by status.

    Args:
        status: Status to filter by
        json_path: Path to test_cases.json

    Returns:
        List of case_ids with specified status
    """
    test_cases = read_test_cases(json_path)
    return [tc['case_id'] for tc in test_cases if tc.get('status') == status]


# CLI input validation constants and functions
VALID_STATUSES = {'Not Run', 'Pass', 'Fail', 'Blocked'}
CASE_ID_PATTERN = re.compile(r'^TC-\d{1,4}$')


def validate_status(status: str) -> str:
    """Validate if status value is valid."""
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}. Must be one of: {', '.join(VALID_STATUSES)}")
    return status


def validate_case_id(case_id: str) -> str:
    """Validate test case ID format."""
    if not CASE_ID_PATTERN.match(case_id):
        raise ValueError(f"Invalid case_id format: {case_id}. Expected format: TC-XXX (e.g., TC-001)")
    return case_id


def validate_list_input(value: str) -> List[str]:
    """Validate and parse comma-separated list input."""
    items = [item.strip() for item in value.split(',') if item.strip()]
    # Check for dangerous characters
    for item in items:
        if any(char in item for char in ['..', '/', '\\', '\x00', '\n', '\r']):
            raise ValueError(f"Invalid characters in list item: {item}")
    return items


# CLI interface
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python json_helper.py count <status>")
        print("  python json_helper.py stats")
        print("  python json_helper.py list <status>")
        print("  python json_helper.py get <case_id>")
        print("  python json_helper.py update <case_id> --status <status> --actual-result <result> ...")
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "count":
            if len(sys.argv) < 3:
                print("Usage: python json_helper.py count <status>", file=sys.stderr)
                sys.exit(1)
            status = validate_status(sys.argv[2])
            count = count_by_status(status)
            print(count)

        elif command == "stats":
            stats = get_test_statistics()
            print(f"Total: {stats['total']}")
            print(f"Not Run: {stats['Not Run']}")
            print(f"Pass: {stats['Pass']}")
            print(f"Fail: {stats['Fail']}")
            print(f"Blocked: {stats['Blocked']}")

        elif command == "list":
            if len(sys.argv) < 3:
                print("Usage: python json_helper.py list <status>", file=sys.stderr)
                sys.exit(1)
            status = validate_status(sys.argv[2])
            case_ids = list_tests_by_status(status)
            for case_id in case_ids:
                print(case_id)

        elif command == "get":
            if len(sys.argv) < 3:
                print("Usage: python json_helper.py get <case_id>", file=sys.stderr)
                sys.exit(1)
            case_id = validate_case_id(sys.argv[2])
            test_case = get_test_case_by_id(case_id)
            if test_case:
                print(json.dumps(test_case, indent=2))
            else:
                print(f"Test case {case_id} not found", file=sys.stderr)
                sys.exit(1)

        elif command == "update":
            if len(sys.argv) < 3:
                print("Usage: python json_helper.py update <case_id> [options]", file=sys.stderr)
                sys.exit(1)

            case_id = validate_case_id(sys.argv[2])

            # Parse arguments
            kwargs = {}
            i = 3
            while i < len(sys.argv):
                arg = sys.argv[i]
                if arg == "--status" and i + 1 < len(sys.argv):
                    kwargs['status'] = validate_status(sys.argv[i + 1])
                    i += 2
                elif arg == "--actual-result" and i + 1 < len(sys.argv):
                    kwargs['actual_result'] = sys.argv[i + 1]
                    i += 2
                elif arg == "--defect-ids" and i + 1 < len(sys.argv):
                    kwargs['defect_ids'] = validate_list_input(sys.argv[i + 1])
                    i += 2
                elif arg == "--screenshots" and i + 1 < len(sys.argv):
                    kwargs['screenshots'] = validate_list_input(sys.argv[i + 1])
                    i += 2
                elif arg == "--logs" and i + 1 < len(sys.argv):
                    kwargs['logs'] = validate_list_input(sys.argv[i + 1])
                    i += 2
                else:
                    i += 1

            success = update_test_case(case_id, **kwargs)
            if success:
                print(f"Successfully updated {case_id}")
            else:
                sys.exit(1)

        else:
            print(f"Unknown command: {command}", file=sys.stderr)
            sys.exit(1)

    except ValueError as e:
        print(f"Validation error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
