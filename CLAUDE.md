# BLIT386

A palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit. Pixel-perfect 2D rendering where primitives
and sprites resolve through a shared indexed palette.

## Tech Stack

- **Language:** TypeScript 5.9.3 (strict mode; pinned to match API Extractor for declaration rollup)
- **Runtime:** Browser (WebGPU)
- **Build:** Vite + vite-plugin-dts (`rollupTypes` uses API Extractor)
- **Formatting:** Biome (TS/JS) + Prettier (MD/YAML)
- **Linting:** ESLint with perfectionist, jsdoc, security, promise plugins
- **Spelling:** cspell
- **Dead code:** knip
- **Commits:** Conventional Commits + DCO sign-off + commitlint
- **Package manager:** pnpm

## Where to Find Information

Before writing new code, reviewing existing code, or preflighting, check here first:

| Question                                                   | Where to look                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does `BT.X` do (getter vs method)?                    | `src/BLIT386.ts` JSDoc, `docs/api-core.md`, **BT API: getters vs methods** below                                                                                                                                             |
| How does a subsystem work internally?                      | The relevant `src/core/` or `src/render/` file                                                                                                                                                                               |
| What does a demo implement?                                | `src/core/IBTDemo.ts` (interface + HardwareSettings)                                                                                                                                                                         |
| How does palette usage tracking work for the overlay grid? | `src/core/RenderPaletteUsage.ts`, `src/overlay/palette/PaletteView.ts`                                                                                                                                                       |
| How does the overlay work?                                 | `docs/overlay.md`, `src/overlay/` (orchestrator + `layout/layoutPlan.ts`), `docs/api-core.md` (HardwareSettings overlay flags), `HardwareSettings.isOverlayEnabled`                                                          |
| What palette/sprite setup pattern is correct?              | `docs/palette-guide.md`, then `docs/api-assets.md`                                                                                                                                                                           |
| What are the render/asset dimension limits?                | `src/utils/RenderLimits.ts` (constants), `src/utils/AssetLimits.ts` (asset + glyph limits), `docs/api-assets.md` (asset size limits table), `docs/api-core.md` (HardwareSettings dimension constraints)                      |
| Which preset has which exact color values?                 | `docs/palette-presets.md`                                                                                                                                                                                                    |
| How do post-process effects work?                          | `docs/post-process-effects.md`                                                                                                                                                                                               |
| What does the CI do on this file?                          | `.github/workflows/ci.yml`                                                                                                                                                                                                   |
| Dependency security policy / CI audit gate?                | `docs/security/dependency-policy.md`, `docs/security/audit-exceptions.md`                                                                                                                                                    |
| What is the benchmark threshold?                           | `ci.yml` benchmark job (`--threshold 25` flag), not docs                                                                                                                                                                     |
| What error message style should I use?                     | `docs/voice.md`, then `src/utils/errorMessages.ts`                                                                                                                                                                           |
| Is this API exported publicly?                             | `src/BLIT386.ts` export block (lines 1563-1610)                                                                                                                                                                              |
| What test mock do I need for GPU code?                     | `src/__test__/webgpu-mock.ts`                                                                                                                                                                                                |
| Declaration tooling / TS version alignment?                | `docs/tooling.md`, `docs/developer-experience-guide.md`, `scripts/check-declaration-tooling.mjs`                                                                                                                             |
| Should this private name repeat the class/file?            | **Internal scoped naming** below; `docs/developer-experience-guide.md` (Naming conventions)                                                                                                                                  |
| Where do I put a new field/method in a `.ts` file?         | **TypeScript file structure** below; `.cursor/rules/ts-file-structure.mdc`; `docs/developer-experience-guide.md` (File structure and member order)                                                                           |
| Where are Cursor agent rules and hooks?                    | `.cursor/rules/*.mdc` (always-applied + glob-scoped); `.cursor/hooks.json`; condensed mirrors in `.claude/rules/`; see [Developer Experience](docs/developer-experience-guide.md#cursor)                                     |
| Where is the public docs site (blit386.dev)?               | Sibling repo `blit386-dev-fumapress` (Fumapress + Waku); canonical engine API docs remain in this repo under `docs/`                                                                                                         |
| What agent skills are available for this project?          | `.agents/skills/` (Zed) and `.claude/skills/` (Claude Code) — `bt-preflight`, `bt-review`, `bt-pr`, `bt-format`, `bt-perf`, `bt-test`, `bt-release`, `bt-spellcheck`, `bt-security-run`, `bt-deep-review`, `bt-quick-format` |
| How do users start a new project with the engine?          | `npm create blit386@latest` — the scaffolder lives in the sibling `create-blit386` repo; see **Onboarding and the scaffolder** below                                                                                         |

## Onboarding and the scaffolder

The recommended way for users to start a new game on top of this engine is the scaffolder:

```bash
npm create blit386@latest my-game
```

It lives in the sibling repo `create-blit386` (`packages/create-blit386`), generates a Vite + JavaScript project,
installs `blit386`, and copies the canonical `AGENTS.md` + `docs/` from `@blit386/kit`. The generated `package.json`
pins a `blit386` version range (`BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts`).

When you change the engine's onboarding surface here (the `README.md` Quick Start, `bootstrap()` signature/defaults, or
the minimal demo shape), check whether the `create-blit386` templates, kit docs, and pinned version range need a
matching update. That repo has its own git history and is not part of this repo's pnpm workspace.

