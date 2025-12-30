"""
Context Management Hooks
========================

Hooks for managing context size and preventing "input too long" errors.
"""

import json
from typing import Any, Dict, Optional

from claude_agent_sdk.types import (
    HookMatcher,
    PostToolUseHookInput,
    PreCompactHookInput,
    HookContext,
    AsyncHookJSONOutput,
)


# Configuration Constants
MAX_SNAPSHOT_LENGTH = 50000  # Maximum characters for take_snapshot output
MAX_TOOL_OUTPUT_LENGTH = 100000  # Maximum characters for any tool output
TRUNCATION_NOTICE = "\n\n[Content truncated due to size limits. Use targeted selectors for specific elements.]"



async def truncate_large_tool_output(
    hook_input: PostToolUseHookInput,
    output: Optional[str],
    context: HookContext,
) -> AsyncHookJSONOutput:
    """
    PostToolUse hook to truncate large tool outputs, especially from take_snapshot.

    This prevents "input too long" errors by limiting the size of tool outputs
    that get added to the conversation context.

    Args:
        hook_input: Information about the tool that was used
        output: The tool's output (not used in PostToolUse)
        context: Hook context with session information

    Returns:
        Hook output that may modify the tool result
    """
    tool_name = hook_input.get("tool_name", "")
    tool_result = hook_input.get("tool_result", {})

    # Get the content from the tool result
    content = tool_result.get("content", "")
    if isinstance(content, dict):
        content = json.dumps(content)
    elif not isinstance(content, str):
        content = str(content)

    # Determine max length based on tool type
    if "take_snapshot" in tool_name:
        max_length = MAX_SNAPSHOT_LENGTH
    else:
        max_length = MAX_TOOL_OUTPUT_LENGTH

    # Check if truncation is needed
    if len(content) > max_length:
        print(f"[Hook] Truncating {tool_name} output from {len(content)} to {max_length} chars")

        truncated_content = content[:max_length] + TRUNCATION_NOTICE

        # Return modified result - use "approve" not "allow"
        return {
            "outputToUser": f"[Context Management] Truncated large output from {tool_name}",
            "decision": "approve",
            # Note: modifying tool_result content requires SDK support
            # This is a notification for now
        }

    # Allow the result as-is - use "approve" not "allow"
    return {"decision": "approve"}


async def pre_compact_handler(
    hook_input: PreCompactHookInput,
    output: Optional[str],
    context: HookContext,
) -> AsyncHookJSONOutput:
    """
    PreCompact hook that fires before context compaction.

    This allows us to add custom instructions for the compaction process
    or log when compaction is happening.

    Args:
        hook_input: Information about the compaction trigger
        output: Not used
        context: Hook context

    Returns:
        Hook output with optional custom instructions
    """
    trigger = hook_input.get("trigger", "unknown")
    session_id = hook_input.get("session_id", "unknown")

    print(f"[Hook] Context compaction triggered ({trigger}) for session {session_id}")

    # Provide custom instructions for the compaction
    custom_instructions = """
When compacting context, prioritize:
1. Keep test case status and progress information
2. Keep recent tool outputs that show current state
3. Summarize older screenshot/snapshot descriptions
4. Remove redundant navigation steps
5. Preserve error messages and defect information
"""

    return {
        "decision": "approve",
        "customInstructions": custom_instructions,
    }


def create_context_management_hooks() -> Dict[str, list]:
    """
    Create hook configuration for context management.

    Returns:
        Dictionary of hooks to pass to ClaudeAgentOptions
    """
    return {
        "PostToolUse": [
            HookMatcher(
                matcher="mcp__chrome-devtools__*",  # All chrome-devtools tools
                hooks=[truncate_large_tool_output],
                timeout=5.0,
            ),
        ],
        "PreCompact": [
            HookMatcher(
                hooks=[pre_compact_handler],
                timeout=5.0,
            ),
        ],
    }


# Alternative: Simple output size limiter for system prompt
CONTEXT_MANAGEMENT_PROMPT = """
## Context Management Guidelines

To avoid context overflow errors:
1. **Minimize take_snapshot calls**: Only use when necessary, prefer targeted element queries
2. **Use take_screenshot for visual verification**: Screenshots are smaller than DOM snapshots
3. **Clear browser state between tests**: Navigate to about:blank between test cases
4. **Summarize long outputs**: When logging results, summarize rather than copy full content
5. **Batch file operations**: Read multiple small files rather than one large file

When you see "Input is too long" error:
- The current session has accumulated too much context
- End the session gracefully and let the next session continue
- Progress is saved in test_cases.json so nothing is lost
"""
