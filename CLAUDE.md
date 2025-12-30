# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **autonomous end-to-end testing framework** that uses the Claude Agent SDK to execute comprehensive browser-based testing with Chrome DevTools MCP. The system implements a two-agent pattern:

1. **Test Planner Agent** (first run): Reads test specifications and creates detailed test cases
2. **Test Executor Agent** (subsequent runs): Executes test cases, captures evidence (screenshots, logs), and generates defect reports

## Quick Start Commands

All commands are managed through the unified `e2e` CLI:

### Check Environment
```bash
./e2e check         # Verify all dependencies are installed
```

### Start Services
```bash
./e2e start                  # Start all services (executor + web)
./e2e start executor         # Start only the test executor
./e2e start web              # Start only the web service
```

### Stop Services
```bash
./e2e stop                   # Stop all services
./e2e stop executor          # Stop only the executor
./e2e stop web               # Stop only the web service
```

### Job Management (no web service required)
```bash
./e2e job submit <file>      # Submit a test job from spec file
./e2e job list               # List all jobs
./e2e job status <job-id>    # Get job status and progress
./e2e job cancel <job-id>    # Cancel a job
```

### View Logs
```bash
./e2e log executor           # View executor logs (tail -f)
./e2e log web                # View web service logs
```

### Service Status
```bash
./e2e status                 # Show current service status
```

### Cleanup Orphaned Processes
If you encounter orphaned chrome-devtools-mcp processes:
```bash
ps -ef | grep chrome-devtools          # Check for running processes
./e2e stop                             # Stop all services and cleanup
```

## Required Configuration Files

Before running tests, you must create this file in the project root:

**test_spec.txt** - Complete test specification including:
   - Use `test_spec.txt.template` as a reference
   - Application overview and features
   - **Environment configuration** (application URLs, test accounts, browser settings)
   - Test scope, test cases, and expected results
   - Testing priorities and success criteria
   - All test data and credentials needed for testing

**IMPORTANT:** All configuration is now in `test_spec.txt`. The separate `.test.env` file is no longer needed.

## Architecture

### Two-Agent Pattern
The framework uses a **stateless two-agent approach** where each session runs with a fresh context:

- **Session 1 (Test Planner)**: Reads `test_spec.txt` and creates:
  - `test_cases.json` with ~50 detailed test cases
  - `test_env.json` with environment configuration extracted from test_spec.txt
- **Session 2+ (Test Executor)**: Executes tests one by one, updating status in `test_cases.json`

Progress persists via:
- `test_cases.json` (source of truth for test status)
- `test_env.json` (environment configuration for test execution)
- Git commits (checkpoint mechanism)
- `claude-progress.txt` (session notes)

### Project Structure

```
src/
├── agent/                    # Agent (TypeScript/Bun)
│   ├── index.ts              # Main entry point
│   ├── agent.ts              # Core agent loop
│   ├── client.ts             # Claude SDK client configuration
│   ├── config.ts             # Agent configuration constants
│   ├── types/                # TypeScript type definitions
│   │   ├── index.ts          # Type re-exports
│   │   ├── session.ts        # Session-related types
│   │   ├── test-case.ts      # Test case types
│   │   └── pricing.ts        # Pricing/cost types
│   ├── services/             # Business logic services
│   │   ├── index.ts          # Service re-exports
│   │   ├── progress.ts       # Test progress tracking
│   │   ├── prompts.ts        # Prompt loading utilities
│   │   ├── pricing.ts        # Cost calculation
│   │   └── token-usage.ts    # Token usage tracking
│   ├── security/             # Security configuration
│   │   ├── index.ts          # Security re-exports
│   │   ├── tools.ts          # Tool permissions
│   │   ├── hooks.ts          # Context management hooks
│   │   └── mcp-servers.ts    # MCP server configuration
│   ├── skills/               # Skills/plugins support
│   │   └── index.ts          # Skills loader
│   ├── prompts/              # Agent prompt templates
│   ├── templates/            # Report templates
│   ├── plugins/              # Agent plugins
│   └── utils/                # Utility scripts
├── server/                   # Web server (Bun runtime)
│   ├── index.ts              # Web server entry point
│   ├── routes/               # API routes
│   ├── services/             # Service implementations
│   └── templates/            # HTML templates
└── cli/                      # CLI-related code (TypeScript)
    ├── index.ts              # CLI entry point
    ├── commands/             # CLI command implementations
    ├── services/             # CLI services
    │   ├── job.ts            # Job management service
    │   └── executor.ts       # Test executor service
    └── run-executor.ts       # Executor entry point
```

### Key Components