## Architecture

All engine functionality is accessed through the static `BT` namespace. The architecture is palette-first: primitives,
sprites, and bitmap text resolve color through the active `Palette` before final RGBA output. Demos implement the
`IBTDemo` interface (`configure?`, `init`, `update`, `render`, optional `overlayRows?`).

The file tree below is **illustrative, not exhaustive** — it highlights notable subsystems and entry points. Colocated
`*.test.ts` / `*.bench.ts` files and small module-local `constants.ts` / `types.ts` helpers are omitted for readability.

```text
src/
  BLIT386.ts              # Public API (BT namespace + export block for classes, helpers, presets)
  docs/
    consumer-doc-imports.test.ts # Guards README/docs import paths against BLIT386.ts exports
  core/
    BTAPI.ts               # Internal singleton managing subsystems (lazy-loads WebGPURenderer on WebGPU init)
    IBTDemo.ts       # Demo interface + HardwareSettings
    GameLoop.ts            # Fixed-timestep game loop
    WebGPUContext.ts       # WebGPU adapter/device/context setup
    RenderPaletteUsage.ts  # Per-frame palette index usage mask for overlay grid
  overlay/
    Overlay.ts             # Orchestrator: sample, toggle, layout plan, delegate draws
    OverlayDrawTarget.ts   # Internal draw port (drawBarFill / drawLabel); not on IRenderer or BT
    OverlayToggleIcon.ts   # Bottom-left bitmap toggle hint icon draw + anchor/exclusion helpers
    toggleIconData.ts      # Inline row-major mask data for the toggle hint icon
    constants.ts           # Overlay layout and style constants
    labels.ts              # Overlay label strings and formatting helpers
    types.ts               # OverlayRow and related types
    index.ts               # Overlay subsystem public exports for BTAPI and unit tests
    layout/                # layoutPlan, layoutHelpers, layout types/constants
    bars/                  # OverlayBars (Bars.ts)
    timing-chart/          # TimingChart, severity, style, tags, constants
    palette/               # PaletteView, PaletteInteraction (swatch hover tooltip, clipboard copy, scroll)
    sampling/              # FpsSampler, TimingSampler
    input/                 # Toggle
  render/
    IRenderer.ts           # Backend-agnostic renderer contract (interface)
    WebGPURenderer.ts      # WebGPU concrete renderer implementing IRenderer
    SoftwareRenderer.ts    # Canvas 2D software fallback implementing IRenderer
    PrimitivePipeline.ts   # Batched geometry writing palette indices (pixels, lines, rects)
    SpritePipeline.ts      # Batched textured quads (sprites, bitmap text)
    PostProcessChain.ts    # Tier-aware fullscreen effect chain
    UpscalePass.ts         # RGBA texture upscale helper (tests / utilities)
    PaletteResolveUpscalePass.ts # r8uint palette indices -> RGBA + upscale
    effects/
      Effect.ts            # Effect interface + EffectTier
      FullscreenEffect.ts  # Base class for typical fullscreen effects
      FullscreenPixelEffect.ts # Pixel-tier base (logical r8uint chain)
      fullscreenVS.ts      # Shared fullscreen vertex shader module
      pixel/               # Pixel-tier effects (PixelGlitch, PixelMosaic)
      display/             # Display-tier effects (BarrelDistortion, Bloom, ChromaticAberration, Flicker,
                             # Interference, Noise, RGBMask, RollLine, Scanlines, Vignette)
      presets/             # Pre-configured stacks (crtPipBoy, amber, green) + index.ts barrel
  assets/
    AssetLoader.ts         # Image loading with caching
    SpriteSheet.ts         # GPU texture wrapper (+ loadIndexed convenience path)
    BitmapFont.ts          # Bitmap font system (.btfont)
    SystemFont.ts          # Built-in system font factory (createSystemFont; used by BT.systemPrint)
    fonts/systemFontData.ts # Glyph bitmap data backing SystemFont
    Palette.ts             # 256-entry indexed color palette
    PaletteEffect.ts       # Palette effect system (cycle, fade, flash, swap)
    palettes/              # Built-in preset palette data (presetData.ts, hudData.ts)
  input/
    PointerInput.ts        # DOM-backed pointer / mouse / touch / pen tracker (4 slots)
    KeyboardInput.ts       # KeyboardEvent.code state, edges, tick repeat, beforeinput text
    GamepadInput.ts        # Polling-based gamepad input tracker (4 players, axes, buttons, dead zone)
    defaultKeyboardMap.ts  # Default face-button key tables; clone helpers for BT.inputMapReset
  utils/
    Bootstrap.ts           # Demo bootstrap utilities
    BootstrapHelpers.ts    # Canvas lookup and error display utilities
    CameraUtils.ts         # Camera clamp helper (world/view bounds)
    CanvasLayoutStyles.ts  # Canvas layout CSS custom properties helper
    RenderLimits.ts        # Render dimension validation (8192 px per axis; 16,777,216 total pixels)
    AssetLimits.ts         # Asset dimension validation, btfont/glyph limits, sprite-blit clipping
    Vector2i.ts            # Integer 2D vector
    Rect2i.ts              # Integer rectangle
    Color32.ts             # 32-bit RGBA color
    Easing.ts              # Easing functions for palette effects
    FrameCapture.ts        # GPU readback + PNG export
    Timer.ts               # Elapsed-time helper (exported; Timer.fireIfElapsed)
  __test__/
    webgpu-mock.ts         # WebGPU mock factories for tests
    setup.ts               # Vitest global setup (GPU constants)
```

