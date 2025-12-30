"""
Tools Configuration
===================

Configuration for Claude Code built-in tools and permissions.
"""

from typing import List


# Built-in tools available to Claude
BUILTIN_TOOLS = [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
]

# Chrome DevTools MCP tools for browser automation
CHROME_DEVTOOLS_TOOLS = [
    "mcp__chrome-devtools__navigate_page",
    "mcp__chrome-devtools__take_screenshot",
    "mcp__chrome-devtools__take_snapshot",
    "mcp__chrome-devtools__click",
    "mcp__chrome-devtools__fill",
    "mcp__chrome-devtools__fill_form",
    "mcp__chrome-devtools__wait_for",
    "mcp__chrome-devtools__list_network_requests",
    "mcp__chrome-devtools__get_network_request",
    "mcp__chrome-devtools__list_console_messages",
    "mcp__chrome-devtools__get_console_message",
    "mcp__chrome-devtools__list_pages",
    "mcp__chrome-devtools__new_page",
    "mcp__chrome-devtools__select_page",
    "mcp__chrome-devtools__close_page",
    "mcp__chrome-devtools__resize_page",
    "mcp__chrome-devtools__hover",
    "mcp__chrome-devtools__drag",
    "mcp__chrome-devtools__press_key",
    "mcp__chrome-devtools__handle_dialog",
    "mcp__chrome-devtools__evaluate_script",
    "mcp__chrome-devtools__emulate",
    "mcp__chrome-devtools__upload_file",
]

# Additional tools for skills support
SKILL_TOOLS = [
    "Skill",
]


def get_builtin_tools() -> List[str]:
    """Get the list of built-in tools."""
    return BUILTIN_TOOLS.copy()


def get_chrome_devtools_tools() -> List[str]:
    """Get the list of Chrome DevTools MCP tools."""
    return CHROME_DEVTOOLS_TOOLS.copy()


def get_skill_tools() -> List[str]:
    """Get the list of skill-related tools."""
    return SKILL_TOOLS.copy()


def get_all_allowed_tools() -> List[str]:
    """
    Get all tools that should be allowed by default.

    Returns:
        Combined list of built-in, Chrome DevTools, and skill tools
    """
    return [
        *BUILTIN_TOOLS,
        *CHROME_DEVTOOLS_TOOLS,
        *SKILL_TOOLS,
    ]


def get_default_permissions(chrome_devtools_tools: List[str] = None) -> List[str]:
    """
    Get default permission rules for the security settings.

    Args:
        chrome_devtools_tools: Optional list of Chrome DevTools tools to include

    Returns:
        List of permission rules
    """
    tools = chrome_devtools_tools or CHROME_DEVTOOLS_TOOLS

    return [
        # Allow all file operations within the project directory
        "Read(./**)",
        "Write(./**)",
        "Edit(./**)",
        "Glob(./**)",
        "Grep(./**)",
        # Bash permission
        "Bash(*)",
        # Chrome DevTools MCP tools for browser automation
        *tools,
    ]
