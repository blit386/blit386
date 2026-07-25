# Architecture

Paired with `.cursor/rules/architecture.mdc` (same annotated tree).

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
    HotReloadUrl.ts        # Cache-bust/normalize URL helpers (appendCacheBustQuery, normalizeAssetUrl) for the dev-only asset hot-replace path; used by AssetLoader, SpriteSheet, AudioClip, BitmapFont
    Vector2i.ts            # Integer 2D vector
    Rect2i.ts              # Integer rectangle
    Color32.ts             # 32-bit RGBA color
    Easing.ts              # Easing curves + interpolate() (number, Vector2i, Color32, Rect2i)
    AudioParamRamp.ts       # Shared AudioParam ramp scheduling (bus fades + per-voice fades)
    Random.ts              # Seeded PRNG (mulberry32; exported; int/float/pick/shuffle/weighted/fork; Vector2i/Rect2i helpers)
    hash.ts                # Stateless coordinate hashes (hash1i/2i/3i uint32 + hash1/2/3 [0,1); exported; for chunked/procedural worlds)
    Rng.ts                 # Deterministic PRNG (mulberry32-style; internal, backs the synth engine's noise generation)
    FrameCapture.ts        # GPU readback + PNG export
    Timer.ts               # Elapsed-time helper (exported; Timer.fireIfElapsed)
    errorMessages.ts       # Centralized user-facing bootstrap/runtime/asset error strings (two-tier voice); imported by Bootstrap and asset/runtime code
    urlHints.ts            # Shared "can't find this file" URL hint helpers (hasExplicitLocation, buildPathHint, extractExtension); used by BitmapFont and AudioClip error builders
  __test__/
    webgpu-mock.ts         # WebGPU mock factories for tests
    webaudio-mock.ts       # Web Audio mock factories for tests (AudioContext, GainNode, AudioParam, decodeAudioData/AudioBuffer mocks)
    setup.ts               # Vitest global setup (GPU constants)
```

## Palette-First Rendering

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

Cursor: `.cursor/rules/architecture.mdc` (glob-scoped to `src/**` in this repo).
