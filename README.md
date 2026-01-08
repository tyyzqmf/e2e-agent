# E2E Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Bun](https://img.shields.io/badge/runtime-bun-f472b6)](https://bun.sh)
[![Claude](https://img.shields.io/badge/powered%20by-claude-orange)](https://claude.ai)

**Create AI-powered end-to-end tests** that plan, execute, and document themselves.

![demo](docs/v1.gif)

Write test specs in plain English. The AI agent plans comprehensive test cases, executes them in a real browser, captures evidence (screenshots, logs), and generates professional test reports—all autonomously.

### Why E2E Agent?

- **Natural Language Testing**: Describe what to test, not how to test it
- **Autonomous Execution**: Agent handles test planning, execution, and reporting
- **Real Browser Testing**: Uses Chrome DevTools for authentic end-to-end validation
- **Professional Reports**: Industry-standard test cases and defect documentation
- **Long-Running Capability**: Stateless sessions with automatic progress checkpoints

Read the [Anthropic blog post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) on building effective agent harnesses.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash
```

Or [build from source](docs/installation.md#build-from-source).

**Prerequisites:**
- Node.js & Chrome/Chromium browser
- AWS Bedrock access OR Anthropic API key

<details>
<summary>Configure API credentials</summary>

**AWS Bedrock (Recommended):**
```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2
aws configure
```

**Anthropic API:**
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

See [full configuration guide](docs/configuration.md).
</details>

## Quick Start

```bash
# 1. Check dependencies
e2e check

# 2. Start services (Web UI + Executor)
e2e start
```

Open http://localhost:5000 to:
1. Write test specs in plain English
2. Submit test job
3. Monitor autonomous execution
4. Download test reports

Or use the CLI:
```bash
e2e job submit quick-start.md    # Submit test job
e2e job status <job-id>          # Check progress
e2e stop                         # Stop services
```

See [all CLI commands](docs/cli-reference.md).

## How It Works

### Two-Agent Pattern

```
Test Spec (Plain English)
         ↓
┌────────────────────────┐
│  1. Test Planner       │  Generates test_cases.json
│     (Session 1)        │  with detailed test plans
└────────────────────────┘
         ↓
┌────────────────────────┐
│  2. Test Executor      │  Executes tests in Chrome
│     (Sessions 2+)      │  Captures evidence
│                        │  Generates reports
└────────────────────────┘
```

**Stateless Sessions**: Each agent run has a fresh context. Progress persists through `test_cases.json` (test status) and `claude-progress.txt` (session notes).

**Autonomous Execution**: The executor agent runs continuously, auto-continuing until all tests complete or a blocking issue occurs.

See [architecture details](docs/architecture.md).

## What You Get

After test execution:

- **Interactive HTML Report** with test results and evidence
- **Test Case Reports** (TC-*.md) with step-by-step execution
- **Defect Reports** (DEFECT-*.md) with severity, reproduction steps, and evidence
- **Screenshots** at every major step
- **API & Console Logs** for debugging failures

[Example reports →](docs/reports.md)

## Documentation

- **[Installation Guide](docs/installation.md)**: Detailed installation instructions
- **[Configuration Guide](docs/configuration.md)**: API credentials and environment setup
- **[CLI Reference](docs/cli-reference.md)**: Complete command reference
- **[Architecture](docs/architecture.md)**: System design and implementation details
- **[Test Reports](docs/reports.md)**: Understanding test reports and evidence
- **[Troubleshooting](docs/troubleshooting.md)**: Common issues and solutions
- **[CLAUDE.md](CLAUDE.md)**: Development guide for contributors
- **[Anthropic Blog](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)**: Design patterns for long-running agents

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (TypeScript execution and web server)
- **AI Agent**: [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- **Browser Automation**: [Chrome DevTools MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/chrome-devtools)
- **Job Queue**: SQLite

## Contributing

Contributions welcome! This is a demonstration framework for building autonomous testing agents.

## License

MIT - see [LICENSE.md](LICENSE.md)
