#!/usr/bin/env bun
/**
 * Autonomous Testing Agent
 * =========================
 *
 * A minimal harness demonstrating long-running autonomous testing with Claude.
 * This script implements the two-agent pattern (test planner + test executor) and
 * incorporates all the strategies from the long-running agents guide.
 *
 * Example Usage:
 *   bun run src/agent/index.ts --project-dir ./my_test_project
 *   bun run src/agent/index.ts --project-dir ./my_test_project --max-iterations 5
 */

import { parseArgs } from "util";
import { resolve } from "path";
import { runAutonomousTestingAgent } from "./agent.ts";
import {
  DEFAULT_MODEL,
  DEFAULT_PROJECT_DIR,
  GENERATIONS_DIR,
  normalizeProjectPath,
  isBedrockEnabled,
} from "./config.ts";

// ====================================
// Configuration Validation
// ====================================

/**
 * Check if AWS Bedrock configuration is valid.
 */
function checkAwsBedrockConfig(): boolean {
  const useBedrock = isBedrockEnabled(process.env.USE_AWS_BEDROCK);
  if (!useBedrock) {
    return false;
  }

  const awsRegion =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!awsRegion) {
    console.error(
      "Error: AWS_REGION or AWS_DEFAULT_REGION environment variable not set"
    );
    console.error("\nTo use AWS Bedrock, set:");
    console.error("  export USE_AWS_BEDROCK=true");
    console.error("  export AWS_REGION=us-east-1  # or your preferred region");
    console.error("\nAnd configure AWS credentials using:");
    console.error("  aws configure");
    console.error(
      "  # or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    );
    return false;
  }

  console.log("Using AWS Bedrock for Claude API");
  return true;
}

/**
 * Check if Anthropic API key is configured.
 */
function checkAnthropicApiKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) {
    return true;
  }

  console.error("Error: ANTHROPIC_API_KEY environment variable not set");
  console.error("\nGet your API key from: https://console.anthropic.com/");
  console.error("\nThen set it:");
  console.error("  export ANTHROPIC_API_KEY='your-api-key-here'");
  console.error("\nAlternatively, to use AWS Bedrock:");
  console.error("  export USE_AWS_BEDROCK=true");
  console.error("  export AWS_REGION=us-east-1");
  return false;
}

// ====================================
// CLI Argument Parsing
// ====================================

function printHelp(): void {
  console.log(`
Autonomous Testing Agent - Long-running agent harness for test execution

Usage:
  bun run src/agent/index.ts [options]

Options:
  --project-dir <path>    Directory for the testing project
                          (default: ${GENERATIONS_DIR}/${DEFAULT_PROJECT_DIR})
                          Relative paths automatically placed in ${GENERATIONS_DIR}/ directory.

  --max-iterations <n>    Maximum number of agent iterations (default: unlimited)

  --model <model>         Claude model to use
                          (default: ${DEFAULT_MODEL})

  --help                  Show this help message

Examples:
  # Start fresh testing project
  bun run src/agent/index.ts --project-dir ./my_test_project

  # Use a specific model (inference profile ID for Bedrock)
  bun run src/agent/index.ts --project-dir ./my_test --model us.anthropic.claude-sonnet-4-5-20250929-v1:0

  # Limit iterations for testing
  bun run src/agent/index.ts --project-dir ./my_test --max-iterations 3

  # Continue existing project
  bun run src/agent/index.ts --project-dir ./my_test_project

Environment Variables:
  Option 1 - Anthropic API:
    ANTHROPIC_API_KEY    Your Anthropic API key

  Option 2 - AWS Bedrock:
    USE_AWS_BEDROCK=true Set to use AWS Bedrock
    AWS_REGION           AWS region (e.g., us-east-1, us-west-2)
    AWS credentials configured via AWS CLI or environment variables
`);
}

function parseCliArgs(): {
  projectDir: string;
  maxIterations: number | null;
  model: string;
  help: boolean;
} {
  const { values } = parseArgs({
    options: {
      "project-dir": {
        type: "string",
        short: "p",
      },
      "max-iterations": {
        type: "string",
        short: "m",
      },
      model: {
        type: "string",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: false,
  });

  return {
    projectDir: values["project-dir"] ?? DEFAULT_PROJECT_DIR,
    maxIterations: values["max-iterations"]
      ? parseInt(values["max-iterations"], 10)
      : null,
    model: values.model ?? DEFAULT_MODEL,
    help: values.help ?? false,
  };
}

// ====================================
// Main Entry Point
// ====================================

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate API credentials (AWS Bedrock or Anthropic API)
  const useBedrock = isBedrockEnabled(process.env.USE_AWS_BEDROCK);

  if (useBedrock) {
    if (!checkAwsBedrockConfig()) {
      process.exit(1);
    }
  } else {
    if (!checkAnthropicApiKey()) {
      process.exit(1);
    }
  }

  // Normalize project directory path
  const projectDir = resolve(normalizeProjectPath(args.projectDir));

  // Run the testing agent
  try {
    const exitCode = await runAutonomousTestingAgent({
      projectDir,
      model: args.model,
      maxIterations: args.maxIterations,
    });
    process.exit(exitCode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
      // Ignore this error during shutdown
      process.exit(0);
    }

    if (error instanceof Error && error.message.includes("SIGINT")) {
      console.log("\n\nInterrupted by user");
      console.log("To resume, run the same command again");
      process.exit(130); // Standard exit code for SIGINT
    }

    console.error(`\nFatal error: ${error}`);
    process.exit(2);
  }
}

// Run if this is the main module
main().catch((error) => {
  console.error(`Unhandled error: ${error}`);
  process.exit(2);
});
