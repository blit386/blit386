---
name: review
description:
  Review the current changes against project rules, conventions, and quality standards. Use when the user asks to review
  changes, check the diff before committing, or look over recent edits. Takes a package argument (blit386, demos,
  docs-site, kit, create-blit386).
---

# Review Changes

Review current changes against project rules and quality standards.

## Usage

```text
/review <package>
```

Where `<package>` is one of `blit386`, `demos`, `docs-site`, `kit`, `create-blit386`.

## Steps

1. Gather changes

- Run `git diff` (unstaged) and `git diff --cached` (staged)
- Run `git ls-files --others --exclude-standard` to catch newly created (untracked) files a diff alone misses
- List which files changed and what changed

2. Run automated checks

- `blit386`: `pnpm run lint`, `pnpm run typecheck`, `pnpm run spellcheck` (all inside `packages/blit386`)
- `demos`: `pnpm run lint`, `pnpm run spellcheck`, `pnpm run build` (production build is the deployment gate for
  Cloudflare Pages)
- `docs-site`: covered by `/preflight docs-site` – run it before merge
- `kit` / `create-blit386`: `pnpm run typecheck` (per package); root `pnpm run format:check` covers lint via Biome

3. Check against project rules

Full detail lives in the root `CLAUDE.md` and the package's own `CLAUDE.md`, plus the rule files under `.claude/rules/`
– read those for the exact getter list, naming exceptions, and edge cases rather than relying on a paraphrase here.

Shared across every package:

- No emoji anywhere (code, comments, docs, commits)
- American English spelling, with the documented exemptions (`AnalyserNode`, the `gray`/`grey` alias)
- Consistent naming conventions, proper error handling (guard clauses, null checks)

`blit386`:

- Integer coordinates (`Vector2i`, `Rect2i`) for rendering
- TypeScript strict types (no `any`); type-only imports for types
- Internal scoped naming: private/protected/module-local names don't repeat the class or file name (`request()` on
  `FrameCapture`, not `requestCapture()`); public `BT.*` and barrel exports stay unchanged
- BT API shape: read-only zero-arg snapshots are getters (`BT.displaySize`, `BT.targetFPS`), not `BT.foo()`; actions and
  parameterized queries stay methods

`demos`:

- Integer coordinates (`Vector2i`, `Rect2i`) for rendering
- Plain JavaScript (ES2022, no TypeScript)
- Beginner-friendly comments: every logical block in `src/*.js` needs a plain-English comment explaining what it does
  and why. A comment that only restates the code (`// increment counter` above `i++`) is not sufficient
- Shared UI kit only – on-screen UI comes from `src/shared/ui.js` (`applyTheme()` in `init()` before `BT.paletteSet()`,
  `ui.tick()` first in `update()`, `ui.begin()` / widgets / `ui.end()` in `render()`); never hand-rolled panels,
  buttons, or HUD colors (`flurry` is the one intentional exception)
- Touch usability: every key-triggered action also has a `ui.button` with a `{ key }` binding; directional input also
  has `ui.dpadWidget()` / `ui.swipe()`
- Keyboard edges (`BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, kit `{ key }` bindings via `ui.tick()`) read
  from `update()`, never `render()`
- Audio: SFX never assumed to play before the first user gesture; audio demos gate their prompt on `BT.isAudioUnlocked`
- New demo slugs: number-free kebab-case, first path segment starts with a letter

`docs-site`:

- MDX pages have `title` frontmatter; descriptions where helpful
- Links point to stable URLs; engine API links go to site paths (`/docs/api/...`, `/docs/guides/...`) for anything in
  the engine's `docs/_sitemap.json` manifest. Only unmirrored contributor docs link to GitHub
- No hand-edits to generated files: `content/docs/{api,guides,performance,reference}/**` and
  `src/data/api-history.generated.json` come from `pnpm run sync:docs`
- Config changes (`press.config.tsx`, `source.config.ts`) reflected in `CLAUDE.md` if behavior changed

`kit` / `create-blit386`:

- Named exports only in library TypeScript; no default exports
- Beginner-friendly comments in scaffold templates and kit content
- Scaffold templates: placeholders render (no leftover `{{tokens}}`); optional wizard flags copy the right
  `templates/optional/` trees; generated `package.json` must not leak `workspace:*`
- Kit content is self-contained: skills and docs reference only `blit386` and other local kit files, never the `demos`
  package
- Generated game code uses public `BT` names from `blit386`
- Docs and kit content updated when workflow or architecture changes

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

## Notes

- Run or suggest `/preflight <package>` before approving – that is the full gate.
