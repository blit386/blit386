# BLIT386

A palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit. Pixel-perfect 2D rendering where primitives
and sprites resolve through a shared indexed palette.

## Tech Stack

- Language: TypeScript 5.9.3 (strict mode; pinned to match API Extractor for declaration rollup)
- Runtime: Browser (WebGPU)
- Build: Vite + vite-plugin-dts (`rollupTypes` uses API Extractor)
- Formatting: Biome (TS/JS) + Prettier (MD/YAML)
- Linting: ESLint with perfectionist, jsdoc, security, promise plugins
- Spelling: cspell
- Dead code: knip
- Commits: Conventional Commits + DCO sign-off + commitlint
- Package manager: pnpm

## Where to Find Information

Before writing new code, reviewing existing code, or preflighting, check here first:

| Question                                                                              | Where to look                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does `BT.X` do (getter vs method)?                                               | `src/BLIT386.ts` JSDoc, `docs/api-core.md`, BT API: getters vs methods below                                                                                                                                                                                                                                                                                                                                                          |
| How do I smooth motion between fixed `update()` steps?                                | `BT.renderAlpha` (`src/core/GameLoop.ts`, `docs/api-game-loop.md`); worked pattern with `Vector2i.lerp` in `docs/guide-game-loop.md`                                                                                                                                                                                                                                                                                                  |
| How do I document a new/changed public API and keep it versioned?                     | `docs/documentation-and-versioning-guide.md` (@since/@changed/@deprecated tagging, `<Since>`/`<ApiAvailability>`/`<PageChangelog>` doc components, review checklist)                                                                                                                                                                                                                                                                  |
| How does a subsystem work internally?                                                 | The relevant `src/core/` or `src/render/` file                                                                                                                                                                                                                                                                                                                                                                                        |
| What does a demo implement?                                                           | `src/core/IBTDemo.ts` (interface + HardwareSettings)                                                                                                                                                                                                                                                                                                                                                                                  |
| How does palette usage tracking work for the overlay grid?                            | `src/core/RenderPaletteUsage.ts`, `src/overlay/palette/PaletteView.ts`                                                                                                                                                                                                                                                                                                                                                                |
| How does the overlay work?                                                            | `docs/guide-overlay.md`, `src/overlay/` (orchestrator + `layout/layoutPlan.ts`), `docs/api-overlay.md` (overlay configure flags and style), `HardwareSettings.isOverlayEnabled`                                                                                                                                                                                                                                                       |
| What palette/sprite setup pattern is correct?                                         | `docs/guide-palette.md`, then `docs/api-assets.md`                                                                                                                                                                                                                                                                                                                                                                                    |
| What are the render/asset dimension limits?                                           | `src/utils/RenderLimits.ts` (constants), `src/utils/AssetLimits.ts` (asset + glyph limits), `docs/api-assets.md` (asset size limits table), `docs/api-core.md` (HardwareSettings dimension constraints)                                                                                                                                                                                                                               |
| Which preset has which exact color values?                                            | `docs/guide-palette-presets.md`                                                                                                                                                                                                                                                                                                                                                                                                       |
| How do post-process effects work?                                                     | `docs/guide-post-process-effects.md`                                                                                                                                                                                                                                                                                                                                                                                                  |
| What does the CI do on this file?                                                     | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                                                                                                            |
| How is agent config drift (rules parity, skills symlinks, AGENTS.md pointer) checked? | `scripts/check-agent-config.mjs`, wired into `pnpm run agents:check` / `preflight` and the `quality` job in `ci.yml`                                                                                                                                                                                                                                                                                                                  |
| Where do the `.cursor/commands/*.md` slash commands come from?                        | Generated from `.claude/skills/*/SKILL.md` (frontmatter stripped) by `scripts/sync-cursor-commands.mjs`; never hand-edit them. `pnpm run sync:cursor-commands` regenerates, `pnpm run sync:cursor-commands:check` reports drift (wired into `preflight` and the `quality` job in `ci.yml`)                                                                                                                                            |
| Dependency security policy / CI audit gate?                                           | `docs/security/dependency-policy.md`, `docs/security/audit-exceptions.md`                                                                                                                                                                                                                                                                                                                                                             |
| What is the benchmark threshold?                                                      | `.github/workflows/ci.yml` benchmark job (`--threshold 25` flag), not docs                                                                                                                                                                                                                                                                                                                                                            |
| What error message style should I use?                                                | `docs/voice.md`, then `src/utils/errorMessages.ts`; shared "can't find this file" URL hints live in `src/utils/urlHints.ts` (used by `BitmapFont` and the `AudioClip` messages)                                                                                                                                                                                                                                                       |
| Is this API exported publicly?                                                        | `src/BLIT386.ts` export block (lines 2064–2124)                                                                                                                                                                                                                                                                                                                                                                                       |
| What test mock do I need for GPU code?                                                | `src/__test__/webgpu-mock.ts`                                                                                                                                                                                                                                                                                                                                                                                                         |
| What test mock do I need for Web Audio code?                                          | `src/__test__/webaudio-mock.ts`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Declaration tooling / TS version alignment?                                           | `docs/tooling.md`, `docs/developer-experience-guide.md`, `scripts/check-declaration-tooling.mjs`                                                                                                                                                                                                                                                                                                                                      |
| Should this private name repeat the class/file?                                       | Internal scoped naming below; `docs/developer-experience-guide.md` (Naming conventions)                                                                                                                                                                                                                                                                                                                                               |
| Where do I put a new field/method in a `.ts` file?                                    | TypeScript file structure below; `.cursor/rules/ts-file-structure.mdc`; `docs/developer-experience-guide.md` (File structure and member order)                                                                                                                                                                                                                                                                                        |
| Where are Cursor agent rules and hooks?                                               | `.cursor/rules/*.mdc` (always-applied + glob-scoped); `.cursor/hooks.json`; condensed mirrors in `.claude/rules/`; see [Developer Experience](docs/developer-experience-guide.md#cursor)                                                                                                                                                                                                                                              |
| Where is the public docs site (blit386.dev)?                                          | Sibling repo `blit386-dev-fumapress` (Fumapress + Waku) generates it from this repo's `docs/`; `docs/_sitemap.json` (schema `docs/_sitemap.schema.json`) controls which docs publish, their URL, sidebar order, and subtitle                                                                                                                                                                                                          |
| Why does each published doc have a blit386.dev banner?                                | Auto-managed by `scripts/sync-doc-banners.mjs` (`pnpm run sync:doc-banners`); never hand-edit the `<!-- blit386.dev-banner -->` block. The mirror strips it; see Public docs site banner below and `.claude/rules/docs-authoring.md`                                                                                                                                                                                                  |
| Can I use Fumadocs components (Callout, TypeTable, …) in docs?                        | Yes, in published docs only (site-first). Which ones, when to use them, and the authoring rules: `.claude/rules/docs-authoring.md` (Cursor: `.cursor/rules/docs-authoring.mdc`)                                                                                                                                                                                                                                                       |
| How do I write/rename/split a `docs/` page?                                           | `.claude/rules/docs-authoring.md` (prose rules: no bold, no `---`, `×` for dimensions; filename mirrors sitemap section; rename/split checklist). For runtime strings see `docs/voice.md` instead                                                                                                                                                                                                                                     |
| What agent skills are available for this project?                                     | `.agents/skills/` (Zed) and `.claude/skills/` (Claude Code) – `bt-preflight`, `bt-review`, `bt-pr`, `bt-format`, `bt-perf`, `bt-test`, `bt-release`, `bt-spellcheck`, `bt-security-run`, `bt-deep-review`, `bt-quick-format`, `bt-issue-audit`                                                                                                                                                                                        |
| How do users start a new project with the engine?                                     | `npm create blit386@latest` – the scaffolder lives in the sibling `create-blit386` repo; see Onboarding and the scaffolder below                                                                                                                                                                                                                                                                                                      |
| How do I load an audio clip?                                                          | `src/assets/AudioClip.ts`, `docs/api-audio.md` (Loading section), `docs/guide-audio.md` (Preloading audio clips)                                                                                                                                                                                                                                                                                                                      |
| How does the SFX voice pool allocate/steal voices?                                    | `src/audio/VoicePool.ts`; exposed via `BT.soundPlay` and friends (`docs/api-audio.md`, Playback (SFX) section)                                                                                                                                                                                                                                                                                                                        |
| How does music playback crossfade and loop?                                           | `src/audio/MusicPlayer.ts`; exposed via `BT.musicPlay` and friends (`docs/api-audio.md`, Playback (Music) section)                                                                                                                                                                                                                                                                                                                    |
| How does the audio meter work?                                                        | `src/overlay/audio-meter/` (AudioMeter, style, constants); lazy metering via `AudioManager.enableBusMetering()`/`getBusLevels()`; wired through `HardwareSettings.isOverlayAudioMetersEnabled` in `src/core/BTAPI.ts`; `docs/api-overlay.md` (Audio meters section)                                                                                                                                                                   |
| How do I synthesize a sound procedurally (no source file)?                            | `AudioClip.synth` in `src/assets/AudioClip.ts`; render/validation math in `src/assets/synth/` (`SynthParams.ts`, `synthEnvelope.ts`, `synthPitch.ts`, `synthWaveforms.ts`, `synthRender.ts`, `synthValidation.ts`); `docs/api-audio.md` (Synth section)                                                                                                                                                                               |
| Is there a built-in sound preset library (jump, explosion, etc.)?                     | `src/assets/synth/synthPresets.ts`, exposed publicly as `BT.synthPreset.{jump,pickup,explosion,laser,hit,blip}`; `docs/api-audio.md` (Presets section), `docs/guide-audio.md` (Design a sound)                                                                                                                                                                                                                                        |
| How does pointer wheel / keyboard scroll capture work?                                | `HardwareSettings.isCapturingPointerScroll` (`src/input/PointerInput.ts`) and `isCapturingKeyboardScroll` (`src/input/KeyboardInput.ts`), both opt-in and default `false`; `isCapturingPointerScroll` also gates `canvas.style.touch-action` (`none` while capturing, `pan-y` otherwise) so touch tap-hold-scroll follows the same opt-in; `docs/guide-input.md` (Scroll delta section), `docs/api-core.md` (Hardware settings table) |
| How does the screen wake lock work?                                                   | `src/core/WakeLock.ts`; `HardwareSettings.isWakeLockEnabled` in `src/core/IBTDemo.ts`; `docs/api-core.md` (Hardware settings table), `docs/api-browser-support.md` (Screen wake lock section)                                                                                                                                                                                                                                         |
| How does screen orientation detection / lock work?                                    | `src/core/Orientation.ts`; `HardwareSettings.preferredOrientation` + `IBTDemo.onOrientationChange` in `src/core/IBTDemo.ts`; `BT.screenOrientation` in `src/BLIT386.ts`; `docs/api-core.md` (Screen orientation), `docs/api-browser-support.md` (Screen orientation)                                                                                                                                                                  |
| How does the engine hot-swap runtime work?                                            | `src/hot/` (`protocol.ts`, `HotRuntime.ts`, `HotSwap.ts`); `BTAPI.hotReplaceDemo`/`getDemo`/`isInitialized` in `src/core/BTAPI.ts`; `IBTDemo.onHotReload` in `src/core/IBTDemo.ts`; hot-aware routing in `src/utils/Bootstrap.ts`                                                                                                                                                                                                     |
| How does the `blit386/vite` dev plugin work?                                          | `src/vite/` (`options.ts`, `transform.ts`, `assets.ts`, `index.ts`); `package.json` `"./vite"` subpath export; dev-only (`apply: 'serve'`) – injects the hot-reload snippet and broadcasts `blit386:asset-changed`/full-reload for asset dir changes; `vite.node.config.ts` sets `root: '/'` to avoid collision with the main build's `dist/blit386.d.ts` (see inline comment for explanation)                                        |
| How does a fresh remote/web session bootstrap its toolchain?                          | Environment bootstrap below; `scripts/session-start-bootstrap.sh`; `.claude/settings.json` (`SessionStart`), `.cursor/hooks.json` (`sessionStart`), `.devcontainer/devcontainer.json`                                                                                                                                                                                                                                                 |

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

## Public docs site banner

Every doc that publishes to blit386.dev (those listed in `docs/_sitemap.json`) carries a short banner just below its H1,
generated and owned entirely by `scripts/sync-doc-banners.mjs` – never hand-edit it. Run `pnpm run sync:doc-banners`
after a sitemap change; `pnpm run sync:doc-banners:check` reports drift in CI. The public mirror strips the block, so it
never appears on the live site.

Full detail: `.claude/rules/docs-authoring.md` (Cursor: `.cursor/rules/docs-authoring.mdc`).

## Fumadocs components in published docs

Published docs (those in `docs/_sitemap.json`) are authored as MDX-capable Markdown, site-first: Fumadocs/Fumapress
components (`Callout`, `Card`/`Cards`, `Tabs`, `Steps`, `Accordions`, `Files`, `TypeTable`, …) render on blit386.dev but
degrade or vanish on GitHub. Any component used must already be registered in `blit386-dev-fumapress/press.config.tsx`
(`getMdxComponents`), or the mirror build throws.

Full detail (component list, when to use which, authoring rules): `.claude/rules/docs-authoring.md` (Cursor:
`.cursor/rules/docs-authoring.mdc`).

## Twoslash in published docs

All TypeScript code blocks in published docs (`docs/api-*.md`, `docs/guide-*.md`, `docs/performance-*.md`,
`docs/reference-*.md`) must use ` ```ts twoslash `. Plain ` ```ts ` is never acceptable – the live site (blit386.dev)
uses fumadocs-twoslash for type-on-hover popups. Every block must compile cleanly on its own:

```ts twoslash
import { BT, Color32, Palette } from 'blit386';
const palette = Palette.c64();
BT.paletteSet(palette);
```

Self-contained blocks carry their own imports; fragment blocks (showing a snippet whose variables come from surrounding
prose) add a hidden preamble above `// ---cut---`. Fix a broken preamble rather than adding `// @noErrors`.

Full preamble rules and the fragment-block example: `.claude/rules/twoslash-docs.md` (Cursor:
`.cursor/rules/twoslash-docs.mdc`).

## Documentation authoring style

House style for the Markdown under `docs/` (the published reference and guides), not runtime user-facing strings – for
throws, console output, and canvas banners see `docs/voice.md`. Headline rules: no bold (`**`) in prose, no `---`
separators, `×` (not `x`) for dimensions except literal program output, no walls of text, credit external inspirations
with a link and author, American English spelling. Filenames mirror the sitemap section (`api-*`, `guide-*`,
`performance-*`, `reference-*`).

Full detail (prose rules, rename/split checklist, post-change cspell/sync obligations):
`.claude/rules/docs-authoring.md` (Cursor: `.cursor/rules/docs-authoring.mdc`), `.claude/rules/docs-sync-required.md`.

## Architecture

All engine functionality is accessed through the static `BT` namespace. The architecture is palette-first: primitives,
sprites, and bitmap text resolve color through the active `Palette` before final RGBA output. Demos implement the
`IBTDemo` interface (`configure?`, `init`, `update`, `render`, optional `overlayRows?`).

The file tree below is illustrative, not exhaustive – it highlights notable subsystems and entry points. Colocated
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
    WakeLock.ts             # Screen Wake Lock subsystem: acquire/release/re-acquire on visibilitychange (HardwareSettings.isWakeLockEnabled)
    Orientation.ts          # Screen orientation detection + optional lock (HardwareSettings.preferredOrientation, IBTDemo.onOrientationChange, BT.screenOrientation)
  hot/
    protocol.ts             # Shared types/constants for the hot-reload runtime (no value imports from src/; shared with the src/vite/ plugin)
    HotRuntime.ts           # Vite HMR context registration, generation counter, hard-reload request, reload announce/broadcast
    HotSwap.ts              # Tiered demo hot-swap: prototype swap (methods-only), re-init (init()/constructor changed), hard reload (hardware settings changed)
  vite/
    options.ts              # Blit386PluginOptions/AssetKind types, defaults, resolveOptions()
    transform.ts            # Hot-reload snippet injection into a matched entry module (idempotent; magic-string sourcemap)
    assets.ts               # Asset hot-update: file path -> served URL -> asset kind; blit386:asset-changed / full-reload
    index.ts                # blit386() Vite plugin factory (subpath export blit386/vite); apply: 'serve', dev-only
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
    audio-meter/           # AudioMeter (per-bus level bars + voices/steal/drop text), style, constants
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
    AudioClip.ts           # Decoded AudioBuffer asset: streamed fetch+decode, cache/dedup, fallback URL lists, synth() factory
    synth/                 # Deterministic synthesis engine backing AudioClip.synth (SynthParams, envelope/pitch/waveform math, validation, synthPresets sound library)
    Palette.ts             # 256-entry indexed color palette
    PaletteEffect.ts       # Palette effect system (cycle, fade, flash, swap)
    palettes/              # Built-in preset palette data (presetData.ts, hudData.ts)
  input/
    PointerInput.ts        # DOM-backed pointer / mouse / touch / pen tracker (4 slots)
    KeyboardInput.ts       # KeyboardEvent.code state, edges, tick repeat, beforeinput text
    GamepadInput.ts        # Polling-based gamepad input tracker (4 players, axes, buttons, dead zone)
    defaultKeyboardMap.ts  # Default face-button key tables; clone helpers for BT.inputMapReset
  audio/
    AudioManager.ts        # Web Audio context, bus graph (sfx/music -> main -> destination), unlock state, mute/volume, SFX + music playback; lazy opt-in bus metering (enableBusMetering, getBusLevels) backs the overlay audio meter band
    audioDecodeContext.ts  # Module-scoped decode-context registry + AudioClip unload seam (wired to VoicePool)
    VoicePool.ts            # Fixed-size SFX voice pool: allocation/stealing, generational SoundRef handles, per-voice fades
    MusicPlayer.ts          # Crossfading music player: current/previous voice pair, fadeMs/overlap timing, loop points
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
    AudioParamRamp.ts       # Shared AudioParam ramp scheduling (bus fades + per-voice fades)
    Rng.ts                 # Deterministic PRNG (mulberry32-style; internal, backs the synth engine's noise generation)
    FrameCapture.ts        # GPU readback + PNG export
    Timer.ts               # Elapsed-time helper (exported; Timer.fireIfElapsed)
  __test__/
    webgpu-mock.ts         # WebGPU mock factories for tests
    webaudio-mock.ts       # Web Audio mock factories for tests (AudioContext, GainNode, AudioParam, decodeAudioData/AudioBuffer mocks)
    setup.ts               # Vitest global setup (GPU constants)
```

### Palette-First Rendering

Two backends selectable via `HardwareSettings.backend` (default `'webgpu'`):

- WebGPU (`'webgpu'`): indexed, palette-first hardware renderer.
  1. Primitives pipeline – batched geometry writing palette indices (pixels, lines, rects). Max 50k vertices/frame.
  2. Sprites pipeline – batched palette-indexed textured quads (sprites, bitmap text). Max 50k vertices (~8333 quads).
     Nearest-neighbor sampling. Auto-batched by texture.
  3. Framebuffer & post-process – the logical composite is an `r8uint` attachment at `displaySize` (one palette slot per
     pixel). Pixel-tier effects (`PostProcessChain`, `FullscreenPixelEffect`) run on that index buffer.
     `PaletteResolveUpscalePass` LUT-resolves indices to RGBA and upscales to `drawingBufferSize`. Display-tier effects
     run on that RGBA before present (see `docs/guide-post-process-effects.md`).
- Software (`'software'`): Canvas 2D fallback. Supports palette rendering, rects, Bresenham lines, indexed sprite blits,
  and bitmap text. Post-process/fullscreen effects throw a clear error directing users to the WebGPU backend. Activates
  automatically when WebGPU init fails; force explicitly via `HardwareSettings.backend: 'software'` or the
  `?backend=software` URL query parameter. Use `BT.activeBackend` to query which backend started
  (`'webgpu' | 'software' | null`). The engine overlay shows the active backend on the top bar when enabled.

### Core Types

- `Vector2i` – integer 2D vector. Constructor auto-floors. Has `width`/`height` aliases. Predicates: `isEqual()`,
  `isEqualXY()`, `isZero()`.
- `Rect2i` – integer rectangle. Predicates: `isContaining()`, `isContainingXY()`, `isIntersecting()`, `isEqual()`.
  Geometry: `intersection()`, `intersectTo()`.
- `Color32` – 32-bit RGBA (0–255). Static colors, hex parsing, named-color registry, float array conversion. Predicate:
  `isEqual()`.

## Critical Rules

1. No emoji – nowhere: code, docs, commits, PR titles, errors, logs
2. Integer coordinates – all rendering uses `Vector2i`/`Rect2i`, never floats
3. Performance first – minimize allocations in update/render, reuse buffers, batch draws
4. Use BT namespace – never access `BTAPI` directly from demo code
5. No `any` types – use `unknown` or proper types (enforced as a Biome lint error; CI fails via `format:check`)
6. Type-only imports – `import type { ... }` for types
7. Documentation is part of every feature – after any public API change update the relevant `docs/api-*.md`; after any
   behavior change update the affected `docs/` guide; after any architecture change update the `CLAUDE.md` architecture
   map. Update `README.md` only when the Quick Start, features list, prerequisites, or browser compatibility is
   affected. Never wait to be asked.

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
  time because the overlay itself read the toggle key's edge from the render phase.
- Default gamepad stick dead zone is `0.75`
- Triggers are axis-only for now (`AXIS_TRIGGER_L` / `AXIS_TRIGGER_R`); dedicated trigger button constants are not
  implemented yet

## BT API: getters vs methods

The public `BT` namespace uses getters for read-only snapshots (`BT.displaySize.y`, `BT.targetFPS`, `BT.activeBackend`)
and methods for actions, parameterized queries, and async work (`BT.cameraSet(...)`, `BT.pointerPos(0)`,
`await BT.captureFrame()`). Do not add new zero-argument `BT.foo()` functions when a getter is appropriate.
`requestedBackend` is the resolved init request; `activeBackend` is what actually started (differs after a
WebGPU→software fallback) and is what runtime gates (post-process, capture) should check.

Full getter/method category tables: `docs/api-core.md`, `.claude/rules/bt-api-getters.md` (Cursor:
`.cursor/rules/bt-api-getters.mdc`). Deprecated aliases: `docs/reference-deprecations.md`.

## Boolean naming

Runtime queries and configure flags (`HardwareSettings`, `BootstrapOptions`) use grammatical `is*` / `has*`
(`isPointerActive`, `hasGlyph`, `isOverlayEnabled`, `isDetectingDroppedFrames`). Side-effect or operation-result
booleans use imperative verbs, not `is*` (`Timer.fireIfElapsed()`, `intersectTo(other, out): boolean`,
`remove(): boolean`). Input hold vs edge on `BT`: `isDown`/`isKeyDown` (held) vs `isPressed`/`isReleased`,
`isKeyPressed`/`isKeyReleased` (edges); never embed a second `Is` (audit: `\bis[A-Za-z]+Is[A-Z]`).

Full tiers: `docs/developer-experience-guide.md` (Boolean naming), `.claude/rules/bt-api-getters.md`.

## Internal scoped naming

Private fields, private methods, protected members, and module-local constants/types must not repeat the enclosing class
or file name – the type or file already provides scope. Example: `FrameCapture.request()` not `requestCapture()`. Does
not apply to public API (`BT.*`, the `BLIT386.ts` export block, public class methods).

Full policy and examples: `.claude/rules/internal-scoped-naming.md` (Cursor:
`.cursor/rules/internal-scoped-naming.mdc`), `docs/developer-experience-guide.md` (Naming conventions).

## API Conventions

- Prefer `SpriteSheet.loadIndexed(...)` for demo/game sprite setup; manual `loadColorsIntoPalette` + `load` + `indexize`
  only for advanced flows
- Use `SpriteSheet.getIndexedPixels()` for CPU-side pixel data in the software renderer (defensive copy of the indexed
  `Uint8Array`; throws if not yet indexized)
- Prefer `Color32#luminance` over duplicating `0.299*r + 0.587*g + 0.114*b` at call sites
- Prefer `BT.deltaSeconds` / `BT.timeSeconds` over hardcoded `1 / TARGET_FPS` in update loops
- Prefer `BT.cameraClamp(...)` (or `clampCameraToWorld(...)` in utility code) over ad-hoc clamp math
- Prefer `palette.applyHUD(startSlot?)` (default `1`) to fill the six common UI slots and register their `hud_*`
  aliases, rather than six manual `palette.set()` calls; override individual slots afterward

## Code Style

- 4-space indent, 120-char line width
- Single quotes, always semicolons, always trailing commas
- Always arrow parens
- Named exports only (no default exports)
- JSDoc required for public APIs (enforced as ESLint `warn` rules that fail CI via `--max-warnings 0`)
- When implementing changes, always update JSDoc and inline comments alongside the code. Never leave stale comments that
  describe old behavior.

### American English spelling

Prose, JSDoc, and our own identifiers use American English (`color`, `optimization`, `canceled`, and American-style
verbs), never the British equivalents. Exempt: literal third-party or spec-mandated names that are correctly spelled
with a British `s` or `c` in their own spec – for example Web Audio's `AnalyserNode`/`createAnalyser`, or this repo's
own `gray`/`grey` named-color alias in `Color32.ts`, which mirrors the CSS Color Module's own dual spelling. Do not
"fix" those.

Cursor: `.cursor/rules/american-english-spelling.mdc` (always applied in this repo).

## TypeScript file structure

Applies to library TypeScript in `src/`. Class member order is enforced by `perfectionist/sort-classes` (imports by
`simple-import-sort`); auto-fix with `pnpm run lint:fix`. It uses `type: 'unsorted'`, so it enforces only group order
(static fields → instance fields → constructor → accessors → static methods → instance methods, each public before
private) and preserves the hand-tuned order within each group. Never use `// #region` / `// #endregion` – region markers
are banned everywhere.

Full file layout and class member order: `.claude/rules/ts-file-structure.md` (Cursor:
`.cursor/rules/ts-file-structure.mdc`), `docs/developer-experience-guide.md` (File structure and member order).

## Commands

```bash
pnpm run build              # Build library (two Vite builds: the main dist/blit386.* plus dist/vite.* for the blit386/vite subpath)
pnpm run lint               # ESLint
pnpm run lint:fix           # ESLint with auto-fix
pnpm run format             # Format all files (Biome + Prettier)
pnpm run format:check       # Check formatting (Biome + Prettier)
pnpm run typecheck          # TypeScript type checking
pnpm run spellcheck         # cspell check
pnpm run knip               # Find unused exports/deps
pnpm run docs:links         # Check Markdown links (all repo-root *.md / *.mdx)
pnpm run agents:check       # Check agent config drift (rules parity, skills symlinks, AGENTS.md <-> CLAUDE.md pointer)
pnpm run preflight          # All checks (format + lint + typecheck + spellcheck + knip + docs:links + agents:check + sync:doc-banners:check + sync:cursor-commands:check + api:since:check + api:history:check + test:unit + test:declarations + test:agent-config + test:cursor-commands + test:api-history + test:security-preflight)
```

RTK: Shell commands are rewritten via `rtk hook cursor` (Cursor) / `rtk hook claude` (Claude Code). Use `pnpm run …` for
scripts. Prefer `rtk read` / `rtk grep` / shell over native Read/Grep for exploration. See `~/.claude/RTK.md`.

## Testing

Test files are colocated next to source: `src/utils/Vector2i.test.ts`.

```bash
pnpm run test                # Run all unit tests (alias for test:unit)
pnpm run test:unit           # Run all unit tests
pnpm run test:unit:watch     # Watch mode for development
pnpm run test:unit:coverage  # Coverage report (80% minimum threshold)
pnpm run test:declarations   # Declaration tooling log checker (Node test)
pnpm run test:agent-config   # Agent config drift checker tests (Node test)
pnpm run test:visual         # Playwright visual regression tests (requires Chrome with WebGPU)
pnpm run test:visual:update  # Update visual test baselines
pnpm run bench               # Run CPU benchmarks (Vitest bench)
pnpm run bench:json          # Run benchmarks and write benchmark-results.json
```

Test tiers:

1. Unit tests (Vitest, node) – Pure logic: Vector2i, Rect2i, Color32, Palette, PaletteEffect, Easing, GameLoop
2. Integration tests (Vitest, Node + GPU mocks; happy-dom for DOM tests) – DOM and GPU code
3. Visual regression (Playwright, Chromium + WebGPU) – PNG snapshot verification of rendered output
4. CPU benchmarks (Vitest bench, `*.bench.ts`) – Hot method and allocation pattern throughput

### Visual Regression Tests

`pnpm run test:visual` runs Playwright with Chromium + WebGPU and captures PNG snapshots of actual rendered frames – the
primary tool for pixel-level correctness (not performance). Run it when changing post-process effects, sprite rendering,
bitmap fonts, primitive drawing, palette-indexed rendering, or camera offsets. Run `pnpm run test:visual:update` to
regenerate baselines after an intentional visual change.

Full coverage list, snapshot locations, and WebGPU mock usage: [docs/reference-testing.md](docs/reference-testing.md).

### Known Testing Quirks

Full list: [docs/reference-testing.md](docs/reference-testing.md) (Known quirks).

## Performance Testing

Use CPU benchmarks (`pnpm run bench`, `pnpm run bench:json`) for isolated methods, helpers, caches, and allocation
patterns. For rendering correctness (not performance), use visual regression tests instead (`pnpm run test:visual`).

Full CI behavior (labeled-PR runs, regression threshold, PR comment format): `docs/performance-testing.md`,
`.claude/skills/bt-perf/SKILL.md` (use this skill for benchmark-related work).

## Git

- Conventional Commits format: `<type>(<scope>): <description>`
- All commits require DCO sign-off (`git commit -s`)
- AI-assisted commits include `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
- Types: feat, fix, refactor, docs, test, chore, perf, ci, style, build, revert (commitlint-enforced)
- Scopes: renderer, camera, assets, api, utils, examples, ci, docs (convention only; commitlint does not enforce a scope
  enum)

## Working with Claude

- Planning vs implementation sessions: During planning work (reviewing issues, discussing architecture), do not modify
  source files. Only update Linear. Wait for a separate implementation session before touching code.
- User-facing strings: Follow the two-tier voice guide for all throws, error messages, and canvas-visible text. See
  [docs/voice.md](docs/voice.md) before writing any throw or user-facing string.
- Documentation is part of every feature: After completing any feature or fix, always update documentation without being
  asked. The rule: if you changed a public API, update the relevant `docs/api-*.md` file; if you changed engine
  behavior, update the affected `docs/` guide; if you changed architecture or added a new subsystem file, update the
  `CLAUDE.md` architecture map and the `## Where to Find Information` table; update `README.md` only if the change
  affects the Quick Start, prerequisites, features list, or browser compatibility. Never treat documentation as a
  separate step the user must request.

## Environment bootstrap (SessionStart hook and devcontainer)

A fresh remote/web/cloud checkout starts with no `node_modules` and no warmed toolchain.
`scripts/session-start-bootstrap.sh` fixes that (`pnpm install --frozen-lockfile`, skips on an unchanged lockfile) and
is wired into `.claude/settings.json` (SessionStart hook), `.cursor/hooks.json` (sessionStart hook), and
`.devcontainer/devcontainer.json` (`postCreateCommand`) – one script, three call sites. None of the three block or fail
the session on a bootstrap error.

Full detail: `.claude/rules/environment-bootstrap.md` (Cursor: `.cursor/rules/environment-bootstrap.mdc`).

## Environment and tooling gotchas

Learned running preflight and the versioning workflow in ephemeral / CI-style checkouts (no git tags, no outbound
network): `_api-history.json` regeneration needs git tags (dates go `null` without them – restore the committed
`versions` block after regenerating), and `docs:links` needs outbound network (external URLs 403 through a sandbox
proxy; internal links still resolve). These are environment artifacts, not code bugs – do not "fix" them by editing the
checks.

Full list (including hook interaction and `--no-verify` guidance): `.claude/rules/environment-gotchas.md` (Cursor:
`.cursor/rules/environment-gotchas.mdc`, always applied).
