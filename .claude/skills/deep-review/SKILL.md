---
name: deep-review
description:
  Comprehensive pre-push review combining automated checks, a security audit, AI code analysis, and a PR-ready summary.
  Use before pushing significant changes or opening a pull request. Takes a package argument (blit386, demos, website,
  kit, create-blit386, or root).
---

# Deep Review

Comprehensive code review that combines automated checks, AI-powered analysis, and security auditing. Use this before
pushing significant changes or creating pull requests.

## Usage

```text
/deep-review <package>
```

## Steps

1. Security MCP preflight (when security tooling is in scope)

- `blit386` and `demos` have MCP-backed security scanning: run `/security-run <package>` or
  `pnpm run security:mcp-preflight` with the session MCP descriptor path and `--allow-fallback`. See
  [docs/security/security-runbook.md](../../../packages/blit386/docs/security/security-runbook.md). Do not skip scans
  when Opsera/JFrog/Semgrep MCP is degraded; use documented fallbacks.
- `website`, `kit`, `create-blit386`, `root` have no MCP security preflight – skip straight to step 3.

2. Run preflight checks

- Run `/preflight <package>` (or the underlying commands – see that skill for the full breakdown)
- If any check fails, report issues and stop; all automated checks must pass before AI review

3. Run security audit

- `blit386` / `demos`: `pnpm run security:audit` (their own `pnpm audit --audit-level=moderate` script)
- `website`, `kit`, `create-blit386`, `root`: no dedicated `security:audit` script – run
  `pnpm audit --audit-level=moderate` directly (it audits the single shared lockfile regardless of cwd, so the result is
  the same from any of these)
- Report any vulnerabilities found (moderate and above)

4. Gather change context

- Run `git diff origin/main...HEAD` to see all changes vs. main
- Run `git log origin/main..HEAD --oneline` to see commit history
- Identify which files changed and their purpose

5. Perform comprehensive code review

- Analyze the diff for: bugs and logic errors, security vulnerabilities, performance issues, error handling gaps, code
  quality issues, adherence to project conventions
- Focus only on high-confidence, high-priority issues
- Verify each issue by reading the actual file contents

6. Check project-specific rules

- Apply the same project-rule checklist as `/review <package>` (full detail: root and package `CLAUDE.md`, plus the rule
  files under `.claude/rules/`)

7. Generate PR-ready summary

- Create a summary suitable for a PR description

## Output Format

```md
## Pre-Push Review Summary

### Changes Overview

- [Brief description of what changed]
- Files modified: X
- Lines added: +Y, removed: -Z

### Automated Checks

- One [PASS/FAIL] line per check the package's preflight runs (see `/preflight <package>` for the current list)
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