- **`src/agent/index.ts`**: Main entry point, handles CLI args and project setup
- **`src/agent/agent.ts`**: Core agent loop - manages sessions, prompt selection, and auto-continuation
- **`src/agent/client.ts`**: Claude SDK client configuration with security settings and MCP server setup
- **`src/agent/services/progress.ts`**: Test progress tracking (counts pass/fail/blocked/not_run)
- **`src/agent/services/prompts.ts`**: Prompt loading and file copying utilities
- **`src/agent/prompts/`**: Contains agent prompts and app_spec.txt

### Security Model (Defense in Depth)

The framework implements three security layers:

1. **OS-level Sandbox**: Bash commands run in isolated environment
2. **Filesystem Restrictions**: File operations restricted to project directory only (via `cwd` setting)
3. **Permissions**: All tools explicitly allowed via `.claude_settings.json`

See `src/agent/security/tools.ts` and `src/agent/client.ts` for implementation details.

### Browser Automation

Uses **Chrome DevTools MCP** instead of Puppeteer for browser automation:
- Configured in `src/agent/security/mcp-servers.ts` with headless Chrome
- Includes sandbox flags for containerized environments: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`
- Available tools: navigate, screenshot, click, fill, wait_for, network inspection, console logs, etc.

## Project Directory Structure

### Generated Output (in `generations/`)

```
generations/
└── <project-name>/
    ├── test_cases.json           # Source of truth for test status
    ├── test_spec.txt             # Copy of test specification (includes env config)
    ├── test_env.json             # Extracted environment configuration
    ├── claude-progress.txt       # Session progress notes
    ├── .claude_settings.json     # Security settings
    ├── templates/                # Report templates
    └── test-reports/
        └── <timestamp>/
            ├── Test_Report_Viewer.html
            ├── test-case-reports/
            │   └── TC-*.md
            ├── defect-reports/
            │   └── DEFECT-*.md
            ├── test-summary-report.md
            ├── screenshots/
            └── logs/
```

## Environment Configuration

### Using AWS Bedrock (Default)
```bash
export USE_AWS_BEDROCK=true
export AWS_REGION=us-west-2
export CLAUDE_CODE_USE_BEDROCK=1

# AWS credentials via CLI
aws configure

# Or via environment variables
export AWS_ACCESS_KEY_ID='...'
export AWS_SECRET_ACCESS_KEY='...'
```

### Using Anthropic API
```bash
export ANTHROPIC_API_KEY='your-api-key'
```

## Development Workflow

### Adding New Test Specifications
1. Edit `test_spec.txt` with:
   - New test scenarios and test cases
   - Environment configuration (application URLs, test accounts, etc.)
   - All necessary test data
2. Run `./e2e job submit test_spec.txt` to submit the test job

### Modifying Agent Behavior
- **Test planning**: Edit `src/agent/prompts/test_planner_prompt.md`
- **Test execution**: Edit `src/agent/prompts/test_executor_prompt.md`

### Adjusting Test Count
The default is ~50 test cases. To change:
- Edit `src/agent/prompts/test_planner_prompt.md` and modify the test case count requirement

### Debugging
- Check `logs/autonomous_test_<timestamp>.log` for detailed execution logs
- Review `test_cases.json` for current test status
- Look at `test-reports/<timestamp>/` for test artifacts

## Important Timing Notes

- **First session** (test planning): Takes 5-10 minutes to generate detailed test cases
- **Subsequent sessions**: Each test execution can take 5-15 minutes depending on complexity
- **Auto-continuation**: 3-second delay between sessions (configurable in `src/agent/config.ts`)
- Tests run autonomously until completion or max-iterations reached

## Key Design Patterns

### Progress Tracking
- `test_cases.json` is the single source of truth
- Status values: "Not Run", "Pass", "Fail", "Blocked"
- Progress displayed after each session via `src/agent/services/progress.ts`

### Evidence Collection
Every test execution captures:
- Screenshots at each major step
- API logs for failed network requests
- Console logs for JavaScript errors
- Detailed test results with actual vs. expected outcomes

### Defect Documentation
Failed tests automatically generate defect reports with:
- Severity classification (Critical/High/Medium/Low)
- Steps to reproduce
- Expected vs. actual results
- Links to evidence (screenshots, logs)
- Environment information

## Dependencies

- **Bun >= 1.0** (runtime for all TypeScript code) - https://bun.sh
- **Chrome/Chromium** (for browser automation)
- **Node.js/npx** (for chrome-devtools-mcp)
- **AWS CLI** (optional, for AWS Bedrock credential validation)

### NPM Dependencies
- `@aws-sdk/client-sts` - AWS credential validation
- `@aws-sdk/credential-providers` - AWS credential loading

## Model Configuration

Default model: `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (inference profile ID for AWS Bedrock)

This format works for both AWS Bedrock and Anthropic API. See `src/agent/config.ts` for default configuration.

## Running the Agent Directly

```bash
# Show help
bun run src/agent/index.ts --help

# Run with project directory
bun run src/agent/index.ts --project-dir ./my_test_project

# Or use npm script
bun run agent --project-dir ./my_test_project
```
