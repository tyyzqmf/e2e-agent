"""
Claude SDK Client Configuration
===============================

Functions for creating and configuring the Claude Agent SDK client.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

# Import from refactored modules (support both package and direct imports)
try:
    from .skills import (
        DEFAULT_PLUGINS_DIR,
        collect_plugin_directories,
        load_skill_content,
    )
    from .tools import (
        CHROME_DEVTOOLS_TOOLS,
        get_all_allowed_tools,
        get_default_permissions,
    )
    from .mcp_servers import get_default_mcp_servers
    from .hooks import (
        create_context_management_hooks,
        CONTEXT_MANAGEMENT_PROMPT,
    )
except ImportError:
    from skills import (
        DEFAULT_PLUGINS_DIR,
        collect_plugin_directories,
        load_skill_content,
    )
    from tools import (
        CHROME_DEVTOOLS_TOOLS,
        get_all_allowed_tools,
        get_default_permissions,
    )
    from mcp_servers import get_default_mcp_servers
    from hooks import (
        create_context_management_hooks,
        CONTEXT_MANAGEMENT_PROMPT,
    )


# Configuration Constants
SETTINGS_FILENAME = ".claude_settings.json"
BEDROCK_ENV_VARS = ("true", "1", "yes")
# With 1M context window enabled (betas=["context-1m-2025-08-07"]),
# we can handle more turns. Each turn with browser automation can consume 50-100K tokens.
MAX_TURNS = 100

# Default system prompt
DEFAULT_SYSTEM_PROMPT = (
    "You are an expert full-stack developer and QA engineer "
    "with deep expertise in end-to-end testing."
)


def get_aws_region() -> str:
    """
    Get AWS region from environment variables.

    Returns:
        AWS region string

    Raises:
        ValueError: If AWS region is not configured
    """
    aws_region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if not aws_region:
        raise ValueError(
            "AWS_REGION or AWS_DEFAULT_REGION environment variable not set.\n"
            "Set your AWS region for Bedrock (e.g., us-east-1, us-west-2)"
        )
    return aws_region


def validate_aws_credentials() -> None:
    """
    Validate that AWS credentials are available.

    Raises:
        ValueError: If AWS credentials are not configured or invalid
    """
    try:
        session = boto3.Session()
        credentials = session.get_credentials()
        if credentials is None:
            raise ValueError(
                "AWS credentials not found.\n"
                "Configure AWS credentials using one of:\n"
                "  1. AWS CLI: aws configure\n"
                "  2. Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY\n"
                "  3. IAM role (if running on EC2/ECS/Lambda)"
            )
    except Exception as e:
        raise ValueError(f"Failed to validate AWS credentials: {e}")


def create_security_settings(project_dir: Path) -> Dict[str, Any]:
    """
    Create comprehensive security settings for the Claude SDK client.

    Args:
        project_dir: Project directory path

    Returns:
        Dictionary containing security settings
    """
    return {
        "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
        "permissions": {
            "defaultMode": "allow",
            "allow": get_default_permissions(CHROME_DEVTOOLS_TOOLS),
        },
    }


def write_security_settings(project_dir: Path, settings: Dict[str, Any]) -> Path:
    """
    Write security settings to a file in the project directory.

    Args:
        project_dir: Project directory path
        settings: Security settings dictionary

    Returns:
        Path to the created settings file
    """
    project_dir.mkdir(parents=True, exist_ok=True)

    settings_file = project_dir / SETTINGS_FILENAME
    with open(settings_file, "w") as f:
        json.dump(settings, f, indent=2)

    return settings_file


def print_client_configuration(
    settings_file: Path,
    use_bedrock: bool,
    aws_region: Optional[str] = None,
) -> None:
    """
    Print client configuration information.

    Args:
        settings_file: Path to settings file
        use_bedrock: Whether using AWS Bedrock
        aws_region: AWS region if using Bedrock
    """
    print(f"Created security settings at {settings_file}")
    if use_bedrock:
        print(f"   - Using AWS Bedrock (region: {aws_region})")
    else:
        print("   - Using Anthropic API")
    print("   - Sandbox enabled (OS-level bash isolation)")
    print(f"   - Filesystem restricted to: {settings_file.parent.resolve()}")
    print("   - Bash commands restricted to allowlist (see security.py)")
    print("   - MCP servers: chrome-devtools (browser automation)")
    print()


def _configure_authentication() -> tuple[bool, Optional[str], Dict[str, str]]:
    """
    Configure authentication for AWS Bedrock or Anthropic API.

    Returns:
        Tuple of (use_bedrock, aws_region, env_vars)

    Raises:
        ValueError: If no valid authentication is configured
    """
    use_bedrock = os.environ.get("USE_AWS_BEDROCK", "").lower() in BEDROCK_ENV_VARS
    aws_region = None
    env_vars: Dict[str, str] = {}

    if use_bedrock:
        aws_region = get_aws_region()
        validate_aws_credentials()

        print(f"Using AWS Bedrock in region: {aws_region}")
        print("AWS credentials validated successfully")

        os.environ["AWS_REGION"] = aws_region
        env_vars["CLAUDE_CODE_USE_BEDROCK"] = "true"
        env_vars["AWS_REGION"] = aws_region
    else:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable not set.\n"
                "Get your API key from: https://console.anthropic.com/\n"
                "Or set USE_AWS_BEDROCK=true to use AWS Bedrock instead."
            )

    return use_bedrock, aws_region, env_vars


def create_client(
    project_dir: Path,
    model: str,
    skills: Optional[List[str]] = None,
    plugin_dirs: Optional[List[Path]] = None,
    skill_content: Optional[str] = None,
    system_prompt: Optional[str] = None,
    append_system_prompt: Optional[str] = None,
    load_default_skills: bool = True,
) -> ClaudeSDKClient:
    """
    Create a Claude Agent SDK client with multi-layered security.

    By default, this client loads the frontend-design skill for creating
    distinctive, production-grade frontend interfaces.

    Args:
        project_dir: Directory for the project
        model: Claude model to use
        skills: Optional list of skill names to load (e.g., ["frontend-design"])
        plugin_dirs: Optional list of plugin directories to load
        skill_content: Optional skill content (SKILL.md) to embed in system prompt
        system_prompt: Optional custom system prompt (replaces default)
        append_system_prompt: Optional text to append to the system prompt
        load_default_skills: Whether to load default skills (frontend-design).
                            Set to False to disable. Default: True

    Returns:
        Configured ClaudeSDKClient

    Security layers (defense in depth):
    1. Sandbox - OS-level bash command isolation prevents filesystem escape
    2. Permissions - File operations restricted to project_dir only
    3. Security hooks - Bash commands validated against an allowlist

    Example:
        # Default behavior (loads frontend-design skill)
        client = create_client(
            project_dir=Path("./my_project"),
            model="claude-sonnet-4-5-20250929",
        )

        # Load specific skills by name
        client = create_client(
            project_dir=Path("./my_project"),
            model="claude-sonnet-4-5-20250929",
            skills=["frontend-design", "xlsx"],
        )

        # Load skill from content
        skill_md = open("path/to/SKILL.md").read()
        client = create_client(
            project_dir=Path("./my_project"),
            model="claude-sonnet-4-5-20250929",
            skill_content=skill_md,
        )

        # Disable default skills
        client = create_client(
            project_dir=Path("./my_project"),
            model="claude-sonnet-4-5-20250929",
            load_default_skills=False,
        )
    """
    # Configure authentication
    use_bedrock, aws_region, env_vars = _configure_authentication()

    # Create and write security settings
    security_settings = create_security_settings(project_dir)
    settings_file = write_security_settings(project_dir, security_settings)
    print_client_configuration(settings_file, use_bedrock, aws_region)

    # Collect plugin directories from skill names
    all_plugin_dirs: List[Path] = list(plugin_dirs) if plugin_dirs else []

    if skills:
        for skill_name in skills:
            skill_plugin_path = DEFAULT_PLUGINS_DIR / skill_name
            if skill_plugin_path.exists():
                all_plugin_dirs.append(skill_plugin_path)
            else:
                print(f"Warning: Skill '{skill_name}' not found in {DEFAULT_PLUGINS_DIR}")

    # Collect and validate plugin directories
    validated_plugin_dirs = collect_plugin_directories(
        plugin_dirs=all_plugin_dirs if all_plugin_dirs else None,
        load_default_skills=load_default_skills,
        verbose=True,
    )

    # Build extra_args for CLI
    extra_args: Dict[str, str | None] = {}
    if validated_plugin_dirs:
        extra_args["plugin-dir"] = " ".join(validated_plugin_dirs)

    # Build final system prompt (merge base + append + skill content + context management)
    final_system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT

    # Append additional content to system prompt
    if append_system_prompt:
        final_system_prompt = f"{final_system_prompt}\n\n{append_system_prompt}"
    if skill_content:
        final_system_prompt = f"{final_system_prompt}\n\n{skill_content}"

    # Add context management guidelines to prevent "input too long" errors
    final_system_prompt = f"{final_system_prompt}\n\n{CONTEXT_MANAGEMENT_PROMPT}"

    # Create context management hooks
    context_hooks = create_context_management_hooks()

    return ClaudeSDKClient(
        options=ClaudeAgentOptions(
            model=model,
            system_prompt=final_system_prompt,
            allowed_tools=get_all_allowed_tools(),
            mcp_servers=get_default_mcp_servers(),
            max_turns=MAX_TURNS,
            max_buffer_size=10 * 1024 * 1024,  # 10MB buffer for large responses
            cwd=str(project_dir.resolve()),
            settings=str(settings_file.resolve()),
            env=env_vars,
            extra_args=extra_args,
            hooks=context_hooks,  # Add context management hooks
            betas=["context-1m-2025-08-07"],  # Enable 1M token context window
        )
    )
