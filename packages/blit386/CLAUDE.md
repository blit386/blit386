# blit386 (engine)

A palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit. Pixel-perfect 2D rendering where primitives,
sprites, and bitmap text resolve color through the active `Palette` before final RGBA output, with a Canvas 2D software
fallback when WebGPU init fails. All engine functionality is reached through the static `BT` namespace; demos implement
`IBTDemo` (`configure?`, `init`, `update`, `render`, optional `overlayRows?`).

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

This package's stack is in `package.json`. One thing it does not tell you: TypeScript is pinned to match API Extractor
(the declaration rollup breaks when they drift). The compact-tables Prettier plugin every package shares
(`scripts/prettier-plugin-compact-tables.mjs`) is owned by the monorepo root, not this package.

## Where to Find Information

Routing that is not obvious from the file tree. For "how does subsystem X work", read `src/<subsystem>/`.

| Question | Where to look |
| --- | --- |
| Is this API exported publicly? | The trailing `export { ... }` / `export type { ... }` block at the end of `src/BLIT386.ts` |
| What are the render/asset dimension limits? | `src/utils/RenderLimits.ts`, `src/utils/AssetLimits.ts` – not docs |
| What is the benchmark regression threshold? | `.github/workflows/ci.yml` benchmark job (`--threshold 25`) – not docs |
| What error message style should I use? | `docs/voice.md`, then `src/utils/errorMessages.ts`; shared "can't find this file" hints in `src/utils/urlHints.ts` |
| What test mock do I need? | `src/__test__/webgpu-mock.ts` (GPU), `src/__test__/webaudio-mock.ts` (Web Audio) |
| How do I document a new/changed public API and keep it versioned? | `docs/documentation-and-versioning-guide.md`, `.claude/rules/bt-api-getters.md` |
| How is `bt-api-getters.md` checked against the real `BT.*` surface? | `scripts/check-api-getters-drift.mjs`, wired into `pnpm run api:getters:check` (this package's own `preflight`) |
| Which preset has which exact color values? | `docs/guide-palette-presets.md` |
| How do I fade a palette cinematically, or do color math in linear light? | `BT.paletteFadeExposure`, `Color32#toLinear` / `#toSrgb`; `docs/api-palette.md#exposure-fade`, `docs/guide-palette.md` |
| How do I smooth motion between fixed `update()` steps? | `BT.renderAlpha`; worked `Vector2i.lerp` pattern in `docs/guide-game-loop.md` |
| Seeded / deterministic random? | `BT.random` / `BT.randomSeed`; `src/utils/Random.ts`, coordinate hashes in `src/utils/hash.ts`, `docs/api-random.md` |
| How does hot-reload / HMR work? | `docs/guide-hot-reload.md` is canonical; runtime in `src/hot/`, dev plugin in `src/vite/` |
| How does the BLIT386 splash work, and how do I turn it off? | `BT.isSplashVisible`, `HardwareSettings.isSplashEnabled`; `src/splash/`, `docs/guide-splash.md` |
| How does dev vs. release detection work? | `BT.isDevMode`; `src/utils/devMode.ts`, dev marker set by `src/vite/transform.ts`, `docs/api-core.md#dev-vs-release-mode` |
| How is agent config drift checked? | `scripts/check-agent-config.mjs` (root), wired into `pnpm run agents:check` and the `quality` CI job |
| Where is the public docs site? | `packages/website` builds it from this package's `docs/`; `docs/_sitemap.json` controls what publishes |
| Dependency security policy / CI audit gate? | `docs/security/dependency-policy.md`, `docs/security/audit-exceptions.md` |
| Where is the annotated `src/` tree? | `.claude/rules/architecture.md` |

## Critical Rules

1. Integer coordinates – all rendering uses `Vector2i` / `Rect2i`, never floats
2. Performance first – minimize allocations in update/render, reuse buffers, batch draws. Buffer reuse and in-place
   mutation are correct in hot paths here; the general prefer-immutability default does not apply to the render loop
3. Use the `BT` namespace – never reach for `BTAPI` from demo code
4. No `any` – use `unknown` or a proper type (Biome lint error; CI fails via `format:check`)
5. Type-only imports – `import type { ... }`

## Input Conventions

- `BTN_*` constants are bit flags (powers of 2), not sequential integers
- `BT.isDown` / `BT.isPressed` / `BT.isReleased` use ANY-match semantics for masks
- Face buttons: players `0` and `1` are keyboard OR gamepad; players `2` and `3` are gamepad-only
- Pointer and gamepad previous-state rollover is end-of-render-frame aligned. Keyboard is different: press/release edges
  and `inputString` clear once per fixed-update tick (inside `demo.update()`), which always runs before that frame's
  `render()`. Call `BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, and the keyboard-mapped half of
  `BT.isPressed` / `BT.isReleased` (players 0/1) from `update()`, never `render()` – reading an edge from `render()`
  races the update tick that already cleared it and intermittently misses presses under rapid input. `BT.isKeyDown` /
  `BT.isDown` (held state, not edges) have no such restriction. See `docs/guide-input.md` (Frame-timing semantics) and
  the postmortem this rule came from: a demo user's rapid `~` taps toggling the engine overlay were dropped ~20% of the
  time because the overlay itself read the toggle key's edge from the render phase
- Default gamepad stick dead zone is `0.75`
- Triggers are axis-only for now (`AXIS_TRIGGER_L` / `AXIS_TRIGGER_R`); dedicated trigger button constants do not exist

## API Conventions

The public `BT` namespace uses getters for read-only snapshots (`BT.displaySize.y`, `BT.targetFPS`, `BT.activeBackend`)
and methods for actions, parameterized queries, and async work (`BT.cameraSet(...)`, `BT.pointerPos(0)`,
`await BT.captureFrame()`). Do not add zero-argument `BT.foo()` functions where a getter fits. `requestedBackend` is the
resolved init request; `activeBackend` is what actually started (they differ after a WebGPU to software fallback) and is
what runtime gates such as post-process and capture must check.

Boolean naming: runtime queries and configure flags use grammatical `is*` / `has*` (`isPointerActive`, `hasGlyph`,
`isOverlayEnabled`). Side-effect or operation-result booleans use imperative verbs (`Timer.fireIfElapsed()`,
`intersectTo(other, out): boolean`, `remove(): boolean`). Never embed a second `Is` (audit: `\bis[A-Za-z]+Is[A-Z]`).

Private fields, private methods, protected members, and module-local constants must not repeat the enclosing class or
file name – the type already supplies that scope (`FrameCapture.request()`, not `requestCapture()`). Public API is
exempt.

Prefer the built-in over re-deriving it: `SpriteSheet.loadIndexed(...)` for sprite setup, `getIndexedPixels()` for
CPU-side pixel data in the software renderer, `Color32#luminance` over inlining the luma weights, `BT.deltaSeconds` /
`BT.timeSeconds` over `1 / TARGET_FPS`, `BT.cameraClamp(...)` over ad-hoc clamp math, and `palette.applyHUD(startSlot?)`
over six manual `palette.set()` calls.

Full category tables, the new-API checklist, and the three boolean tiers: `.claude/rules/bt-api-getters.md` and
`.claude/rules/internal-scoped-naming.md` (both load when you touch `src/`), plus `docs/api-core.md` and
`docs/developer-experience-guide.md`. Deprecated aliases: `docs/reference-deprecations.md`.

## Code Style

4-space indent, 120 columns, single quotes, semicolons, trailing commas, always arrow parens, named exports only. JSDoc
is required on public APIs (ESLint `warn` rules that fail CI via `--max-warnings 0`). Update JSDoc and inline comments
alongside the code they describe – never leave a comment asserting old behavior.

Class member order is enforced by `perfectionist/sort-classes` with `type: 'unsorted'`, so it fixes group order only
(static fields, instance fields, constructor, accessors, static methods, instance methods – public before private) and
preserves the hand-tuned order inside each group; `pnpm run lint:fix` applies it. Region markers (`// #region`) are
banned. Full layout: `.claude/rules/ts-file-structure.md`.

Widen an existing literal-union type (`Backend`, `AudioBus`, `EffectTier`, `EasingFunction`) rather than adding a second
literal beside it, and interpolate any numeric sentinel shared with a WGSL source into the shader template instead of
typing it in both places. Shared policy: root `.claude/rules/named-constants.md`.

## Writing docs

Everything about authoring `docs/` – prose house style, which Fumadocs components may appear, the twoslash requirement
on every TypeScript block, filenames mirroring the sitemap section, the rename/split checklist, and the generated
blit386.dev banner you must never hand-edit – lives in `.claude/rules/docs-authoring.md` and
`.claude/rules/twoslash-docs.md`, which load automatically when you touch `docs/`. For runtime user-facing strings read
`docs/voice.md` instead.

## Commands

Scripts are `pnpm run <script>` from this package's directory (or `pnpm --filter blit386 run <script>` from the repo
root); `package.json` is the list, and `pnpm run preflight` is the gating set. Shell commands are rewritten by
`rtk hook claude` – prefer `rtk read` / `rtk grep` over native Read/Grep for exploration.

