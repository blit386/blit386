---
name: test
description:
  Run a package's test suite - unit, coverage, watch, visual regression, or a single file - or explain what testing
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

1. Running the dev server (`pnpm run dev`) and opening the demo in a browser - an agent drives it as described under
   "Driving a live demo" below
2. The production build (`pnpm run build`) - a build failure surfaces broken imports or plugin errors
3. Preflight checks (`/preflight demos`) - format:check, lint, test, spellcheck, knip, check:demo-registry,
   check:demo-comment-links, build

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

| Test file | Covers |
| --- | --- |
| `scripts/__tests__/capture-demo-clip.test.mjs` | Argument parsing, URL/dimension math, ffmpeg and browser-script builders |
| `scripts/__tests__/capture-og-image.test.mjs` | OG card argument parsing, scale-mode resolution, integer/fit/auto scale math, the ffmpeg filter graph, the `!important` canvas-prep script |
| `scripts/__tests__/capture-demo-shots.test.mjs` | The `capture:shots` driver: argument parsing, variant validation, `/shots?auto` URL building, output-path containment |
| `scripts/__tests__/check-demo-registry.test.mjs` | The `check:demo-registry` validation rules: each one still rejects the bad input it claims to |
| `scripts/__tests__/check-demo-comment-links.test.mjs` | The `check:demo-comment-links` helpers: header-comment extraction, dead-host, docs-link, and demo-slug failures |
| `plugins/__tests__/demo-registry.test.mjs` | `@description` and `@ogScale` header-tag parsing across both comment styles |
| `plugins/__tests__/virtual-demos.test.mjs` | `renderDemoHtml` layout substitution and the dev-only vintage-URL redirect lookup |
| `plugins/__tests__/channel-headers.test.mjs` | The pure `robots.txt` / `_headers` builders behind `channelHeadersPlugin` |
| `plugins/__tests__/sitemap.test.mjs` | The pure sitemap XML builder behind `sitemapPlugin` |
| `plugins/__tests__/html-escape.test.mjs` | The shared HTML-escaping helper `virtual-demos.js` and `social-meta.js` use |
| `plugins/__tests__/social-meta.test.mjs` | The social head block: tag set, escaping, channel-aware URLs, JSON-LD, OG image fallback |
| `src/shared/__tests__/ui-theme.test.mjs` | `applyTheme()`: default/custom `startSlot`, the 12-color block, the nine-slice sets it builds, out-of-range guards, the fresh-copy-vs-singleton distinction |
| `src/shared/__tests__/ui-core.test.mjs` | `hitContains()`'s inclusive/exclusive edges, the draw-command pool's allocates-nothing-per-frame invariant (and its overflow-growth path), `begin()`/`end()` group invariants, layout anchor math for all five `UI_ANCHORS`, the `debug` overlay, and the `snapshot()` tests (recording off allocates nothing, absolute coordinates, a fresh group list per tick, a returned copy, `texts` passed through from `BT.frameText`) |
| `src/shared/__tests__/ui-lint.test.mjs` | The layout lint rules (`overlap`, `out-of-display`, `margin`, `row-gap`) over recorded snapshots, including the zero-width spacer exemption |
| `src/shared/__tests__/ui-widgets.test.mjs` | `slider()` pixel/value mapping and clamping, `checkbox()` click and key-edge toggling, `pip()`'s purely-visual state, `meter()` fraction clamping, `tooltip()` docking and clamping, `spacer()` recording a zero-width row |
| `src/shared/__tests__/key-names.test.mjs` | `keyLabel()`: letter, digit, arrow, named-key, and numpad labels, and the pass-through for any other code |
| `src/shared/__tests__/ui-gestures.test.mjs` | Swipe direction/threshold/time-window recognition, the widget-exclusion gate, the dominant-axis tie-break |
| `src/shared/__tests__/ui-dpad.test.mjs` | `isDown`/`isPressed` edge semantics across ticks, `show: 'auto'` vs `'always'` visibility gating |
| `_shots/__tests__/poses.test.mjs` | The pose table: ids, one trigger per pose, every slug known to the registry |
| `_shots/__tests__/manifest.test.mjs` | Manifest shape, merging a partial run into the committed manifest |
| `_shots/__tests__/layout-model.test.mjs` | The gallery's stack and tile layout model |
| `_shots/__tests__/keys.test.mjs` | The `/shots` keyboard map |
| `_shots/__tests__/capture.test.mjs` | The capture engine's pure helpers |
| `_shots/__tests__/diff.test.mjs` | `diffPixels`: changed pixels marked magenta, the rest transparent, and the size-mismatch refusal |
| `_shots/__tests__/baseline.test.mjs` | `parseBaseline`: which `?baseline=` values the page accepts (http(s) and same-origin paths) and refuses |
| `_shots/__tests__/findings.test.mjs` | Review findings: flags, notes, and the Markdown export |
| `_shots/__tests__/sheet-entries.test.mjs` | The public site-index sheet's tile pick: one clean `display` capture per nav-visible demo, in nav order |

