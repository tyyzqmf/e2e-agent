# Troubleshooting Guide

Common issues and solutions when using E2E Agent.

## Installation Issues

### "Bun not found"

**Problem**: `e2e: command not found` or `bun: command not found`

**Solution**:
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Add to PATH (check installer output for exact command)
source ~/.bashrc  # or source ~/.zshrc

# Verify
bun --version
```

If still not working:
```bash
# Manual PATH configuration
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
```

### "Node.js or npx not found"

**Problem**: Chrome DevTools MCP cannot start

**Solution**:
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS
brew install node

# Verify
node --version
npx --version
```

### "Chrome/Chromium not found"

**Problem**: Browser automation fails

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y chromium-browser

# macOS
brew install --cask google-chrome

# Verify
google-chrome --version  # or chromium-browser --version
```

### Installation script fails

**Problem**: `curl | bash` fails with permission errors

**Solution**:
```bash
# Download script first
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh -o install.sh

# Review script
cat install.sh

# Run with explicit bash
bash install.sh

# If permission denied, check directory permissions
ls -la ~/.e2e-agent/
```

## Configuration Issues

### "AWS credentials not found"

**Problem**: `Error: Missing AWS credentials`

**Solution**:
```bash
# Check if credentials are configured
aws sts get-caller-identity

# If not configured, run aws configure
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID='your-key'
export AWS_SECRET_ACCESS_KEY='your-secret'
export AWS_REGION='us-west-2'

# Verify
aws sts get-caller-identity
```

### "ANTHROPIC_API_KEY not set"

**Problem**: `Error: ANTHROPIC_API_KEY environment variable is not set`

**Solution**:
```bash
# Set API key
export ANTHROPIC_API_KEY='sk-ant-...'

# Make persistent
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc

# Verify
echo $ANTHROPIC_API_KEY
```

### "Access denied" for Bedrock

**Problem**: `AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel`

**Solution**:

Add Bedrock permissions to your IAM user/role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
    }
  ]
}
```

Or use IAM user with AdministratorAccess for testing.

### "Region not supported"

**Problem**: `Error: Model not available in region`

**Solution**:
```bash
# Claude models are available in these regions
export AWS_REGION=us-west-2    # Oregon (recommended)
# or
export AWS_REGION=us-east-1    # Virginia
```

## Service Issues

### "Web UI not accessible"

**Problem**: Cannot access http://localhost:5000

**Solution**:
```bash
# Check if web service is running
e2e status

# Check port 5000 is not in use
lsof -i :5000
# If port in use, kill the process or use different port

# Check logs
e2e log web

# Restart services
e2e stop
e2e start
```

### "Executor not starting"

**Problem**: `e2e start executor` completes but executor not running

**Solution**:
```bash
# Check executor status
e2e status

# Check logs for errors
e2e log executor

# Common issues:
# 1. Check dependencies
e2e check

# 2. Kill orphaned processes
ps -ef | grep "bun.*executor"
kill <pid>

# 3. Clean restart
e2e stop
e2e start executor
```

### "Service already running"

**Problem**: `Error: Service is already running`

**Solution**:
```bash
# Stop services first
e2e stop

# If stop doesn't work, manually kill processes
ps -ef | grep "e2e-agent"
kill <pid>

# Clean restart
e2e start
```

### Port already in use

**Problem**: `Error: Port 5000 is already in use`

**Solution**:
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill <pid>

# Or use different port (requires code change)
# Edit src/server/index.ts and change PORT constant
```

## Job Execution Issues

### "Job stuck in pending"

**Problem**: Job status stays "pending" and never starts

**Solution**:
```bash
# Check executor is running
e2e status

# If not running, start it
e2e start executor

# Check executor logs
e2e log executor

# Verify job exists
e2e job list
```

### "Job failed immediately"

**Problem**: Job status changes to "failed" right after submission

**Solution**:
```bash
# Check executor logs for error
e2e log executor

# Common causes:
# 1. Invalid test spec file
cat test_spec.txt  # verify format

# 2. Missing API credentials
e2e check

