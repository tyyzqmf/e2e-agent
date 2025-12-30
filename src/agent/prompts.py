"""
Prompt Loading Utilities
========================

Functions for loading prompt templates from the prompts directory.
"""

import logging
import shutil
from pathlib import Path
from typing import Union

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directory Constants
PROMPTS_DIR = Path(__file__).parent / "prompts"
TEMPLATES_DIR = Path(__file__).parent / "templates"
UTILS_DIR = Path(__file__).parent / "utils"
ROOT_DIR = Path(__file__).parent.parent  # Project root (parent of src/)


def validate_project_directory(project_dir: Path) -> Path:
    """
    Validate that the project directory is within expected boundaries.

    Args:
        project_dir: The project directory path to validate

    Returns:
        Resolved absolute path

    Raises:
        ValueError: If the path is outside expected boundaries
    """
    # Resolve to absolute path
    resolved_path = project_dir.resolve()

    # Get the expected parent directory (generations folder or cwd)
    cwd = Path.cwd().resolve()
    expected_parents = [
        cwd / "generations",
        cwd / "autonomous_demo_project",
        cwd / "data" / "reports",
        cwd,
    ]

    # Check if the path is within any of the expected parent directories
    is_valid = any(
        str(resolved_path).startswith(str(parent))
        for parent in expected_parents
    )

    if not is_valid:
        raise ValueError(
            f"Invalid project directory: {project_dir}\n"
            f"Project directory must be within: {', '.join(str(p) for p in expected_parents)}"
        )

    logger.info(f"Validated project directory: {resolved_path}")
    return resolved_path


def validate_dest_name(dest_name: str) -> str:
    """
    Validate destination name to prevent path traversal attacks.

    Args:
        dest_name: The destination filename or directory name

    Returns:
        Validated destination name

    Raises:
        ValueError: If dest_name contains path traversal sequences or invalid characters
    """
    # Check for path traversal sequences
    if '..' in dest_name:
        raise ValueError(f"Path traversal detected in dest_name: {dest_name}")

    # Check for absolute paths
    if dest_name.startswith('/') or dest_name.startswith('\\'):
        raise ValueError(f"Absolute paths not allowed in dest_name: {dest_name}")

    # Check for null bytes (could be used to bypass checks)
    if '\x00' in dest_name:
        raise ValueError(f"Null bytes not allowed in dest_name: {dest_name}")

    # Check for other dangerous characters
    dangerous_chars = ['<', '>', ':', '"', '|', '?', '*']
    for char in dangerous_chars:
        if char in dest_name:
            raise ValueError(f"Invalid character '{char}' in dest_name: {dest_name}")

    return dest_name


def load_prompt(name: str) -> str:
    """
    Load a prompt template from the prompts directory.

    Args:
        name: Name of the prompt file (without .md extension)

    Returns:
        Content of the prompt template
    """
    prompt_path = PROMPTS_DIR / f"{name}.md"
    return prompt_path.read_text()


def get_test_planner_prompt() -> str:
    """
    Load the test planner prompt.

    Returns:
        Test planner prompt content
    """
    return load_prompt("test_planner_prompt")


def get_test_executor_prompt() -> str:
    """
    Load the test executor agent prompt.

    Returns:
        Test executor prompt content
    """
    return load_prompt("test_executor_prompt")


def copy_to_project(
    project_dir: Path,
    source_path: Path,
    dest_name: str,
    is_directory: bool = False
) -> None:
    """
    Copy a file or directory to the project directory if it doesn't exist.

    Args:
        project_dir: Project directory to copy to
        source_path: Source file or directory path
        dest_name: Destination name (relative to project_dir)
        is_directory: Whether the source is a directory

    Raises:
        ValueError: If project directory or dest_name validation fails
    """
    # Validate project directory to prevent path traversal
    validated_dir = validate_project_directory(project_dir)

    # Validate dest_name to prevent path traversal
    validated_dest_name = validate_dest_name(dest_name)

    dest_path = validated_dir / validated_dest_name

    # Additional safety check: ensure resolved path is still within validated_dir
    dest_path_resolved = dest_path.resolve()
    validated_dir_resolved = validated_dir.resolve()
    if not str(dest_path_resolved).startswith(str(validated_dir_resolved)):
        raise ValueError(
            f"Destination path escapes project directory: {dest_name}"
        )

    if dest_path.exists():
        logger.debug(f"{validated_dest_name} already exists in project directory")
        return

    try:
        if is_directory:
            shutil.copytree(source_path, dest_path)
        else:
            shutil.copy(source_path, dest_path)

        logger.info(f"Copied {validated_dest_name} to project directory")
        print(f"Copied {validated_dest_name} to project directory")
    except Exception as e:
        logger.error(f"Failed to copy {validated_dest_name}: {e}")
        raise


def copy_test_spec_to_project(project_dir: Path) -> None:
    """
    Copy the test spec file into the project directory for the agent to read.

    Args:
        project_dir: Target project directory
    """
    copy_to_project(
        project_dir,
        ROOT_DIR / "test_spec.txt",
        "test_spec.txt",
        is_directory=False
    )




def copy_templates_to_project(project_dir: Path) -> None:
    """
    Copy the templates into the project directory for the agent to read.

    Args:
        project_dir: Target project directory
    """
    copy_to_project(
        project_dir,
        TEMPLATES_DIR,
        "templates",
        is_directory=True
    )


def copy_utils_to_project(project_dir: Path) -> None:
    """
    Copy the utils directory into the project directory for the agent to use.

    This includes json_helper.py and other utility scripts that the agent
    needs during test execution.

    Args:
        project_dir: Target project directory
    """
    copy_to_project(
        project_dir,
        UTILS_DIR,
        "utils",
        is_directory=True
    )