### Palette-First Rendering

Two backends selectable via `HardwareSettings.backend` (default `'webgpu'`):

- **WebGPU** (`'webgpu'`): indexed, palette-first hardware renderer.
  1. **Primitives pipeline** - batched geometry writing **palette indices** (pixels, lines, rects). Max 50k
     vertices/frame.
  2. **Sprites pipeline** - batched **palette-indexed** textured quads (sprites, bitmap text). Max 50k vertices (~8333
     quads). Nearest-neighbor sampling. Auto-batched by texture.
  3. **Framebuffer & post-process** - the logical composite is an **`r8uint`** attachment at `displaySize` (one palette
     slot per pixel). **Pixel-tier** effects (`PostProcessChain`, `FullscreenPixelEffect`) run on that index buffer.
     **`PaletteResolveUpscalePass`** LUT-resolves indices to RGBA and upscales to `drawingBufferSize`. **Display-tier**
     effects run on that RGBA before present (see `docs/post-process-effects.md`).
- **Software** (`'software'`): Canvas 2D fallback. Supports palette rendering, rects, Bresenham lines, indexed sprite
  blits, and bitmap text. Post-process/fullscreen effects throw a clear error directing users to the WebGPU backend.
  Activates automatically when WebGPU init fails; force explicitly via `HardwareSettings.backend: 'software'` or the
  `?backend=software` URL query parameter. Use `BT.activeBackend` to query which backend started
  (`'webgpu' | 'software' | null`). The engine overlay shows the active backend on the top bar when enabled.

### Core Types

- `Vector2i` - integer 2D vector. Constructor auto-floors. Has `width`/`height` aliases. Predicates: `isEqual()`,
  `isEqualXY()`, `isZero()`.
- `Rect2i` - integer rectangle. Predicates: `isContaining()`, `isContainingXY()`, `isIntersecting()`, `isEqual()`.
  Geometry: `intersection()`, `intersectTo()`.
- `Color32` - 32-bit RGBA (0-255). Static colors, hex parsing, named-color registry, float array conversion. Predicate:
  `isEqual()`.

## Critical Rules

