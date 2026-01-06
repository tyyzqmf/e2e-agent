#!/usr/bin/env bun
/**
 * E2E CLI - Executor Entry Point
 *
 * Standalone entry point for running the test executor service.
 * This file replaces run_executor.py
 */

import { runExecutor } from "./services/executor.ts";

// Run the executor
runExecutor().catch((error) => {
	console.error(`Fatal error: ${error}`);
	process.exit(1);
});
