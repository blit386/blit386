import { DEFAULT_MAX_CANVAS_SIZE } from '../utils/CanvasLayoutStyles';
import type { Color32 } from '../utils/Color32';
import { Vector2i } from '../utils/Vector2i';

/**
 * Magnification filter used by the upscale pass between the pixel chain
 * (logical resolution) and the display chain (output resolution).
 */
export type OutputUpscaleFilter = 'nearest' | 'linear';

/**
 * Rendering backend selection for {@link HardwareSettings.backend}.
 *
 * - `'webgpu'` - Hardware-accelerated WebGPU path (default). Supports all draw
 *   primitives, sprites, palette, camera, and fullscreen post-process effects.
 * - `'software'` - Canvas 2D software fallback. Supports draw primitives,
 *   sprites, palette, and camera. Fullscreen shader effects are not available
 *   and will throw when added.
 *
 * @since 1.0.3
 */
export type Backend = 'webgpu' | 'software';

/**
 * Named buses in the audio graph, used by {@link BT.audioVolumeSet},
 * {@link BT.audioVolumeGet}, {@link BT.audioMuteSet}, and {@link BT.isAudioMuted}.
 *
 * `'sfx'` and `'music'` feed into `'main'`, which feeds the audio destination.
 *
 * @since 1.3.0
 */
export type AudioBus = 'main' | 'music' | 'sfx';

/**
 * Preferred display orientation for {@link HardwareSettings.preferredOrientation}.
 *
 * - `'landscape'` / `'portrait'` - after init, attempt `screen.orientation.lock()`
 *   with that target (silent no-op when unsupported or rejected).
 * - `'any'` - no lock attempt (default).
 *
 * @since 1.3.1
 */
export type PreferredOrientation = 'landscape' | 'portrait' | 'any';

/**
 * Passed to {@link IBTDemo.onHotReload} after a hot reload swaps in new code.
 *
 * @since 1.4.0
 */
export interface HotReloadContext {
    /** Which swap tier ran: `'methods'` swapped the prototype in place; `'reinit'` re-ran `init()` on a fresh instance. */
    reason: 'methods' | 'reinit';

    /** Hot-swap generation number, incremented on every successful swap since page load. */
    generation: number;

    /**
     * Own enumerable fields of the previous demo instance, captured just before `init()` ran on
     * the new one. Present only when `reason` is `'reinit'`.
     */
    snapshot?: Record<string, unknown>;
}

/**
 * Engine-facing hardware configuration returned by `configure()` when a demo
 * implements that optional hook, or by {@link defaultConfig} otherwise.
 *
 * @since 0.1.0
 * @changed 1.3.1 Added {@link HardwareSettings.isOverlayToggleHitDebugVisible}.
 * @changed 1.3.1 Shrink bottom-left overlay toggle hit region from 48x48 to 17x13.
 * @changed 1.3.1 Added {@link HardwareSettings.isCapturingPointerScroll}.
 * @changed 1.3.1 Added {@link HardwareSettings.isCapturingKeyboardScroll}.
 * @changed 1.3.1 Added {@link HardwareSettings.isWakeLockEnabled}.
 * @changed 1.3.1 Added {@link HardwareSettings.preferredOrientation}.
 */
export interface HardwareSettings {
    /**
     * Logical render resolution in pixels (e.g. `320x240`).
     *
     * Must use positive whole-number dimensions no larger than `8192x8192`
     * and no more than `16,777,216` total pixels. When running in WebGPU mode
     * the width and height must also not exceed the active adapter's
     * `maxTextureDimension2D` limit (typically `8192` or `16384` depending on
     * the GPU); compare both the numeric caps above and
     * `GPUAdapter.limits.maxTextureDimension2D` when choosing dimensions.
     */
    displaySize: Vector2i;

    /**
     * Output drawing-buffer size in pixels. When set, this drives the WebGPU
     * drawing buffer resolution and enables the `'display'` tier of the
     * post-process effect chain (CRT scanlines, barrel distortion, etc.). CSS
     * layout uses {@link applyCanvasLayoutStyles} custom properties
     * (`--canvas-aspect-*`, `--canvas-max-*`) derived from this and
     * {@link displaySize}; leave undefined to render at logical `displaySize`
     * with no display-tier effects.
     *
     * Display-tier effects need this to be larger than `displaySize` to express
     * curvature/scanlines/etc. cleanly without floor-quantizing onto the
     * logical pixel grid.
     *
     * Must use positive whole-number dimensions no larger than `8192x8192`
     * and no more than `16,777,216` total pixels. When running in WebGPU mode
     * the width and height must also not exceed the active adapter's
     * `maxTextureDimension2D` limit (typically `8192` or `16384` depending on
     * the GPU); compare both the numeric caps above and
     * `GPUAdapter.limits.maxTextureDimension2D` when choosing dimensions.
     */
    drawingBufferSize?: Vector2i;

    /**
     * Maximum on-screen canvas size in CSS pixels. The demos layout scales the
     * canvas up to the viewport (preserving aspect ratio) but not beyond this
     * size. Defaults to `960x720` in {@link defaultConfig}.
     *
     * Must use positive whole-number dimensions no larger than `8192x8192`
     * and no more than `16,777,216` total pixels. When running in WebGPU mode
     * the width and height must also not exceed the active adapter's
     * `maxTextureDimension2D` limit (typically `8192` or `16384` depending on
     * the GPU); compare both the numeric caps above and
     * `GPUAdapter.limits.maxTextureDimension2D` when choosing dimensions.
     */
    maxCanvasSize?: Vector2i;

    /**
     * Magnification filter applied between the pixel chain and the display
     * chain. `'nearest'` preserves crisp pixel edges (default); `'linear'`
     * gives a soft "old TV" feel.
     */
    outputUpscaleFilter?: OutputUpscaleFilter;

    /**
     * Target fixed-update rate: how often {@link IBTDemo.update} runs per second.
     *
     * Not the measured render rate shown as `Present FPS` on the overlay; `render()` follows
     * `requestAnimationFrame` and may differ (for example 60 Hz updates on a 120 Hz display).
     */
    targetFPS: number;

