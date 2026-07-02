---
name: demos-review
description:
  Review the current changes against project rules, conventions, and quality standards. Use when the user asks to review
  changes, check the diff before committing, or look over recent edits.
---

# Review Changes

Review current changes against project rules and quality standards.

## Usage

```text
/demos-review
```

## Steps

1. Gather changes

- Run `git diff` to see all unstaged modifications
- Run `git diff --cached` to see staged changes
- List which files were modified and what changed

2. Run automated checks

- `pnpm run lint` – Report any lint issues
- `pnpm run spellcheck` – Check for spelling issues
- `pnpm run build` – Confirm the production build succeeds (deployment gate for Cloudflare Pages)

3. Check against project rules

- No emoji anywhere (code, comments, docs, commits)
- Integer coordinates (Vector2i, Rect2i) for rendering
- Plain JavaScript (ES2022, no TypeScript)
- Proper error handling (guard clauses, null checks)
- Consistent naming conventions
- Beginner-friendly comments in `src/*.js` demo files: every logical block must have a plain-English comment explaining
  what it does and why. Comments that only restate the code (e.g., "// increment counter" above `i++`) are not
  sufficient. Math functions, loop structures, and engine API calls must be explained in plain language.
- New demo files follow the slug naming rule: `NNN-topic.js` with the next free three-digit prefix; retired numbers stay
  unused (e.g. `021` is retired and must not be reused); `00a-*` is the lone non-numeric exception
- New demo files use `// @pageTitle Custom Title` in the first 20 lines when the default title
  (`BLIT386 Demo NNN – Title Cased Topic`) is not appropriate; check existing demos for examples

4. Summarize findings

- List critical issues that must be fixed
- List warnings and suggestions for improvement
- Highlight any security concerns

## Output Format

```md
## Critical Issues

- [File:Line] Description of issue

## Warnings

- [File:Line] Description of warning

## Suggestions

- Consider doing X for better Y

## Summary

Overall assessment of the changes and readiness for commit.
```