## Testing

Test files sit next to their source (`src/utils/Vector2i.test.ts`). The one exception is `vite.config.test.ts`, which
sits at the package root next to the build config it covers and is pulled in by an explicit `vitest.config.ts` include.
Four tiers:

1. Unit (Vitest, node) – pure logic: Vector2i, Rect2i, Color32, Palette, PaletteEffect, Easing, GameLoop
2. Integration (Vitest, Node + GPU mocks; happy-dom for DOM) – DOM and GPU code
3. Visual regression (Playwright, Chromium + WebGPU) – PNG snapshots of real rendered frames
4. CPU benchmarks (Vitest bench, `*.bench.ts`) – hot method and allocation throughput

Run `/test blit386 visual` when changing post-process effects, sprite rendering, bitmap fonts, primitive drawing,
palette-indexed rendering, or camera offsets: it is the pixel-level correctness tool, not a performance one.
`test:visual:update` regenerates baselines after an intentional visual change. Benchmarks cover isolated methods and
allocation patterns; CI runs them on labeled PRs against a regression threshold.

Coverage lists, snapshot locations, mock usage, and known quirks:
[docs/reference-testing.md](docs/reference-testing.md). Benchmark workflow: `docs/performance-testing.md` and the
`/perf` skill.

## Git scopes

