/**
 * Session Types
 * ==============
 *
 * Type definitions for agent sessions and usage tracking.
 */

/**
 * Status of an agent session
 */
export enum SessionStatus {
  CONTINUE = "continue",
  ERROR = "error",
  COMPLETED = "completed",
}

/**
 * Token usage information from a session
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Usage data returned from a session
 */
export interface UsageData {
  usage: TokenUsage | null;
  totalCostUsd: number | null;
  durationMs: number;
  numTurns: number;
  sessionId: string;
}

/**
 * Result of running an agent session
 */
export interface SessionResult {
  status: SessionStatus;
  responseText: string;
  usageData: UsageData | null;
}

/**
 * Options for running an agent session
 */
export interface AgentSessionOptions {
  projectDir: string;
  model: string;
  maxIterations?: number;
}

/**
 * Session type identifier
 */
export type SessionType = "test_planner" | "test_executor";
