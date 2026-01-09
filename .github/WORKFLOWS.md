# GitHub Workflows - Quick Reference

This is a quick reference for all GitHub workflows. For detailed documentation, see [WORKFLOWS_SUMMARY.md](../WORKFLOWS_SUMMARY.md).

## 📊 Active Workflows (14 total)

### Core CI/CD (3)

1. **CI** (`ci.yml`) - Lint, TypeCheck, Tests, Build
   - Triggers: Push to main, PRs
   - Required for merge

2. **E2E Tests** (`e2e-test.yml`) - Framework testing
   - Triggers: Push to main, PRs, Daily 2 AM, Manual

3. **Build & Release** (`release.yml`) - Multi-platform binaries
   - Triggers: Tags (v*), Manual

### Security (2)

4. **CodeQL** (`codeql.yml`) - Security analysis
   - Triggers: Push to main, PRs, Weekly (Tue)

5. **Security Scan** (`security-scan.yml`) - Comprehensive scanning
   - Triggers: Push to main, PRs, Weekly (Mon 9 AM), Manual
   - Tools: Trivy, NPM Audit, Gitleaks, OSV Scanner, License Check

### Quality & Performance (2)

6. **Coverage** (`coverage.yml`) - Code coverage tracking
   - Triggers: Push to main, PRs

7. **Benchmarks** (`benchmark.yml`) - Performance monitoring
   - Triggers: Push to main, PRs, Weekly (Sun 3 AM), Manual

### Community Management (7)

8. **Auto-merge Dependabot** (`auto-merge-dependabot.yml`)
   - Auto-merges patch/minor updates

9. **PR Size Labeler** (`pr-size-label.yml`)
   - Labels: XS, S, M, L, XL

10. **PR Title Lint** (`pr-title-lint.yml`)
    - Enforces Conventional Commits

11. **Docs Check** (`docs-check.yml`)
    - Reminds to update docs

12. **Stale** (`stale.yml`)
    - Closes inactive issues/PRs

13. **Greetings** (`greetings.yml`)
    - Welcomes new contributors

14. **Label** (`label.yml`)
    - Auto-labels PRs by files

## 🚀 Quick Commands

```bash
# Manual trigger
gh workflow run ci.yml
gh workflow run e2e-test.yml

# Check status
gh run list --workflow=ci.yml

# Re-run failed
gh run rerun RUN_ID --failed
```

## 📋 Required Checks

These must pass before merging PRs:
- ✅ Lint & Format
- ✅ TypeScript Type Check
- ✅ Unit Tests
- ✅ Build Verification

## 🔧 Setup

See [WORKFLOW_SETUP.md](WORKFLOW_SETUP.md) for:
- Required secrets (optional CODECOV_TOKEN)
- Repository settings
- Branch protection rules
- Troubleshooting

## 🎯 Status Badges

```markdown
[![CI](https://github.com/tyyzqmf/e2e-agent/workflows/CI/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tyyzqmf/e2e-agent/workflows/CodeQL%20Advanced/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/codeql.yml)
[![License](https://img.shields.io/github/license/tyyzqmf/e2e-agent)](LICENSE)
```

## 📚 Additional Documentation

- [**WORKFLOW_SETUP.md**](WORKFLOW_SETUP.md) - Setup and configuration guide
- [**CONTRIBUTING.md**](CONTRIBUTING.md) - Contribution guidelines
- [**SECURITY.md**](SECURITY.md) - Security policy

---

Last updated: 2026-01-09
