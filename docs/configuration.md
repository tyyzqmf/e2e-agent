# Configuration Guide

## API Credentials

Choose one of the following options:

### Option 1: AWS Bedrock (Recommended)

AWS Bedrock provides Claude models with higher rate limits and better reliability.

```bash
# Enable Bedrock
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2

# Recommended output token settings for Bedrock
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096
export MAX_THINKING_TOKENS=1024
```

**Configure AWS credentials:**

```bash
# Option A: Using AWS CLI
aws configure

# Option B: Using environment variables
export AWS_ACCESS_KEY_ID='your-access-key'
export AWS_SECRET_ACCESS_KEY='your-secret-key'
```

**Verify credentials:**

```bash
aws sts get-caller-identity
```

**Required IAM permissions:**

Your AWS user/role needs `bedrock:InvokeModel` permission for the Claude model:

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

### Option 2: Anthropic API

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

Get your API key from: https://console.anthropic.com/

## Model Configuration

Default model: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

This model ID works for both AWS Bedrock and Anthropic API.

**To use a different model:**

Edit `src/agent/config.ts` and change the `DEFAULT_MODEL` constant.

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLAUDE_CODE_USE_BEDROCK` | No | `0` | Set to `1` to use AWS Bedrock |
| `AWS_REGION` | When using Bedrock | `us-west-2` | AWS region for Bedrock |
| `AWS_ACCESS_KEY_ID` | When using Bedrock | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | When using Bedrock | - | AWS secret key |
| `ANTHROPIC_API_KEY` | When using Anthropic API | - | Anthropic API key |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | No | `4096` | Maximum output tokens per request |
| `MAX_THINKING_TOKENS` | No | `1024` | Maximum thinking tokens |

## Persistent Configuration

To avoid setting environment variables every time, add them to your shell profile:

**Bash (~/.bashrc):**

```bash
# Add to end of file
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096
export MAX_THINKING_TOKENS=1024
```

**Zsh (~/.zshrc):**

```bash
# Add to end of file
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096
export MAX_THINKING_TOKENS=1024
```

Then reload:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Test Specification Configuration

When submitting a test job, your test specification file must include:

1. **Application Overview**: What you're testing
2. **Test Scenarios**: What features/flows to test
3. **Environment Config**:
   - Application URLs
   - Test accounts and credentials
   - Browser settings
   - Any API keys or tokens needed

See `test_spec.txt.template` for a complete example.

## Chrome DevTools Configuration

The framework automatically configures Chrome DevTools MCP with these settings:

- Headless mode enabled
- Sandbox flags for containerized environments
- DevTools protocol enabled

To customize, edit `src/agent/security/mcp-servers.ts`.

## Next Steps

- [Learn CLI commands](cli-reference.md)
- [Understand architecture](architecture.md)
- [Troubleshooting](troubleshooting.md)
