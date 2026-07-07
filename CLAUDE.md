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

| Question                                                          | Where to look                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does `BT.X` do (getter vs method)?                           | `src/BLIT386.ts` JSDoc, `docs/api-core.md`, BT API: getters vs methods below                                                                                                                                                                            |
| How do I document a new/changed public API and keep it versioned? | `docs/documentation-and-versioning-guide.md` (@since/@changed/@deprecated tagging, `<Since>`/`<ApiAvailability>`/`<PageChangelog>` doc components, review checklist)                                                                                    |
| How does a subsystem work internally?                             | The relevant `src/core/` or `src/render/` file                                                                                                                                                                                                          |
| What does a demo implement?                                       | `src/core/IBTDemo.ts` (interface + HardwareSettings)                                                                                                                                                                                                    |
| How does palette usage tracking work for the overlay grid?        | `src/core/RenderPaletteUsage.ts`, `src/overlay/palette/PaletteView.ts`                                                                                                                                                                                  |
| How does the overlay work?                                        | `docs/guide-overlay.md`, `src/overlay/` (orchestrator + `layout/layoutPlan.ts`), `docs/api-overlay.md` (overlay configure flags and style), `HardwareSettings.isOverlayEnabled`                                                                         |
| What palette/sprite setup pattern is correct?                     | `docs/guide-palette.md`, then `docs/api-assets.md`                                                                                                                                                                                                      |
| What are the render/asset dimension limits?                       | `src/utils/RenderLimits.ts` (constants), `src/utils/AssetLimits.ts` (asset + glyph limits), `docs/api-assets.md` (asset size limits table), `docs/api-core.md` (HardwareSettings dimension constraints)                                                 |
| Which preset has which exact color values?                        | `docs/guide-palette-presets.md`                                                                                                                                                                                                                         |
| How do post-process effects work?                                 | `docs/guide-post-process-effects.md`                                                                                                                                                                                                                    |
| What does the CI do on this file?                                 | `.github/workflows/ci.yml`                                                                                                                                                                                                                              |
| Dependency security policy / CI audit gate?                       | `docs/security/dependency-policy.md`, `docs/security/audit-exceptions.md`                                                                                                                                                                               |
| What is the benchmark threshold?                                  | `ci.yml` benchmark job (`--threshold 25` flag), not docs                                                                                                                                                                                                |
| What error message style should I use?                            | `docs/voice.md`, then `src/utils/errorMessages.ts`; shared "can't find this file" URL hints live in `src/utils/urlHints.ts` (used by `BitmapFont` and the `AudioClip` messages)                                                                         |
| Is this API exported publicly?                                    | `src/BLIT386.ts` export block (lines 1563–1610)                                                                                                                                                                                                         |
| What test mock do I need for GPU code?                            | `src/__test__/webgpu-mock.ts`                                                                                                                                                                                                                           |
| What test mock do I need for Web Audio code?                      | `src/__test__/webaudio-mock.ts`                                                                                                                                                                                                                         |
| Declaration tooling / TS version alignment?                       | `docs/tooling.md`, `docs/developer-experience-guide.md`, `scripts/check-declaration-tooling.mjs`                                                                                                                                                        |
| Should this private name repeat the class/file?                   | Internal scoped naming below; `docs/developer-experience-guide.md` (Naming conventions)                                                                                                                                                                 |
| Where do I put a new field/method in a `.ts` file?                | TypeScript file structure below; `.cursor/rules/ts-file-structure.mdc`; `docs/developer-experience-guide.md` (File structure and member order)                                                                                                          |
| Where are Cursor agent rules and hooks?                           | `.cursor/rules/*.mdc` (always-applied + glob-scoped); `.cursor/hooks.json`; condensed mirrors in `.claude/rules/`; see [Developer Experience](docs/developer-experience-guide.md#cursor)                                                                |
| Where is the public docs site (blit386.dev)?                      | Sibling repo `blit386-dev-fumapress` (Fumapress + Waku) generates it from this repo's `docs/`; `docs/_sitemap.json` (schema `docs/_sitemap.schema.json`) controls which docs publish, their URL, sidebar order, and subtitle                            |
| Why does each published doc have a blit386.dev banner?            | Auto-managed by `scripts/sync-doc-banners.mjs` (`pnpm run sync:doc-banners`); never hand-edit the `<!-- blit386.dev-banner -->` block. The mirror strips it; see Public docs site banner below                                                          |
| Can I use Fumadocs components (Callout, TypeTable, …) in docs?    | Yes, in published docs only (site-first). Which ones, when to use them, and the authoring rules: Fumadocs components in published docs below                                                                                                            |
| How do I write/rename/split a `docs/` page?                       | Documentation authoring style below (prose rules: no bold, no `---`, `×` for dimensions; filename mirrors sitemap section; rename/split checklist). For runtime strings see `docs/voice.md` instead                                                     |
| What agent skills are available for this project?                 | `.agents/skills/` (Zed) and `.claude/skills/` (Claude Code) – `bt-preflight`, `bt-review`, `bt-pr`, `bt-format`, `bt-perf`, `bt-test`, `bt-release`, `bt-spellcheck`, `bt-security-run`, `bt-deep-review`, `bt-quick-format`                            |
| How do users start a new project with the engine?                 | `npm create blit386@latest` – the scaffolder lives in the sibling `create-blit386` repo; see Onboarding and the scaffolder below                                                                                                                        |
| How do I load an audio clip?                                      | `src/assets/AudioClip.ts`, `docs/api-audio.md` (Loading section), `docs/guide-audio.md` (Preloading audio clips)                                                                                                                                        |
| How does the SFX voice pool allocate/steal voices?                | `src/audio/VoicePool.ts`; exposed via `BT.soundPlay` and friends (`docs/api-audio.md`, Playback (SFX) section)                                                                                                                                          |
| How does music playback crossfade and loop?                       | `src/audio/MusicPlayer.ts`; exposed via `BT.musicPlay` and friends (`docs/api-audio.md`, Playback (Music) section)                                                                                                                                      |
| How do I synthesize a sound procedurally (no source file)?        | `AudioClip.synth` in `src/assets/AudioClip.ts`; render/validation math in `src/assets/synth/` (`SynthParams.ts`, `synthEnvelope.ts`, `synthPitch.ts`, `synthWaveforms.ts`, `synthRender.ts`, `synthValidation.ts`); `docs/api-audio.md` (Synth section) |
| Is there a built-in sound preset library (jump, explosion, etc.)? | `src/assets/synth/synthPresets.ts`, exposed publicly as `BT.synthPreset.{jump,pickup,explosion,laser,hit,blip}`; `docs/api-audio.md` (Presets section), `docs/guide-audio.md` (Design a sound)                                                          |

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
pointing GitHub readers at the typeset copy on the site. It is wrapped in `<!-- blit386.dev-banner:start -->` /
`<!-- blit386.dev-banner:end -->` sentinels.

- Do not hand-edit or hand-add the banner block. It is generated and owned entirely by `scripts/sync-doc-banners.mjs`,
  which derives each `https://blit386.dev/docs/<path>` URL from the sitemap so the link can never drift.
- Run `pnpm run sync:doc-banners` after adding a doc to the sitemap or changing a doc's `path`; the banner is inserted
  if missing and rewritten if stale. `pnpm run sync:doc-banners:check` reports drift without writing (for CI).
- The banner is a GitHub-only signpost: the public mirror generator (`blit386-dev-fumapress`) strips the whole block, so
  it never appears on the live site. Editing banner prose means editing the template in `scripts/sync-doc-banners.mjs`,
  not the docs.

## Fumadocs components in published docs

Published docs (those in `docs/_sitemap.json`) are authored as MDX-capable Markdown: you may use Fumadocs/Fumapress
components directly in the `.md` source. The mirror generator passes PascalCase tags through verbatim, and the live site
renders them. These docs are site-first – components do not render on GitHub (they degrade to plain text or disappear),
so the blit386.dev banner points GitHub readers to the typeset copy. Contributor-only docs (not in the sitemap:
`developer-experience-guide.md`, `voice.md`, `tooling.md`, `security/*`) stay plain Markdown – components there would
render nowhere.

Registered components (wired up in `blit386-dev-fumapress/press.config.tsx`): `Callout`, `Card` / `Cards`, `Tabs` /
`Tab`, `Steps` / `Step`, `Accordion` / `Accordions`, `Files` / `File` / `Folder`, `TypeTable`, `GithubInfo`,
`InlineTOC`. Fenced code blocks already get the styled Fumadocs code block (copy button, `title="..."`). Adding a new
component means registering it in that `getMdxComponents` map first, or the build throws.

When to use which:

- `Callout` – notes, tips, warnings, migration notes, important gotchas. `<Callout type="warn" title="...">` for
  warnings; default type for notes. Replaces `> Note:` blockquotes.
- `TypeTable` – option / field / parameter reference tables (name, type, default, description). Replaces Markdown tables
  whose columns are field/type/default/purpose.
- `Steps` – sequential procedures (setup flows, manual conversions). One `### heading` per step.
- `Tabs` – genuine alternatives: per-OS commands, npm/pnpm, preferred-vs-manual paths, display-vs-pixel tiers.
- `Accordions` – collapsible advanced detail or troubleshooting (one `Accordion` per item).
- `Cards` – the trailing See Also section (one `Card` per link).
- `Files` – directory trees without inline comments (it has no per-file description slot; keep comment-annotated trees
  as ` ```text ` blocks).
- Do not add a manual or `InlineTOC` table of contents – the site renders its own right-hand TOC panel.

Authoring rules (learned the hard way; keep the build green):

- Block form only. Put blank lines around component children (`<Callout>`, blank line, body, blank line, `</Callout>`).
  Inline children get reflowed by Prettier into a less-readable single line; block form is stable under
  `pnpm run format`.
- JSX expression props work (`TypeTable type={{ ... }}`, `Tabs items={[ ... ]}`). The mirror generator is MDX-aware and
  leaves braces verbatim inside component blocks; in plain prose a bare `{` is still escaped, so keep object/array props
  on component lines.
- `Card href` is a JSX prop the mirror does NOT rewrite. Use site-absolute paths from the sitemap
  (`/docs/<section>/<topic>`, e.g. `/docs/api/core#overlay`), not relative `*.md` links. For unpublished docs, link to
  the full GitHub URL.
- Validate before considering it done: in `blit386-dev-fumapress`, run `pnpm run sync:docs` then `pnpm run build` (or at
  least `pnpm run typecheck`). An undefined component or malformed prop fails the build, which would break the deploy.

## Twoslash in published docs

All TypeScript code blocks in published docs (`docs/api-*.md`, `docs/guide-*.md`, `docs/performance-*.md`,
`docs/reference-*.md`) must use ` ```ts twoslash `. Plain ` ```ts ` is never acceptable in published docs. This is
non-negotiable – the live site (blit386.dev) uses fumadocs-twoslash for type-on-hover popups.

Every block must compile cleanly on its own. Two patterns:

Self-contained block – full imports at the top, no cut needed:

```ts twoslash
import { BT, Color32, Palette } from 'blit386';
const palette = Palette.c64();
BT.paletteSet(palette);
```

Fragment block – shows a partial snippet whose variables come from surrounding prose – add a hidden preamble then
`// ---cut---`. Everything above the cut is compiled but hidden from the reader:

```ts twoslash
import { BT, Palette } from 'blit386';
const nightPalette = Palette.vga();
// ---cut---
BT.paletteFade(nightPalette, 2000, 'ease-in-out');
```

Preamble rules:

- One `import { ... } from 'blit386'` line covering all engine names used in the block.
- `const x = new Type(...)` for constructible types: `Palette`, `Vector2i`, `Rect2i`, `Color32`.
- `declare const x: Type` for non-constructible types: `SpriteSheet`, `BitmapFont`.
- `declare const indexed: { sheet: SpriteSheet; srcRect: Rect2i };` for `indexed.sheet` / `indexed.srcRect` patterns.
- Named palette vars (`nightPalette`, `dangerPalette`, etc.): `const nightPalette = Palette.vga();`
- Generic position/rect context vars: `const pos = new Vector2i(0, 0);`, `const rect = new Rect2i(0, 0, 320, 240);`

After adding or editing a block, always verify: in `blit386-dev-fumapress` run `pnpm run sync:docs && pnpm run build`. A
Twoslash compilation error fails the production build. Fix the preamble rather than adding `// @noErrors`.

## Documentation authoring style

House style for the Markdown under `docs/` (the published reference and guides). This is about authoring the docs
themselves, not runtime user-facing strings – for throws, console output, and canvas banners see `docs/voice.md`.

Prose rules:

- No bold (`**`) in doc prose. Lead a paragraph or bullet with a strong sentence, not a bolded label; promote a
  recurring label to a real `###` subsection instead. A `**` that sits inside inline code or a fenced block (a glob such
  as `src/**/*.ts`, or a JSDoc comment opener) is not bold, so leave it.
- No `---` horizontal-rule separators between sections. Let headings do the separating.
- Dimensions use the multiplication sign `×`, not the letter `x`: `320×240`, `6×14`, `8192×8192`. The one exception is
  literal program output quoted verbatim (for example the overlay's on-screen `webgpu | 320x240`, which the engine
  renders with a lowercase `x`).
- No walls of text. Break long paragraphs into short ones, bullet lists, `###` subsections, or `Callout`s. Every `###`
  subsection needs a parent `##`; give orphaned ones a heading.
- Credit external inspirations with a link and the author's name (for example RetroBlit at
  `https://www.badcastle.com/retroblit.html` by Martin Cietwierkowski, `@daafu`).

Filenames mirror the sitemap section: a doc whose `path` is `api/<topic>` is `api-<topic>.md`; `guides/<topic>` is
`guide-<topic>.md`; `performance/<topic>` is `performance-<topic>.md`; `reference/<topic>` is `reference-<topic>.md`.
New published docs follow this so the filename and URL stay legible together.

Renaming or splitting a published doc:

1. `git mv` the file (plain `mv` if it is still untracked).
2. Update its `src` in `docs/_sitemap.json`. Keep `path` stable unless the topic name itself changed, so URLs and
   banners do not move; if the filename topic changes, update `path` to match (filename mirrors section).
3. Rewrite every inbound link. Guard substring matches so a compound name is not hit by accident – renaming `overlay.md`
   must not touch `api-overlay.md` (use a `(?<![\w-])` lookbehind or equivalent).
4. When splitting, keep in the original file any anchor other docs link to (`#resolution-model`,
   `#requested-vs-active-backend`, …); move the rest. Add a `See also` `Cards` block to each new page.
5. Run `pnpm run sync:doc-banners`, then `pnpm run docs:links`, then `pnpm run format` (longer filenames shift Markdown
   table padding, so tables usually need reflowing).

After any doc change:

- Add new proper nouns / coined words to `cspell.json` (and to `blit386-dev-fumapress/cspell.json` if they land in that
  repo's hand-authored content, e.g. the landing page – its `content/docs/**` is spell-ignored as generated).
- The site mirrors `docs/` via the sibling `blit386-dev-fumapress` (`pnpm run sync:docs`); `content/docs/**` there is
  generated, never hand-edit it. Adding, renaming, or removing a sitemap entry means that mirror needs a re-sync. See
  Docs sync required rule and the sibling repo's `CLAUDE.md` (Documentation mirror).

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
    AudioManager.ts        # Web Audio context, bus graph (sfx/music -> main -> destination), unlock state, mute/volume, SFX + music playback
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
5. No `any` types – use `unknown` or proper types
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

The public `BT` namespace uses getters for read-only snapshots and methods for actions, parameterized queries, and async
work. Do not add new zero-argument `BT.foo()` functions when a getter is appropriate.

### Use getters (property access, no `()`)

Full table in `docs/api-core.md` and `.claude/rules/bt-api-getters.md`. The categories:

- Configure-time (mirror `HardwareSettings` field names): `displaySize`, `drawingBufferSize`, `targetFPS` (clone
  `Vector2i` getters per read; `targetFPS` is the configured rate, not measured FPS).
- Derived: `outputSize` (`drawingBufferSize ?? displaySize`; no `HardwareSettings` field; clone per read).
- Configure-time (backend): `requestedBackend` (resolved `HardwareSettings.backend` after merge and `?backend=software`;
  `null` before init).
- Loop timing: `deltaSeconds`, `timeSeconds`, `ticks`.
- Runtime state: `activeBackend` (what actually started after fallback; `null` before init or on failure), `camera`,
  `palette` (live reference), `isAudioUnlocked` (`false` until the first user gesture resumes the audio context),
  `isMusicPlaying` (`true` while the music player has a live current track).
- Per-frame input: `pointerScrollDelta`, `inputString`, `gamepadCount` (read once per frame).

Examples: `BT.displaySize.y`, `BT.targetFPS`, `BT.ticks % 60`, `if (BT.activeBackend === 'software')`.

### Use methods (call with `()`)

- Lifecycle / mutations: `init`, `ticksReset`, `cameraSet`, `cameraReset`, `paletteSet`, `paletteCreate`, `showCursor`,
  `hideCursor`, `spritesRefresh`, `assignTag`, `inputMap`, `inputMapReset`.
- Palette effects: `paletteCycle`, `paletteFade`, `paletteFadeRange`, `paletteFlash`, `paletteSwap`,
  `paletteClearEffects`.
- Post-process: `effectAdd`, `effectRemove`, `effectClear`; preset namespace `BT.preset` (`crtPipBoy`, `amber`,
  `green`).
- Audio: `audioVolumeSet(bus, value, options?)`, `audioVolumeGet(bus)`, `audioMuteSet(bus, muted)`, `isAudioMuted(bus)`,
  `soundPlay(clip, options?)`, `soundStop(ref, options?)`, `isSoundPlaying(ref)`,
  `soundVolumeSet(ref, value, options?)`, `soundVolumeGet(ref)`, `soundPitchSet(ref, value, options?)`,
  `soundPitchGet(ref)`, `soundPanSet(ref, value, options?)`, `soundPanGet(ref)`, `musicPlay(clip, options?)`,
  `musicStop(options?)`, `musicVolumeSet(value, options?)`, `musicVolumeGet()`; procedural synthesis via
  `AudioClip.synth(params)` (not a `BT` method); preset namespace `BT.synthPreset` (`jump`, `pickup`, `explosion`,
  `laser`, `hit`, `blip`).
- Drawing / clearing: `clear`, `clearRect`, `drawPixel`, `drawLine`, `drawRect`, `drawRectFill`, `drawSprite`,
  `systemPrint`, `printFont`.
- Parameterized queries: `pointerPos(index?)`, `pointerDelta`, `isPointerActive`, `isDown`, `isPressed`, `isReleased`,
  `getAxis`, `isGamepadConnected`, `isKeyDown`, `isKeyPressed`, `isKeyReleased`.
- Utilities with arguments: `cameraClamp(camera, worldSize, viewSize?)`, `systemPrintMeasure(text)`.
- Async: `captureFrame`, `downloadFrame`.

Deprecated aliases still on `BT` are enumerated in `docs/reference-deprecations.md` (`pointerPosValid`, `buttonDown`,
`keyDown`, …). Top-level package exports outside the `BT` namespace (`bootstrap`, `defaultConfig`,
`mergeHardwareSettings`, effect classes, preset functions, core types, `IndexedSpriteLoadResult`, …) are listed in the
`BLIT386.ts` export block.

### Naming when adding getters

Match the `HardwareSettings` field name for configure values (`targetFPS`, not `fps` or `targetFps`); use a derived
getter when the value is computed from configure fields (`outputSize`, no matching field); use a runtime-descriptive
name when no configure field exists (`activeBackend`, not `renderer`). `requestedBackend` is the resolved init request,
`activeBackend` is for runtime gates (post-process, capture) and differs after a WebGPU→software fallback.

Full tables: `docs/api-core.md`. Style guide: `docs/developer-experience-guide.md` (Naming conventions).

## Boolean naming

Runtime queries and configure flags (`HardwareSettings`, `BootstrapOptions`) use grammatical `is*` / `has*`
(`isPointerActive`, `hasGlyph`, `isOverlayEnabled`, `isDetectingDroppedFrames`). Side-effect or operation-result
booleans use imperative verbs, not `is*` (`Timer.fireIfElapsed()`, `intersectTo(other, out): boolean`,
`remove(): boolean`).

Input hold vs edge on `BT`: `BT.isDown` / `BT.isKeyDown` (held), `BT.isPressed` / `BT.isReleased` (button masks),
`BT.isKeyPressed` / `BT.isKeyReleased` (keyboard codes). Internal input classes mirror those names; never embed a second
`Is`. Audit: `\bis[A-Za-z]+Is[A-Z]`. Identifier acronyms: `canvasID`, `containerID`.

Full tiers: `docs/developer-experience-guide.md` (Boolean naming).

## Internal scoped naming

Private fields, private methods, protected members, and module-local constants/types must not repeat the enclosing class
or file name. The type or file already provides scope; strip redundant prefixes from internal identifiers.

Examples: `FrameCapture.request()` not `requestCapture()` (and `width` not `captureWidth`); `GamepadInput.poll()` not
`pollGamepads()`; `FRAGMENT_WGSL` not `BLOOM_FRAGMENT_WGSL` in `Bloom.ts`; file-local `Serialized` not `PaletteJSON` or
`JSON` in `Palette.ts`.

Does not apply to public API: `BT.*`, the `BLIT386.ts` export block, public methods on exported classes, or documented
configure field names. When JSDoc references public symbols, use their full public names (e.g. internal pointer wire
codes map to `BT.BTN_POINTER_A`, not gamepad `BT.BTN_A`).

Apply when adding new internal symbols or when refactoring a file you are already changing; do not rename public surface
or drive breaking changes through consumers for naming-only cleanup.

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
- JSDoc required for public APIs
- When implementing changes, always update JSDoc and inline comments alongside the code. Never leave stale comments that
  describe old behavior.

## TypeScript file structure

Applies to library TypeScript in `src/`. Class member order is enforced by `perfectionist/sort-classes` (imports by
`simple-import-sort`); auto-fix with `pnpm run lint:fix`. It uses `type: 'unsorted'`, so it enforces only the group
order below and preserves the hand-tuned order within each group. Never use `// #region` / `// #endregion` – region
markers are banned everywhere.

### File layout (top to bottom)

1. Module JSDoc – a `/** … */` block describing the file's purpose.
2. Imports – `import type` for type-only imports; inline `type` modifiers inside mixed imports
   (`import { type Backend, defaultConfig } from …`). Ordering is auto-fixed by `pnpm run lint:fix`
   (`simple-import-sort`).
3. Leading module members – config/input constants (`MAX_VERTICES`, `INV_255`), validators/lookup tables
   (`HEX_TOKEN_PATTERN`, `HEX_TABLE`), type aliases (`type EffectTier`), and module-level init loops.
4. Primary export – the class / interface / function the file is named for.
5. Trailing module members – large WGSL/template-literal constants (`const FRAGMENT_WGSL`) and pure helpers after the
   class (exported helpers before private ones).

### Class member order

1. Static fields – cached singletons (`_zero`, `_white`), registries (`namedColors`).
2. Instance fields – public → protected → private (`#field` or `private`); `readonly` grouped; each gets its own JSDoc
   and a blank line (no packed field blocks).
3. Constructor – parameter-properties carry inline `/** … */` JSDoc.
4. Accessors – static getters first, then instance getters/setters.
5. Static methods – public before private.
6. Instance methods – public → protected → private; private helpers last.

### Cross-cutting

- Keep a deprecated alias next to its canonical member (`equals` after `isEqual`).
- Cluster related instance-method families in a deliberate sub-order: new-allocating (`add`, `sub`) → `*To` zero-alloc →
  `*InPlace` → queries (`isEqual`, `isZero`) → `clone` / `toString` last.
- One blank line between members; a blank line before `return` and between logical blocks.
- JSDoc on every member (including private); named exports only, no default exports.

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
pnpm run preflight          # All checks (format + lint + typecheck + spellcheck + knip + docs:links + sync:doc-banners:check + api:since:check + api:history:check + test:unit + test:declarations)
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

`pnpm run test:visual` runs Playwright with Chromium + WebGPU and captures PNG snapshots of actual rendered frames. This
is the primary tool for verifying that visual output is correct – not performance, but pixel-level correctness.

Use it when implementing or changing:

- Post-process effects (CRT, bloom, or any new effect in the effect chain)
- Sprite rendering, tinting, or blending
- Bitmap font rendering
- Primitive drawing (pixels, lines, rects)
- Palette-indexed rendering
- Camera offsets

Run `pnpm run test:visual:update` to regenerate baselines after an intentional visual change. Snapshots live in
`tests/visual/__snapshots__/`.

The suite covers camera, fonts, mixed (primitives + sprites), primitives, sprites, and post-process (baseline, CRT,
CRT+bloom, and individual display/pixel effects).

WebGPU mocks: use `src/__test__/webgpu-mock.ts` for tests needing GPUDevice, GPUTexture, etc. See
[docs/reference-testing.md](docs/reference-testing.md) for full details.

### Known Testing Quirks

- DOM environment directive: Add `// @vitest-environment happy-dom` at the top of any test file that touches DOM APIs.
  Without it, the test runs in Node and DOM APIs are undefined.
- AssetLoader image tests: The suite stubs `Image` with `vi` rather than relying on happy-dom data-URI `onload` behavior
  (which is unreliable in happy-dom).
- Vector2i `-0` vs `0`: JavaScript can produce `-0` when negating vectors. Use `result.x + 0` to coerce in assertions
  where sign is meaningless.

## Performance Testing

Use the benchmark system when the user asks about performance, throughput, regressions, hot paths, or CI benchmark
coverage.

- Use CPU benchmarks for isolated methods, helpers, caches, and allocation patterns
- For rendering correctness, use visual regression tests (`pnpm run test:visual`) – they produce PNG snapshots

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
