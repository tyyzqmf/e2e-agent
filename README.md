# E2E Agent - Autonomous End-to-End Testing Framework

An autonomous testing framework that uses the Claude Agent SDK to execute comprehensive end-to-end tests with browser automation. The system provides a Web UI for managing test jobs and uses a two-agent pattern (test planner + test executor) to plan and execute tests autonomously.

![demo](docs/v1.gif)

- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## Features

- **Web UI Management**: Create, monitor, and manage test jobs through a web interface
- **Autonomous Test Execution**: AI agent plans and executes tests without human intervention
- **Browser Automation**: Chrome DevTools MCP for comprehensive browser inspection and automation
- **Evidence Collection**: Automatic screenshots, API logs, and console logs for every test
- **Professional Reports**: Industry-standard test case reports and defect documentation
- **Long-Running Sessions**: Stateless agent pattern with progress persistence across sessions
- **Security-First**: Multi-layer security (sandbox, filesystem restrictions, tool permissions)
- **Modern Runtime**: Built with Bun for fast startup and excellent TypeScript support

## Prerequisites

**Required:**

```bash
# Install Bun (https://bun.sh)
curl -fsSL https://bun.sh/install | bash
bun --version

# Install Node.js (for Chrome DevTools MCP)
node --version
npx --version

# Install Chrome/Chromium browser
google-chrome --version
```

**API Configuration:** Choose one option:

**Option 1 - AWS Bedrock (Recommended):**
```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2

# Recommended output token settings for Bedrock
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096
export MAX_THINKING_TOKENS=1024

# Configure AWS credentials
aws configure
```

**Option 2 - Anthropic API:**
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

## Quick Start

### 1. Check Environment

```bash
./e2e check         # Verify all dependencies are installed
```

### 2. Start Services

```bash
./e2e start         # Start all services (executor + web UI)

# Access Web UI at http://localhost:5000
```

### 3. Submit Test Job

**Option A - Via Web UI:**
1. Open http://localhost:5000 in your browser
2. Fill in test specification (application details, test scenarios, credentials)
3. Submit and monitor progress

**Option B - Via CLI (no web service required):**
```bash
./e2e job submit quick-start.md   # Submit job (auto-starts executor if needed)
./e2e job list                    # List all jobs
./e2e job status <job-id>         # Check job progress
```

### 4. Stop

```bash
./e2e stop          # Stop all services
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `./e2e help` | Show help message |
| `./e2e check` | Check environment requirements |
| `./e2e start` | Start all services (executor + web) |
| `./e2e start executor` | Start only the executor |
| `./e2e start web` | Start only the web service |
| `./e2e stop` | Stop all services |
| `./e2e stop executor` | Stop only the executor |
| `./e2e stop web` | Stop only the web service |
| `./e2e job submit <file>` | Submit a test job |
| `./e2e job list` | List all jobs |
| `./e2e job status <id>` | Get job status |
| `./e2e job cancel <id>` | Cancel a job |
| `./e2e log executor` | View executor logs |
| `./e2e log web` | View web logs |
| `./e2e status` | Show service status |

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web UI        │────▶│   Job Queue      │────▶│   Executor      │
│  (Bun Server)   │     │  (SQLite DB)     │     │  (Background)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Claude Agent   │
                                                │  (Planner/Exec) │
                                                └─────────────────┘
```

### Two-Agent Pattern

The framework uses a stateless two-agent approach:

1. **Test Planner Agent (Session 1):**
   - Reads test specification (includes test cases and environment config)
   - Generates `test_cases.json` with detailed test cases
   - Generates `test_env.json` with extracted environment configuration
   - Sets up test report structure and templates

2. **Test Executor Agent (Sessions 2+):**
   - Executes test cases one by one from `test_cases.json`
   - Uses Chrome DevTools MCP for browser automation
   - Captures evidence (screenshots, logs) at each step
   - Updates test status (Pass/Fail/Blocked)
   - Creates defect reports for failures
   - Auto-continues until all tests complete

### Progress Persistence

Each session runs with a fresh context window. Progress persists through:
- **`test_cases.json`**: Single source of truth for test status
- **`claude-progress.txt`**: Session notes and next steps

## Project Structure