    /**
     * When true, the engine logs a `console.warn` whenever it detects that
     * the browser missed one or more vsync deadlines. Useful for spotting
     * stutters during development. Defaults to `false`.
     *
     * Detection runs in `GameLoop.detectFrameDrop()` and uses an
     * auto-calibrated baseline - the shortest `requestAnimationFrame` delta
     * observed in a rolling window of recent frames - rather than a fixed
     * `1.5 / targetFPS` threshold. A frame is reported as dropped when its
     * rAF delta exceeds 1.5x that baseline, which makes detection work on
     * any display refresh rate (60 / 120 / 144 Hz, etc.) and on browsers
     * such as Firefox where rAF often fires at the display rate rather than
     * at `targetFPS`.
     */
    isDetectingDroppedFrames?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isDetectingDroppedFrames} instead.
     */
    detectDroppedFrames?: boolean;

    /**
     * When `true`, the engine calls `preventDefault()` on canvas `wheel` events and
     * accumulates vertical delta into {@link BT.pointerScrollDelta}. Defaults to `false`
     * in {@link defaultConfig} so the host page can scroll while the pointer is over the
     * canvas. Opt in when the demo or game maps the mouse wheel.
     *
     * This flag also gates `canvas.style.touch-action`: it is `'none'` while capture is
     * active (or the overlay forces capture over the palette band) and `'pan-y'`
     * otherwise, so touch devices can tap-hold-scroll the host page past the canvas
     * when this flag is `false`.
     *
     * The overlay palette grid still captures wheel while the pointer is over its band,
     * even when this flag is `false`.
     *
     * @since 1.3.1
     * @changed 1.4.0 Also gates `canvas.style.touch-action` (`'none'` while capturing,
     *   `'pan-y'` otherwise) instead of the canvas unconditionally blocking touch scroll.
     */
    isCapturingPointerScroll?: boolean;

    /**
     * When `true`, the engine calls `preventDefault()` on canvas `keydown` for keys that
     * scroll the host page by default (arrow keys, Space, PageUp/PageDown, Home, End).
     * Defaults to `false` in {@link defaultConfig} so those keys still scroll the page
     * while the canvas is focused. Opt in when the demo or game maps those keys for
     * gameplay.
     *
     * @since 1.3.1
     */
    isCapturingKeyboardScroll?: boolean;

    /**
     * When `true`, the engine requests a screen wake lock after a successful `init()`
     * and re-acquires it automatically once the page returns to the foreground. Prevents
     * mobile browsers from dimming or locking the screen during active gameplay. Silently
     * no-ops on browsers that do not support the Wake Lock API. Defaults to `false` in
     * {@link defaultConfig}.
     *
     * @since 1.3.1
     */
    isWakeLockEnabled?: boolean;

    /**
     * Preferred screen orientation. When `'landscape'` or `'portrait'`, the engine
     * attempts `screen.orientation.lock()` after a successful `init()`. Silently
     * no-ops on browsers that do not support locking (for example iOS Safari) or when
     * the platform rejects the request. Defaults to `'any'` in {@link defaultConfig}
     * (no lock attempt). Detection via {@link BT.screenOrientation} and
     * {@link IBTDemo.onOrientationChange} works regardless of this setting.
     *
     * @since 1.3.1
     */
    preferredOrientation?: PreferredOrientation;

    /**
     * Whether the BLIT386 splash plays before the game starts.
     *
     * Leave unset for the default: shown in release builds, hidden in development
     * builds. Setting it explicitly wins over the `?splash` / `?nosplash` URL flags
     * and over {@link BT.isDevMode}.
     *
     * @since 1.5.0
     */
    isSplashEnabled?: boolean;

    /**
     * Dark endpoint of the splash's 16-step grey ramp.
     *
     * Defaults to black. The ramp is generated in linear light between this and
     * {@link HardwareSettings.splashColorLight}, so the steps are physically even
     * rather than perceptually even.
     *
     * @since 1.5.0
     */
    splashColorDark?: Color32;

    /**
     * Light endpoint of the splash's 16-step grey ramp.
     *
     * Defaults to white. See {@link HardwareSettings.splashColorDark}.
     *
     * @since 1.5.0
     */
    splashColorLight?: Color32;

    /**
     * Rendering backend to use. Defaults to `'webgpu'`.
     *
     * Set to `'software'` to opt into the Canvas 2D fallback backend.
     * You can also force software mode at runtime with `?backend=software`
     * in the page URL.
     */
    backend?: Backend;

    /**
     * Maximum number of simultaneous audio voices (concurrently playing sounds). Defaults to
     * `16` in {@link defaultConfig}. Valid range is `1`-`64`.
     *
     * @since 1.3.0
     */
    audioVoices?: number;

    /**
     * When `true` (default), the engine draws a screen-space overlay after
     * each demo `render()` call (FPS, target rate, resolution, backend, demo title).
     * The overlay body starts hidden unless {@link isOverlayVisibleAtStart} is
     * `true`. Users can show or hide the body with Backquote or a primary press in
     * the bottom-left 17x13 px corner when {@link isOverlayToggleEnabled} is
     * `true`. Set to `false` to disable the overlay subsystem and all toggle input
     * (for release builds that must not expose debug HUD).
     */
    isOverlayEnabled?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayEnabled} instead.
     */
    overlayEnabled?: boolean;

    /**
     * When `true`, the overlay body (metrics bars, palette grid, custom rows) is
     * visible on the first frame. Defaults to `false` in {@link defaultConfig}; the
     * toggle hint may still draw when {@link isOverlayToggleHintVisible} is `true`.
     */
    isOverlayVisibleAtStart?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayVisibleAtStart} instead.
     */
    overlayVisibleAtStart?: boolean;

    /**
     * When `true` (default), the engine draws the toggle hint icon while the overlay
     * body is hidden. Set to `false` for expert/minimal demos that want no on-screen
     * overlay affordance until the body is shown.
     */
    isOverlayToggleHintVisible?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayToggleHintVisible} instead.
     */
    overlayToggleHintVisible?: boolean;

    /**
     * When `true` (default), Backquote and the bottom-left corner pointer press toggle
     * overlay body visibility. Set to `false` to lock body visibility at
     * {@link isOverlayVisibleAtStart}.
     */
    isOverlayToggleEnabled?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayToggleEnabled} instead.
     */
    overlayToggleEnabled?: boolean;

    /**
     * When `true`, the engine draws a 1 px outline of the bottom-left overlay toggle hit
     * region (`17x13` logical pixels). Defaults to `false` in {@link defaultConfig}; set to
     * `true` while tuning the hit zone. The outline uses the overlay text palette index and
     * draws whether the overlay body is shown or hidden.
     *
     * @since 1.3.1
     */
    isOverlayToggleHitDebugVisible?: boolean;

    /**
     * When `true`, the engine draws a live palette swatch grid in the overlay
     * footer stacked above the hint bar. Defaults to `false` in {@link defaultConfig};
     * set to `true` to opt in.
     */
    isOverlayPaletteEnabled?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayPaletteEnabled} instead.
     */
    overlayPaletteView?: boolean;

    /**
     * Maximum palette swatches per row in the overlay grid. When unset, the engine
     * picks the widest column count that fits {@link HardwareSettings.displaySize}.
     */
    overlayPaletteColumns?: number;

    /**
     * Maximum visible palette grid rows in the overlay footer viewport. When unset,
     * all rows are shown (current behavior). When set, the bottom band height uses
     * this row count rather than the full palette row count; values are clamped to
     * at least `1` and at most the total row count.
     */
    overlayPaletteRowsVisible?: number;

    /**
     * Palette indices for the built-in overlay bars (top and bottom), row gaps,
     * and as defaults for custom {@link OverlayRow} entries that omit per-row colors.
     *
     * When omitted, the overlay uses palette index `1` for bars and gaps and `2` for text.
     */
    overlayStyle?: OverlayStyle;

    /**
     * When `true`, the engine draws a scrolling update/render timing chart band between the
     * title row and the Present FPS row. Defaults to `false` in {@link defaultConfig}.
     *
     * Chart bars use raw per-frame CPU samples from BTAPI (not EMA-smoothed text row values).
     */
    isOverlayTimingChartEnabled?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayTimingChartEnabled} instead.
     */
    overlayTimingChart?: boolean;

    /**
     * Height in pixels of the timing chart band when {@link isOverlayTimingChartEnabled} is `true`.
     * Defaults to 22 pixels when omitted.
     */
    overlayTimingChartHeight?: number;

    /**
     * Optional palette indices for the timing chart band. Update/render bar colors default to
     * {@link OverlayStyle} bar/text indices; warning/error/event slots control semantic
     * chart tints and future tag markers.
     */
    overlayTimingChartStyle?: OverlayTimingChartStyle;

    /**
     * Renderer diagnostic visualization on the timing chart when {@link isOverlayTimingChartEnabled} is enabled.
     *
     * - `'minimal'`: bottom-column marker and warning tint when GPU batch overflow occurred (default when chart enabled)
     * - `'rich'`: minimal plus vertex-pressure dots in the lower third of the chart band
     * - `false`: no diagnostic visualization on the chart
     */
    overlayTimingChartDiagnostics?: false | 'minimal' | 'rich';

    /**
     * When `true`, adds a 13 px row below the Frame/update/render timing text showing primitive/sprite
     * overflow counts and submitted vertex totals. Defaults to `false`.
     */
    isOverlayRendererDiagnosticsBarEnabled?: boolean;

    /**
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isOverlayRendererDiagnosticsBarEnabled} instead.
     */
    overlayRendererDiagnosticsBar?: boolean;

    /**
     * When `true`, the engine draws a per-bus level meter band (main/music/sfx bars plus a
     * voices used/total, steal, and drop text readout) in the overlay. Defaults to `false` in
     * {@link defaultConfig}. Enabling this also lazily creates the `AnalyserNode`s backing the
     * bus level readings ({@link AudioManager.enableBusMetering}) - no metering cost is paid
     * unless this flag is `true`.
     *
     * @since 1.3.0
     */
    isOverlayAudioMetersEnabled?: boolean;

    /**
     * Height in pixels of the audio meter band when {@link isOverlayAudioMetersEnabled} is `true`.
     * Defaults to 13 pixels when omitted.
     *
     * @since 1.3.0
     */
    overlayAudioMeterHeight?: number;

    /**
     * Optional palette indices for the audio meter band. Level bar and track colors default to
     * {@link OverlayStyle} text/gap indices; warning/clip slots control semantic level tints.
     *
     * @since 1.3.0
     */
    overlayAudioMeterStyle?: OverlayAudioMeterStyle;
}

