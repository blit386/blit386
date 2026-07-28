# Review Changes

Review current changes against project rules and quality standards.

## Usage

```text
/bt-review
```

## Steps

1. Gather changes

- Run `git diff` to see all unstaged modifications
- Run `git diff --cached` to see staged changes
- List which files were modified and what changed

2. Run automated checks

- `pnpm run lint` – Report any lint issues
- `pnpm run typecheck` – Report any type errors
- `pnpm run spellcheck` – Check for spelling issues

3. Check against project rules

Full detail lives in `CLAUDE.md` (Critical Rules, BT API: getters vs methods, Internal scoped naming, Boolean naming)
and the paired rule files (`.claude/rules/*.md`, Cursor: `.cursor/rules/*.mdc`) – read those for the exact getter list,
naming exceptions, and edge cases rather than relying on a paraphrase here. Rules below are cited by basename, which is
the same in both directories. Quick checklist:

- No emoji anywhere (code, comments, docs, commits)
- Integer coordinates (Vector2i, Rect2i) for rendering
- TypeScript strict types (no `any`); type-only imports for types
- Proper error handling (guard clauses, null checks); consistent naming
- Internal scoped naming: private/protected/module-local names don't repeat the class or file name (`request()` on
  `FrameCapture`, not `requestCapture()`); public `BT.*` and barrel exports stay unchanged (`internal-scoped-naming`
  rule)
- BT API shape: read-only zero-arg snapshots are getters (`BT.displaySize`, `BT.targetFPS`), not `BT.foo()`; actions and
  parameterized queries stay methods (`bt-api-getters` rule)

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

Overall assessment of the changes and readiness for a commit.
```