The live capture-to-file pipelines (driving installed Chrome through Playwright, encoding with ffmpeg) are not covered -
verify those by hand, running the script against a real demo. `_partials/demo-shell.js` (shell chrome, needs a DOM
harness) and the individual demo files under `src/<topic>.js` remain uncovered, per the "no automated tests" note above.

Driving a live demo (how an agent checks what a demo shows - the canvas has no accessibility tree, and a screenshot of a
6-pixel font is a bad oracle):

1. Open `http://localhost:5173/demos/<slug>.html?embed&capture&seed=1` from `pnpm run dev`. `?embed&capture` puts the
   engine on `window.BT` and turns on the drawn-text recorder; `seed=1` pins `BT.random`.
2. Poll `BT.isReady` before anything else. Step frames with `BT.renderAt(seconds)` and
   `BT.renderAt(next, { from: 'current' })` rather than waiting on `requestAnimationFrame`: a background or hidden
   browser pane throttles or stops the live loop, while a seek renders exactly the frame asked for.
3. Read the strings from `BT.frameText`, not a screenshot: each `BT.systemPrint` call that drew text (kit text included)
   and each overlay row label drawn, with its display position; text that draws nothing is skipped. A kit `ui.kv` row is
   two entries on the same `y`, key then value. `BT.testState()` is the game's memory, not what was drawn - most demos
   have no hook, and a wrong label over a right value still passes it. `__blitDemoUi.snapshot()` adds the kit's groups
   and widget rectangles (set `__blitDemoUi.recording = true` first) next to the same `texts`.
4. Pointer input: dispatch `PointerEvent`s on the canvas, mapping display pixels to `clientX` / `clientY` with
   `canvas.getBoundingClientRect()` and `BT.displaySize` - never `canvas.width`, since a 320×240 demo often has a
   640×480 backing store. Set `pointerType: 'mouse'` (BT-594: an empty type is treated as the mouse, but a touch or pen
   move with no `pointerdown` is dropped).
5. For a slider, a drag, or a hold, leave the button down across a rendered frame: `pointerdown`, step a frame, move,
   step, then `pointerup`. A same-turn `pointerdown` + `pointerup` on the audio-buses Music slider unlocks audio
   (`BT.isAudioUnlocked` turns true) and leaves `BT.audioVolumeGet('music')` at `1`, because `ui.slider` only drags
   while the button is still down on a rendered frame.

`_shots/capture.js` is the working recipe (`seekWhenReady`, `pointerClientPoint`, `injectInput`). The engine contract
for all of the above - readiness, seeking, test state, the drawn-text readout - lives in
`packages/blit386/docs/api-core.md` (Engine readiness, Seeking a frame with renderAt, Test state for agent play-testing,
Reading the text a frame drew); read it there rather than restating it here.

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
folder. Every file opens with a doc comment saying what it covers; `ls packages/kit/test packages/create-blit386/test`
is the truth if a row here drifts. Totals as of 2026-10-09: 200 cases in `packages/kit`, 76 in
`packages/create-blit386`.

`packages/kit/test` (`hook-harness.mjs` and `shell-cases.mjs` are shared fixtures, not suites):

