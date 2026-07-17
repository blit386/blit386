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
- Shared UI kit: on-screen UI comes from `src/shared/ui.js` (`applyTheme()` in `init()` before `BT.paletteSet()`,
  `ui.tick()` as the first line of `update()`, `ui.begin()` / widgets / `ui.end()` in `render()`). Never hand-rolled
  panels, buttons, or HUD text colors (`018-flurry` is the only intentional exception: immersive screensaver, no demo
  HUD)
- Touch usability: every key-triggered action also has a `ui.button` with a `{ key }` binding, directional input also
  has `ui.dpadWidget()` and/or `ui.swipe()`, and hardware-showcase demos (028, 031, 035) show a warm "needs a
  keyboard/gamepad" label when `ui.hasTouch()` is true
- Input lifecycle: keyboard edges (`BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, kit `{ key }` bindings via
  `ui.tick()`) are read from `update()`, never `render()`
- Audio: SFX are never assumed to play before the first user gesture (`BT.soundPlay()` before unlock is dropped;
  `BT.musicPlay()` is queued), and audio demos gate their prompt on `BT.isAudioUnlocked`
- New demo files follow the slug naming rule: `NNN-topic.js` with the next free three-digit prefix above the highest in
  use; retired and skipped numbers stay unused (`021` retired; `039` and `040` never used); `00a-*` is the lone
  non-numeric exception
- New demo files use `// @pageTitle Custom Title` in the first 20 lines when the default title
  (`BLIT386 Demo NNN – Title Cased Topic`) is not appropriate; check existing demos for examples
- Hosted demo links use the flat `https://demos.blit386.dev/NNN-slug` form (the old `blit386-demos.vancura.dev` host is
  dead)

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
