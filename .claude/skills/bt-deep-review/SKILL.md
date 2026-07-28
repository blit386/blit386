---
name: bt-deep-review
description:
  Comprehensive pre-push review combining automated checks, a security audit, AI code analysis, and a PR-ready summary.
  Use before pushing significant changes or opening a pull request.
---

# Deep Review

Comprehensive code review that combines automated checks, AI-powered analysis, and security auditing. Use this before
pushing significant changes or creating pull requests.

## Usage

```text
/bt-deep-review
```

## Steps

1. Security MCP preflight (when security tooling is in scope)

- Run `/bt-security-run` or `pnpm run security:mcp-preflight` with the session MCP descriptor path and
  `--allow-fallback`
- See [docs/security/security-runbook.md](../../../docs/security/security-runbook.md)
- Do not skip scans when Opsera/JFrog/Semgrep MCP is degraded; use documented fallbacks

2. Run preflight checks

- Run `/bt-preflight` (or `pnpm run preflight` directly) – see that skill for the full breakdown of what it checks
- If any check fails, report issues and stop
- All automated checks must pass before AI review

3. Run security audit

- Execute `pnpm run security:audit` (pnpm audit)
- Report any vulnerabilities found (moderate and above)

4. Gather change context

- Run `git diff origin/main...HEAD` to see all changes vs. main
- Run `git log origin/main..HEAD --oneline` to see commit history
- Identify which files changed and their purpose

5. Perform comprehensive code review

- Analyze the diff for:
  - Bugs and logic errors
  - Security vulnerabilities
  - Performance issues
  - Error handling gaps
  - Code quality issues
  - Adherence to project conventions
- Focus only on high-confidence, high-priority issues
- Verify each issue by reading the actual file contents

6. Check project-specific rules

- Apply the same project-rule checklist as `/bt-review` (full detail: `CLAUDE.md` Critical Rules, BT API getters vs
  methods, Internal scoped naming, plus the paired rule files – `.claude/rules/*.md`, Cursor: `.cursor/rules/*.mdc`)

7. Generate PR-ready summary

- Create a summary suitable for PR description

## Output Format

```md
## Pre-Push Review Summary

### Changes Overview

- [Brief description of what changed]
- Files modified: X
- Lines added: +Y, removed: -Z

### Automated Checks

- One [PASS/FAIL] line per check `pnpm run preflight` runs (see `/bt-preflight` for the current list)
- [PASS/FAIL] Security audit

### Code Review Findings

#### Critical Issues

- [File:Line] Description (must fix before the merge)

#### Warnings

- [File:Line] Description (should address)

#### Suggestions

- Description (nice to have)

### Verdict

[READY TO PUSH / NEEDS FIXES / NEEDS DISCUSSION]
```
