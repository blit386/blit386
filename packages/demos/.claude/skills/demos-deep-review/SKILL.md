---
name: demos-deep-review
description:
  Comprehensive pre-push review combining automated checks, a security audit, AI code analysis, and a PR-ready summary.
  Use before pushing significant changes or opening a pull request.
---

# Deep Review

Comprehensive code review that combines automated checks, AI-powered analysis, and security auditing. Use this before
pushing significant changes or creating pull requests.

## Usage

```text
/demos-deep-review
```

## Steps

1. **Security MCP preflight (when security tooling is in scope)**

- Run `/demos-security-run` or `pnpm run security:mcp-preflight` with the session MCP descriptor path and
  `--allow-fallback`
- See
  [blit-tech/docs/security/security-runbook.md](https://github.com/vancura/blit-tech/blob/main/docs/security/security-runbook.md)
- Do not skip scans when Opsera/JFrog/Semgrep MCP is degraded; use documented fallbacks

2. **Run preflight checks**

- Execute `pnpm run preflight` (format, lint, spellcheck, knip, docs:links)
- Execute `pnpm run build` to confirm the production build succeeds
- If any check fails, report issues and stop
- All automated checks must pass before AI review

3. **Run security audit**

- Execute `pnpm run security:audit` (pnpm audit)
- Report any vulnerabilities found (moderate and above)

4. **Gather change context**

- Run `git diff origin/main...HEAD` to see all changes vs main
- Run `git log origin/main..HEAD --oneline` to see commit history
- Identify which files changed and their purpose

5. **Perform comprehensive code review**

- Analyze the diff for:
  - Bugs and logic errors
  - Security vulnerabilities
  - Performance issues
  - Error handling gaps
  - Code quality issues
  - Adherence to project conventions
- Focus only on high-confidence, high-priority issues
- Verify each issue by reading the actual file contents

6. **Check project-specific rules**

- No emoji anywhere (code, comments, docs, commits)
- Integer coordinates (Vector2i, Rect2i) for all rendering
- Plain JavaScript (ES2022, no TypeScript)
- Beginner-friendly comments in `src/*.js` demo files: every logical block must have a plain-English comment explaining
  what it does and why. Comments that only restate the code (e.g., "// increment counter" above `i++`) are not
  sufficient. Math functions, loop structures, and engine API calls must be explained in plain language.

7. **Generate PR-ready summary**

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
- [PASS/FAIL] Spell check
- [PASS/FAIL] Unused exports (knip)
- [PASS/FAIL] Docs links (docs:links)
- [PASS/FAIL] Build
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
