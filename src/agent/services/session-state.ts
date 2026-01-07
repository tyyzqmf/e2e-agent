/**
 * Session State Management
 * ========================
 *
 * Manages session state for conditional session resume to optimize cache reuse.
 * Tracks session IDs, timestamps, and progress to determine when to resume vs start fresh.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Session state stored between agent iterations
 */
export interface SessionState {
	/** Last session ID that can be resumed */
	lastSessionId: string | null;
	/** Timestamp when the last session ended */
	lastSessionEndTime: number;
	/** Number of "Not Run" tests at the end of last session */
	lastNotRunCount: number;
	/** Whether the last session made progress (reduced Not Run count) */
	lastSessionMadeProgress: boolean;
	/** Number of consecutive resumed sessions without progress */
	resumedWithoutProgressCount: number;
	/** Session end status */
	lastSessionStatus: "continue" | "context_overflow" | "error";
}

/** Cache TTL in milliseconds (5 minutes, matches Anthropic's cache TTL) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum consecutive resumed sessions without progress before forcing fresh start */
const MAX_RESUMED_WITHOUT_PROGRESS = 2;

/** Filename for session state persistence */
const SESSION_STATE_FILE = ".session_state.json";

/**
 * Load session state from disk
 */
export function loadSessionState(projectDir: string): SessionState | null {
	const stateFile = join(projectDir, SESSION_STATE_FILE);

	if (!existsSync(stateFile)) {
		return null;
	}

	try {
		const content = readFileSync(stateFile, "utf-8");
		return JSON.parse(content) as SessionState;
	} catch (error) {
		console.log(`[Session State] Failed to load state: ${error}`);
		return null;
	}
}

/**
 * Save session state to disk
 */
export function saveSessionState(
	projectDir: string,
	state: SessionState,
): void {
	const stateFile = join(projectDir, SESSION_STATE_FILE);

	try {
		writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
	} catch (error) {
		console.log(`[Session State] Failed to save state: ${error}`);
	}
}

/**
 * Determine if we should resume the previous session
 *
 * Resume conditions:
 * 1. Previous session exists and is within cache TTL (5 min)
 * 2. Previous session ended normally (not error/overflow)
 * 3. Previous session made progress OR we haven't exceeded retry limit
 * 4. Not in "force fresh" mode due to too many idle resumed sessions
 *
 * @returns Session ID to resume, or null for fresh start
 */
export function shouldResumeSession(
	projectDir: string,
	_currentNotRunCount: number,
): { resumeSessionId: string | null; reason: string } {
	const state = loadSessionState(projectDir);

	// No previous state - fresh start
	if (!state || !state.lastSessionId) {
		return { resumeSessionId: null, reason: "No previous session" };
	}

	// Check cache TTL
	const timeSinceLastSession = Date.now() - state.lastSessionEndTime;
	if (timeSinceLastSession > CACHE_TTL_MS) {
		return {
			resumeSessionId: null,
			reason: `Cache expired (${Math.round(timeSinceLastSession / 1000)}s > ${CACHE_TTL_MS / 1000}s TTL)`,
		};
	}

	// Don't resume after errors or context overflow
	if (state.lastSessionStatus !== "continue") {
		return {
			resumeSessionId: null,
			reason: `Previous session ended with ${state.lastSessionStatus}`,
		};
	}

	// Check for idle loop (resumed sessions without progress)
	if (state.resumedWithoutProgressCount >= MAX_RESUMED_WITHOUT_PROGRESS) {
		return {
			resumeSessionId: null,
			reason: `Idle loop detected (${state.resumedWithoutProgressCount} resumed sessions without progress)`,
		};
	}

	// Safe to resume
	const timeRemaining = Math.round(
		(CACHE_TTL_MS - timeSinceLastSession) / 1000,
	);
	return {
		resumeSessionId: state.lastSessionId,
		reason: `Resuming session (cache valid for ${timeRemaining}s more)`,
	};
}

/**
 * Update session state after a session completes
 */
export function updateSessionState(
	projectDir: string,
	sessionId: string,
	status: "continue" | "context_overflow" | "error",
	currentNotRunCount: number,
	wasResumed: boolean,
): void {
	const previousState = loadSessionState(projectDir);
	const previousNotRunCount = previousState?.lastNotRunCount ?? -1;

	// Determine if progress was made
	const madeProgress =
		previousNotRunCount >= 0 && currentNotRunCount < previousNotRunCount;

	// Track resumed sessions without progress
	let resumedWithoutProgressCount = 0;
	if (wasResumed && !madeProgress) {
		resumedWithoutProgressCount =
			(previousState?.resumedWithoutProgressCount ?? 0) + 1;
		console.log(
			`[Session State] Resumed session made no progress (${resumedWithoutProgressCount}/${MAX_RESUMED_WITHOUT_PROGRESS})`,
		);
	}

	const newState: SessionState = {
		lastSessionId: sessionId,
		lastSessionEndTime: Date.now(),
		lastNotRunCount: currentNotRunCount,
		lastSessionMadeProgress: madeProgress,
		resumedWithoutProgressCount,
		lastSessionStatus: status,
	};

	saveSessionState(projectDir, newState);

	if (madeProgress) {
		console.log(
			`[Session State] Progress made: ${previousNotRunCount} -> ${currentNotRunCount} Not Run`,
		);
	}
}

/**
 * Generate a "state reset" prompt prefix for resumed sessions.
 * This ensures the AI re-reads test_cases.json instead of relying on memory.
 */
export function getResumeResetPrompt(): string {
	return `
<session_resume_context>
**IMPORTANT: This is a RESUMED session. Your previous conversation context is preserved.**

However, your MEMORY of test status may be STALE. Before proceeding:

1. **RE-READ test_cases.json** - This is the ONLY source of truth for test status
2. **IGNORE any "mission accomplished" or "all tests complete" claims** from previous conversation
3. **Check actual Not Run count**: \`python3 utils/json_helper.py stats\`
4. **If Not Run > 0, continue executing tests** regardless of previous claims

DO NOT assume tests are complete based on conversation history.
The test loop continues until test_cases.json shows 0 "Not Run" tests.
</session_resume_context>

`;
}

/**
 * Clear session state (force fresh start next time)
 */
export function clearSessionState(projectDir: string): void {
	const stateFile = join(projectDir, SESSION_STATE_FILE);

	if (existsSync(stateFile)) {
		try {
			const fs = require("node:fs");
			fs.unlinkSync(stateFile);
			console.log("[Session State] Cleared session state");
		} catch {
			// Ignore errors
		}
	}
}