1. **No emoji** - nowhere: code, docs, commits, PR titles, errors, logs
2. **Integer coordinates** - all rendering uses `Vector2i`/`Rect2i`, never floats
3. **Performance first** - minimize allocations in update/render, reuse buffers, batch draws
4. **Use BT namespace** - never access `BTAPI` directly from demo code
5. **No `any` types** - use `unknown` or proper types
6. **Type-only imports** - `import type { ... }` for types
7. **Documentation is part of every feature** - after any public API change update the relevant `docs/api-*.md`; after
   any behavior change update the affected `docs/` guide; after any architecture change update the `CLAUDE.md`
   architecture map. Update `README.md` only when the Quick Start, features list, prerequisites, or browser
   compatibility is affected. Never wait to be asked.

## Input Conventions

- `BTN_*` constants are bit flags (powers of 2), not sequential integers
- `BT.isDown` / `BT.isPressed` / `BT.isReleased` use ANY-match semantics for masks
- Face buttons: players `0` and `1` are keyboard OR gamepad; players `2` and `3` are gamepad-only
- Input previous-state rollover is end-of-frame aligned (same snapshot model across pointer/keyboard/gamepad)
- Default gamepad stick dead zone is `0.75`
- Triggers are axis-only for now (`AXIS_TRIGGER_L` / `AXIS_TRIGGER_R`); dedicated trigger button constants are not
  implemented yet

## BT API: getters vs methods

The public `BT` namespace uses **getters** for read-only snapshots and **methods** for actions, parameterized queries,
and async work. Do not add new zero-argument `BT.foo()` functions when a getter is appropriate.

### Use getters (property access, no `()`)

| Category                                                         | Members                                             | Notes                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Configure-time** (mirror {@link HardwareSettings} field names) | `displaySize`, `drawingBufferSize`, `targetFPS`     | Clone per read for `Vector2i` getters.                                                                                      |
| **Derived**                                                      | `outputSize`                                        | Effective drawing buffer (`drawingBufferSize ?? displaySize`). No `HardwareSettings` field; clone per read.                 |
| **Loop timing**                                                  | `deltaSeconds`, `timeSeconds`, `ticks`              | `targetFPS` is configured rate, not measured FPS.                                                                           |
| **Configure-time (backend)**                                     | `requestedBackend`                                  | Mirrors resolved `HardwareSettings.backend` after merge and `?backend=software`; `null` before init.                        |
| **Runtime state**                                                | `activeBackend`, `camera`, `palette`                | `activeBackend` is what actually started (after fallback); `null` before init or on failure. `palette` is a live reference. |
| **Per-frame input**                                              | `pointerScrollDelta`, `inputString`, `gamepadCount` | Read once per frame when needed.                                                                                            |

Examples: `BT.displaySize.y`, `BT.targetFPS`, `BT.ticks % 60`, `if (BT.activeBackend === 'software')`.

### Use methods (call with `()`)

- **Lifecycle / mutations:** `init`, `ticksReset`, `cameraSet`, `cameraReset`, `paletteSet`, `paletteCreate`,
  `showCursor`, `hideCursor`, `spritesRefresh`, `assignTag`, `inputMap`, `inputMapReset`.
- **Palette effects:** `paletteCycle`, `paletteFade`, `paletteFadeRange`, `paletteFlash`, `paletteSwap`,
  `paletteClearEffects`.
- **Post-process:** `effectAdd`, `effectRemove`, `effectClear`; preset namespace `BT.preset` (`crtPipBoy`, `amber`,
  `green`).
- **Drawing / clearing:** `clear`, `clearRect`, `drawPixel`, `drawLine`, `drawRect`, `drawRectFill`, `drawSprite`,
  `systemPrint`, `printFont`.
- **Parameterized queries:** `pointerPos(index?)`, `pointerDelta`, `isPointerActive`, `isDown`, `isPressed`,
  `isReleased`, `getAxis`, `isGamepadConnected`, `isKeyDown`, `isKeyPressed`, `isKeyReleased`.
- **Utilities with arguments:** `cameraClamp(camera, worldSize, viewSize?)`, `systemPrintMeasure(text)`.
- **Async:** `captureFrame`, `downloadFrame`.

**Deprecated aliases still on `BT` (see `docs/deprecations.md`):** `pointerPosValid`, `buttonDown`, `buttonPressed`,
`buttonReleased`, `gamepadConnected`, `keyDown`, `keyPressed`, `keyReleased`.

