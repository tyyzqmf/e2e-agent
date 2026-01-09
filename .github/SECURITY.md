# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a Vulnerability

We take the security of E2E Agent seriously. If you believe you have found a security vulnerability, please report it to us responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by:

1. **Email**: Send details to the maintainer at [create an email or security contact]
2. **GitHub Security Advisory**: Use GitHub's [private vulnerability reporting](https://github.com/tyyzqmf/e2e-agent/security/advisories/new)

### What to Include

Please include the following information in your report:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Varies based on severity and complexity

### What to Expect

1. **Acknowledgment**: We'll acknowledge receipt of your report within 48 hours
2. **Assessment**: We'll investigate and determine the severity and impact
3. **Fix Development**: We'll work on a fix for confirmed vulnerabilities
4. **Disclosure**: We'll coordinate disclosure timing with you
5. **Credit**: We'll credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

When using E2E Agent, please follow these security best practices:

### Credential Management

- **Never commit credentials** to version control
- Use environment variables for sensitive data (API keys, passwords)
- Use AWS IAM roles when possible instead of access keys
- Rotate credentials regularly

### Test Specifications

- **Review `test_spec.txt`** before committing - ensure no secrets are included
- Use placeholder values in templates
- Store actual credentials in environment variables or secure vaults

### Environment Configuration

- **Restrict file access**: The agent runs with filesystem restrictions by default
- **Use sandboxed execution**: Enable OS-level sandboxing when available
- **Review MCP server permissions**: Check Chrome DevTools MCP configuration
- **Audit tool permissions**: Review `.claude_settings.json` in generated projects

### Browser Automation

- **Use headless mode** in production environments
- **Implement rate limiting** for test execution
- **Validate URLs** before navigation
- **Sanitize inputs** in test specifications

### AWS Bedrock / Anthropic API

- **Use least-privilege IAM policies**
- **Enable CloudTrail logging** for API calls
- **Monitor usage and costs**
- **Set appropriate token limits**

### Docker/Container Security

When running in containers:
- Use official base images
- Keep images updated
- Run as non-root user when possible
- Limit container resources

## Known Security Considerations

### Chrome DevTools Protocol

E2E Agent uses Chrome DevTools MCP for browser automation. Be aware:

- Browser instances have network access
- Screenshots may contain sensitive information
- Console logs may include credentials or tokens
- Local storage and cookies are accessible

### Claude Agent SDK

The agent executes with specific tool permissions:

- File operations are restricted to the project directory
- Bash commands run in a sandboxed environment
- All tool usage is logged

Review `src/agent/security/` for implementation details.

## Security Updates

Subscribe to security advisories:

- Watch this repository for security updates
- Enable GitHub security alerts
- Monitor the [Security Advisories page](https://github.com/tyyzqmf/e2e-agent/security/advisories)

## Disclosure Policy

- Security fixes will be released as quickly as possible
- A security advisory will be published for confirmed vulnerabilities
- CVE IDs will be requested for significant vulnerabilities
- Users will be notified through GitHub releases and security advisories

## Attribution

We appreciate researchers who report vulnerabilities responsibly and will:

- Credit you in the security advisory
- Add your name to a security hall of fame (if desired)
- Work with you on disclosure timing

Thank you for helping keep E2E Agent and its users safe!
