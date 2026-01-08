# Test Reports Guide

## Report Structure

After test execution, the following reports are generated in the `generations/<project-name>/test-reports/` directory:

```
test-reports/
├── Test_Report_Viewer.html       # Interactive HTML viewer
├── test-summary-report.md        # Overall summary
├── test-case-reports/            # Individual test reports
│   ├── TC-001.md
│   ├── TC-002.md
│   └── ...
├── defect-reports/               # Defect documentation
│   ├── DEFECT-001.md
│   ├── DEFECT-002.md
│   └── ...
├── screenshots/                  # Visual evidence
│   ├── TC-001-step1.png
│   ├── TC-001-step2.png
│   └── ...
├── snapshots/                    # DOM snapshots (HTML)
│   └── ...
└── logs/                         # API and console logs
    ├── TC-001-api-logs.txt
    ├── TC-001-console-logs.txt
    └── ...
```

## Report Types

### 1. Test Report Viewer (HTML)

**File**: `Test_Report_Viewer.html`

Interactive HTML report that provides:
- Test execution summary with pass/fail statistics
- Filterable test case list
- Embedded screenshots and logs
- Click-to-expand defect details
- Links to individual reports

**Features**:
- View all test results at a glance
- Filter by status (Pass/Fail/Blocked)
- Search test cases by name
- One-click access to evidence

**Usage**:
```bash
# Open in browser
open test-reports/Test_Report_Viewer.html

# Or
cd test-reports && python3 -m http.server 8080
# Then visit http://localhost:8080/Test_Report_Viewer.html
```

### 2. Test Summary Report

**File**: `test-summary-report.md`

Executive summary with:

```markdown
# Test Summary Report

## Overview
- **Total Tests**: 50
- **Passed**: 42 (84%)
- **Failed**: 6 (12%)
- **Blocked**: 2 (4%)

## Test Execution Timeline
- **Start Time**: 2024-01-08 09:00:00
- **End Time**: 2024-01-08 12:30:00
- **Duration**: 3.5 hours

## Pass/Fail Breakdown by Category
- User Authentication: 10/10 passed
- Shopping Cart: 8/10 passed (2 failed)
- Checkout Process: 5/8 passed (2 failed, 1 blocked)
- ...

## Critical Issues Found
1. DEFECT-003: Payment processing timeout (Critical)
2. DEFECT-007: Shipping address not validated (High)
...

## Recommendations
- Fix critical payment processing issue before release
- Add shipping address validation
...
```

### 3. Test Case Reports

**Files**: `test-case-reports/TC-*.md`

Detailed report for each test case:

```markdown
# TC-001: User Login with Valid Credentials

## Test Information
- **Test ID**: TC-001
- **Status**: Pass
- **Executed**: 2024-01-08 09:15:00
- **Duration**: 45 seconds

## Test Description
Verify that users can successfully log in with valid credentials.

## Test Steps

### Step 1: Navigate to login page
- **Action**: Open https://example.com/login
- **Expected**: Login page displays with username and password fields
- **Actual**: Login page loaded successfully
- **Evidence**: [TC-001-step1.png](../screenshots/TC-001-step1.png)

### Step 2: Enter valid credentials
- **Action**: Enter username "testuser" and password
- **Expected**: Fields accept input
- **Actual**: Credentials entered successfully
- **Evidence**: [TC-001-step2.png](../screenshots/TC-001-step2.png)

### Step 3: Click login button
- **Action**: Click "Log In" button
- **Expected**: User redirected to dashboard
- **Actual**: Successfully redirected to dashboard
- **Evidence**: [TC-001-step3.png](../screenshots/TC-001-step3.png)

## Test Result
**PASS** - All steps completed successfully

## Evidence Links
- Screenshots: [step1](../screenshots/TC-001-step1.png), [step2](../screenshots/TC-001-step2.png), [step3](../screenshots/TC-001-step3.png)
- API Logs: [TC-001-api-logs.txt](../logs/TC-001-api-logs.txt)
- Console Logs: [TC-001-console-logs.txt](../logs/TC-001-console-logs.txt)
```

