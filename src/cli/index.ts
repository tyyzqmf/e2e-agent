#!/usr/bin/env bun

/**
 * E2E Testing Framework CLI
 *
 * A unified CLI for managing the E2E testing framework, built with Bun.
 *
 * Usage: e2e <command> [subcommand] [options]
 *
 * Commands:
 *   help                     Show help message
 *   check                    Check environment requirements
 *   start [service]          Start services (executor, web, or all)
 *   stop [service]           Stop services (executor, web, or all)
 *   job <action>             Job management (submit, cancel, status, list)
 *   log <service>            View service logs (executor, web)
 *   status                   Show service status
 */

import { handleJobCommand } from "./commands/jobs.ts";
import { handleLogCommand, showStatus } from "./commands/logs.ts";
import {
	startAll,
	startBun,
	startExecutor,
	stopAll,
	stopBun,
	stopExecutor,
} from "./commands/services.ts";
import { checkRequirements, setupEnvironment } from "./env-check.ts";
import {
	DATA_DIR,
	ensureDirectories,
	isCompiledBinary,
	PROJECT_ROOT,
	printError,
	printHeader,
	printSuccess,
} from "./utils.ts";

// Version information
const VERSION = "0.2.7";
const BUILD_DATE = "2026-01-07";

// ====================================
// Internal Service Runners
// ====================================

/**
 * Run the web server directly (for compiled binary mode)
 */
async function runInternalServer(): Promise<void> {
	// Dynamically import to ensure all modules are bundled
	const { startServer } = await import("../server/main.ts");
	await startServer();
}

/**
 * Run the executor directly (for compiled binary mode)
 */
async function runInternalExecutor(): Promise<void> {
	const { runExecutor } = await import("./services/executor.ts");
	await runExecutor();
}

/**
 * Run the agent directly (for compiled binary mode)
 * Expects --project-dir and optionally --max-iterations as arguments
 */
async function runInternalAgent(): Promise<void> {
	// Remove --internal-agent from argv so the agent's parseArgs doesn't see it
	process.argv = process.argv.filter((arg) => arg !== "--internal-agent");
	const { main: runAgent } = await import("../agent/index.ts");
	await runAgent();
}

// ====================================
// Help Command
// ====================================

function showVersion(): void {
	console.log(`E2E Testing Framework v${VERSION}`);
	console.log(`Build date: ${BUILD_DATE}`);
	console.log(`Runtime: Bun ${Bun.version}`);
}

function showHelp(): void {
	console.log(`E2E Testing Framework CLI v${VERSION}

Usage: e2e <command> [subcommand] [options]

Commands:
  help                     Show this help message
  version                  Show version information
  check                    Check environment requirements

  start [service]          Start services
    e2e start              Start web service (Bun)
    e2e start executor     Start only the test executor
    e2e start web          Start the Bun web service

  stop [service]           Stop services
    e2e stop               Stop all services
    e2e stop executor      Stop only the test executor
    e2e stop web           Stop the Bun web service

  job <action>             Job management (no web service required)
    e2e job submit <file>  Submit a new test job from spec file
    e2e job cancel <id>    Cancel a job by ID
    e2e job status <id>    Get status of a specific job
    e2e job list           List all jobs

  log <service>            View service logs
    e2e log executor       View executor logs (tail -f)
    e2e log web            View web service logs (tail -f)

  status                   Show service status

Examples:
  e2e check                     # Check environment requirements
  e2e start                     # Start web service
  e2e start executor            # Start test executor
  e2e job submit quick-start.md # Submit a test job
  e2e job list                  # List all jobs
  e2e log executor              # Follow executor logs
  e2e log web                   # Follow web service logs

Environment Variables:
  CLAUDE_CODE_USE_BEDROCK  Enable AWS Bedrock (set to 1)
  AWS_REGION               AWS region (default: us-west-2)
  PORT                     Web service port (default: 3000)
  HOST                     Web service host (default: 0.0.0.0)
`);
}

// ====================================
// Main Entry Point
// ====================================

async function main(): Promise<void> {
	// Parse arguments first to check for internal commands
	const args = process.argv.slice(2);
	const command = args[0] ?? "help";

	// Handle internal commands (used by compiled binary to spawn services)
	if (command === "--internal-server") {
		process.env.DATA_DIR = process.env.DATA_DIR ?? DATA_DIR;
		await runInternalServer();
		return;
	}

	if (command === "--internal-executor") {
		process.env.DATA_DIR = process.env.DATA_DIR ?? DATA_DIR;
		await runInternalExecutor();
		return;
	}

	if (command === "--internal-agent") {
		// Agent handles its own arguments (--project-dir, --max-iterations, etc.)
		await runInternalAgent();
		return;
	}

	// Change to project root (only in development mode)
	if (!isCompiledBinary()) {
		process.chdir(PROJECT_ROOT);
	}

	// Ensure directories exist
	await ensureDirectories();

	const subArgs = args.slice(1);

	try {
		switch (command) {
			case "help":
			case "-h":
			case "--help":
				showHelp();
				break;

			case "version":
			case "-v":
			case "--version":
				showVersion();
				break;

			case "check": {
				printHeader("Environment Requirements Check");
				const result = await checkRequirements(true);
				if (!result.hasErrors) {
					printSuccess("All requirements satisfied!");
				} else {
					printError("Some requirements are missing");
					process.exit(1);
				}
				break;
			}

			case "start": {
				const startService = subArgs[0] ?? "all";
				switch (startService) {
					case "all":
						await startAll();
						break;
					case "web":
					case "bun":
						await setupEnvironment(true);
						await startBun(true); // foreground mode
						break;
					case "executor":
						await setupEnvironment(true);
						await startExecutor();
						break;
					default:
						printError(`Unknown service: ${startService}`);
						console.log("Usage: e2e start [executor|web]");
						process.exit(1);
				}
				break;
			}

			case "stop": {
				const stopService = subArgs[0] ?? "all";
				switch (stopService) {
					case "all":
						await stopAll();
						break;
					case "executor":
						await stopExecutor();
						break;
					case "web":
					case "bun":
						await stopBun();
						break;
					default:
						printError(`Unknown service: ${stopService}`);
						console.log("Usage: e2e stop [executor|web]");
						process.exit(1);
				}
				break;
			}

			case "job": {
				const jobAction = subArgs[0];
				if (!jobAction) {
					printError("Missing job action");
					console.log("Usage: e2e job <submit|cancel|status|list> [args]");
					process.exit(1);
				}
				await setupEnvironment(false); // Silent mode
				await handleJobCommand(jobAction, subArgs.slice(1));
				break;
			}

			case "log":
			case "logs": {
				const logService = subArgs[0];
				if (!logService) {
					printError("Missing service name");
					console.log("Usage: e2e log <executor|web>");
					process.exit(1);
				}
				await handleLogCommand(logService);
				break;
			}

			case "status":
				await showStatus();
				break;

			default:
				printError(`Unknown command: ${command}`);
				console.log("");
				showHelp();
				process.exit(1);
		}
	} catch (error) {
		printError(`Command failed: ${error}`);
		process.exit(1);
	}
}

// Run main
main().catch((error) => {
	printError(`Fatal error: ${error}`);
	process.exit(1);
});
