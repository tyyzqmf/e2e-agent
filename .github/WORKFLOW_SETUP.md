# Workflow Setup Guide

This guide explains how to set up and configure all GitHub workflows for the E2E Agent project.

## 📋 Overview

The project includes 14 automated workflows covering:
- ✅ Continuous Integration (CI)
- 🚀 Build & Release
- 🔒 Security Scanning
- 📊 Performance Benchmarking
- 📈 Code Coverage
- 🤖 Community Management

## 🔧 Required Secrets

### For Code Coverage (Optional)

**CODECOV_TOKEN**
   - Generate at: https://codecov.io/gh/tyyzqmf/e2e-agent/settings
   - Add to: Repository Settings → Secrets → Actions
   - Optional: Workflows work without it, but coverage won't upload to Codecov

## 🎯 Required Settings

### GitHub Repository Settings

#### 1. Enable GitHub Actions
- Go to: Settings → Actions → General
- Set: "Allow all actions and reusable workflows"
- Enable: "Read and write permissions" for GITHUB_TOKEN
- Enable: "Allow GitHub Actions to create and approve pull requests"

#### 2. Enable Dependabot
- Go to: Settings → Security → Code security and analysis
- Enable: "Dependabot alerts"
- Enable: "Dependabot security updates"
- Enable: "Dependabot version updates"

#### 3. Enable Security Features
- Go to: Settings → Security → Code security and analysis
- Enable: "Dependency graph"
- Enable: "Dependabot alerts"
- Enable: "Code scanning" (CodeQL)
- Enable: "Secret scanning"

#### 4. Branch Protection Rules
- Go to: Settings → Branches → Add rule
- Branch name pattern: `main`
- Enable:
  - ✅ Require a pull request before merging
  - ✅ Require status checks to pass before merging
    - Add: `lint`, `typecheck`, `test`, `build`
  - ✅ Require conversation resolution before merging
  - ✅ Require linear history
  - ✅ Include administrators

#### 5. Enable GitHub Packages
- Go to: Settings → Actions → General
- Under "Workflow permissions":
  - Enable: "Read and write permissions"

## 🚀 Workflow Triggers

### Automatic Triggers

| Workflow | Trigger |
|----------|---------|
| CI | Every push to `main`, every PR |
| CodeQL | Every push to `main`, every PR, Weekly (Tue) |
| E2E Tests | Every push to `main`, every PR, Daily at 2 AM |
| Security Scan | Every push to `main`, every PR, Weekly (Mon 9 AM) |
| Benchmarks | Every push to `main`, every PR, Weekly (Sun 3 AM) |
| Coverage | Every push to `main`, every PR |
| Stale Issues | Daily at midnight |
| Build & Release | When tags pushed (v*) |

### Manual Triggers

All workflows support manual triggering via `workflow_dispatch`.

To manually trigger:
1. Go to: Actions → Select workflow
2. Click: "Run workflow"
3. Select branch and options
4. Click: "Run workflow"

## 📊 Status Badges

Add these badges to your README.md:

```markdown
<!-- Build Status -->
[![CI](https://github.com/tyyzqmf/e2e-agent/workflows/CI/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/ci.yml)
[![E2E Tests](https://github.com/tyyzqmf/e2e-agent/workflows/E2E%20Tests/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/e2e-test.yml)
[![Release](https://github.com/tyyzqmf/e2e-agent/workflows/Build%20and%20Release/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/release.yml)

<!-- Security -->
[![CodeQL](https://github.com/tyyzqmf/e2e-agent/workflows/CodeQL%20Advanced/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/codeql.yml)
[![Security Scan](https://github.com/tyyzqmf/e2e-agent/workflows/Security%20Scanning/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/security-scan.yml)

<!-- Coverage -->
[![codecov](https://codecov.io/gh/tyyzqmf/e2e-agent/branch/main/graph/badge.svg)](https://codecov.io/gh/tyyzqmf/e2e-agent)
[![Coverage](https://github.com/tyyzqmf/e2e-agent/workflows/Code%20Coverage/badge.svg)](https://github.com/tyyzqmf/e2e-agent/actions/workflows/coverage.yml)

<!-- License -->
[![License](https://img.shields.io/github/license/tyyzqmf/e2e-agent)](LICENSE)
```

## 🔍 Monitoring Workflows

### View Workflow Runs
- Go to: Actions tab
- Select workflow from left sidebar
- View run history and details

### Debugging Failed Workflows

1. **Check workflow logs**:
   - Click on failed run
   - Expand failed job
   - Review error messages

2. **Re-run workflows**:
   - Click "Re-run jobs" button
   - Or: "Re-run failed jobs"

3. **Test locally**:
   ```bash
   # Install act (GitHub Actions local runner)
   brew install act  # macOS
   # or
   curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

   # Run workflow locally
   act -j test
   act -j lint
   ```

## 🛡️ Security Best Practices

### 1. Protect Secrets
- Never commit secrets to code
- Use repository secrets for sensitive data
- Rotate tokens regularly
- Use environment secrets for production

### 2. Review Dependabot PRs
- Check for breaking changes
- Review changelogs
- Test before merging
- Auto-merge only patch/minor updates

### 3. Monitor Security Scans
- Review CodeQL findings weekly
- Address critical vulnerabilities immediately
- Keep dependencies updated
- Review security advisories

### 4. Audit Workflow Permissions
- Use minimal required permissions
- Review `permissions:` in workflows
- Limit GITHUB_TOKEN scope
- Use read-only by default

## 📈 Optimization Tips

### 1. Speed Up CI
```yaml
# Use caching
- uses: actions/cache@v3
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('bun.lockb') }}

# Run jobs in parallel
jobs:
  test:
    strategy:
      matrix:
        node-version: [18, 20]
```

### 2. Reduce Workflow Runs
```yaml
# Skip CI on docs-only changes
on:
  push:
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

### 3. Use Workflow Concurrency
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## 🔄 Maintenance

### Weekly Tasks
- [ ] Review Dependabot PRs
- [ ] Check security scan results
- [ ] Review stale issues/PRs

### Monthly Tasks
- [ ] Review workflow efficiency
- [ ] Update action versions
- [ ] Rotate access tokens
- [ ] Review branch protection rules

### Quarterly Tasks
- [ ] Audit workflow permissions
- [ ] Review CI/CD pipeline
- [ ] Update documentation
- [ ] Performance optimization

## 🆘 Troubleshooting

### Common Issues

**1. "NPM_TOKEN not found"**
```
Solution: Add NPM_TOKEN to repository secrets
Settings → Secrets → Actions → New repository secret
```

**2. "Permission denied: packages"**
```
Solution: Enable package write permissions
Settings → Actions → General → Workflow permissions → Read and write
```

**3. "Rate limit exceeded"**
```
Solution: Use GITHUB_TOKEN for API calls
Add: env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**4. "Docker build failed"**
```
Solution: Check Dockerfile syntax and dependencies
Test locally: docker build -t e2e-agent:test .
```

**5. "Tests failing in CI but pass locally"**
```
Solution: Check environment differences
- Node/Bun versions
- Environment variables
- File paths
- Chrome/browser availability
```

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)

## ✅ Setup Checklist

Use this checklist when setting up workflows:

- [ ] Enable GitHub Actions
- [ ] Configure branch protection
- [ ] Add required secrets (NPM_TOKEN)
- [ ] Enable Dependabot
- [ ] Enable security features
- [ ] Add status badges to README
- [ ] Test manual workflow triggers
- [ ] Review and merge first Dependabot PR
- [ ] Monitor first few workflow runs
- [ ] Document any custom configurations

---

Last updated: 2026-01-09