/**
 * Palette indices for overlay bar fills and system-font text.
 *
 * @since 1.1.0
 */
export interface OverlayStyle {
    /** Palette index for bar backgrounds (top, bottom, and custom rows unless overridden). */
    barPaletteIndex?: number;

    /** Palette index for overlay text (built-in labels and custom rows unless overridden). */
    textPaletteIndex?: number;

    /**
     * Palette index for 1 px row gaps between overlay bands and boundary separators
     * (below the top cluster, above the bottom hint bar). Defaults to
     * {@link OverlayStyle.barPaletteIndex} when omitted.
     */
    gapPaletteIndex?: number;
}

/**
 * Palette indices for the timing chart band.
 *
 * @since 1.1.0
 */
export interface OverlayTimingChartStyle {
    /** Update bar color; defaults to {@link OverlayStyle.barPaletteIndex} or overlay bar index. */
    updateBarPaletteIndex?: number;

    /** Render bar color; defaults to {@link OverlayStyle.textPaletteIndex} or overlay text index. */
    renderBarPaletteIndex?: number;

    /** Warning tint when a chart column is over budget or dropped one frame. */
    warningPaletteIndex?: number;

    /** Error tint when a chart column is severely over budget or dropped 2+ frames. */
    errorPaletteIndex?: number;

    /** Palette index for timing chart tag and tick text. */
    tagPaletteIndex?: number;

    /**
     * Faint horizontal grid lines behind chart dots. Defaults to
     * {@link OverlayStyle.gapPaletteIndex} or {@link OverlayStyle.barPaletteIndex} when omitted.
     */
    gridPaletteIndex?: number;

    /** Overflow marker tint for {@link HardwareSettings.overlayTimingChartDiagnostics} minimal/rich modes. Defaults to {@link warningPaletteIndex}. */
    overflowPaletteIndex?: number;
}

/**
 * Palette indices for the audio meter band.
 *
 * @since 1.3.0
 */
export interface OverlayAudioMeterStyle {
    /** Bus level bar color; defaults to {@link OverlayStyle.textPaletteIndex} or overlay text index. */
    levelBarPaletteIndex?: number;

    /**
     * Bar track (empty background) color. Defaults to {@link OverlayStyle.gapPaletteIndex} or
     * {@link OverlayStyle.barPaletteIndex} when omitted.
     */
    trackPaletteIndex?: number;

    /** Warning tint when a bus level crosses the warning threshold. */
    warningPaletteIndex?: number;

    /** Clip tint when a bus level crosses the clip threshold. */
    clipPaletteIndex?: number;
}

/**
 * One optional overlay row supplied by a demo (left label, optional right label).
 *
 * Rendered as a 13 px bar stacked above the footer (palette grid + hint bar when
 * {@link HardwareSettings.isOverlayPaletteEnabled} is `true`, or the hint bar alone) with 1 px gaps.
 * Reuse the same array instance from {@link IBTDemo.overlayRows} when possible to avoid
 * per-frame allocations.
 *
 * @since 1.1.0
 */
export interface OverlayRow {
    /** Left-aligned text (for example `Position: 120, 80`). */
    leftText: string;

    /** Optional right-aligned text in the same bar. */
    rightText?: string;

