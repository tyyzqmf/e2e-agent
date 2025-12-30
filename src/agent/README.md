# Autonomous Agent Demo

A minimal harness demonstrating long-running autonomous agents with the Claude Agent SDK. This demo supports two modes:

1. **Coding Mode**: Build complete applications using a two-agent pattern (initializer + coding agent)
2. **Testing Mode**: Execute comprehensive end-to-end tests using a two-agent pattern (test planner + test executor)

## Prerequisites

**Required:** Install the latest versions of both Claude Code and the Claude Agent SDK:

```bash
# Install Claude Code CLI (latest version required)
npm install -g @anthropic-ai/claude-code

# Install Python dependencies
pip install -r requirements.txt
```

Verify your installations:
```bash
claude --version  # Should be latest version
pip show claude-code-sdk  # Check SDK is installed
```

**API Configuration:** Choose one option:

**Option 1 - Anthropic API:**
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

**Option 2 - AWS Bedrock:**
```bash
export USE_AWS_BEDROCK=true
export AWS_REGION=us-east-1  # or your preferred region

# Configure AWS credentials (choose one):
aws configure  # AWS CLI method
# OR
export AWS_ACCESS_KEY_ID='your-access-key'
export AWS_SECRET_ACCESS_KEY='your-secret-key'
# OR use IAM role (if on EC2/ECS/Lambda)
```

## Quick Start

### Coding Mode (Build Applications)

```bash
python autonomous_agent_demo.py --mode coding --project-dir ./my_project
```

### Testing Mode (Execute Tests)

```bash
python autonomous_agent_demo.py --mode testing --project-dir ./my_test_project
```

For testing with limited iterations:
```bash
python autonomous_agent_demo.py --mode testing --project-dir ./my_test --max-iterations 3
```

## Important Timing Expectations

> **Warning: These demos take a long time to run!**

### Coding Mode
- **First session (initialization):** The agent generates a `feature_list.json` with 200 test cases. This takes several minutes and may appear to hang - this is normal.
- **Subsequent sessions:** Each coding iteration can take **5-15 minutes** depending on complexity.
- **Full app:** Building all 200 features typically requires **many hours** of total runtime.

### Testing Mode
- **First session (test planning):** The agent generates a `test_cases.json` with 200 test cases. This takes several minutes and may appear to hang - this is normal.
- **Subsequent sessions:** Each test execution iteration can take **5-15 minutes** depending on test complexity and browser automation.
- **Full test suite:** Executing all 200 test cases typically requires **many hours** of total runtime.

**Tip:** The 200 items parameter in the prompts is designed for comprehensive coverage. If you want faster demos, you can modify the prompts to reduce the count (e.g., 20-50 items for a quicker demo).

## How It Works

### Coding Mode: Two-Agent Pattern

1. **Initializer Agent (Session 1):** Reads `app_spec.txt`, creates `feature_list.json` with 200 test cases, sets up project structure, and initializes git.

2. **Coding Agent (Sessions 2+):** Picks up where the previous session left off, implements features one by one, and marks them as passing in `feature_list.json`.

### Testing Mode: Two-Agent Pattern

1. **Test Planner Agent (Session 1):** Reads `test_spec.txt`, creates `test_cases.json` with 200 test cases, sets up test report structure, and initializes git.

2. **Test Executor Agent (Sessions 2+):** Picks up where the previous session left off, executes test cases one by one using Chrome DevTools MCP, captures evidence (screenshots, logs), documents results, and creates defect reports for failures.

### Session Management

- Each session runs with a fresh context window
- Progress is persisted via JSON files (`feature_list.json` or `test_cases.json`) and git commits
- The agent auto-continues between sessions (3 second delay)
- Press `Ctrl+C` to pause; run the same command to resume

## Security Model

This demo uses a defense-in-depth security approach (see `security.py` and `client.py`):

1. **OS-level Sandbox:** Bash commands run in an isolated environment
2. **Filesystem Restrictions:** File operations restricted to the project directory only
3. **Bash Allowlist:** Only specific commands are permitted:
   - File inspection: `ls`, `cat`, `head`, `tail`, `wc`, `grep`
   - Node.js: `npm`, `node`
   - Version control: `git`
   - Process management: `ps`, `lsof`, `sleep`, `pkill` (dev processes only)

Commands not in the allowlist are blocked by the security hook.

## Project Structure

```
autonomous-testing/
├── autonomous_agent_demo.py  # Main entry point
├── agent.py                  # Agent session logic (both modes)
├── client.py                 # Claude SDK client configuration
├── security.py               # Bash command allowlist and validation
├── progress.py               # Progress tracking utilities
├── prompts.py                # Prompt loading utilities
├── prompts/
│   ├── app_spec.txt          # Application specification (coding mode)
│   ├── test_spec.txt         # Test specification (testing mode)
│   ├── initializer_prompt.md # Coding mode: first session prompt
│   ├── coding_prompt.md      # Coding mode: continuation session prompt
│   ├── test_planner_prompt.md    # Testing mode: first session prompt
│   └── test_executor_prompt.md   # Testing mode: continuation session prompt
└── requirements.txt          # Python dependencies
```

## Generated Project Structure

### Coding Mode Output

After running in coding mode, your project directory will contain:

```
my_project/
├── feature_list.json         # Test cases (source of truth)
├── app_spec.txt              # Copied specification
├── init.sh                   # Environment setup script
├── claude-progress.txt       # Session progress notes
├── .claude_settings.json     # Security settings
└── [application files]       # Generated application code
```

### Testing Mode Output