### 4. Defect Reports

**Files**: `defect-reports/DEFECT-*.md`

Professional defect documentation:

```markdown
# DEFECT-003: Payment Processing Timeout

## Defect Information
- **Defect ID**: DEFECT-003
- **Related Test**: TC-018
- **Severity**: Critical
- **Status**: Open
- **Reported**: 2024-01-08 10:30:00

## Summary
Payment processing times out after 30 seconds, preventing users from completing checkout.

## Severity Classification
**Critical** - Blocks core business functionality (checkout/payment)

## Steps to Reproduce
1. Add items to shopping cart
2. Proceed to checkout
3. Enter shipping information
4. Select "Credit Card" payment method
5. Enter card details: 4242 4242 4242 4242, Exp: 12/25, CVV: 123
6. Click "Complete Payment"
7. Wait for 30 seconds

## Expected Result
- Payment processes successfully within 5 seconds
- User sees confirmation message
- Order confirmation email sent

## Actual Result
- Payment processing spinner shows for 30 seconds
- Error message: "Request timeout. Please try again."
- Payment not processed
- No order created

## Environment
- **Application URL**: https://example.com
- **Browser**: Chrome 120.0
- **Test Account**: testuser@example.com
- **Test Date**: 2024-01-08 10:30:00

## Evidence
### Screenshots
- [Before payment](../screenshots/TC-018-step5.png)
- [Timeout error](../screenshots/TC-018-step6-error.png)

### API Logs
```
POST /api/payments/process
Request: {
  "orderId": "ORD-12345",
  "amount": 99.99,
  "card": "4242..."
}
Response: 504 Gateway Timeout after 30000ms
```

See [full API logs](../logs/TC-018-api-logs.txt)

### Console Errors
```
[Error] Payment API request timeout
[Error] Uncaught TypeError: Cannot read property 'status' of undefined
```

See [full console logs](../logs/TC-018-console-logs.txt)

## Root Cause Analysis
Payment gateway API not responding within configured timeout limit.

## Recommended Fix
1. Investigate payment gateway performance
2. Increase timeout to 60 seconds
3. Add retry logic for transient failures
4. Implement better error handling and user feedback

## Impact
- Users cannot complete purchases
- Revenue loss
- Poor user experience
- Potential cart abandonment

## Notes
This issue occurs consistently with all test accounts and payment methods.
```

## Evidence Collection

### Screenshots

Captured automatically at each major step:
- **Format**: PNG
- **Naming**: `TC-XXX-stepN.png`
- **Content**: Full-page screenshot with visible UI elements
- **Timing**: Before and after each action

**Best Practices**:
- Screenshots show exact state at time of action
- Errors and alerts are captured
- Sensitive data (passwords, credit cards) may be visible - handle appropriately

### API Logs

Network requests and responses:
- **Format**: Plain text
- **Naming**: `TC-XXX-api-logs.txt`
- **Content**: Request/response details for failed API calls

**Example**:
```
=== Failed Network Requests ===

Request #1
URL: POST https://example.com/api/payments/process
Status: 504 Gateway Timeout
Duration: 30000ms

Request Headers:
  Content-Type: application/json
  Authorization: Bearer eyJ...

Request Body:
  {
    "orderId": "ORD-12345",
    "amount": 99.99
  }

Response Body:
  {
    "error": "Gateway timeout"
  }
```

### Console Logs

JavaScript errors and warnings:
- **Format**: Plain text
- **Naming**: `TC-XXX-console-logs.txt`
- **Content**: Console errors, warnings, and relevant logs

**Example**:
```
=== Console Errors ===

[Error] TypeError: Cannot read property 'status' of undefined
  at handlePaymentResponse (checkout.js:245)
  at XMLHttpRequest.onload (checkout.js:180)

[Warning] Failed to load resource: net::ERR_CONNECTION_TIMED_OUT

[Error] Uncaught (in promise) Error: Payment processing failed
  at processPayment (payment.js:89)
```

### DOM Snapshots

HTML snapshots at key points:
- **Format**: HTML
- **Naming**: `TC-XXX-snapshot-N.html`
- **Content**: Complete DOM state
- **Usage**: Detailed debugging of UI state