    /**
     * Bar fill palette index for this row only. Falls back to
     * {@link HardwareSettings.overlayStyle} then overlay defaults.
     */
    barPaletteIndex?: number;

    /**
     * Text palette index for this row only (left and right labels). Falls back to
     * {@link HardwareSettings.overlayStyle} then overlay defaults.
     */
    textPaletteIndex?: number;
}

/**
 * Demo contract implemented by BLIT386 applications.
 *
 * Engine lifecycle order:
 * 1. configure() - Optional; called first to set display size, output buffer, FPS, overlay
 * 2. init() - Called after renderer setup, load assets here
 * 3. update() - Fixed timestep via accumulator (may run 0..N times per frame)
 * 4. render() - Called once per requestAnimationFrame (browser refresh rate)
 * 5. (engine) overlay - When {@link HardwareSettings.isOverlayEnabled} is true, drawn after `render()` on top
 *
 * @since 0.1.0
 * @changed 1.3.1 Added optional {@link IBTDemo.onOrientationChange} hook.
 * @changed 1.4.0 Added optional {@link IBTDemo.onHotReload} hook.
 */
export interface IBTDemo {
    /**
     * Optional hook to declare display size, optional output drawing-buffer size,
     * upscale filter, target fixed-update rate, rendering backend, and overlay.
     *
     * When omitted, the engine uses {@link defaultConfig} (`320x240` logical,
     * `640x480` drawing buffer, `60` FPS, overlay enabled).
     *
     * When present, you may return only the fields you want to change; the
     * engine merges them with {@link defaultConfig} via
     * {@link mergeHardwareSettings}. Omit `displaySize` to inherit the full
     * default resolution and output buffer. Include `displaySize` when you
     * want a custom logical size; optional fields you omit then stay unset
     * (for example no `drawingBufferSize` means a 1:1 drawing buffer).
     *
     * @returns Partial hardware configuration for this demo.
     */
    configure?(): Partial<HardwareSettings>;

    /**
     * Called once after the selected rendering backend has been initialized.
     * Load assets and prepare a demo state here.
     *
     * @returns Promise that resolves to true if successful, false to abort.
     */
    init(): Promise<boolean>;

    /**
     * Called zero or more times per frame at the fixed timestep declared by
     * `targetFPS`. The accumulator pattern ensures the target rate is met on
     * average, but a single frame may invoke this multiple times (catch-up) or
     * not at all. Update simulation, timers, and input-driven state here.
     *
     * This is a hot path. Minimize allocations, reuse objects, and prefer
     * in-place vector operations where possible.
     *
     * Avoid rendering work here; draw in `render()` instead.
     */
    update(): void;

    /**
     * Called once per `requestAnimationFrame` tick (browser refresh rate).
     * Issue all draw calls for the current frame here.
     *
     * When {@link HardwareSettings.isOverlayEnabled} is `true` (default), the engine
     * draws a screen-space overlay HUD after this method returns (present FPS, target FPS, draw calls,
     * frame/update()/render() timings, backend, demo title). Optional {@link overlayRows} adds stacked bars above
     * the footer.
     * Demos do not need to duplicate engine overlay text. Reserve about ~42 px at the top and space for the bottom palette
     * grid (or ~13 px when {@link HardwareSettings.isOverlayPaletteEnabled} is `false`) at the bottom (plus ~14 px per
     * custom overlay row) for overlay bars, or disable the overlay in `configure()` when using custom full-screen HUD
     * layouts.
     *
     * This is a hot path. Batch draws by texture to reduce GPU state changes
     * and reuse Color32/Vector2i instances instead of allocating per frame.
     *
     * Avoid mutating the simulation state here unless it is strictly visual.
     */
    render(): void;

    /**
     * Optional hook returning extra overlay rows for the current frame.
     *
     * Called once per render frame after `render()` when {@link HardwareSettings.isOverlayEnabled}
     * is `true` and the overlay body is visible (not hidden via Backquote or corner toggle). Rows stack
     * upward from just above the bottom hint bar (1 px gap between bars). Omit this hook or return
     * an empty array when no custom rows are needed.
     *
     * Hot path: reuse the same array and row objects when content is unchanged; avoid
     * allocating new strings or arrays every frame when values only change in place.
     *
     * @returns Read-only list of overlay rows, or `undefined` for none.
     */
    overlayRows?(): readonly OverlayRow[] | undefined;

    /**
     * Optional hook called when `screen.orientation` reports a type change.
     *
     * The engine installs a listener after a successful `init()` and removes it on
     * `stop()`. Use this to show a "please rotate" prompt or adapt layout; the
     * engine does not draw that UI itself. Read the current value any time via
     * {@link BT.screenOrientation}.
     *
     * @since 1.3.1
     * @param type - Current `screen.orientation.type` (for example
     *   `'landscape-primary'` or `'portrait-secondary'`).
     */
    onOrientationChange?(type: string): void;

    /**
     * Optional hook called after a hot reload swaps in new code for this demo.
     *
     * Fires for both swap tiers: `'methods'` (the prototype was swapped in place; this
     * instance and its fields are untouched) and `'reinit'` (a fresh instance was
     * constructed and its `init()` re-run; `snapshot` carries the previous instance's own
     * enumerable fields so state can be restored). Never fires for a hardware-settings
     * change, which triggers a full page reload instead.
     *
     * No-op in production - `import.meta.hot` never exists outside a Vite dev server, so
     * this hook is only ever called during local development.
     *
     * @since 1.4.0
     * @param context - Which tier ran, the new generation number, and (for
     *   `'reinit'`) a field snapshot of the previous instance.
     */
    onHotReload?(context: HotReloadContext): void;
}

/**
 * Creates a fresh default hardware configuration for quick demos.
 *
 * Matches the most common setup across BLIT386 demos: `320x240` logical resolution,
 * `640x480` canvas output (2x nearest upscale), `60` FPS fixed updates, and the engine
 * overlay enabled.
 *
 * @since 1.0.3
 * @returns Default HardwareSettings configuration.
 */
export function defaultConfig(): HardwareSettings {
    return {
        displaySize: new Vector2i(320, 240),
        drawingBufferSize: new Vector2i(640, 480),
        maxCanvasSize: new Vector2i(DEFAULT_MAX_CANVAS_SIZE.x, DEFAULT_MAX_CANVAS_SIZE.y),
        targetFPS: 60,
        outputUpscaleFilter: 'nearest',
        backend: 'webgpu',
        audioVoices: 16,
        isCapturingPointerScroll: false,
        isCapturingKeyboardScroll: false,
        isWakeLockEnabled: false,
        preferredOrientation: 'any',
        isOverlayEnabled: true,
        isOverlayVisibleAtStart: false,
        isOverlayToggleHintVisible: true,
        isOverlayToggleEnabled: true,
        isOverlayToggleHitDebugVisible: false,
        isOverlayPaletteEnabled: false,
        isOverlayTimingChartEnabled: false,
        isOverlayAudioMetersEnabled: false,
    };
}

