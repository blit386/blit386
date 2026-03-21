---
description: Comprehensive code review with AI analysis, security audit, and PR-ready summary
---

# Deep Review

Comprehensive code review that combines automated checks, AI-powered analysis, and security auditing. Use this before
pushing significant changes or creating pull requests.

## Usage

```text
/deep-review
```

## Steps

1. **Run preflight checks**
   - Execute `pnpm preflight` (format, lint, typecheck, spellcheck, knip)
   - If any check fails, report issues and stop
   - All automated checks must pass before AI review

2. **Run security audit**
   - Execute `pnpm security:audit` (pnpm audit)
   - Report any vulnerabilities found (moderate and above)

3. **Gather change context**
   - Run `git diff origin/main...HEAD` to see all changes vs main
   - Run `git log origin/main..HEAD --oneline` to see commit history
   - Identify which files changed and their purpose

4. **Perform comprehensive code review**
   - Analyze the diff for:
     - Bugs and logic errors
     - Security vulnerabilities
     - Performance issues
     - Error handling gaps
     - Code quality issues
     - Adherence to project conventions
   - Focus only on high-confidence, high-priority issues
   - Verify each issue by reading the actual file contents

5. **Check project-specific rules**
   - No emoji anywhere (code, comments, docs, commits)
   - Integer coordinates (Vector2i, Rect2i) for all rendering
   - TypeScript strict types (no `any`)
   - Type imports use `import type` syntax

6. **Generate PR-ready summary**
   - Create a summary suitable for PR description

## Output Format

```md
## Pre-Push Review Summary

### Changes Overview

- [Brief description of what changed]
- Files modified: X
- Lines added: +Y, removed: -Z

### Automated Checks

- [PASS/FAIL] Format check
- [PASS/FAIL] Lint check
- [PASS/FAIL] Type check
- [PASS/FAIL] Spell check
- [PASS/FAIL] Unused exports (knip)
- [PASS/FAIL] Security audit

### Code Review Findings

#### Critical Issues

- [File:Line] Description (must fix before merge)

#### Warnings

- [File:Line] Description (should address)

#### Suggestions

- Description (nice to have)

### Verdict

[READY TO PUSH / NEEDS FIXES / NEEDS DISCUSSION]
```