# 3. Project directory permission issues
ls -la generations/<project-name>/
```

### "Tests not executing"

**Problem**: Job shows "running" but no tests execute

**Solution**:
```bash
# Check agent logs
tail -f generations/<project-name>/logs/*.log

# Check test_cases.json was created
cat generations/<project-name>/test_cases.json

# Verify claude-progress.txt for errors
cat generations/<project-name>/claude-progress.txt

# Check executor is still running
e2e status

# Restart executor
e2e stop executor
e2e start executor
```

### "All tests show 'Not Run'"

**Problem**: Tests never get executed, all remain "Not Run"

**Solution**:

This usually means the Test Planner session completed but Test Executor sessions aren't starting.

```bash
# Check if test planning completed
ls -la generations/<project-name>/test_cases.json

# Check agent logs
tail -100 generations/<project-name>/logs/*.log

# Look for:
# - "Test planning session completed"
# - "Starting test execution session"

# If planning didn't complete, test spec might be invalid
# Review test_spec.txt format
```

## Chrome DevTools Issues

### "Chrome DevTools MCP not available"

**Problem**: `Error: MCP server 'chrome-devtools' not available`

**Solution**:
```bash
# Check Node.js and npx
node --version
npx --version

# Check Chrome is installed
google-chrome --version

# Test MCP server manually
npx -y @modelcontextprotocol/server-chrome-devtools

# If it starts, the issue is in configuration
# Check src/agent/security/mcp-servers.ts
```

### "Browser launch failed"

**Problem**: `Error: Failed to launch browser`

**Solution**:

**On Linux**:
```bash
# Install missing dependencies
sudo apt-get update
sudo apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2

# If running in Docker/container, ensure these flags are used:
# --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage
# (These are already configured in the framework)
```

**On macOS**:
```bash
# Reset Chrome
rm -rf ~/Library/Application\ Support/Google/Chrome

# Reinstall Chrome
brew reinstall --cask google-chrome
```

### "Chrome crashes or hangs"

**Problem**: Browser launches but crashes or becomes unresponsive

**Solution**:
```bash
# Check system resources
free -h  # Linux
vm_stat  # macOS

# Ensure at least 2GB free memory

# Kill all Chrome processes
pkill -f chrome

# Restart services
e2e stop
e2e start
```

### Orphaned Chrome processes

**Problem**: Chrome processes remain after stopping services

**Solution**:
```bash
# Check for Chrome DevTools MCP processes
ps -ef | grep chrome-devtools

# Kill orphaned processes
pkill -f chrome-devtools
pkill -f chrome

# Stop services cleanly
e2e stop  # This also cleans up orphaned processes

# Verify
ps -ef | grep chrome
```

## Test Execution Issues

### "Test fails but should pass"

**Problem**: Test reports failure but manual testing works

**Causes and Solutions**:

1. **Timing issue**: Page not fully loaded
   ```
   Solution: Increase wait times in test spec
   Add explicit "wait for element" instructions
   ```

2. **Element selectors changed**: UI updated but test not updated
   ```
   Solution: Update test spec with new selectors
   Review screenshot to see actual UI state
   ```

3. **Test data issue**: Account locked, data changed, etc.
   ```
   Solution: Verify test accounts still valid
   Check application state
   Reset test data
   ```

4. **Environment issue**: Wrong URL, wrong credentials
   ```
   Solution: Review test_env.json
   Update test_spec.txt with correct config
   ```

### "Test blocked"

**Problem**: Test status shows "Blocked"

**Meaning**: Test cannot proceed due to external dependency

**Common causes**:
- Previous test failed and broke application state
- Test account locked or expired
- Required test data missing
- Application bug blocking test flow

**Solution**:
```bash
# Check defect report for blocked test
cat generations/<project-name>/test-reports/defect-reports/DEFECT-*.md

# Review test dependencies
cat generations/<project-name>/test_cases.json | grep -A 5 "Blocked"

# Fix blocking issue and resubmit job
e2e job submit test_spec.txt
```

### "Screenshots not captured"

**Problem**: Test reports show missing screenshot links

**Solution**:
```bash
# Check screenshots directory
ls -la generations/<project-name>/test-reports/screenshots/

# Check disk space
df -h

# Check agent logs for screenshot errors
grep -i "screenshot" generations/<project-name>/logs/*.log

# Verify Chrome DevTools MCP is working
e2e log executor | grep -i "chrome"
```

### "API logs empty"

**Problem**: Test failed but no API logs captured

**Explanation**: API logs only capture failed network requests. If the test failed for non-network reasons (UI issue, timeout, etc.), there may be no API logs.

**Solution**: Check console logs and screenshots instead:
```bash
cat generations/<project-name>/test-reports/logs/TC-XXX-console-logs.txt
open generations/<project-name>/test-reports/screenshots/TC-XXX-*.png
```

## Performance Issues

### "Tests running very slowly"

**Problem**: Each test takes >15 minutes

**Solutions**:

1. **Reduce test complexity**: Break large tests into smaller ones
2. **Check network latency**: Test against local/staging environment
3. **Increase timeout limits**: Edit `src/agent/config.ts`
4. **Check system resources**: Ensure adequate CPU/memory

### "High API costs"

**Problem**: Running tests costs more than expected

**Solutions**:

1. **Reduce test count**: Start with 10-20 tests for demos
   - Edit `src/agent/prompts/test_planner_prompt.md`

2. **Use simpler test scenarios**: Avoid complex multi-step tests

3. **Check token usage**:
   ```bash
   grep -i "token" generations/<project-name>/logs/*.log
   ```

4. **Use AWS Bedrock**: Better pricing than Anthropic API

### "Context limit exceeded"

**Problem**: `Error: Maximum context length exceeded`

**Solution**:

This shouldn't happen due to stateless sessions, but if it does:

```bash
# Check agent config
cat src/agent/config.ts | grep -i "token"

# Reduce MAX_OUTPUT_TOKENS if too high
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096

# Ensure auto-continuation is working
grep -i "continuation" generations/<project-name>/logs/*.log
```

## Database Issues

### "Cannot write to database"

**Problem**: `Error: SQLITE_CANTOPEN` or similar

**Solution**:
```bash
# Check database file permissions
ls -la data/jobs.db

# If doesn't exist, create data directory
mkdir -p data
chmod 755 data

# Restart services
e2e stop
e2e start
```

### "Database locked"

**Problem**: `Error: database is locked`

**Solution**:
```bash
# Check for multiple web services
ps -ef | grep "bun.*server"

# Kill duplicate processes
kill <pid>

# Restart cleanly
e2e stop
e2e start
```

## Log Analysis

### Enable debug logging

```bash
# Set environment variable
export DEBUG=1

# Restart services
e2e stop
e2e start

# Logs will be more verbose
e2e log executor
```

### View all logs

```bash
# Executor logs
tail -f logs/executor_*.log

# Agent logs (during execution)
tail -f generations/<project-name>/logs/*.log

# Web server logs
e2e log web
```

### Search logs for errors

```bash
# Find errors in executor logs
grep -i "error" logs/executor_*.log

# Find errors in agent logs
grep -i "error" generations/<project-name>/logs/*.log

# Find API issues
grep -i "api" generations/<project-name>/logs/*.log
```

## Getting Help

If you're still stuck after trying these solutions:

1. **Check logs**: Detailed error messages in logs often point to the issue
   ```bash
   e2e log executor
   tail -100 generations/<project-name>/logs/*.log
   ```

2. **Run environment check**: Verify all dependencies
   ```bash
   e2e check
   ```

3. **Clean restart**: Stop everything and start fresh
   ```bash
   e2e stop
   pkill -f e2e-agent
   pkill -f chrome
   e2e start
   ```

4. **File an issue**: https://github.com/tyyzqmf/e2e-agent/issues
   - Include output of `e2e check`
   - Include relevant log excerpts
   - Include test spec if possible (remove sensitive data)

## Known Issues

### Issue: Web UI shows "Loading..." indefinitely

**Status**: Known issue in some environments

**Workaround**: Use CLI instead of Web UI
```bash
e2e job submit test_spec.txt
e2e job status <job-id>
```

### Issue: macOS "setsid: command not found"

**Status**: Fixed in v2.0.0+

**Workaround**: Update to latest version
```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/e2e-agent/main/install.sh | bash
```

## Related Documentation

- [Installation Guide](installation.md)
- [Configuration Guide](configuration.md)
- [CLI Reference](cli-reference.md)
- [Architecture](architecture.md)