After running in testing mode, your project directory will contain:

```
my_test_project/
├── test_cases.json           # Test cases (source of truth)
├── test_spec.txt             # Copied test specification
├── test_env.json             # Test environment configuration
├── claude-progress.txt       # Session progress notes
├── .claude_settings.json     # Security settings
└── test-reports/             # Test execution results
    └── 2025-12-04_143022/   # Timestamped test run
        ├── Test_Report_Viewer.html      # HTML report viewer
        ├── test-case-reports/           # Individual test reports
        │   ├── TC-001-Login.md
        │   ├── TC-002-Registration.md
        │   └── ...
        ├── defect-reports/              # Defect documentation
        │   ├── DEFECT-001.md
        │   └── DEFECT-002.md
        ├── test-summary-report.md       # Overall test summary
        ├── screenshots/                 # Visual evidence
        │   ├── 01_TC-001_login_page.png
        │   ├── 02_TC-001_success.png
        │   └── ...
        └── logs/                        # API and console logs
            ├── api_error_TC-001_auth.json
            ├── console_TC-002.log
            └── ...
```

## Running Generated Applications (Coding Mode)

After the coding agent completes (or pauses), you can run the generated application:

```bash
cd generations/my_project

# Run the setup script created by the agent
./init.sh

# Or manually (typical for Node.js apps):
npm install
npm run dev
```

The application will typically be available at `http://localhost:3000` or similar (check the agent's output or `init.sh` for the exact URL).

## Viewing Test Reports (Testing Mode)

After the testing agent completes (or pauses), you can view the test reports:

```bash
cd generations/my_test_project/test-reports

# Find the latest timestamped directory
ls -lt

# Open the HTML report viewer in a browser
# Or browse the markdown reports in test-case-reports/ and defect-reports/
```

The test reports include:
- **Test execution summary** with pass/fail statistics
- **Individual test case reports** with steps, results, and evidence
- **Defect reports** with screenshots, logs, and reproduction steps
- **Visual evidence** (screenshots at each test step)
- **API and console logs** for failed tests

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--mode` | Agent mode: `coding` or `testing` | `coding` |
| `--project-dir` | Directory for the project | `./autonomous_demo_project` |
| `--max-iterations` | Max agent iterations | Unlimited |
| `--model` | Claude model to use | `claude-sonnet-4-5-20250929` |

## Customization

### Coding Mode: Changing the Application

Edit `prompts/app_spec.txt` to specify a different application to build.

### Testing Mode: Changing the Test Target

Edit `prompts/test_spec.txt` to specify a different web application to test.

### Adjusting Item Count

- **Coding Mode:** Edit `prompts/initializer_prompt.md` and change the "200 features" requirement
- **Testing Mode:** Edit `prompts/test_planner_prompt.md` and change the "200 test cases" requirement

Use smaller numbers (e.g., 20-50) for faster demos.

### Modifying Allowed Commands

Edit `security.py` to add or remove commands from `ALLOWED_COMMANDS`.

## Testing Mode Details

### Browser Automation

Testing mode uses **Chrome DevTools MCP** (Model Context Protocol) for browser automation instead of Puppeteer. This provides:

- Comprehensive browser inspection capabilities
- Network request/response capture
- Console log collection
- Multi-tab management
- Screenshot and snapshot functionality

### Evidence Collection

Every test execution captures:

1. **Screenshots** at each major step
2. **API logs** for failed network requests
3. **Console logs** for JavaScript errors
4. **Detailed test results** with actual vs. expected outcomes

### Defect Documentation

When tests fail, the agent automatically creates defect reports following industry standards:

- **Severity classification** (Critical/High/Medium/Low)
- **Steps to reproduce**
- **Expected vs. actual results**
- **Evidence links** (screenshots, logs)
- **Environment information**

### Test Standards

Testing mode follows best practices from the project:

- Industry-standard test case design
- Comprehensive evidence collection
- Professional defect documentation
- Test validation criteria

## Troubleshooting

**"Appears to hang on first run"**
This is normal. The agent is generating 200 detailed items (features or test cases), which takes significant time. Watch for `[Tool: ...]` output to confirm the agent is working.

**"Command blocked by security hook"**
The agent tried to run a command not in the allowlist. This is the security system working as intended. If needed, add the command to `ALLOWED_COMMANDS` in `security.py`.

**"API key/credentials not set"**
Ensure `ANTHROPIC_API_KEY` is exported (for Anthropic API) or `USE_AWS_BEDROCK=true` with AWS credentials configured (for AWS Bedrock).

**"Chrome DevTools MCP not available" (Testing Mode)**
Ensure you have the latest version of Claude Code installed with MCP support.

## Examples

### Build a Web Application

```bash
# Edit prompts/app_spec.txt with your application requirements
python autonomous_agent_demo.py --mode coding --project-dir ./my_app
```

### Test an Existing Application

```bash
# Edit prompts/test_spec.txt with your application details
python autonomous_agent_demo.py --mode testing --project-dir ./my_tests
```

### Quick Demo with Limited Iterations

```bash
# Testing mode with only 3 iterations
python autonomous_agent_demo.py --mode testing --project-dir ./quick_test --max-iterations 3
```

## Architecture

Both modes follow the same architectural patterns:

- **Two-agent pattern** for long-running tasks
- **JSON as source of truth** for progress tracking
- **Git for persistence** across sessions
- **Fresh context windows** for each session
- **Autonomous continuation** between sessions
- **Security-first design** with sandboxing and allowlists

## License

Internal Anthropic use.
