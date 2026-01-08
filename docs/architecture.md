# Architecture

## System Overview

E2E Agent is built as a **job-based autonomous testing system** with three main components:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web UI        │────▶│   Job Queue      │────▶│   Executor      │
│  (Bun Server)   │     │  (SQLite DB)     │     │  (Background)   │
│  Port 5000      │     │                  │     │   Service       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Claude Agent   │
                                                │  (SDK-based)    │
                                                └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Chrome DevTools │
                                                │      MCP        │
                                                └─────────────────┘
```

## Components

### 1. Web UI (src/server/)

**Technology**: Bun HTTP server with TypeScript

**Responsibilities**:
- Job submission interface
- Job status monitoring
- Test report viewing
- Job queue management

**Key Files**:
- `src/server/index.ts`: Web server entry point
- `src/server/routes/`: API endpoints
- `src/server/services/`: Business logic
- `src/server/templates/`: HTML templates

### 2. Job Queue (SQLite)

**Technology**: SQLite database

**Schema**:
```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spec TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  project_dir TEXT
);
```

**Job States**:
- `pending`: Waiting for executor to pick up
- `running`: Currently being executed
- `completed`: Successfully finished
- `failed`: Execution failed
- `cancelled`: User cancelled the job

### 3. Executor (src/cli/)

**Technology**: Long-running Bun process

**Responsibilities**:
- Poll job queue for new jobs
- Spawn Claude Agent for test execution
- Monitor agent progress
- Update job status in database

**Key Files**:
- `src/cli/run-executor.ts`: Executor main loop
- `src/cli/services/executor.ts`: Executor service implementation
- `src/cli/services/job.ts`: Job management logic

### 4. Claude Agent (src/agent/)

**Technology**: Claude Agent SDK with TypeScript

**Responsibilities**:
- Test planning (Session 1)
- Test execution (Sessions 2+)
- Evidence collection
- Report generation

**Key Files**:
- `src/agent/index.ts`: Agent entry point
- `src/agent/agent.ts`: Core agent loop
- `src/agent/client.ts`: Claude SDK configuration
- `src/agent/prompts/`: Agent prompts
  - `test_planner_prompt.md`: Planning phase
  - `test_executor_prompt.md`: Execution phase

## Two-Agent Pattern

The framework uses a **stateless two-agent approach** where each session runs with a fresh context:

### Session 1: Test Planner Agent

```
Test Specification (Plain English)
         ↓
┌────────────────────────┐
│  Test Planner Agent    │
│                        │
│  Reads: test_spec.txt  │
│                        │
│  Generates:            │
│  - test_cases.json     │ (50 detailed test cases)
│  - test_env.json       │ (environment config)
│  - Report structure    │
└────────────────────────┘
```

**Prompt**: `src/agent/prompts/test_planner_prompt.md`

**Outputs**:
- `test_cases.json`: Array of test cases with structure, steps, expected results
- `test_env.json`: Extracted environment configuration from test spec
- `test-reports/`: Directory structure with templates

### Sessions 2+: Test Executor Agent

```
┌────────────────────────┐
│  Test Executor Agent   │
│                        │
│  Reads:                │
│  - test_cases.json     │ (find next test to run)
│  - test_env.json       │ (get config)
│  - claude-progress.txt │ (session notes)
│                        │
│  Executes:             │
│  - Navigate browser    │
│  - Perform test steps  │
│  - Capture evidence    │
│  - Update test status  │
│                        │
│  Auto-continues until  │
│  all tests complete    │
└────────────────────────┘
```

**Prompt**: `src/agent/prompts/test_executor_prompt.md`

**Actions per test**:
1. Read next "Not Run" test from `test_cases.json`
2. Use Chrome DevTools MCP to execute test steps
3. Capture screenshots at each major step
4. Capture API logs and console errors
5. Update test status (Pass/Fail/Blocked)
6. Generate test case report (TC-*.md)
7. Generate defect report if failed (DEFECT-*.md)
8. Update `claude-progress.txt` with notes
9. Auto-continue to next test (3-second delay)

## Progress Persistence

Since each session has a fresh context, progress persists through files:

### test_cases.json (Source of Truth)

```json
[
  {
    "id": "TC-001",
    "title": "User Login",
    "status": "Pass",
    "steps": [...],
    "expected_results": [...],
    "actual_results": "...",
    "evidence": {
      "screenshots": ["TC-001-step1.png", ...],
      "logs": ["TC-001-api-logs.txt"]
    }
  },
  ...
]
```

**Status Values**:
- `Not Run`: Test hasn't been executed yet
- `Pass`: Test passed all validations
- `Fail`: Test failed with defect
- `Blocked`: Test blocked by dependency or environment issue

### test_env.json

Extracted environment configuration:
```json
{
  "application_url": "https://example.com",
  "test_accounts": [
    {"username": "testuser1", "password": "..."}
  ],
  "browser_settings": {
    "headless": true
  }
}
```

### claude-progress.txt

Session notes and next steps:
```
Session 15 completed at 2024-01-08 10:30:00
- Executed TC-015: Shopping Cart Checkout (PASS)
- Found JavaScript error in checkout form
- Next: Continue with TC-016