Conventional Commits and DCO sign-off are root-level policy (see root `CLAUDE.md`). This package's scopes, by frequency:
`docs`, `audio`, `assets`, `overlay`, `core`, `api`, `ci`, `renderer`, `tests`, `utils`, `rules`, `release`, `security`,
`input`, `deps` / `deps-dev`, `visual`, `camera`.

## Working with Claude

- User-facing strings: follow the two-tier voice guide for every throw, error message, and canvas-visible string. Read
  [docs/voice.md](docs/voice.md) first.
- Documentation is part of every feature. After a public API change update the matching `docs/api-*.md`; after a
  behavior change the affected guide; after an architecture change or a new subsystem file,
  `.claude/rules/architecture.md` and the Where to Find Information table above. Update `README.md` only when the Quick
  Start, prerequisites, features list, or browser compatibility changed. Never treat this as a step the user must ask
  for.
- Onboarding: users start with `npm create blit386@latest my-game`, from `packages/create-blit386`. When this package's
  onboarding surface changes – README Quick Start, `bootstrap()` signature or defaults, the minimal demo shape – check
  whether `packages/create-blit386`'s templates, `packages/kit`'s docs, and the pinned `BLIT386_RANGE` need a matching
  change.

## Environment bootstrap (SessionStart hook and devcontainer)

A fresh remote or cloud checkout has no `node_modules`. `scripts/session-start-bootstrap.sh` fixes that
(`pnpm install --frozen-lockfile` for the whole monorepo, skipped on an unchanged lockfile) and is wired into both the
root `.claude/settings.json` (SessionStart) and the root `.devcontainer/devcontainer.json` (`postCreateCommand`) – one
script, two call sites. Neither blocks or fails the session on a bootstrap error. Detail:
`.claude/rules/environment-bootstrap.md`.

## Environment and tooling gotchas

Preflight behaves differently in ephemeral or CI-style checkouts, and the failures look like code bugs but are not – do
not "fix" them by editing the checks. `_api-history.json` regeneration needs git tags (dates regenerate as `null`
without them, wiping the committed ones; restore the `versions` block afterward), and `docs:links` needs outbound
network (external URLs 403 through a sandbox proxy while internal links still resolve). Full list, including hook
interaction and when `--no-verify` is legitimate: `.claude/rules/environment-gotchas.md`, which loads every session.