| Suite | Covers |
| --- | --- |
| `agents-sync.test.mjs` | `blit agents sync` when a file the kit newly ships already exists, untracked, on disk |
| `antigravity-hooks.test.mjs` | The Antigravity adapter's hooks: `hooks.json` shape, the fail-closed guard entry, the once-per-conversation bootstrap, format-on-edit payloads |
| `clean.test.mjs` | `blit clean`: language detection, the scaffolded-vs-modified safety check, the confirm prompt and `--yes`, the manifest hash update |
| `codemod.test.mjs` | The migration registry and anchored codemod engine behind `blit migrate`: auto-applied renames vs. names left for review |
| `codex-adapter.test.mjs` | The Codex adapter: `.codex/hooks.json` and `config.toml`, shipped scripts, and that the hooks block the way Codex needs |
| `copilot-adapter.test.mjs` | The GitHub Copilot adapter: `.github/hooks/blit.json`, the setup workflow, the root `.mcp.json`, both payload shapes |
| `doctor.test.mjs` | `blit doctor`: the kit-engine range check, the `.gitattributes` check, the docs-server config check |
| `enable-hot-reload.test.mjs` | The vite.config hot-reload enabler and `hasBlit386VitePlugin` |
| `env.test.mjs` | `satisfiesCaretRange` / `exceedsCaretRange`, the caret-range helpers behind `doctor` and `upgrade` |
| `gemini-adapter.test.mjs` | The Gemini CLI adapter: `.gemini/settings.json`, shipped scripts, exit-code-2 blocking |
| `guard-core.test.mjs` | `guard-core.cjs`: the pure path and shell classifiers every agent's hook entry shares, and the fail-closed wrapper |
| `hook-scripts.test.mjs` | The `format-file.cjs` and `protect-files.cjs` hook scripts every generated game gets |
| `kit-root.test.mjs` | `kitRoot()` and `resolveKitRoot()`: both ways of finding a kit package root, checked on the emitted artifacts |
| `mcp-config.test.mjs` | The documentation-MCP config the adapters emit, compared against the website package's canonical definition |
| `opencode.test.mjs` | The OpenCode adapter: emitted files, `opencode.json` permission lists in step with the guard core, the `kit-guard.ts` plugin |
| `ownership.test.mjs` | The shared ownership module: which generated files the kit owns and which paths each assistant occupies |
| `play.test.mjs` | `blit play` paths that fail before a browser opens: help, argument checks, no game folder, the missing `playwright-core` hint |
| `shell-safety.test.mjs` | The `shell-safety.cjs` entry Claude Code and Cursor run: every case in the policy table in each agent's protocol, plus payload edge cases. Slow - spawns a process per case |
| `skills-frontmatter.test.mjs` | Every shipped skill's frontmatter parses and stays within the cross-agent limits; flat skills layout; shared `.agents/skills/` copies byte-equal |
| `upgrade.test.mjs` | `blit upgrade`: the not-under-git abort, and the offline bump that offers `migrate` |

`packages/create-blit386/test` (`helpers.mjs` is the shared fixture, not a suite):

| Suite | Covers |
| --- | --- |
| `scaffold.test.mjs` | The scaffold path end to end (JS and TS): expected files, no leftover placeholders, no leaked `workspace:*`, the non-TTY `--yes` fallback, optional CI |
| `kit-parity.test.mjs` | Single-source guards against `@blit386/kit`: the resolved kit, written agent files vs. the adapters' output, manifest classes vs. `classifyFile` |
| `agents-sync.test.mjs` | `blit agents sync` on a scaffolded game: drift check, full write path, symlink guards |
| `agents-add.test.mjs` | `blit agents add` on a scaffolded game: Claude Code and Cursor after the fact, the all-or-nothing collision rule, the `.mcp.json` merge |
| `agent-*.test.mjs` | One suite per assistant adapter (antigravity, claude-cursor, codex, copilot, gemini, opencode, zed): what its scaffold ships and how its `add` and `sync` merges behave |
| `migrate.test.mjs` | `blit migrate` on a scaffolded game: the old-name preview and rewrite, the hot-reload upgrade of an older vite.config |
| `env.test.mjs` | `meetsNodeFloor`, the Node version floor guard |
| `pkgManager.test.mjs` | The Corepack `packageManager` field |

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
plugin), `test:shell-safety` (this repo's own `.claude/hooks/shell-safety.sh` only, held to the kit's shared policy
table `packages/kit/test/shell-cases.mjs` plus its own extra cases; the kit's `shell-safety.cjs` entry is covered by
`packages/kit/test/shell-safety.test.mjs`).