**Top-level package exports** (outside the `BT` namespace): `bootstrap`, `defaultConfig`, `mergeHardwareSettings`,
`applyEasing`, `clampCameraToWorld`, `displayError`, `getCanvas`, `Timer`, effect classes (`BarrelDistortion`, `Bloom`,
…), preset functions (`crtPipBoy`, `amber`, `green`), core types (`Vector2i`, `Rect2i`, `Color32`, `Palette`, …), and
`IndexedSpriteLoadResult`.

### Naming when adding getters

- **Same name as `HardwareSettings`** when exposing configure values (`targetFPS`, not `fps` or `targetFps`).
- **Derived getters** when the value is computed from configure fields (`outputSize` from
  `drawingBufferSize ?? displaySize`); do not add a matching `HardwareSettings` field.
- **Descriptive runtime names** when there is no configure field (`activeBackend`, not `renderer`).
- **`requestedBackend` vs `activeBackend`:** use `requestedBackend` for the resolved init request; use `activeBackend`
  for runtime gates (post-process, capture). They differ when WebGPU was requested but fell back to software.

Full tables: `docs/api-core.md`. Style guide: `docs/developer-experience-guide.md` (Naming conventions).

## Boolean naming

Runtime queries use **`is*`** / **`has*`** (`isPointerActive`, `isIndexed`, `hasGlyph`, `isDirty`). Configure flags in
`HardwareSettings` and `BootstrapOptions` also use grammatical **`is*`** (`isOverlayEnabled`,
`isDetectingDroppedFrames`). Side-effect or operation-result booleans use imperative verbs, not `is*`
(`Timer.fireIfElapsed()`, `intersectTo(other, out): boolean`, `remove(): boolean`).

**Input hold vs edge on `BT`:** `BT.isDown` / `BT.isKeyDown` (held), `BT.isPressed` / `BT.isReleased` (button masks),
`BT.isKeyPressed` / `BT.isKeyReleased` (keyboard codes). Internal input classes mirror those names; never embed a second
`Is` (`isKeyPressed`). Audit: `\bis[A-Za-z]+Is[A-Z]`. Identifier acronyms: `canvasID`, `containerID`.

Full tiers: `docs/developer-experience-guide.md` (Boolean naming).

## Internal scoped naming

**Private fields, private methods, protected members, and module-local constants/types must not repeat the enclosing
class or file name.** The type or file already provides scope; strip redundant prefixes from internal identifiers.

Examples:

- `FrameCapture.request()` not `requestCapture()`; `width` not `captureWidth`
- `GamepadInput.poll()` not `pollGamepads()`
- `Bloom.ts`: `FRAGMENT_WGSL` not `BLOOM_FRAGMENT_WGSL`
- `Palette.ts`: file-local `Serialized` (or similar), not `PaletteJSON` or `JSON`

**Does not apply to public API:** `BT.*`, the `BLIT386.ts` export block, public methods on exported classes, or
documented configure field names. When JSDoc references public symbols, use their full public names (e.g. internal
pointer wire codes map to `BT.BTN_POINTER_A`, not gamepad `BT.BTN_A`).

Apply when adding new internal symbols or when refactoring a file you are already changing; do not rename public surface
or drive breaking changes through consumers for naming-only cleanup.

## API Conventions

- Prefer `SpriteSheet.loadIndexed(...)` for demo/game sprite setup; use manual `loadColorsIntoPalette` + `load` +
  `indexize` only for advanced flows
- Use `SpriteSheet.getIndexedPixels()` when the software renderer needs CPU-side pixel data; it returns a defensive copy
  of the internal palette-indexed `Uint8Array` (throws if the sheet has not been indexized)
- Prefer `Color32#luminance` for perceived brightness calculations instead of duplicating `0.299*r + 0.587*g + 0.114*b`
  at call sites
- Prefer fixed-step helpers `BT.deltaSeconds` / `BT.timeSeconds` over hardcoded `1 / TARGET_FPS` in update loops
- Prefer `BT.cameraClamp(...)` (or `clampCameraToWorld(...)` in utility code) over ad-hoc clamp math
- Prefer `palette.applyHUD(startSlot?)` (default `1`) to fill the six common UI slots (white, bg, label, header, dim,
  FPS) and register their `hud_*` name aliases, rather than six manual `palette.set()` calls; override individual slots
  afterward for demo-specific colors

## Code Style