/**
 * Clones a {@link Vector2i} so merged settings do not share mutable references.
 *
 * @param size - Source vector.
 * @returns Fresh vector with the same components.
 */
function cloneVector2i(size: Vector2i): Vector2i {
    return new Vector2i(size.x, size.y);
}

/** Non-positive sentinel surfaced when configure() passes null vectors; rejected by {@link validateDimensions}. */
const INVALID_CONFIGURE_VECTOR_SIZE = new Vector2i(0, 0);

/**
 * Picks a configure-time vector: omit when undefined or null, clone valid {@link Vector2i} values.
 *
 * Explicit `null` is detected from the original `partial` field during merge, not from `picked`.
 *
 * @param value - Field from demo `configure()`.
 * @returns Cloned vector when valid, otherwise `undefined`.
 */
function pickConfigureVector(value: Vector2i | undefined | null): Vector2i | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    return cloneVector2i(value);
}

/**
 * Clones a caller-supplied configure color so merged settings do not share a
 * mutable reference with the demo's `configure()` return value.
 *
 * @param value - Raw color from `configure()`, possibly undefined.
 * @returns Cloned color, or undefined when none was supplied.
 */
function pickConfigureColor(value: Color32 | undefined): Color32 | undefined {
    return value === undefined ? undefined : value.clone();
}

/**
 * Resolves required `displaySize` for the explicit-profile merge path.
 *
 * Uses defaults only when the field was omitted (`undefined`). Explicit `null` maps to
 * {@link INVALID_CONFIGURE_VECTOR_SIZE} so {@link validateDimensions} can reject it.
 *
 * @param partialDisplaySize - Raw `configure()` value.
 * @param pickedDisplaySize - Cloned value from {@link pickDefinedHardwareSettings}, if any.
 * @param fallback - Baseline display size from {@link defaultConfig}.
 * @returns Resolved display size (never `null`).
 */
function resolveExplicitDisplaySize(
    partialDisplaySize: Vector2i | undefined | null,
    pickedDisplaySize: Vector2i | undefined,
    fallback: Vector2i,
): Vector2i {
    if (partialDisplaySize === null) {
        return INVALID_CONFIGURE_VECTOR_SIZE.clone();
    }

    if (pickedDisplaySize !== undefined) {
        return pickedDisplaySize;
    }

    return cloneVector2i(fallback);
}

/**
 * Resolves an optional vector for the explicit display profile.
 *
 * @param partialValue - Raw `configure()` value.
 * @param picked - Cloned value from {@link pickDefinedHardwareSettings}, if any.
 * @returns Cloned vector, {@link INVALID_CONFIGURE_VECTOR_SIZE} when `partialValue` is `null`, or `undefined` when omitted.
 */
function resolveExplicitOptionalVector(
    partialValue: Vector2i | undefined | null,
    picked: Vector2i | undefined,
): Vector2i | undefined {
    if (partialValue === null) {
        return INVALID_CONFIGURE_VECTOR_SIZE.clone();
    }

    return picked;
}

/**
 * Copies a defined scalar or object field from `partial` into `picked`.
 *
 * @param picked - Output partial settings.
 * @param partial - Values returned by the demo's `configure()` hook.
 * @param key - Hardware settings field to copy when defined.
 */
function pickIfDefinedPartial<K extends keyof HardwareSettings>(
    picked: Partial<HardwareSettings>,
    partial: Partial<HardwareSettings>,
    key: K,
): void {
    /* eslint-disable security/detect-object-injection -- key is keyof HardwareSettings */
    if (partial[key] !== undefined) {
        picked[key] = partial[key];
    }
    /* eslint-enable security/detect-object-injection */
}

/**
 * Copies defined overlay fields from `partial` into `picked`.
 *
 * @param picked - Output partial settings.
 * @param partial - Values returned by the demo's `configure()` hook.
 */
function pickDefinedOverlaySettings(picked: Partial<HardwareSettings>, partial: Partial<HardwareSettings>): void {
    pickIfDefinedPartial(picked, partial, 'isOverlayEnabled');
    pickIfDefinedPartial(picked, partial, 'isOverlayVisibleAtStart');
    pickIfDefinedPartial(picked, partial, 'isOverlayToggleHintVisible');
    pickIfDefinedPartial(picked, partial, 'isOverlayToggleEnabled');
    pickIfDefinedPartial(picked, partial, 'isOverlayToggleHitDebugVisible');
    pickIfDefinedPartial(picked, partial, 'isOverlayPaletteEnabled');
    pickIfDefinedPartial(picked, partial, 'overlayPaletteColumns');
    pickIfDefinedPartial(picked, partial, 'overlayPaletteRowsVisible');
    pickIfDefinedPartial(picked, partial, 'isOverlayTimingChartEnabled');
    pickIfDefinedPartial(picked, partial, 'overlayTimingChartHeight');
    pickIfDefinedPartial(picked, partial, 'overlayTimingChartDiagnostics');
    pickIfDefinedPartial(picked, partial, 'isOverlayRendererDiagnosticsBarEnabled');
    pickIfDefinedPartial(picked, partial, 'isOverlayAudioMetersEnabled');
    pickIfDefinedPartial(picked, partial, 'overlayAudioMeterHeight');

    if (partial.overlayStyle !== undefined) {
        picked.overlayStyle = { ...partial.overlayStyle };
    }

    if (partial.overlayTimingChartStyle !== undefined) {
        picked.overlayTimingChartStyle = { ...partial.overlayTimingChartStyle };
    }

    if (partial.overlayAudioMeterStyle !== undefined) {
        picked.overlayAudioMeterStyle = { ...partial.overlayAudioMeterStyle };
    }
}

/**
 * Copies only defined fields from a partial configure() return value.
 *
 * @param partial - Values returned by the demo's `configure()` hook.
 * @returns Partial settings containing only defined entries, with vectors cloned.
 */