## Severity Classification

Defects are classified using industry-standard severity levels:

### Critical
- **Definition**: Blocks core business functionality
- **Examples**:
  - Cannot complete checkout
  - Cannot log in
  - Data loss or corruption
  - Security vulnerabilities
- **SLA**: Fix immediately

### High
- **Definition**: Significant impact on functionality
- **Examples**:
  - Feature not working as specified
  - Poor performance (>5s load time)
  - Validation errors allowing bad data
- **SLA**: Fix within 1 sprint

### Medium
- **Definition**: Moderate impact, workaround available
- **Examples**:
  - UI display issues
  - Minor functionality problems
  - Inconsistent behavior
- **SLA**: Fix within 2 sprints

### Low
- **Definition**: Minor issues with minimal impact
- **Examples**:
  - Cosmetic issues
  - Typos
  - Minor UI inconsistencies
- **SLA**: Fix when convenient

## Report Access Methods

### 1. Via Web UI

After test completion:
1. Go to http://localhost:5000
2. Click on completed job
3. Click "View Reports" button
4. Download report package (ZIP)

### 2. Via Filesystem

Reports are in the project directory:
```bash
cd generations/<project-name>/test-reports/
open Test_Report_Viewer.html
```

### 3. Via CLI

```bash
# List reports
ls -la generations/*/test-reports/

# Open summary
cat generations/<project-name>/test-reports/test-summary-report.md

# Find failed tests
grep -l "FAIL" generations/<project-name>/test-reports/test-case-reports/*.md
```

## Report Customization

### Modify Report Templates

Edit templates in `src/agent/templates/`:
- `test-case-report-template.md`: Test case format
- `defect-report-template.md`: Defect report format

### Change Report Format

Edit `src/agent/prompts/test_executor_prompt.md` to change:
- Screenshot frequency
- Log detail level
- Evidence collection criteria

## Report Retention

Reports are stored indefinitely unless manually deleted:

```bash
# Clean up old reports
rm -rf generations/old-project-name/test-reports/

# Archive reports
tar -czf test-reports-2024-01-08.tar.gz generations/*/test-reports/
```

## Sharing Reports

### Package for Sharing

```bash
# Create report package
cd generations/<project-name>
zip -r test-reports.zip test-reports/

# Or tar
tar -czf test-reports.tar.gz test-reports/
```

### Upload to CI/CD

```bash
# GitHub Actions example
- name: Upload test reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: generations/*/test-reports/
```

### Email Reports

The summary report is human-readable and can be emailed directly:

```bash
# Email summary
cat generations/<project-name>/test-reports/test-summary-report.md | \
  mail -s "Test Execution Summary" team@example.com
```

## Interpreting Results

### Green Test Suite (High Pass Rate)

If 90%+ tests pass:
- Application is likely production-ready
- Focus on fixing critical and high-severity defects
- Review blocked tests for environment issues

### Yellow Test Suite (Moderate Pass Rate)

If 70-90% tests pass:
- Significant issues remain
- Review defect reports to prioritize fixes
- May need another test cycle after fixes

### Red Test Suite (Low Pass Rate)

If <70% tests pass:
- Major functionality issues
- Not ready for release
- Focus on critical defects first
- Consider retest after major fixes

## Common Questions

**Q: Why are there no API logs for some tests?**

A: API logs only capture failed requests. Passing tests with successful API calls won't generate API logs.

**Q: Can I customize the screenshot frequency?**

A: Yes, edit `src/agent/prompts/test_executor_prompt.md` and adjust the "take screenshot" instructions.

**Q: How do I regenerate reports without re-running tests?**

A: Currently not supported. Reports are generated during test execution.

**Q: Can I export reports to JIRA/TestRail?**

A: Not built-in, but you can write a script to parse the markdown reports and create issues/test cases via API.

## Related Documentation

- [Architecture](architecture.md): How reports are generated
- [CLI Reference](cli-reference.md): Accessing reports via CLI
- [Troubleshooting](troubleshooting.md): Report generation issues