- 4-space indent, 120-char line width
- Single quotes, always semicolons, always trailing commas
- Always arrow parens
- Named exports only (no default exports)
- JSDoc required for public APIs
- When implementing changes, always update JSDoc and inline comments alongside the code. Never leave stale comments that
  describe old behavior.

## TypeScript file structure

Applies to library TypeScript in `src/`. **Class member order is enforced by `perfectionist/sort-classes`** (and import
order by `simple-import-sort`); the rule is auto-fixable with `pnpm run lint:fix`. It uses `type: 'unsorted'`, so it
enforces only the **group order** below and preserves the hand-tuned order **within** each group (e.g. logical method
families stay as written). Match this layout when adding or moving code. **Never use `// #region` / `// #endregion`** —
region markers are banned everywhere.

### File layout (top to bottom)

1. **Module JSDoc** — a `/** … */` block describing the file's purpose.
2. **Imports** — `import type` for type-only imports; inline `type` modifiers inside mixed imports
   (`import { type Backend, defaultConfig } from …`). Ordering is auto-fixed by `pnpm run lint:fix`
   (`simple-import-sort`).
3. **Leading module members** — constants that act as configuration or inputs (`MAX_VERTICES`, `INV_255`),
   validators/lookup tables (`HEX_TOKEN_PATTERN`, `HEX_TABLE`), and type aliases (`type EffectTier`, `type Resolve`).
   Module-level init loops (e.g. filling a lookup table) live here too.
4. **Primary export** — the class / interface / function the file is named for.
5. **Trailing module members** — large WGSL/template-literal constants (`const FRAGMENT_WGSL`) and pure helper functions
   placed **after** the class. Exported helpers come before private ones.

### Class member order

1. **Static fields** — cached singletons (`_zero`, `_white`), registries (`namedColors`).
2. **Instance fields** — public, then protected, then private (`#field` or `private`). Group `readonly` together. Each
   field gets its own JSDoc and is separated by a blank line (no packed field blocks).
3. **Constructor** — parameter-properties carry inline `/** … */` JSDoc.
4. **Accessors** — static getters first, then instance getters/setters.
5. **Static methods** — public before private.
6. **Instance methods** — public, then protected, then private. Private helpers (`cleanup`, `getOrCreateBindGroup`) come
   last.

### Cross-cutting

- Keep a **deprecated alias next to its canonical member** (`equals` after `isEqual`; `handleToggle` after
  `handleInput`).
- Cluster related instance-method families in a deliberate sub-order: new-allocating methods (`add`, `sub`) → `*To`
  zero-alloc variants → `*InPlace` variants → queries (`isEqual`, `isZero`) → `clone` / `toString` last.
- One blank line between members; a blank line before `return` and between logical blocks inside method bodies.
- JSDoc on every member, including private fields and methods.
- Named exports only; no default exports.

See `docs/developer-experience-guide.md` (File structure and member order) and `.cursor/rules/ts-file-structure.mdc`.

## Commands

```bash
pnpm run build              # Build library
pnpm run lint               # ESLint
pnpm run lint:fix           # ESLint with auto-fix
pnpm run format             # Format all files (Biome + Prettier)
pnpm run format:check       # Check formatting (Biome + Prettier)
pnpm run typecheck          # TypeScript type checking
pnpm run spellcheck         # cspell check
pnpm run knip               # Find unused exports/deps
pnpm run docs:links         # Check Markdown links (all repo-root *.md / *.mdx)
pnpm run preflight          # All checks (format + lint + typecheck + spellcheck + knip + docs:links + test:unit + test:declarations)
```

**RTK:** Shell commands are rewritten via `rtk hook cursor` (Cursor) / `rtk hook claude` (Claude Code). Use `pnpm run …`
for scripts. Prefer `rtk read` / `rtk grep` / shell over native Read/Grep for exploration. See `~/.claude/RTK.md`.

## Testing

Test files are colocated next to source: `src/utils/Vector2i.test.ts`.

```bash
pnpm run test                # Run all unit tests (alias for test:unit)
pnpm run test:unit           # Run all unit tests
pnpm run test:unit:watch     # Watch mode for development
pnpm run test:unit:coverage  # Coverage report (80% minimum threshold)
pnpm run test:declarations   # Declaration tooling log checker (Node test)
pnpm run test:visual         # Playwright visual regression tests (requires Chrome with WebGPU)
pnpm run test:visual:update  # Update visual test baselines
pnpm run bench               # Run CPU benchmarks (Vitest bench)
pnpm run bench:json          # Run benchmarks and write benchmark-results.json
```