function pickDefinedHardwareSettings(partial: Partial<HardwareSettings>): Partial<HardwareSettings> {
    const picked: Partial<HardwareSettings> = {};

    const pickedDisplaySize = pickConfigureVector(partial.displaySize);
    if (pickedDisplaySize !== undefined) {
        picked.displaySize = pickedDisplaySize;
    }

    const pickedDrawingBufferSize = pickConfigureVector(partial.drawingBufferSize);
    if (pickedDrawingBufferSize !== undefined) {
        picked.drawingBufferSize = pickedDrawingBufferSize;
    }

    const pickedMaxCanvasSize = pickConfigureVector(partial.maxCanvasSize);
    if (pickedMaxCanvasSize !== undefined) {
        picked.maxCanvasSize = pickedMaxCanvasSize;
    }

    pickIfDefinedPartial(picked, partial, 'targetFPS');
    pickIfDefinedPartial(picked, partial, 'outputUpscaleFilter');
    pickIfDefinedPartial(picked, partial, 'isDetectingDroppedFrames');
    pickIfDefinedPartial(picked, partial, 'isCapturingPointerScroll');
    pickIfDefinedPartial(picked, partial, 'isCapturingKeyboardScroll');
    pickIfDefinedPartial(picked, partial, 'isWakeLockEnabled');
    pickIfDefinedPartial(picked, partial, 'preferredOrientation');
    pickIfDefinedPartial(picked, partial, 'backend');
    pickIfDefinedPartial(picked, partial, 'audioVoices');
    pickIfDefinedPartial(picked, partial, 'isSplashEnabled');

    const pickedSplashColorDark = pickConfigureColor(partial.splashColorDark);
    if (pickedSplashColorDark !== undefined) {
        picked.splashColorDark = pickedSplashColorDark;
    }

    const pickedSplashColorLight = pickConfigureColor(partial.splashColorLight);
    if (pickedSplashColorLight !== undefined) {
        picked.splashColorLight = pickedSplashColorLight;
    }

    pickDefinedOverlaySettings(picked, partial);

    return picked;
}

/** Legacy-to-current boolean field aliases accepted by configure() compatibility handling. */
const DEPRECATED_BOOLEAN_ALIASES = [
    { current: 'isDetectingDroppedFrames', legacy: 'detectDroppedFrames' },
    { current: 'isOverlayEnabled', legacy: 'overlayEnabled' },
    { current: 'isOverlayVisibleAtStart', legacy: 'overlayVisibleAtStart' },
    { current: 'isOverlayToggleHintVisible', legacy: 'overlayToggleHintVisible' },
    { current: 'isOverlayToggleEnabled', legacy: 'overlayToggleEnabled' },
    { current: 'isOverlayPaletteEnabled', legacy: 'overlayPaletteView' },
    { current: 'isOverlayTimingChartEnabled', legacy: 'overlayTimingChart' },
    { current: 'isOverlayRendererDiagnosticsBarEnabled', legacy: 'overlayRendererDiagnosticsBar' },
] as const;

/**
 * Normalizes deprecated configure() keys onto current HardwareSettings fields.
 *
 * New names always win when both are provided in the same object.
 *
 * @param partial - Raw values returned by configure().
 * @returns Partial settings with legacy keys mapped to current keys.
 */
function normalizeDeprecatedHardwareSettings(partial: Partial<HardwareSettings>): Partial<HardwareSettings> {
    const normalized = { ...partial };

    for (const alias of DEPRECATED_BOOLEAN_ALIASES) {
        const currentValue = normalized[alias.current];

        const legacyValue = partial[alias.legacy];

        if (currentValue === undefined && legacyValue !== undefined) {
            normalized[alias.current] = legacyValue;
        }
    }

    return normalized;
}

/**
 * Resolves an optional vector from picked configure values or defaults.
 *
 * @param partialValue - Raw value from `configure()` for this optional vector field.
 * @param picked - Value from `configure()`, if any.
 * @param fallback - Default vector when picked is omitted.
 * @returns Cloned vector or `undefined` when neither side provides a size.
 */
function resolveMergedOptionalVector(
    partialValue: Vector2i | undefined | null,
    picked: Vector2i | undefined,
    fallback: Vector2i | undefined,
): Vector2i | undefined {
    if (partialValue === null) {
        return INVALID_CONFIGURE_VECTOR_SIZE.clone();
    }

    if (picked !== undefined) {
        return picked;
    }

    return fallback === undefined ? undefined : cloneVector2i(fallback);
}

/**
 * Sets `target[key]` when `value` is defined.
 *
 * @param target - Partial settings object being built.
 * @param key - Hardware settings field to assign.
 * @param value - Resolved value, or `undefined` to skip.
 */
function assignIfDefined<K extends keyof HardwareSettings>(
    target: Partial<HardwareSettings>,
    key: K,
    value: HardwareSettings[K] | undefined,
): void {
    if (value !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- key is keyof HardwareSettings
        target[key] = value;
    }
}

/**
 * Shallow-clones an object-shaped optional before assignment.
 *
 * @param value - Optional record from configure or defaults.
 * @returns Cloned record, or `undefined` when input is omitted.
 */
function shallowCloneOptional<T extends object>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : { ...value };
}

/**
 * Merged optional vectors for the full-default configure path.
 *
 * @param optionals - Partial {@link HardwareSettings} object being built; optional
 *   vector fields are written here via {@link assignIfDefined} when resolved.
 * @param partial - Raw `configure()` return value being merged.
 * @param picked - Defined fields from `configure()`.
 * @param defaults - Baseline hardware settings.
 */
function assignFullDefaultMergeVectors(
    optionals: Partial<HardwareSettings>,
    partial: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): void {
    assignIfDefined(
        optionals,
        'drawingBufferSize',
        resolveMergedOptionalVector(partial.drawingBufferSize, picked.drawingBufferSize, defaults.drawingBufferSize),
    );

    assignIfDefined(
        optionals,
        'maxCanvasSize',
        resolveMergedOptionalVector(partial.maxCanvasSize, picked.maxCanvasSize, defaults.maxCanvasSize),
    );
}

/**
 * Merged optional scalars and overlay records for the full-default configure path.
 *
 * @param optionals - Partial settings object being built.
 * @param picked - Defined fields from `configure()`.
 * @param defaults - Baseline hardware settings.
 */
