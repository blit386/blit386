---
name: test
description:
  Run a package's test suite – unit, coverage, watch, visual regression, or a single file – or explain what testing
  exists when a package has none. Use when the user wants to run tests or check coverage. Takes a package argument
  (blit386, demos, website, kit, create-blit386).
---

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
- `visual`: `pnpm run test:visual` (Playwright visual regression)
- File path: `pnpm exec vitest run <path>`

Conventions: test files are colocated (`src/utils/Vector2i.test.ts` next to `Vector2i.ts`); visual tests live in
`tests/visual/`; use `describe`/`it` from vitest (not `test`); follow the source code style (four-space indent, single
quotes, semicolons); no emoji in test descriptions.

Report results: pass count on success; specific failures with file locations and assertion details on failure; coverage
percentages vs. the 80% threshold when running `coverage`. Suggest `pnpm run test:visual:update` when a visual
regression is an intentional change.

## packages/demos

Demo _content_ (`src/*.js`, the interactive WebGPU pieces) has no automated tests. Do not look for Vitest, Playwright,
or a `tests/` directory for those – automated unit or E2E coverage would require a headless WebGPU runtime (not broadly
available) and would largely duplicate what `packages/blit386`'s own suite already covers. Correctness is verified by:

1. Running the dev server (`pnpm run dev`) and opening the demo in a browser
2. The production build (`pnpm run build`) – a build failure surfaces broken imports or plugin errors
3. Preflight checks (`/preflight demos`) – format:check, lint, test, spellcheck, knip, check:demo-registry,
   check:demo-comment-links, build

What to do instead: verify a new demo with `pnpm run dev` + manual exercise; confirm no build regression with
`pnpm run build`; check code quality with `/preflight demos` or `/review demos`; full pre-push audit with
`/deep-review demos`.

Tooling _scripts_ and _plugins_ are different. `pnpm run test` runs `node --test` over two directories –
`scripts/__tests__/*.test.mjs` and `plugins/__tests__/*.test.mjs` – covering pure helpers that need no browser or
WebGPU:

| Test file | Covers |
| --- | --- |
| `scripts/__tests__/capture-demo-clip.test.mjs` | Argument parsing, URL/dimension math, ffmpeg and browser-script builders |
| `scripts/__tests__/capture-og-image.test.mjs` | OG card argument parsing, scale-mode resolution, integer/fit/auto scale math, the ffmpeg filter graph, the `!important` canvas-prep script |
| `plugins/__tests__/demo-registry.test.mjs` | `@description` and `@ogScale` header-tag parsing across both comment styles |
| `plugins/__tests__/social-meta.test.mjs` | The social head block: tag set, escaping, channel-aware URLs, JSON-LD, OG image fallback |

The live capture-to-file pipelines (driving `agent-browser`, encoding with ffmpeg) are not covered – verify those by
hand, running the script against a real demo.

Manual hot-reload check (nothing automated covers this – run by hand after touching hot-reload wiring):

1. `pnpm run dev:watch`, then open `basics` (shell URL; the demo runs inside the `?embed&source` iframe)
2. Edit a `render()` color constant – visual change, state kept, console shows `[BT] Hot reload #1 (methods)`
3. Edit `init()` – re-init runs, `onHotReload` fires with a snapshot, no page reload
4. Edit `configure()`'s `displaySize` – full page reload
5. Edit a `public/sprites/*.png` used by a demo – texture updates in place, no reload
6. Edit `public/audio/blip.wav` – the next `soundPlay` uses the new sound; replacing playing music restarts the track
7. Edit `src/shared/ui.js` – demo state kept, UI kit still works; D-pad visibility may reset (expected)
8. Edit `_partials/layout.html` or `_partials/demo-shell.js` – full reload of the shell only
9. Jump to another demo via the banner combobox or prev/next – address bar updates via `pushState`, only the iframe
   reloads, browser back/forward restores the previous demo
10. Edit an engine `src/` file – the library rebuilds and the page full-reloads
11. Repeat steps 2-3 with `?backend=software` on the embed URL – full reload is the known tier-detection gap, not a
    regression
12. Introduce a syntax error in a demo – the old demo keeps running; fixing it recovers automatically

## packages/website

`node --test scripts/__tests__/*.test.mjs`, run via `pnpm run test` (or `pnpm run test:watch`). Covers the sync and
build helper scripts, not the rendered site itself – visual/content correctness is verified by `pnpm run build` + manual
check.

## packages/kit and packages/create-blit386

Seven `node --test` suites, 57 cases total. No Vitest, no Playwright, no top-level `tests/` directory – each package
owns its own `test/` folder.

| Suite | Cases | Covers |
| --- | --- | --- |
| `packages/create-blit386/test/scaffold.test.mjs` | 22 | The scaffold path end to end (JS and TS), the non-TTY `--yes` fallback, optional CI and agent files, the `.blit/` ownership manifest, `blit agents sync` (drift, full sync, `--force`, note and merge preservation), `blit agents add` (including collision safety), and `blit migrate` preview + `--write` |
| `packages/create-blit386/test/env.test.mjs` | 4 | `meetsNodeFloor`: the Node version floor guard, including pre-release and custom-floor strings |
| `packages/kit/test/codemod.test.mjs` | 13 | The migration registry and the anchored codemod engine behind `blit migrate`: auto-applied renames vs. names reported for review, receiver anchoring, idempotence, and registry field completeness |
| `packages/kit/test/enable-hot-reload.test.mjs` | 9 | `enableHotReloadInViteConfig`: wiring `blit386/vite` into a game's `vite.config.js`, no-op and unsupported-shape detection, plus `hasBlit386VitePlugin` |
| `packages/kit/test/doctor.test.mjs` | 4 | `blit doctor`: engine range compatible, installed engine older or newer than the kit range, and a missing game `package.json` |
| `packages/kit/test/env.test.mjs` | 3 | `satisfiesCaretRange` / `exceedsCaretRange`: the caret-range comparison behind `doctor` and `upgrade` |
| `packages/kit/test/upgrade.test.mjs` | 2 | `blit upgrade`: the not-under-git abort, and the offline bump that offers `migrate` when renames are pending |

Prerequisites: a build for the scaffolder suite – it shells out to `packages/create-blit386/dist/index.js` and
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
plugin), `test:shell-safety` (both `shell-safety.sh` hook variants).
