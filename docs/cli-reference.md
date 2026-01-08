# CLI Reference

Complete reference for all `e2e` CLI commands.

## General Commands

### `e2e help`

Show help message with available commands.

```bash
e2e help
e2e --help
e2e -h
```

### `e2e version`

Show version information.

```bash
e2e version
e2e --version
e2e -v
```

### `e2e check`

Check if all required dependencies are installed and configured correctly.

```bash
e2e check
```

Verifies:
- Bun runtime
- Node.js and npx
- Chrome/Chromium browser
- AWS credentials (if using Bedrock)
- Anthropic API key (if using Anthropic API)

## Service Management

### `e2e start`

Start services. Can start all services or specific ones.

```bash
# Start all services (executor + web)
e2e start

# Start only the executor (background test execution)
e2e start executor

# Start only the web service (UI on port 5000)
e2e start web
```

The web UI will be available at http://localhost:5000

### `e2e stop`

Stop running services.

```bash
# Stop all services
e2e stop

# Stop only the executor
e2e stop executor

# Stop only the web service
e2e stop web
```

Also cleans up any orphaned Chrome DevTools MCP processes.

### `e2e status`

Show current status of all services.

```bash
e2e status
```

Displays:
- Executor status (running/stopped)
- Web service status (running/stopped)
- Process IDs
- Port information

## Job Management

### `e2e job submit <file>`

Submit a new test job from a test specification file.

```bash
e2e job submit test_spec.txt
e2e job submit quick-start.md
```

The file should contain:
- Application overview and features
- Environment configuration (URLs, credentials)
- Test scenarios and expected results
- Testing priorities and success criteria

Auto-starts the executor if not already running.

### `e2e job list`

List all test jobs with their status.

```bash
e2e job list
```

Shows:
- Job ID
- Job name
- Status (pending/running/completed/failed/cancelled)
- Submission time
- Progress percentage

### `e2e job status <job-id>`

Get detailed status and progress for a specific job.

```bash
e2e job status abc123
```

Displays:
- Current status
- Test progress (passed/failed/blocked/not run)
- Current test being executed
- Estimated completion time
- Links to reports (if available)

### `e2e job cancel <job-id>`

Cancel a running or pending job.

```bash
e2e job cancel abc123
```

## Logging

### `e2e log executor`

View executor logs in real-time (tail -f).

```bash
e2e log executor
```

Press Ctrl+C to exit.

### `e2e log web`

View web service logs.

```bash
e2e log web
```

## Common Workflows

### Start everything and submit a job

```bash
e2e check
e2e start
e2e job submit test_spec.txt
e2e log executor  # Monitor progress
```

### CLI-only workflow (no web UI)

```bash
e2e start executor
e2e job submit test_spec.txt
e2e job status <job-id>
e2e stop executor
```

### Check job progress

```bash
e2e job list
e2e job status <job-id>
e2e log executor  # See detailed logs
```

### Cleanup and restart

```bash
e2e stop
ps -ef | grep chrome-devtools  # Check for orphaned processes
e2e start
```

## Exit Codes

The CLI uses these exit codes:

- `0`: Success
- `1`: General error
- `2`: Missing dependencies
- `3`: Configuration error
- `4`: Service already running
- `5`: Service not running

## Environment Variables

These environment variables affect CLI behavior:

- `CLAUDE_CODE_USE_BEDROCK`: Use AWS Bedrock (set to `1`)
- `AWS_REGION`: AWS region for Bedrock
- `ANTHROPIC_API_KEY`: Anthropic API key

See [Configuration Guide](configuration.md) for details.

## Tips

- Use `e2e check` first to verify your environment is ready
- Jobs are persistent—you can stop services and restart without losing progress
- Use `e2e log executor` to watch tests execute in real-time
- Job IDs are short hashes (e.g., `abc123`), you can copy them from `e2e job list`

## Troubleshooting

If commands aren't working, see the [Troubleshooting Guide](troubleshooting.md).
