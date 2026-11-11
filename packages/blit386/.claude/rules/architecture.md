---
paths: [src/**]
---

# Architecture

The file tree below is illustrative, not exhaustive - it highlights notable subsystems and entry points. Colocated
`*.test.ts` / `*.bench.ts` files and small module-local `constants.ts` / `types.ts` helpers are omitted for readability.

```text
src/
  BLIT386.ts              # Public API: merges the src/bt/ parts into the BT namespace (Object.defineProperties, so getters stay getters) + export block for classes, helpers, presets
  bt/
    constants.ts          # FLIP_* / ROT_* / BTN_* / PLAYER_* / AXIS_* and the default keyboard tables
    lifecycle.ts          # init, size and time getters, readiness, splash, testState, captureFrame, renderAt, resume, downloadFrame
    audio.ts              # Bus volume and mute, sound effects, music, synth presets
    palette.ts            # Active palette, palette effects, BT.random, spritesRefresh
    effects.ts            # effectAdd / effectRemove / effectClear and the BT.preset stacks
    draw.ts               # Clearing, primitives, system and bitmap text, sprites, tiles, nine-slice
    camera.ts             # cameraSet, camera, cameraClamp, cameraReset
    pointer.ts            # Pointer position / delta / scroll / activity, cursor
    buttons.ts            # Button, key, and gamepad state and edges, keyboard maps, axes, any-key / any-button
    internal.ts           # Helpers two or more parts share: beginner runtime errors, pointerClock, settingsOrDefault (not public); a one-part helper such as drawReady stays in its part
  docs/
    consumer-doc-imports.test.ts # Guards README/docs import paths against BLIT386.ts exports
  core/
    BTAPI.ts               # Internal singleton managing subsystems (lazy-loads WebGPURenderer on WebGPU init); readiness gate behind BT.isReady, and the BT.renderAt seek path (seek -> stop/park loop -> buildReplayDemo fresh instance for 'start' -> GameLoop.step; restartParkedLoop backs BT.resume)
    IBTDemo.ts             # Demo interface (incl. optional testState() hook) + HardwareSettings (keyboardLayout, KEYBOARD_LAYOUTS) + TestStateSnapshot
    GameLoop.ts            # Fixed-timestep game loop; step(n) runs n updates + one render synchronously (the primitive behind BT.renderAt)
    SeedUrlParam.ts        # ?seed=N URL parameter: pure resolver + reader, seeds BT.random before the game's init()
    WebGPUContext.ts       # WebGPU adapter/device/context setup
    RenderPaletteUsage.ts  # Per-frame palette index usage mask for overlay grid
    WakeLock.ts             # Screen Wake Lock subsystem: acquire/release/re-acquire on visibilitychange (HardwareSettings.isWakeLockEnabled)
    Orientation.ts          # Screen orientation detection + optional lock (HardwareSettings.preferredOrientation, IBTDemo.onOrientationChange, BT.screenOrientation)
    ReducedMotion.ts         # prefers-reduced-motion detection (IBTDemo.onReducedMotionChange, BT.isReducedMotionPreferred)
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
    OverlayToggleIcon.ts   # Bottom-left bitmap toggle hint icon draw + icon Y anchor
    toggleIconData.ts      # Toggle hint icon as row strings; ICON_MASK derived from them
    bandStyle.ts           # Shared chrome palette index fallback + value-to-band-height scaling
    drawOutline.ts         # 1 px on-top outline shared by the palette tooltip and the toggle hit debug view
    validateSettings.ts    # Configure-time checks for overlay sizes and palette indices (BT.init resolves false on a bad value)
    constants.ts           # Overlay layout and style constants
    labels.ts              # Overlay label strings and formatting helpers
    types.ts               # OverlayRow and related types
    index.ts               # Overlay subsystem public exports for BTAPI and unit tests
    layout/                # layoutPlan, layoutHelpers, layout types/constants
    bars/                  # OverlayBars (Bars.ts)
    timing-chart/          # TimingChart, severity, style, tags, constants
    audio-meter/           # AudioMeter (per-bus level bars + voices/steal/drop text), style, constants
    palette/               # PaletteView (grid draw), PaletteInteraction (hover, copy, scroll state), hitTest (swatch + scrollbar hits), tooltip (layout, draw, clipboard write)
    sampling/              # FpsSampler, TimingSampler
    input/                 # Toggle
  splash/
    Splash.ts               # BLIT386 splash: five-state machine, own palette + effect manager, skip listeners, draw
    gating.ts               # Gating resolver: configure() flag > ?splash / ?nosplash > BT.isDevMode
    ramp.ts                 # 16-step gray ramp, even in encoded sRGB (createRamp) + all-black copy (createBlackened)
    logoData.ts             # Inline row-major palette indices for the logo (generated by scripts/convert-splash-logo.mjs)
    constants.ts            # Fade/hold durations, ramp slot layout, dissolve tuning
    types.ts                # SplashState union + SplashOptions
    index.ts                # Splash subsystem public exports for BTAPI and unit tests
  render/
    IRenderer.ts           # Backend-agnostic renderer contract (interface)
    WebGPURenderer.ts      # WebGPU concrete renderer implementing IRenderer
    SceneBatch.ts          # WebGPU demo tier: one primitive + one sprite pipeline encoded in call order (segment list)
    OverlayPipelines.ts    # WebGPU overlay tiers (bars, labels, top bars, top labels): lazy allocation, fixed encode order
    WebGPUFrameCaptures.ts # WebGPU capture slots (output, display, F9 shortcut) and their shared logical capture target
    WebGPUPostProcess.ts   # WebGPU scene framebuffer, pixel/display effect chains, and palette resolve + upscale
    SoftwareRenderer.ts    # Canvas 2D software fallback implementing IRenderer
    SoftwareFrameCaptures.ts # Software capture slots (output, display, F9 shortcut) and the one PNG export they share
    SoftwareRaster.ts      # Software draw-command types + rasterizer replaying them into the RGBA frame (BT-58 rewrites this seam)
    PrimitivePipeline.ts   # Batched geometry writing palette indices (pixels, lines, rects)
    clipLine.ts            # Integer viewport clip for Bresenham lines (clipBresenhamLine); shared by SoftwareRenderer and PrimitivePipeline
    SpritePipeline.ts      # Batched textured quads (sprites, bitmap text); applies SpriteDrawParams flags/scale/pivot/stretch
    SpriteOrientation.ts   # FLIP_*/ROT_* bits, mask -> orientation lookup, the one orientation table both backends read
    PostProcessChain.ts    # Tier-aware fullscreen effect chain
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
    spriteIndexing.ts      # SpriteSheet palette indexing: indexized-sheet registry (BT.spritesRefresh), RGBA-to-index mapping, loadColorsIntoPalette colors, used-index scan, r8uint upload
    spriteTileGrid.ts      # Tile size validation and tile source-rect writers shared by SpriteSheet.tileRect and BT.drawTile
    NineSlice.ts           # Frozen nine-slice asset (NineSlice.fromSheet) + per-axis split helper used by BT.drawNineSlice
    BitmapFont.ts          # Bitmap font system (.btfont): glyph lookup, measuring, hot reload
    btfontFile.ts          # .btfont file loading for BitmapFont: capped read, parse, validation, glyph table, texture load, load errors
    hotReloadRegistry.ts   # Dev-only registry of live SpriteSheets and BitmapFonts per normalized URL, read by HotRuntime
    readStreamedBody.ts    # Streamed response-body reader shared by AudioClip and the .btfont loader
    SystemFont.ts          # Built-in system font factory (createSystemFont; used by BT.systemPrint)
    fonts/systemFontData.ts # Glyph bitmap data backing SystemFont
    AudioClip.ts           # Decoded AudioBuffer asset: streamed fetch+decode, cache/dedup, fallback URL lists, synth() factory
    synth/                 # Deterministic synthesis engine backing AudioClip.synth (SynthParams, envelope/pitch/waveform math, validation, synthPresets sound library)
    Palette.ts             # 256-entry indexed color palette
    PaletteEffect.ts       # PaletteEffect interface, PaletteEffectManager, paletteSwap; re-exports the effect classes below
    CycleEffect.ts         # BT.paletteCycle: range rotation, at most one turn of work per tick
    FadeEffect.ts          # BT.paletteFade: whole-palette eased fade
    FadeRangeEffect.ts     # BT.paletteFadeRange: eased fade over a slot range
    ExposureFadeEffect.ts  # BT.paletteFadeExposure: linear-light fade with luminance lead (+ ExposureFadeOptions)
    FlashEffect.ts         # BT.paletteFlash: snapshot, flood, restore
    paletteFade.ts         # Fade helpers shared by the effects (range snapshot, eased progress, per-entry lerp)
    palettes/              # Built-in preset palette data (presetData.ts, hudData.ts)
  input/
    PointerInput.ts        # DOM-backed pointer / mouse / touch / pen tracker (4 slots); two previous-state clocks - endUpdate for update() readers, endFrame for render-side readers and the overlay
    pointerSlot.ts         # PointerInput's slot shape, pointer button codes / DOM button tables, mask helpers, pure slot functions
    pointerRouting.ts      # PointerInput's pointermove / down / up / cancel / leave routing onto the four slots
    clientToDisplayPos.ts  # Pure client -> display-pixel conversion shared by PointerInput and BT.nativeScreenToDisplayPos
    KeyboardInput.ts       # KeyboardEvent.code state, edges, tick repeat, keydown text (BT.inputString); any-key queries behind BT.isAnyKey*
    GamepadInput.ts        # Polling-based gamepad input tracker (4 players, axes, buttons, dead zone); digital trigger buttons (BTN_L2/R2 at 0.5 analog) and any-button masks
    gamepadMapping.ts      # W3C standard-mapping tables, the BT.AXIS_* values, and pure readers: one Gamepad -> BTN_* mask + AXIS_* tuple, stick dead zone
    buttonFlags.ts         # The BT.BTN_* bit flags and face / pointer / trigger masks, defined once (import-free; BLIT386.ts and the input modules share it)
    repeatTick.ts          # isRepeatTick: the shared every-N-ticks repeat rule for held keys and gamepad buttons
    defaultKeyboardMap.ts  # Default face-button key tables for both keyboardLayout values ('versus' and 'single'); clone helpers
    InputTrace.ts          # Dev-only input-edge recorder (window.__btInputTrace): per-update and per-frame pointer/key/gamepad edges, delta, wheel; BTAPI records only while isRecording; capped
    keyboardRuntimeMaps.ts # Mutable runtime keyboard maps for players 0/1, seeded from HardwareSettings.keyboardLayout; shared by BT and BTAPI without a circular import
  audio/
    AudioManager.ts        # Web Audio context, bus graph (sfx/music -> main -> destination), unlock state, mute/volume, SFX + music playback; lazy opt-in bus metering (enableBusMetering, getBusLevels) backs the overlay audio meter band
    audioDecodeContext.ts  # One mutable audioHooks object (decode context, unload + music hot-replace callbacks) AudioClip reads; AudioManager fills and resets it
    VoicePool.ts            # Fixed-size SFX voice pool: allocation/stealing, generational SoundRef handles, per-voice fades
    MusicPlayer.ts          # Crossfading music player: current/previous voice pair, fadeMs/overlap timing, loop points
  utils/
    Bootstrap.ts           # Demo bootstrap utilities
    BootstrapHelpers.ts    # Canvas lookup and error display utilities
    CameraUtils.ts         # Camera clamp helper (world/view bounds)
    CanvasLayoutStyles.ts  # Canvas layout CSS custom properties helper
    RenderLimits.ts        # Render dimension validation (8192 px per axis; 16,777,216 total pixels)
    AssetLimits.ts         # Asset dimension validation, btfont/glyph limits, sprite-blit clipping
    TileGrid.ts            # Tile size / coordinate validation shared by Rect2i.fromTile and the SpriteSheet tile grid (spriteTileGrid.ts)
    HotReloadUrl.ts        # Cache-bust/normalize URL helpers (appendCacheBustQuery, normalizeAssetUrl) for the dev-only asset hot-replace path; used by AssetLoader, SpriteSheet, AudioClip, BitmapFont. resolveAgainstDocument also backs the .btfont texture origin check in AssetLimits
    devMode.ts             # Dev vs. release build detection (resolveDevMode pure resolver + isDevMode reader); backs BT.isDevMode
    Vector2i.ts            # Integer 2D vector (allocating methods, statics, normalized, equality)
    Vector2iOps.ts         # Internal base of Vector2i: *To / *InPlace families, set/copyFrom, magnitude and distance queries (not exported)
    Rect2i.ts              # Integer rectangle
    Color32.ts             # 32-bit RGBA color (re-exports the colorMath helpers)
    colorMath.ts           # Byte clamps, INV_255, srgbToLinear/linearToSrgb piecewise transfer helpers, hex parsing, hue2rgb
    NamedColors.ts         # Named-color registry behind Color32.registerColor/resolveNamedColor (type-only Color32 import)
    Easing.ts              # Easing curves + interpolate() (number, Vector2i, Color32, Rect2i)
    AudioParamRamp.ts       # Shared AudioParam ramp scheduling (bus fades + per-voice fades)
    Random.ts              # Seeded PRNG (mulberry32; exported; int/float/pick/shuffle/weighted/fork; Vector2i/Rect2i helpers; also backs synth noise)
    hash.ts                # Stateless coordinate hashes (hash1i/2i/3i uint32 + hash1/2/3 [0,1); exported; for chunked/procedural worlds)
    ValueNoise.ts          # Seedable value noise (1D/2D/3D + fBm; [-1,1]; exported; uses hash*i)
    PerlinNoise.ts         # Seedable Perlin gradient noise (1D/2D/3D + fBm; [-1,1]; exported)
    SimplexNoise.ts        # Seedable simplex noise (2D/3D + fBm; [-1,1]; exported)
    SeededNoise.ts         # Internal base classes for the noise classes: seed validation + allocation-free fBm loops (not exported)
    noiseCommon.ts         # Private fade/lerp/gradient helpers and fBm defaults for the noise classes (not exported)
    FrameCapture.ts        # GPU readback + PNG export
    FrameCaptureShortcut.ts # F9 / Shift+F9 dev-mode capture shortcut gating (pure resolver + reader) and the default download filename
    globalExpose.ts        # Exposes BT on window for console debugging (dev-only by default; BootstrapOptions.exposeGlobal overrides)
    Timer.ts               # Elapsed-time helper (exported; Timer.fireIfElapsed)
    errorMessages/         # Centralized user-facing error strings (two-tier voice), one file per domain (asset, audio, bootstrap, btfont, math, palette, random, render, sprite, synth) behind an index.ts barrel; fixed text is an X_MESSAGE const, parameterized text an xError(...) builder
    urlHints.ts            # Shared "can't find this file" URL hint helpers (hasExplicitLocation, buildPathHint, extractExtension); used by BitmapFont and AudioClip error builders
  __test__/
    webgpu-mock.ts         # WebGPU mock factories for tests
    bresenham.ts           # Reference Bresenham walk (walkBresenham) for the line-clipping tests
    webaudio-mock.ts       # Web Audio mock factories for tests (AudioContext, GainNode, AudioParam, decodeAudioData/AudioBuffer mocks)
    spriteOrientationFixture.ts # Shared ABC/DEF sprite source + grid oracle for every flip/rotation mask (used by both backends' tests)
    engineHarness.ts       # Test-only: boots the real BTAPI (software backend, fake canvas), owns the rAF clock, dispatches input between frames, records per-update/per-render reads (refresh-rate tests)
    overlayFixtures.ts     # Shared mock renderer + snapshot helpers for overlay unit tests
    setup.ts               # Vitest global setup (GPU constants)
```

## Adding a new subsystem

When adding a new top-level `src/` directory, or a file within an existing one that becomes a genuine per-frame hot path
(called every `update()`/`render()`, not just at init or on rare events): update this file's tree above, the Where to
Find table in [CLAUDE.md](../../CLAUDE.md), and check whether it belongs in
[`.claude/rules/bench-coverage.md`](bench-coverage.md)'s hot-path directory list. That file's `paths:` glob and
`scripts/check-bench-coverage.mjs`'s `HOT_PATH_DIRS` are what make benchmark coverage get reminded about at all - a new
hot subsystem left off both lists gets no nudge to add benchmarks and no pre-push reminder when it changes.

## Palette-First Rendering

Two backends selectable via `HardwareSettings.backend` (default `'webgpu'`):

- WebGPU (`'webgpu'`): indexed, palette-first hardware renderer.
  1. Primitives pipeline - batched geometry writing palette indices (pixels, lines, rects). Max 50k vertices/frame.
  2. Sprites pipeline - batched palette-indexed textured quads (sprites, bitmap text). Max 50k vertices (~8333 quads).
     Nearest-neighbor sampling. Auto-batched by texture.
  3. Framebuffer & post-process - the logical composite is an `r8uint` attachment at `displaySize` (one palette slot per
     pixel). Pixel-tier effects (`PostProcessChain`, `FullscreenPixelEffect`) run on that index buffer.
     `PaletteResolveUpscalePass` LUT-resolves indices to RGBA and upscales to `drawingBufferSize`. Display-tier effects
     run on that RGBA before present (see `docs/guide-post-process-effects.md`).
- Software (`'software'`): Canvas 2D fallback. Supports palette rendering, rects, Bresenham lines, indexed sprite blits,
  and bitmap text. Post-process/fullscreen effects throw a clear error directing users to the WebGPU backend. Activates
  automatically when WebGPU init fails; force explicitly via `HardwareSettings.backend: 'software'` or the
  `?backend=software` URL query parameter. Use `BT.activeBackend` to query which backend started
  (`'webgpu' | 'software' | null`). The engine overlay shows the active backend on the top bar when enabled.
