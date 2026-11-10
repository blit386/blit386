# Run Tests

Run the package's test suite with various options.

## Usage

```text
/test <package>              # Run the package's default test suite
/test blit386 coverage       # Run with coverage report (80% threshold)
/test blit386 watch          # Run in watch mode
/test blit386 visual         # Run visual regression tests (requires Chrome with WebGPU)
/test blit386 <file>         # Run tests for a specific file
```

## packages/blit386

- No arguments: `pnpm run test:unit` (all Vitest tests)
- `coverage`: `pnpm run test:unit:coverage` (with coverage thresholds)
- `watch`: `pnpm run test:unit:watch` (interactive watch mode)
- `visual`: `pnpm run test:visual` (Playwright visual regression; local only - CI runs just the baseline-free subset,
  `pnpm run test:visual:parity`, see `docs/reference-testing.md`)
- File path: `pnpm exec vitest run <path>`

Conventions: test files are colocated (`src/utils/Vector2i.test.ts` next to `Vector2i.ts`); visual tests live in
`tests/visual/`; use `describe`/`it` from vitest (not `test`); follow the source code style (four-space indent, single
quotes, semicolons); no emoji in test descriptions.

Report results: pass count on success; specific failures with file locations and assertion details on failure; coverage
percentages vs. the 80% threshold when running `coverage`. Suggest `pnpm run test:visual:update` when a visual
regression is an intentional change.

## packages/demos

Demo _content_ (`src/<topic>.js`, the interactive WebGPU pieces) has no automated tests. Do not look for Vitest,
Playwright, or a `tests/` directory for those - automated unit or E2E coverage would require a headless WebGPU runtime
(not broadly available) and would largely duplicate what `packages/blit386`'s own suite already covers. Correctness is
verified by:

1. Running the dev server (`pnpm run dev`) and opening the demo in a browser
2. The production build (`pnpm run build`) - a build failure surfaces broken imports or plugin errors
3. Preflight checks (`/preflight demos`) - format:check, lint, test, spellcheck, knip, check:demo-registry,
   check:demo-comment-links (the production build is not part of preflight)

What to do instead: verify a new demo with `pnpm run dev` + manual exercise; confirm no build regression with
`pnpm run build`; check code quality with `/preflight demos` or `/review demos`; full pre-push audit with
`/deep-review demos`.

Tooling _scripts_, _plugins_, the shared UI kit, and the `/shots` page are different. `pnpm run test` runs `node --test`
over four directories - `scripts/__tests__/*.test.mjs`, `plugins/__tests__/*.test.mjs`,
`src/shared/__tests__/*.test.mjs`, and `_shots/__tests__/*.test.mjs` - covering pure helpers that need no browser or
WebGPU. The shared UI kit's tests do import the real `blit386` package (for `Rect2i`/`Vector2i` and to unit-test
`ui-core.js` etc. against it), so `pnpm --filter blit386 run build` must have produced `packages/blit386/dist/` first -
`pnpm run test` builds it automatically via `../../scripts/ensure-engine-built.mjs` when missing or stale, same as
`dev`/`build`/`preview`/`knip` already do.

Every test file opens with a doc comment saying what it covers - `ls` those four directories and read the headers for
the inventory; this skill keeps no per-file list.

The live capture-to-file pipelines (driving installed Chrome through Playwright, encoding with ffmpeg) are not covered -
verify those by hand, running the script against a real demo. `_partials/demo-shell.js` (shell chrome, needs a DOM
harness) and the individual demo files under `src/<topic>.js` remain uncovered, per the "no automated tests" note above.

Manual hot-reload check (nothing automated covers this - run by hand after touching hot-reload wiring):

1. `pnpm run dev:watch`, then open `basics` (shell URL; the demo runs inside the `?embed&source` iframe)
2. Edit a `render()` color constant - visual change, state kept, console shows `[BT] Hot reload #1 (methods)`
3. Edit `init()` - re-init runs, `onHotReload` fires with a snapshot, no page reload
4. Edit `configure()`'s `displaySize` - full page reload
5. Edit a `public/sprites/*.png` used by a demo - texture updates in place, no reload
6. Edit `public/audio/blip.wav` - the next `soundPlay` uses the new sound; replacing playing music restarts the track
7. Edit `src/shared/ui.js` - demo state kept, UI kit still works; D-pad visibility may reset (expected)
8. Edit `_partials/layout.html` or `_partials/demo-shell.js` - full reload of the shell only
9. Jump to another demo via the banner combobox or prev/next - address bar updates via `pushState`, only the iframe
   reloads, browser back/forward restores the previous demo
10. Edit an engine `src/` file - the library rebuilds and the page full-reloads
11. Repeat steps 2-3 with `?backend=software` on the embed URL - full reload is the known tier-detection gap, not a
    regression
12. Introduce a syntax error in a demo - the old demo keeps running; fixing it recovers automatically

## packages/website

Two runners, both behind `pnpm run test` (which builds the engine first via `../../scripts/ensure-engine-built.mjs`):

- `test:scripts` - `node --test scripts/__tests__/*.test.mjs`, the sync and build helper scripts (`test:scripts:watch`
  for watch mode)
- `test:unit` - Vitest over `src/**/*.test.ts`, the `ServerPlugin`s that run in the deployed Worker (`/mcp`, CSP,
  channel headers, the feed, method guards) plus `public/webmcp.js`; `test:unit:coverage` is what `test` runs,
  `test:unit:watch` for watch mode. See "Test runners" in `packages/website/CLAUDE.md` for why it is plain Vitest and
  not the Workers pool.

Neither covers the rendered site itself - visual/content correctness is verified by `pnpm run build` + manual check.

## packages/kit and packages/create-blit386

`node --test` suites only. No Vitest, no Playwright, no top-level `tests/` directory - each package owns its own `test/`
folder. Every file opens with a doc comment saying what it covers, so
`ls packages/kit/test packages/create-blit386/test` and those headers are the inventory; this skill keeps no per-file
list. In `packages/kit/test`, `hook-harness.mjs` and `shell-cases.mjs` are shared fixtures, not suites, and
`shell-safety.test.mjs` is slow (it spawns a process per case). In `packages/create-blit386/test`, `helpers.mjs` is the
shared fixture and each `agent-*.test.mjs` covers one adapter.

Prerequisites: a build for the scaffolder suite - it shells out to `packages/create-blit386/dist/index.js` and
`packages/kit/dist/cli.js`. The kit package rebuilds itself through a `pretest` script; the scaffolder package does not,
so run `pnpm run build` first if either `dist/` is missing or stale.

Steps: build if needed, then run `pnpm --filter @blit386/kit run test` and `pnpm --filter create-blit386 run test` (or
`cd` into each package and `pnpm run test`). Report which package failed and whether the break is in scaffold logic,
templates, kit content, adapters, or the migration registry.

Not covered: visual regression of generated games (nothing renders a canvas), a real `npm install` or Vite build inside
a generated project, npm publish or registry propagation. Some `agents sync` cases are skipped when git is unavailable
(they need a three-way merge).

Root-level script tests that exercise shared tooling (part of the relevant package's `preflight`, not this suite):
`test:agent-config` (`.agents/skills` symlink integrity), `test:compact-tables` (the compact Markdown table Prettier
plugin). This repo's own Claude Code and Cursor shell guard is the kit's `shell-safety.cjs` entry, run in place and
covered by `packages/kit/test/shell-safety.test.mjs`.