// eslint-disable-next-line complexity -- flat fan-out of one assignIfDefined per field, not branching
function assignFullDefaultMergeScalars(
    optionals: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): void {
    assignIfDefined(optionals, 'outputUpscaleFilter', picked.outputUpscaleFilter ?? defaults.outputUpscaleFilter);
    assignIfDefined(
        optionals,
        'isDetectingDroppedFrames',
        picked.isDetectingDroppedFrames ?? defaults.isDetectingDroppedFrames,
    );
    assignIfDefined(
        optionals,
        'isCapturingPointerScroll',
        picked.isCapturingPointerScroll ?? defaults.isCapturingPointerScroll,
    );
    assignIfDefined(
        optionals,
        'isCapturingKeyboardScroll',
        picked.isCapturingKeyboardScroll ?? defaults.isCapturingKeyboardScroll,
    );
    assignIfDefined(optionals, 'isWakeLockEnabled', picked.isWakeLockEnabled ?? defaults.isWakeLockEnabled);
    assignIfDefined(optionals, 'preferredOrientation', picked.preferredOrientation ?? defaults.preferredOrientation);
    assignIfDefined(optionals, 'backend', picked.backend ?? defaults.backend);
    assignIfDefined(optionals, 'audioVoices', picked.audioVoices ?? defaults.audioVoices);

    // The splash fields have no defaultConfig() baseline on purpose: isSplashEnabled must stay
    // unset so the URL flags and dev-mode detection can resolve it, and the ramp endpoints
    // default inside src/splash/ramp.ts.
    assignIfDefined(optionals, 'isSplashEnabled', picked.isSplashEnabled);
    assignIfDefined(optionals, 'splashColorDark', picked.splashColorDark);
    assignIfDefined(optionals, 'splashColorLight', picked.splashColorLight);

    assignIfDefined(optionals, 'overlayStyle', shallowCloneOptional(picked.overlayStyle ?? defaults.overlayStyle));

    assignIfDefined(
        optionals,
        'isOverlayVisibleAtStart',
        picked.isOverlayVisibleAtStart ?? defaults.isOverlayVisibleAtStart,
    );

    assignIfDefined(
        optionals,
        'isOverlayToggleHintVisible',
        picked.isOverlayToggleHintVisible ?? defaults.isOverlayToggleHintVisible,
    );

    assignIfDefined(
        optionals,
        'isOverlayToggleEnabled',
        picked.isOverlayToggleEnabled ?? defaults.isOverlayToggleEnabled,
    );

    assignIfDefined(
        optionals,
        'isOverlayToggleHitDebugVisible',
        picked.isOverlayToggleHitDebugVisible ?? defaults.isOverlayToggleHitDebugVisible,
    );

    assignIfDefined(
        optionals,
        'isOverlayPaletteEnabled',
        picked.isOverlayPaletteEnabled ?? defaults.isOverlayPaletteEnabled,
    );

    assignIfDefined(optionals, 'overlayPaletteColumns', picked.overlayPaletteColumns);

    assignIfDefined(optionals, 'overlayPaletteRowsVisible', picked.overlayPaletteRowsVisible);

    assignIfDefined(
        optionals,
        'isOverlayTimingChartEnabled',
        picked.isOverlayTimingChartEnabled ?? defaults.isOverlayTimingChartEnabled,
    );

    assignIfDefined(
        optionals,
        'overlayTimingChartHeight',
        picked.overlayTimingChartHeight ?? defaults.overlayTimingChartHeight,
    );

    assignIfDefined(
        optionals,
        'overlayTimingChartStyle',
        shallowCloneOptional(picked.overlayTimingChartStyle ?? defaults.overlayTimingChartStyle),
    );

    assignIfDefined(optionals, 'overlayTimingChartDiagnostics', picked.overlayTimingChartDiagnostics);

    assignIfDefined(optionals, 'isOverlayRendererDiagnosticsBarEnabled', picked.isOverlayRendererDiagnosticsBarEnabled);

    assignFullDefaultMergeAudioMeterScalars(optionals, picked, defaults);
}

/**
 * Merged optional audio meter fields for the full-default configure path.
 *
 * @param optionals - Partial settings object being built.
 * @param picked - Defined fields from `configure()`.
 * @param defaults - Baseline hardware settings.
 */
function assignFullDefaultMergeAudioMeterScalars(
    optionals: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): void {
    assignIfDefined(
        optionals,
        'isOverlayAudioMetersEnabled',
        picked.isOverlayAudioMetersEnabled ?? defaults.isOverlayAudioMetersEnabled,
    );

    assignIfDefined(
        optionals,
        'overlayAudioMeterHeight',
        picked.overlayAudioMeterHeight ?? defaults.overlayAudioMeterHeight,
    );

    assignIfDefined(
        optionals,
        'overlayAudioMeterStyle',
        shallowCloneOptional(picked.overlayAudioMeterStyle ?? defaults.overlayAudioMeterStyle),
    );
}

/**
 * Collects optional hardware fields for the full-default merge path.
 *
 * @param partial - Raw `configure()` return value being merged.
 * @param picked - Defined fields from `configure()`.
 * @param defaults - Baseline hardware settings.
 * @returns Partial settings to spread into the resolved profile.
 */
function buildFullDefaultMergeOptionals(
    partial: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): Partial<HardwareSettings> {
    const optionals: Partial<HardwareSettings> = {};
    assignFullDefaultMergeVectors(optionals, partial, picked, defaults);
    assignFullDefaultMergeScalars(optionals, picked, defaults);
    return optionals;
}

/**
 * Optional fields explicitly set in `configure()` when the demo provided `displaySize`.
 *
 * @param partial - Raw `configure()` return value with explicit `displaySize`.
 * @param picked - Defined fields with vectors cloned.
 * @returns Partial settings to spread into the resolved profile.
 */
function buildExplicitDisplayOptionals(
    partial: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
): Partial<HardwareSettings> {
    const optionals: Partial<HardwareSettings> = {};
    assignIfDefined(
        optionals,
        'drawingBufferSize',
        resolveExplicitOptionalVector(partial.drawingBufferSize, picked.drawingBufferSize),
    );
    assignIfDefined(
        optionals,
        'maxCanvasSize',
        resolveExplicitOptionalVector(partial.maxCanvasSize, picked.maxCanvasSize),
    );
    assignIfDefined(optionals, 'outputUpscaleFilter', picked.outputUpscaleFilter);
    assignIfDefined(optionals, 'isDetectingDroppedFrames', picked.isDetectingDroppedFrames);
    assignIfDefined(optionals, 'isCapturingPointerScroll', picked.isCapturingPointerScroll);
    assignIfDefined(optionals, 'isCapturingKeyboardScroll', picked.isCapturingKeyboardScroll);
    assignIfDefined(optionals, 'isWakeLockEnabled', picked.isWakeLockEnabled);
    assignIfDefined(optionals, 'preferredOrientation', picked.preferredOrientation);
    assignIfDefined(optionals, 'audioVoices', picked.audioVoices);
    assignIfDefined(optionals, 'isSplashEnabled', picked.isSplashEnabled);
    assignIfDefined(optionals, 'splashColorDark', picked.splashColorDark);
    assignIfDefined(optionals, 'splashColorLight', picked.splashColorLight);
    assignIfDefined(optionals, 'overlayStyle', shallowCloneOptional(picked.overlayStyle));
    assignIfDefined(optionals, 'overlayPaletteColumns', picked.overlayPaletteColumns);
    assignIfDefined(optionals, 'overlayPaletteRowsVisible', picked.overlayPaletteRowsVisible);
    assignIfDefined(optionals, 'isOverlayTimingChartEnabled', picked.isOverlayTimingChartEnabled);
    assignIfDefined(optionals, 'overlayTimingChartHeight', picked.overlayTimingChartHeight);
    assignIfDefined(optionals, 'overlayTimingChartStyle', shallowCloneOptional(picked.overlayTimingChartStyle));
    assignIfDefined(optionals, 'overlayTimingChartDiagnostics', picked.overlayTimingChartDiagnostics);
    assignIfDefined(optionals, 'isOverlayRendererDiagnosticsBarEnabled', picked.isOverlayRendererDiagnosticsBarEnabled);
    assignIfDefined(optionals, 'isOverlayToggleHitDebugVisible', picked.isOverlayToggleHitDebugVisible);
    assignIfDefined(optionals, 'isOverlayAudioMetersEnabled', picked.isOverlayAudioMetersEnabled);
    assignIfDefined(optionals, 'overlayAudioMeterHeight', picked.overlayAudioMeterHeight);
    assignIfDefined(optionals, 'overlayAudioMeterStyle', shallowCloneOptional(picked.overlayAudioMeterStyle));
    return optionals;
}