Progress: 15/50 tests completed
Pass: 12, Fail: 2, Blocked: 1
```

## Auto-Continuation Logic

The agent automatically continues until completion:

```typescript
// src/agent/agent.ts
while (shouldContinue()) {
  const result = await runSession();

  if (result.stopReason === 'end_turn') {
    // Agent finished current test, continue to next
    await sleep(AUTO_CONTINUE_DELAY);
    continue;
  }

  if (result.stopReason === 'max_tokens') {
    // Context limit reached, start new session
    await sleep(AUTO_CONTINUE_DELAY);
    continue;
  }

  // Stop if all tests complete or error occurs
  if (allTestsComplete() || result.stopReason === 'error') {
    break;
  }
}
```

**Exit Conditions**:
- All tests have status (no "Not Run" tests remaining)
- Max iterations reached (configurable in `src/agent/config.ts`)
- Unrecoverable error occurred
- User manually stopped the executor

## Security Model

Defense-in-depth security with three layers:

### 1. OS-Level Sandbox

Bash commands run in isolated environment using Bun's sandbox mode.

### 2. Filesystem Restrictions

All file operations are restricted to the project directory only:

```typescript
// src/agent/client.ts
const client = new Agent({
  sandboxing: {
    enabled: true,
    cwd: projectDir,  // Restrict to project directory
  }
});
```

### 3. Tool Permissions

Explicit allowlist for all tools and MCP servers:

```typescript
// src/agent/security/tools.ts
export const ALLOWED_TOOLS = [
  'bash',
  'str_replace_editor',
  'list_files',
  'read_file',
  // ... explicit list
];

// .claude_settings.json (generated)
{
  "allowedTools": [...],
  "mcpServers": {
    "chrome-devtools": {
      "allowedTools": ["navigate", "screenshot", "click", ...]
    }
  }
}
```

See `src/agent/security/` for full implementation.

## Browser Automation

### Chrome DevTools MCP

The framework uses Chrome DevTools Protocol via MCP server:

```typescript
// src/agent/security/mcp-servers.ts
export const MCP_SERVERS = {
  "chrome-devtools": {
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-chrome-devtools",
      "--browser-args",
      "--headless --no-sandbox --disable-setuid-sandbox"
    ],
    allowedTools: [
      "navigate",
      "screenshot",
      "click",
      "fill",
      "select",
      "wait_for",
      "evaluate",
      "get_network_logs",
      "get_console_logs",
      // ... more tools
    ]
  }
};
```

**Available Operations**:
- Page navigation and interaction (click, fill, select)
- Multi-tab management
- Screenshots and DOM snapshots
- Network request/response inspection
- Console log collection
- JavaScript evaluation

**Sandbox Flags**: Safe for containerized environments (Docker, EC2)

## Project Structure

```
src/
├── agent/                    # Claude Agent (TypeScript/Bun)
│   ├── index.ts              # Agent entry point
│   ├── agent.ts              # Core agent loop
│   ├── client.ts             # Claude SDK client
│   ├── config.ts             # Configuration constants
│   ├── types/                # TypeScript types
│   ├── services/             # Business logic
│   │   ├── progress.ts       # Test progress tracking
│   │   ├── prompts.ts        # Prompt loading
│   │   ├── pricing.ts        # Cost calculation
│   │   └── token-usage.ts    # Token usage tracking
│   ├── security/             # Security configuration
│   │   ├── tools.ts          # Tool permissions
│   │   ├── hooks.ts          # Context management
│   │   └── mcp-servers.ts    # MCP server config
│   ├── prompts/              # Agent prompts
│   └── templates/            # Report templates
├── server/                   # Web server (Bun)
│   ├── index.ts              # Server entry point
│   ├── routes/               # API routes
│   ├── services/             # Server services
│   └── templates/            # HTML templates
└── cli/                      # CLI (TypeScript/Bun)
    ├── index.ts              # CLI entry point
    ├── commands/             # CLI commands
    ├── services/             # CLI services
    │   ├── job.ts            # Job management
    │   └── executor.ts       # Test executor
    └── run-executor.ts       # Executor process
