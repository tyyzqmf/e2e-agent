"""
MCP Servers Configuration
=========================

Configuration for Model Context Protocol (MCP) servers used by Claude.
"""

from typing import Any, Dict, List, Optional


# Default Chrome executable path
CHROME_EXECUTABLE_PATH = "/usr/bin/google-chrome"

# Default Chrome arguments for headless operation in containerized environments
DEFAULT_CHROME_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]


def get_chrome_devtools_config(
    headless: bool = True,
    executable_path: str = CHROME_EXECUTABLE_PATH,
    isolated: bool = True,
    extra_chrome_args: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Get Chrome DevTools MCP server configuration.

    Args:
        headless: Whether to run Chrome in headless mode
        executable_path: Path to Chrome/Chromium executable
        isolated: Whether to run in isolated mode
        extra_chrome_args: Additional Chrome arguments

    Returns:
        MCP server configuration dictionary
    """
    args = [
        "-y",
        "chrome-devtools-mcp@latest",
    ]

    if headless:
        args.append("--headless")

    args.append(f"--executablePath={executable_path}")

    if isolated:
        args.append("--isolated=true")

    # Add default Chrome args
    for chrome_arg in DEFAULT_CHROME_ARGS:
        args.append(f"--chromeArg={chrome_arg}")

    # Add extra Chrome args if provided
    if extra_chrome_args:
        for chrome_arg in extra_chrome_args:
            args.append(f"--chromeArg={chrome_arg}")

    return {
        "command": "npx",
        "args": args,
    }


def get_default_mcp_servers(
    include_chrome_devtools: bool = True,
    chrome_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Get default MCP server configurations.

    Args:
        include_chrome_devtools: Whether to include Chrome DevTools server
        chrome_config: Optional custom Chrome DevTools configuration

    Returns:
        Dictionary of MCP server configurations
    """
    servers: Dict[str, Dict[str, Any]] = {}

    if include_chrome_devtools:
        servers["chrome-devtools"] = chrome_config or get_chrome_devtools_config()

    return servers


def create_custom_mcp_server(
    command: str,
    args: Optional[List[str]] = None,
    env: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Create a custom MCP server configuration.

    Args:
        command: The command to run the MCP server
        args: Optional list of arguments
        env: Optional environment variables

    Returns:
        MCP server configuration dictionary
    """
    config: Dict[str, Any] = {"command": command}

    if args:
        config["args"] = args

    if env:
        config["env"] = env

    return config
