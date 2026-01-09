# Contributing to E2E Agent

Thank you for your interest in contributing to E2E Agent! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone. Please be professional and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/e2e-agent.git
   cd e2e-agent
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/tyyzqmf/e2e-agent.git
   ```

## Development Setup

### Prerequisites

- **Bun >= 1.0** - [Install Bun](https://bun.sh)
- **Node.js/npx** - For chrome-devtools-mcp
- **Chrome/Chromium** - For browser automation
- **AWS CLI** (optional) - For AWS Bedrock support

### Installation

```bash
# Install dependencies
bun install

# Check environment
./e2e check

# Run tests
bun run test:all
```

### Environment Configuration

For AWS Bedrock (recommended):
```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-west-2
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096
export MAX_THINKING_TOKENS=1024

# Configure AWS credentials
aws configure
```

For Anthropic API:
```bash
export ANTHROPIC_API_KEY='your-api-key'
```

## Making Changes

### Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Use descriptive branch names:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Maintenance tasks

### Development Workflow

1. **Make your changes** in the appropriate files
2. **Write/update tests** for your changes
3. **Run linting and formatting**:
   ```bash
   bun run lint:fix
   bun run format
   ```
4. **Run type checking**:
   ```bash
   bun run typecheck
   ```
5. **Run all tests**:
   ```bash
   bun run test:all
   ```

## Testing

### Test Commands

```bash
# Run all tests
bun run test:all

# Run only Bun runtime tests
bun run test:bun

# Run only CLI integration tests
bun run test:cli
```

### Writing Tests

- Place unit tests in `src/**/__tests__/` directories
- Place integration tests in the `tests/` directory
- Use descriptive test names
- Follow existing test patterns

Example:
```typescript
import { describe, test, expect } from "bun:test";

describe("MyFeature", () => {
  test("should do something correctly", () => {
    // Arrange
    const input = "test";

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

## Submitting Changes

### Before Submitting

Ensure all checks pass:
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run test:all` passes
- [ ] Code is formatted (`bun run format`)
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions

### Create a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Fill out the PR template completely
   - Link related issues
   - Add screenshots if applicable
   - Request review from maintainers

3. **Respond to feedback**:
   - Address review comments promptly
   - Make requested changes
   - Push updates to your branch

### PR Review Process

- Maintainers will review your PR
- CI checks must pass
- At least one approval is required
- Changes may be requested
- Once approved, maintainers will merge

## Coding Standards

### TypeScript Style

- Use TypeScript for all new code
- Provide type annotations for public APIs
- Avoid `any` types when possible
- Use interfaces for object shapes

### Code Quality

- Follow existing code patterns
- Keep functions small and focused
- Use descriptive variable names
- Add comments for complex logic
- Remove console.logs before committing

### Formatting

We use **Biome** for linting and formatting:

```bash
# Check code
bun run lint

# Fix issues automatically
bun run lint:fix

# Format code
bun run format
```

### File Organization

```
src/
├── agent/          # Agent implementation
├── server/         # Web server
├── cli/            # CLI implementation
└── __tests__/      # Tests
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```
feat(agent): add support for custom prompts

Add ability to load custom prompt templates from user-defined directories.
Includes validation and error handling.

Closes #123
```

```
fix(cli): correct job status display

Fix issue where job status was showing incorrect progress percentages.

Fixes #456
```

## Project Structure

Key directories and files:

- `src/agent/` - Core agent implementation
- `src/server/` - Web server for job management
- `src/cli/` - CLI commands and utilities
- `tests/` - Integration tests
- `docs/` - Documentation
- `e2e` - Main CLI entry point

## Questions?

- Open a [Discussion](https://github.com/tyyzqmf/e2e-agent/discussions) for questions
- Check existing [Issues](https://github.com/tyyzqmf/e2e-agent/issues) and [PRs](https://github.com/tyyzqmf/e2e-agent/pulls)
- Read the [Documentation](https://github.com/tyyzqmf/e2e-agent/blob/main/README.md)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to E2E Agent! 🎉