**Test tiers:**

1. **Unit tests** (Vitest, node) - Pure logic: Vector2i, Rect2i, Color32, Palette, PaletteEffect, Easing, GameLoop
2. **Integration tests** (Vitest, Node + GPU mocks; happy-dom for DOM tests) - DOM and GPU code
3. **Visual regression** (Playwright, Chromium + WebGPU) - PNG snapshot verification of rendered output
4. **CPU benchmarks** (Vitest bench, `*.bench.ts`) - Hot method and allocation pattern throughput

### Visual Regression Tests

`pnpm run test:visual` runs Playwright with Chromium + WebGPU and captures PNG snapshots of actual rendered frames. This
is the primary tool for verifying that visual output is correct - not performance, but pixel-level correctness.

Use it when implementing or changing:

- Post-process effects (CRT, bloom, or any new effect in the effect chain)
- Sprite rendering, tinting, or blending
- Bitmap font rendering
- Primitive drawing (pixels, lines, rects)
- Palette-indexed rendering
- Camera offsets

Run `pnpm run test:visual:update` to regenerate baselines after an intentional visual change. Snapshots live in
`tests/visual/__snapshots__/`.

The suite covers: camera, fonts, mixed (primitives + sprites), primitives, sprites, and post-process (baseline, CRT,
CRT+bloom, and individual display/pixel effects such as Vignette, Scanlines, Bloom, PixelGlitch, ChromaticAberration,
BarrelDistortion, upscale passes, and more).

**WebGPU mocks:** Use `src/__test__/webgpu-mock.ts` for tests needing GPUDevice, GPUTexture, etc. See
[docs/testing.md](docs/testing.md) for full details.

### Known Testing Quirks

- **DOM environment directive**: Add `// @vitest-environment happy-dom` at the top of any test file that touches DOM
  APIs. Without it, the test runs in Node and DOM APIs are undefined.
- **AssetLoader image tests**: The suite stubs `Image` with `vi` rather than relying on happy-dom data-URI `onload`
  behavior (which is unreliable in happy-dom).
- **Vector2i `-0` vs `0`**: JavaScript can produce `-0` when negating vectors. Use `result.x + 0` to coerce in
  assertions where sign is meaningless.

## Performance Testing

Use the benchmark system when the user asks about performance, throughput, regressions, hot paths, or CI benchmark
coverage.

- Use **CPU benchmarks** for isolated methods, helpers, caches, and allocation patterns
- For rendering correctness, use visual regression tests (`pnpm run test:visual`) - they produce PNG snapshots

Recommended commands:

```bash
pnpm run bench
pnpm run bench:json
```

CI status:

- CPU benchmarks run in GitHub Actions on `main` pushes and on PRs labeled `perf`
- Labeled PR benchmark runs compare against the latest `main` baseline artifact
- The benchmark job comments on the PR and fails on regressions greater than 25%

Claude Code reusable skill:

- Use `.claude/skills/bt-perf/SKILL.md` for benchmark-related work
- Use it when adding a new `*.bench.ts` or reasoning about benchmark CI behavior

## Git

- Conventional Commits format: `<type>(<scope>): <description>`
- All commits require DCO sign-off (`git commit -s`)
- AI-assisted commits include `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
- Types: feat, fix, refactor, docs, test, chore, perf, ci, style, build, revert (commitlint-enforced)
- Scopes: renderer, camera, assets, api, utils, examples, ci, docs (convention only; commitlint does not enforce a scope
  enum)

## Working with Claude

- **Planning vs implementation sessions**: During planning work (reviewing issues, discussing architecture), do not
  modify source files. Only update Linear. Wait for a separate implementation session before touching code.
- **User-facing strings**: Follow the two-tier voice guide for all throws, error messages, and canvas-visible text. See
  [docs/voice.md](docs/voice.md) before writing any throw or user-facing string.
- **Documentation is part of every feature**: After completing any feature or fix, always update documentation without
  being asked. The rule: if you changed a public API, update the relevant `docs/api-*.md` file; if you changed engine
  behavior, update the affected `docs/` guide; if you changed architecture or added a new subsystem file, update the
  `CLAUDE.md` architecture map and the `## Where to Find Information` table; update `README.md` only if the change
  affects the Quick Start, prerequisites, features list, or browser compatibility. Never treat documentation as a
  separate step the user must request.
