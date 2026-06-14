---
name: bt-review
description:
  Review the current changes against project rules, conventions, and quality standards. Use when the user asks to review
  changes, check the diff before committing, or look over recent edits.
---

# Review Changes

Review current changes against project rules and quality standards.

## Usage

```text
/bt-review
```

## Steps

1. **Gather changes**

- Run `git diff` to see all unstaged modifications
- Run `git diff --cached` to see staged changes
- List which files were modified and what changed

2. **Run automated checks**

- `pnpm run lint` - Report any lint issues
- `pnpm run typecheck` - Report any type errors
- `pnpm run spellcheck` - Check for spelling issues

3. **Check against project rules**

- No emoji anywhere (code, comments, docs, commits)
- Integer coordinates (Vector2i, Rect2i) for rendering
- TypeScript strict types (no `any`)
- Type imports use `import type` syntax
- Proper error handling (guard clauses, null checks)
- Consistent naming conventions
- **Internal scoped naming:** private/protected/module-local names must not repeat class or file name (`request()` on
  `FrameCapture`, not `requestCapture()`). Public `BT.*` and barrel exports stay unchanged. See `CLAUDE.md` (**Internal
  scoped naming**).
- **BT API shape:** read-only zero-arg snapshots use getters (`BT.displaySize`, `BT.targetFPS`), not `BT.foo()`. Actions
  and parameterized queries stay methods. New configure mirrors use `HardwareSettings` field names (`targetFPS`, not
  `fps`). Derived getters (e.g. `outputSize`) have no matching field. See `CLAUDE.md` (**BT API: getters vs methods**).

4. **Summarize findings**

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

Overall assessment of the changes and readiness for a commit.
```