```
e2e-agent/
├── e2e                         # Unified CLI command (symlink to e2e.ts)
├── e2e.ts                      # CLI entry point (Bun/TypeScript)
├── src/
│   ├── agent/                      # Agent (TypeScript/Bun)
│   │   ├── index.ts                  # Main entry point
│   │   ├── agent.ts                  # Core agent loop
│   │   ├── client.ts                 # Claude SDK client configuration
│   │   ├── config.ts                 # Agent configuration constants
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── index.ts              # Type re-exports
│   │   │   ├── session.ts            # Session-related types
│   │   │   ├── test-case.ts          # Test case types
│   │   │   └── pricing.ts            # Pricing/cost types
│   │   ├── services/                 # Business logic services
│   │   │   ├── index.ts              # Service re-exports
│   │   │   ├── progress.ts           # Test progress tracking
│   │   │   ├── prompts.ts            # Prompt loading utilities
│   │   │   ├── pricing.ts            # Cost calculation
│   │   │   └── token-usage.ts        # Token usage tracking
│   │   ├── security/                 # Security configuration
│   │   │   ├── index.ts              # Security re-exports
│   │   │   ├── tools.ts              # Tool permissions
│   │   │   ├── hooks.ts              # Context management hooks
│   │   │   └── mcp-servers.ts        # MCP server configuration
│   │   ├── skills/                   # Skills/plugins support
│   │   │   └── index.ts              # Skills loader
│   │   ├── prompts/                  # Agent prompt templates
│   │   │   ├── test_planner_prompt.md
│   │   │   └── test_executor_prompt.md
│   │   ├── templates/                # Report templates
│   │   └── plugins/                  # Agent plugins
│   ├── server/                     # Web server (Bun runtime)
│   │   ├── index.ts                # Web server entry point
│   │   ├── config.ts               # Configuration management
│   │   ├── routes/                 # API routes
│   │   │   ├── api.ts              # REST API endpoints
│   │   │   └── static.ts           # Static file serving
│   │   ├── services/               # Business logic
│   │   │   ├── JobManager.ts       # Job queue management (SQLite)
│   │   │   └── ResultService.ts    # Test results handling
│   │   ├── static/                 # Static web assets (CSS, JS)
│   │   ├── templates/              # HTML templates
│   │   └── utils/
│   │       └── logger.ts           # Logging utilities
│   └── cli/                        # CLI-related code (TypeScript)
│       ├── index.ts                # CLI entry point
│       ├── env-check.ts            # Environment checks
│       ├── utils.ts                # CLI utilities
│       ├── run-executor.ts         # Executor entry point
│       ├── commands/               # CLI command implementations
│       │   ├── services.ts         # Service start/stop commands
│       │   ├── jobs.ts             # Job management commands
│       │   └── logs.ts             # Log viewing commands
│       └── services/               # CLI services
│           ├── job.ts              # Job management service
│           └── executor.ts         # Test executor service
├── data/                       # Runtime data
│   ├── e2e.db                  # SQLite database (jobs)
│   └── reports/                # Generated reports
└── generations/                # Generated test projects (CLI mode)
```

## Test Reports

After tests complete, reports are generated with:

- **Test_Report_Viewer.html**: Interactive HTML report viewer
- **test-case-reports/**: Individual test case reports (TC-*.md)
- **defect-reports/**: Defect documentation (DEFECT-*.md)
- **test-summary-report.md**: Overall test execution summary
- **screenshots/**: Visual evidence for each test step
- **logs/**: API and console logs for failed tests

### Evidence Collection

Every test execution captures:
1. **Screenshots** at each major step
2. **API logs** for failed network requests
3. **Console logs** for JavaScript errors
4. **Test results** with actual vs. expected outcomes

### Defect Documentation

Failed tests automatically generate defect reports with:
- Severity classification (Critical/High/Medium/Low)
- Steps to reproduce
- Expected vs. actual results
- Evidence links (screenshots, logs)
- Environment information

## CLI Mode (Alternative)

For running tests directly without Web UI:

```bash
# Run autonomous agent
bun run src/agent/index.ts --project-dir ./my_test

# Use a specific model
bun run src/agent/index.ts --project-dir ./my_test --model us.anthropic.claude-sonnet-4-5-20250929-v1:0

# With iteration limit
bun run src/agent/index.ts --project-dir ./my_test --max-iterations 5

# Or use npm script
bun run agent --project-dir ./my_test
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--project-dir` | Directory for test project | `generations/autonomous_test_project` |
| `--max-iterations` | Max agent iterations | Unlimited |
| `--model` | Claude model to use | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |

## Security Model

The framework implements defense-in-depth security:

1. **OS-level Sandbox**: Bash commands run in isolated environment
2. **Filesystem Restrictions**: File operations restricted to project directory only
3. **Tool Permissions**: Explicit allowlist for all tools and MCP servers

See `src/agent/client.ts` and `src/agent/security/` for implementation details.

## Browser Automation

Uses **Chrome DevTools MCP** for browser automation with features:
- Comprehensive browser inspection
- Network request/response capture
- Console log collection
- Multi-tab management
- Screenshot and snapshot functionality

Configured with sandbox-safe flags for containerized environments.

## Customization

### Adjust Test Count

Edit `src/agent/prompts/test_planner_prompt.md` and change the test case count (default: ~50). Use smaller numbers (10-20) for faster demos.

### Modify Agent Behavior

- **Test Planning**: Edit `src/agent/prompts/test_planner_prompt.md`
- **Test Execution**: Edit `src/agent/prompts/test_executor_prompt.md`

## Troubleshooting

**"Missing dependencies" error**
```bash
./e2e check    # See which dependencies are missing
```

**"Web UI not accessible"**
- Ensure `./e2e start` completed successfully
- Check if port 5000 is available
- Check logs: `./e2e log web`

**"Tests not executing"**
- Verify executor is running: `./e2e status`
- Check executor logs: `./e2e log executor`
- Ensure AWS/Anthropic credentials are configured

**"AWS credentials not found"**
```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2
aws configure  # Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
```

**"ANTHROPIC_API_KEY not set"**
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

**"Chrome DevTools MCP not available"**
- Ensure Node.js and npx are installed
- Ensure Chrome/Chromium browser is installed
- Run `./e2e stop` to cleanup processes and restart

**"Bun not found"**
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
# Add to PATH (follow installer instructions)
source ~/.bashrc  # or ~/.zshrc
```

## Requirements

- **Bun** >= 1.0.0 (All TypeScript code - CLI, Web Service, Agent)
- Node.js and npx (Chrome DevTools MCP)
- Chrome/Chromium browser
- AWS Bedrock access OR Anthropic API key

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run specific test file
bun test src/server/__tests__/api.test.ts
```

### Test Coverage

The Bun services have comprehensive test coverage:

| Component | Functions | Lines |
|-----------|-----------|-------|
| JobManager | 100% | 100% |
| ResultService | 100% | 100% |
| API Routes | 100% | 88% |
| CLI Utils | 100% | 92% |
| Config | 100% | 91% |

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Contributing

This is a demonstration framework for autonomous testing with Claude Agent SDK. Contributions are welcome!
