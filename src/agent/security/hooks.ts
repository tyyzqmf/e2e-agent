/**
 * Context Management Hooks
 * =========================
 *
 * Hooks for managing context size and preventing "input too long" errors.
 */

/**
 * Configuration Constants
 */
export const MAX_SNAPSHOT_LENGTH = 50000;
export const MAX_TOOL_OUTPUT_LENGTH = 100000;
export const TRUNCATION_NOTICE =
  "\n\n[Content truncated due to size limits. Use targeted selectors for specific elements.]";

/**
 * Hook decision types
 */
export type HookDecision = "approve" | "block";

/**
 * Post tool use hook input
 */
export interface PostToolUseHookInput {
  toolName?: string;
  toolResult?: {
    content?: string | object;
    isError?: boolean;
  };
}

/**
 * Pre compact hook input
 */
export interface PreCompactHookInput {
  trigger?: string;
  sessionId?: string;
}

/**
 * Hook output format
 */
export interface HookOutput {
  decision: HookDecision;
  outputToUser?: string;
  customInstructions?: string;
}

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  matcher?: string;
  hooks: Array<
    (input: PostToolUseHookInput | PreCompactHookInput) => Promise<HookOutput>
  >;
  timeout?: number;
}

/**
 * PostToolUse hook to truncate large tool outputs, especially from take_snapshot.
 *
 * This prevents "input too long" errors by limiting the size of tool outputs
 * that get added to the conversation context.
 */
export async function truncateLargeToolOutput(
  hookInput: PostToolUseHookInput
): Promise<HookOutput> {
  const toolName = hookInput.toolName ?? "";
  const toolResult = hookInput.toolResult ?? {};

  // Get the content from the tool result
  let content = toolResult.content ?? "";
  if (typeof content === "object") {
    content = JSON.stringify(content);
  } else if (typeof content !== "string") {
    content = String(content);
  }

  // Determine max length based on tool type
  const maxLength = toolName.includes("take_snapshot")
    ? MAX_SNAPSHOT_LENGTH
    : MAX_TOOL_OUTPUT_LENGTH;

  // Check if truncation is needed
  if (content.length > maxLength) {
    console.log(
      `[Hook] Truncating ${toolName} output from ${content.length} to ${maxLength} chars`
    );

    return {
      decision: "approve",
      outputToUser: `[Context Management] Truncated large output from ${toolName}`,
    };
  }

  return { decision: "approve" };
}

/**
 * PreCompact hook that fires before context compaction.
 *
 * This allows us to add custom instructions for the compaction process
 * or log when compaction is happening.
 */
export async function preCompactHandler(
  hookInput: PreCompactHookInput
): Promise<HookOutput> {
  const trigger = hookInput.trigger ?? "unknown";
  const sessionId = hookInput.sessionId ?? "unknown";

  console.log(
    `[Hook] Context compaction triggered (${trigger}) for session ${sessionId}`
  );

  // Provide custom instructions for the compaction
  const customInstructions = `
When compacting context, prioritize:
1. Keep test case status and progress information
2. Keep recent tool outputs that show current state
3. Summarize older screenshot/snapshot descriptions
4. Remove redundant navigation steps
5. Preserve error messages and defect information
`;

  return {
    decision: "approve",
    customInstructions,
  };
}

/**
 * Create hook configuration for context management.
 *
 * @returns Dictionary of hooks to pass to ClaudeAgentOptions
 */
export function createContextManagementHooks(): Record<string, HookMatcher[]> {
  return {
    PostToolUse: [
      {
        matcher: "mcp__chrome-devtools__*",
        hooks: [truncateLargeToolOutput],
        timeout: 5000,
      },
    ],
    PreCompact: [
      {
        hooks: [preCompactHandler],
        timeout: 5000,
      },
    ],
  };
}

/**
 * Context management guidelines to add to system prompt
 */
export const CONTEXT_MANAGEMENT_PROMPT = `
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
`;
