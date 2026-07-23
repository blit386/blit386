# Review Changes

Review current changes against create-blit386 conventions and quality standards.

## Usage

```text
/cbt-review
```

## Steps

1. Gather changes

- Run `git diff` (unstaged) and `git diff --cached` (staged)
- Run `git ls-files --others --exclude-standard` to catch newly created (untracked) files that a diff alone misses
- List which files changed and what changed, including the untracked files above

2. Run automated checks

- `pnpm run lint` – Biome lint
- `pnpm run typecheck` – TypeScript across all packages
- `pnpm run spellcheck` – cspell

3. Check against project rules

- No emoji anywhere (code, docs, user-facing strings, commits)
- Named exports only in library TypeScript; no default exports
- Beginner-friendly comments in scaffold templates and kit content
- Scaffold templates: placeholders render (no leftover `{{tokens}}`); optional wizard flags copy the right
  `templates/optional/` trees; generated `package.json` must not leak `workspace:*`
- Kit content is self-contained: skills and docs reference only `blit386` and other local kit files, never the
  `blit386-demos` repo
- Generated game code uses public `BT` names from the sibling `blit386` repo
- Docs and kit content updated when workflow or architecture changes (see `.claude/rules/docs-sync-required.md`)

4. Summarize findings

- List critical issues to fix, then warnings, then suggestions

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

## Notes

- Run or suggest `pnpm run preflight` (or `/cbt-preflight`) before approving; that is the full gate, including
  `agents:check`, `sync:cursor-commands:check`, and the script-level agent/cursor unit tests as well as package suites.