/**
 * Merges partial settings with {@link defaultConfig} when the demo did not set
 * `displaySize` (for example only `{ targetFPS: 30 }`).
 *
 * @param partial - Raw `configure()` return value being merged.
 * @param picked - Defined fields from `configure()`.
 * @param defaults - Baseline hardware settings.
 * @returns Resolved settings with full default resolution and output buffer.
 */
function mergePartialWithFullDefaults(
    partial: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): HardwareSettings {
    return {
        displaySize: cloneVector2i(defaults.displaySize),
        targetFPS: picked.targetFPS ?? defaults.targetFPS,
        isOverlayEnabled: picked.isOverlayEnabled ?? defaults.isOverlayEnabled ?? true,
        isOverlayVisibleAtStart: picked.isOverlayVisibleAtStart ?? defaults.isOverlayVisibleAtStart ?? false,
        isOverlayToggleHintVisible: picked.isOverlayToggleHintVisible ?? defaults.isOverlayToggleHintVisible ?? true,
        isOverlayToggleEnabled: picked.isOverlayToggleEnabled ?? defaults.isOverlayToggleEnabled ?? true,
        isOverlayPaletteEnabled: picked.isOverlayPaletteEnabled ?? defaults.isOverlayPaletteEnabled ?? false,
        ...buildFullDefaultMergeOptionals(partial, picked, defaults),
    };
}

/**
 * Applies only fields present in `configure()` when the demo set `displaySize`.
 *
 * @param partial - Raw `configure()` return value with explicit `displaySize`.
 * @param picked - Defined fields with vectors cloned.
 * @param defaults - Baseline hardware settings for required fallbacks.
 * @returns Resolved settings; omitted optionals such as `drawingBufferSize` stay unset.
 * `backend` always inherits from {@link defaultConfig} when omitted from `configure()`.
 */
function mergeExplicitDisplayProfile(
    partial: Partial<HardwareSettings>,
    picked: Partial<HardwareSettings>,
    defaults: HardwareSettings,
): HardwareSettings {
    return {
        displaySize: resolveExplicitDisplaySize(partial.displaySize, picked.displaySize, defaults.displaySize),
        targetFPS: picked.targetFPS ?? defaults.targetFPS,
        isOverlayEnabled: picked.isOverlayEnabled ?? defaults.isOverlayEnabled ?? true,
        isOverlayVisibleAtStart: picked.isOverlayVisibleAtStart ?? defaults.isOverlayVisibleAtStart ?? false,
        isOverlayToggleHintVisible: picked.isOverlayToggleHintVisible ?? defaults.isOverlayToggleHintVisible ?? true,
        isOverlayToggleEnabled: picked.isOverlayToggleEnabled ?? defaults.isOverlayToggleEnabled ?? true,
        isOverlayPaletteEnabled: picked.isOverlayPaletteEnabled ?? defaults.isOverlayPaletteEnabled ?? false,
        backend: picked.backend ?? defaults.backend ?? 'webgpu',
        ...buildExplicitDisplayOptionals(partial, picked),
    };
}

/**
 * Resolves demo `configure()` output into complete {@link HardwareSettings}.
 *
 * When `displaySize` is omitted from `partial`, unset fields inherit from
 * {@link defaultConfig} (including `drawingBufferSize` and `isOverlayEnabled`).
 * When `displaySize` is provided, only fields present in `partial` are applied;
 * omitted optionals such as `drawingBufferSize` remain unset so the drawing buffer
 * can match logical resolution. `isOverlayEnabled` defaults to `true` when omitted.
 *
 * @since 1.0.5
 * @param partial - Optional partial settings from `configure()`.
 * @returns Resolved hardware settings for initialization.
 */
export function mergeHardwareSettings(partial?: Partial<HardwareSettings>): HardwareSettings {
    const defaults = defaultConfig();

    if (partial === undefined) {
        return defaults;
    }

    const normalized = normalizeDeprecatedHardwareSettings(partial);
    const picked = pickDefinedHardwareSettings(normalized);

    if (normalized.displaySize === undefined) {
        return mergePartialWithFullDefaults(normalized, picked, defaults);
    }

    return mergeExplicitDisplayProfile(normalized, picked, defaults);
}

/** Resolved timing-chart renderer diagnostic visualization mode. */
export type OverlayTimingChartDiagnosticsMode = false | 'minimal' | 'rich';

/**
 * Resolves {@link HardwareSettings.overlayTimingChartDiagnostics} for runtime overlay/chart code.
 *
 * Defaults to `'minimal'` when the timing chart is enabled and the field is omitted; `false` otherwise.
 *
 * @param settings - Resolved hardware settings.
 * @returns Chart diagnostic visualization mode.
 */
export function resolveOverlayTimingChartDiagnostics(settings: HardwareSettings): OverlayTimingChartDiagnosticsMode {
    if (settings.overlayTimingChartDiagnostics !== undefined) {
        return settings.overlayTimingChartDiagnostics;
    }

    return settings.isOverlayTimingChartEnabled === true ? 'minimal' : false;
}

/**
 * Whether BTAPI should collect WebGPU renderer diagnostic counters this frame.
 *
 * @param settings - Resolved hardware settings.
 * @returns `true` when chart diagnostics or the renderer diagnostics bar needs data.
 */
export function needsOverlayRendererDiagnostics(settings: HardwareSettings): boolean {
    return (
        resolveOverlayTimingChartDiagnostics(settings) !== false ||
        settings.isOverlayRendererDiagnosticsBarEnabled === true
    );
}