```

## Data Flow

### Job Submission Flow

```
User submits test spec
         ↓
Web UI creates job record (status: pending)
         ↓
Job saved to SQLite queue
         ↓
Executor polls queue every 5 seconds
         ↓
Executor picks up job (status: running)
         ↓
Executor spawns Claude Agent with project dir
         ↓
Agent runs autonomously (sessions 1, 2, 3, ...)
         ↓
Executor monitors progress via filesystem
         ↓
Job completes (status: completed/failed)
```

### Test Execution Flow

```
Session 1: Planning
  ↓
test_cases.json created (50 tests, all "Not Run")
  ↓
Session 2: Executor reads first "Not Run" test
  ↓
Execute test → Update status → Write report
  ↓
Auto-continue (3s delay)
  ↓
Session 3: Executor reads next "Not Run" test
  ↓
... repeat until all tests complete
  ↓
Generate test summary report
```

## Performance Considerations

### Context Management

Each session is stateless with fresh context:
- **Pros**: No context bloat, consistent behavior
- **Cons**: Must reload state from files each session

### Auto-Continue Delay

3-second delay between sessions (configurable):
- Prevents API rate limiting
- Allows filesystem sync
- Gives time for background processes

### Parallel Execution

Currently sequential (one test at a time):
- Simpler state management
- Easier debugging
- More reliable evidence collection

Future: Could support parallel execution with multiple browser instances.

## Cost Optimization

The agent tracks token usage and costs:

```typescript
// src/agent/services/pricing.ts
export function calculateCost(usage: TokenUsage): number {
  const inputCost = (usage.input_tokens / 1_000_000) * INPUT_PRICE_PER_MILLION;
  const outputCost = (usage.output_tokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
  return inputCost + outputCost;
}
```

Typical costs:
- Planning session: $0.50 - $1.50
- Per test execution: $0.10 - $0.50
- 50-test suite: ~$10 - $25

## Extensibility

### Custom Prompts

Edit prompts to change agent behavior:
- `src/agent/prompts/test_planner_prompt.md`: Planning logic
- `src/agent/prompts/test_executor_prompt.md`: Execution logic

### Custom Report Templates

Edit templates in `src/agent/templates/`:
- Test case report format
- Defect report format
- Summary report format

### Additional MCP Servers

Add new MCP servers in `src/agent/security/mcp-servers.ts`:
```typescript
export const MCP_SERVERS = {
  "my-custom-server": {
    command: "node",
    args: ["./my-server.js"],
    allowedTools: ["tool1", "tool2"]
  }
};
```

## Monitoring and Observability

### Logs

All logs written to `logs/` directory:
- `executor_<timestamp>.log`: Executor logs
- `autonomous_test_<timestamp>.log`: Agent logs
- `web_server.log`: Web server logs

### Progress Tracking

Real-time progress via:
- Database: `SELECT progress FROM jobs WHERE id = ?`
- Filesystem: Parse `test_cases.json` for status counts
- Logs: Parse `claude-progress.txt` for session notes

### Metrics

Track these metrics for performance:
- Tests per hour
- Average test execution time
- Token usage per test
- Cost per test suite
- Pass/fail ratios

## Related Documentation

- [Installation Guide](installation.md)
- [Configuration Guide](configuration.md)
- [CLI Reference](cli-reference.md)
- [Test Reports](reports.md)
- [Troubleshooting](troubleshooting.md)
