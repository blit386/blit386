import { AssetLoader } from '../assets/AssetLoader';
import { AudioClip } from '../assets/AudioClip';
import type { BitmapFont } from '../assets/BitmapFont';
import { NineSlice, type NineSliceMode, splitNineSliceAxis } from '../assets/NineSlice';
import type { Palette } from '../assets/Palette';
import { TRANSPARENT_PALETTE_INDEX } from '../assets/Palette';
import {
    CycleEffect,
    ExposureFadeEffect,
    type ExposureFadeOptions,
    FadeEffect,
    FadeRangeEffect,
    FlashEffect,
    PaletteEffectManager,
    paletteSwap,
} from '../assets/PaletteEffect';
import { type SpriteSheet, writeGridTileRect, writeTileRect } from '../assets/SpriteSheet';
import { createSystemFont } from '../assets/SystemFont';
import { AudioManager } from '../audio/AudioManager';
import type { MusicPlayOptions } from '../audio/MusicPlayer';
import { INVALID_SOUND_REF, type SoundPlayOptions, type SoundRef } from '../audio/VoicePool';
import { GamepadInput } from '../input/GamepadInput';
import { KeyboardInput } from '../input/KeyboardInput';
import { setKeyboardLayout } from '../input/keyboardRuntimeMaps';
import { PointerInput } from '../input/PointerInput';
import type { OverlayAudioSnapshot, OverlayDrawTarget } from '../overlay';
import { createOverlayLayout, Overlay, OVERLAY_TOGGLE_KEY_CODE, resolveOverlayTopLeftLabel } from '../overlay';
import type { Effect } from '../render/effects/Effect';
import type { IRenderer } from '../render/IRenderer';
import { SoftwareRenderer } from '../render/SoftwareRenderer';
import {
    mapSpritePoint,
    resolveSpriteOrientation,
    resolveSpriteScale,
    SPRITE_ORIENTATIONS,
    type SpriteDrawParams,
    type SpriteOrientation,
} from '../render/SpriteOrientation';
import { WebGPURenderer } from '../render/WebGPURenderer';
import type { SplashState } from '../splash';
import { createBlackened, HANDOFF_FADE_MS, isSplashEnabled, Splash } from '../splash';
import { applyCanvasLayoutStyles, DEFAULT_MAX_CANVAS_SIZE } from '../utils/CanvasLayoutStyles';
import { Color32 } from '../utils/Color32';
import { isDevMode } from '../utils/devMode';
import type { EasingFunction } from '../utils/Easing';
import * as errorMessages from '../utils/errorMessages';
import {
    noActivePaletteError,
    paletteIndexNegativeError,
    paletteIndexOutOfRangeError,
    spriteNotIndexizedError,
} from '../utils/errorMessages';
import { downloadBlob, type FrameCaptureSize, writeBlobToClipboard } from '../utils/FrameCapture';
import { defaultFrameCaptureFilename, isFrameCaptureShortcutEnabled } from '../utils/FrameCaptureShortcut';
import { Random } from '../utils/Random';
import { Rect2i } from '../utils/Rect2i';
import { RenderDimensionLimitError, validateDimensions } from '../utils/RenderLimits';
import { Vector2i } from '../utils/Vector2i';
import type { FrameDropCallback, FrameDropEvent } from './GameLoop';
import { GameLoop } from './GameLoop';
import type { AudioBus, Backend, HardwareSettings, IBTDemo, OverlayRow, RenderAtFrom } from './IBTDemo';
import {
    defaultConfig,
    mergeHardwareSettings,
    needsOverlayRendererDiagnostics,
    resolveOverlayTimingChartDiagnostics,
} from './IBTDemo';
import { Orientation } from './Orientation';
import { ReducedMotion } from './ReducedMotion';
import { markIndexUsed, resetUsage, USAGE_CAPACITY } from './RenderPaletteUsage';
import { readSeedUrlParam } from './SeedUrlParam';
import { WakeLock } from './WakeLock';
import { initWebGPU } from './WebGPUContext';

/** Strips top-level `readonly` so a public snapshot type can be mutated in place internally. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * `KeyboardEvent.code` for the dev-mode frame-capture shortcuts: bare F9 copies the frame to
 * the OS clipboard, Shift+F9 downloads it as a PNG file; see
 * {@link HardwareSettings.isFrameCaptureShortcutEnabled}. Combined with {@link SHIFT_KEY_CODES}.
 */
const FRAME_CAPTURE_SHORTCUT_KEY_CODE = 'F9';

/**
 * `KeyboardEvent.code` values for either Shift key. Held alongside F9 selects the save-to-file
 * shortcut below; F9 alone (neither held) selects the copy-to-clipboard shortcut instead.
 */
const SHIFT_KEY_CODES = ['ShiftLeft', 'ShiftRight'] as const;

/**
 * Central runtime facade for BLIT386 engine services.
 *
 * `BTAPI` owns engine initialization, keeps references to the active renderer
 * and optional WebGPU device/context (null on the software backend), and exposes
 * the drawing/camera methods used by demos.
 * It is a singleton; access it through `BTAPI.instance`.
 */
export class BTAPI {
    /**
     * Major semantic-version component.
     */
    public static readonly VERSION_MAJOR = 1;

    /** Minor version number. */
    public static readonly VERSION_MINOR = 7;

    /** Patch version number. */
    public static readonly VERSION_PATCH = 1;

    /** Singleton instance of BTAPI. */
    private static _instance: BTAPI | null = null;

    /**
     * Source rect reused by every `drawTile*` call. Safe to share: the WebGPU
     * sprite pipeline consumes `srcRect` before returning and the software
     * renderer clones it into its command list.
     */
    private readonly scratchTileRect = new Rect2i();

    /** Source rect reused by every `drawNineSlice` quad. Safe to share for the same reason as `scratchTileRect`. */
    private readonly scratchNineSliceSrc = new Rect2i();

    /** Destination point reused by every 1:1 `drawNineSlice` quad (both renderers copy or consume it). */
    private readonly scratchNineSliceDest = new Vector2i();

    /** `[left, middle, right]` column widths of the current `drawNineSlice` box. */
    private readonly nineSliceColumns = new Int32Array(3);

    /** `[top, middle, bottom]` row heights of the current `drawNineSlice` box. */
    private readonly nineSliceRows = new Int32Array(3);

    /** Sheet x of each `drawNineSlice` column strip; end caps crop from their outer side. */
    private readonly nineSliceSrcX = new Int32Array(3);

    /** Sheet y of each `drawNineSlice` row strip; end caps crop from their outer side. */
    private readonly nineSliceSrcY = new Int32Array(3);

    /** Screen x of each `drawNineSlice` column box. */
    private readonly nineSliceBoxX = new Int32Array(3);

    /** Screen y of each `drawNineSlice` row box. */
    private readonly nineSliceBoxY = new Int32Array(3);

    /** Current demo instance implementing IBTDemo. */
    private demo: IBTDemo | null = null;

    /** Hardware configuration settings from the demo. */
    private hwSettings: HardwareSettings | null = null;

    /** WebGPU device for GPU operations. */
    private device: GPUDevice | null = null;

    /** WebGPU canvas context for presenting frames. */
    private context: GPUCanvasContext | null = null;

    /** HTML canvas element used for rendering. */
    private canvas: HTMLCanvasElement | null = null;

    /** Renderer subsystem for all drawing operations. */
    private renderer: (IRenderer & OverlayDrawTarget) | null = null;

    /** Backend that was successfully initialized, or null before init. */
    private activeBackend: Backend | null = null;

    /**
     * World camera offset last applied via {@link setCameraOffset}, persisted across frames.
     *
     * Re-applied at the start of every render pass, before the demo's `render()` runs (see
     * the `onRender` callback built in {@link init}). Without this, a render frame with zero
     * fixed-update steps (common once the render rate approaches or exceeds the fixed update
     * rate, for example at 120 Hz) would draw the world with whatever the *previous* frame's
     * `render()` left the live offset at after its own {@link resetCamera} call for
     * screen-space UI - which is always `(0, 0)` - producing a visible snap-to-origin flash
     * instead of holding the last correct scroll position.
     */
    private lastCameraOffset: Vector2i = Vector2i.zero();

    /**
     * True when {@link resetCamera} ran and its effect on {@link lastCameraOffset} is still
     * deferred to the next fixed-update tick (see {@link commitPendingCameraReset}).
     *
     * `resetCamera()` is also the documented way to flip to screen space for UI at the end of
     * `render()`, with the demo's next `update()` restoring the world offset via
     * {@link setCameraOffset}. Committing the reset to `lastCameraOffset` immediately would make
     * it durable right away, which would incorrectly override the world offset during a render
     * frame with zero fixed-update steps that falls between that reset and the restoring
     * `setCameraOffset()` call - the exact snap-to-origin flash `lastCameraOffset` exists to
     * prevent. Deferring the commit lets a following `setCameraOffset()` supersede it normally,
     * while still making the reset durable once nothing calls `setCameraOffset()` again.
     */
    private pendingCameraReset = false;

    /**
     * Engine overlay; non-null when {@link HardwareSettings.isOverlayEnabled}
     * is not `false`. Layout is fixed at init; drawn after demo `render()` each frame.
     */
    private overlay: Overlay | null = null;

    /** Active engine palette used by palette-first rendering. */
    private palette: Palette | null = null;

    /**
     * Whether {@link setPalette} defers instead of applying.
     *
     * Armed for the splash's duration only. The splash owns the palette while it
     * is on screen, so a game's `init()` calling `BT.paletteSet()` is captured and
     * applied at handoff rather than resolving every color through the splash's ramp.
     */
    private isCapturingPalette: boolean = false;

    /** Palette captured from the game's `init()`, applied at handoff. */
    private pendingPalette: Palette | null = null;

    /** Active splash, or null when gating turned it off. One-shot per page load. */
    private splash: Splash | null = null;

    /** Registry of all sprite sheets that have been passed to drawSprite, for spritesRefresh. */
    private readonly spriteSheets: Set<SpriteSheet> = new Set();

    /** Game loop managing fixed-timestep updates and variable-rate rendering. */
    private loop: GameLoop | null = null;

    /** Milliseconds per fixed update (`1000 / targetFPS`); set by {@link init}, `0` before. */
    private updateIntervalMs = 0;

    /** Tick-clock time of the previous loop render, for the post-process delta. */
    private lastRenderClockMs = 0;

    /** `BT.random` state captured just before the boot `init()`, restored by a `'start'` seek. */
    private bootRandomState = 0;

    /** `BT.random.seedValue` at the same moment, so a restored seeded stream still reports its seed. */
    private bootRandomSeed: number | undefined = undefined;

    /** True while a seek runs the game's code (the `init()` re-run and the stepped updates); drops SFX. */
    private isSeeking = false;

    /** True after `renderAt` stopped the loop, until {@link resume}; `captureFrame` then renders on demand. */
    private isSeekParked = false;

    /**
     * Settles after every {@link renderAt} called so far. Seeks chain onto it so they never interleave, and
     * {@link resume} and {@link captureFrame} chain onto it so they act on the seeked frame, in call order.
     */
    private seekChain: Promise<void> = Promise.resolve();

    /**
     * Manages animated palette effects (cycling, fading, flashing). Runs on the tick clock, so
     * `BT.renderAt` can seek it and it never reads `performance.now()`.
     */
    private readonly paletteEffects = new PaletteEffectManager(() => this.getTickClockMs());

    /** Default engine PRNG; time-seeded when the singleton is created. */
    private readonly random = new Random();

    /** Built-in 6x14 system font for BT.systemPrint(). */
    private systemFont: BitmapFont | null = null;

    /** Accumulated fixed-step update time for the frame currently being rendered. */
    private pendingUpdateMs = 0;

    /** Number of fixed-step updates accumulated for the current render frame. */
    private pendingUpdateSteps = 0;

    /** True only while the demo's `update()` runs; lets `BT.isPressed` hand carried pointer presses to update alone. */
    private updating = false;

    /** Number of demo draw API calls issued since the last rendered frame. */
    private pendingDrawCalls = 0;

    /** Scratch for the resolved `SpriteDrawParams.scale`, so params draws allocate nothing. */
    private readonly spriteScaleScratch = new Vector2i(1, 1);

    /** Footprint corner for params draws with a `Vector2i` dest; renderers copy it when they queue the draw. */
    private readonly spriteCornerScratch = new Vector2i();

    /**
     * Cached {@link isDevMode} for dev-only draw checks. Refreshed in {@link init} and once per render
     * frame (HMR can switch on after init), never per draw: `isDevMode()` resolves several signals.
     */
    private isDevGuardActive = false;

    /**
     * Overlay Backquote toggle press captured during a fixed-update tick, before
     * {@link KeyboardInput.endUpdate} clears that tick's press edge. Read and reset by
     * {@link beginRenderFrame} so the overlay (checked during the render phase, after every
     * update tick for the frame has already run) still observes a press that landed inside a tick.
     */
    private pendingOverlayTogglePress = false;

    /**
     * True while a Shift+F9 save or bare-F9 clipboard-copy dev-mode frame capture is in
     * flight (see {@link HardwareSettings.isFrameCaptureShortcutEnabled}). Shared by both
     * shortcuts rather than one guard each: both ultimately call
     * `IRenderer.captureFrameForShortcut()`, which is backed by a single-slot
     * `FrameCapture` request queue on the renderer - a second call while the first is still
     * pending rejects the first with "Capture superseded by a new request" instead of
     * queuing it. Independent guards would let one shortcut silently fail the other's
     * capture instead of preventing the overlap, so holding or rapidly alternating between
     * F9 and Shift+F9 must block on this one flag. The public
     * `captureFrame({ size: 'display' })` uses a separate renderer slot, so it needs no
     * guard here and never contends with a keypress.
     */
    private isFrameCaptureShortcutInFlight = false;

    /**
     * Incremented by {@link stop}; both shortcut methods capture the current value before
     * starting and only clear {@link isFrameCaptureShortcutInFlight} in their completion
     * handler if it still matches. `FrameCapture.resolve()` captures its pending
     * resolve/reject callbacks into locals before its own `await`s, so a capture already
     * mid-readback when `stop()` runs keeps running independently of the game loop and can
     * still settle after a subsequent `init()` has created a new renderer and started its
     * own capture; without this check that stale completion would clear the new capture's
     * guard early.
     */
    private frameCaptureShortcutGeneration = 0;

    /** Bitmask of palette indices referenced by demo draw calls this frame. */
    private readonly framePaletteUsageMask = new Uint8Array(USAGE_CAPACITY);

    /** Reused timing snapshot passed into the overlay each frame. */
    private readonly overlayTiming: {
        frameMs: number;
        updateMs: number;
        renderMs: number;
        updateSteps: number;
        drawCalls: number;
        droppedFrames: number;
        primitiveOverflowCount: number;
        spriteOverflowCount: number;
        primitiveSubmittedVertices: number;
        spriteSubmittedVertices: number;
    } = {
        frameMs: 0,
        updateMs: 0,
        renderMs: 0,
        updateSteps: 0,
        drawCalls: 0,
        droppedFrames: 0,
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
    };

    /** Reused audio snapshot passed into the overlay each frame; populated by {@link captureAudioDiagnostics}. */
    private readonly audioSnapshot: Writable<OverlayAudioSnapshot> = {
        levels: { main: 0, music: 0, sfx: 0 },
        activeVoices: 0,
        totalVoices: 0,
        voiceStealCount: 0,
        voiceDropCount: 0,
        preUnlockDropCount: 0,
    };

    /** Pending renderer diagnostics captured after overlay draws; copied into {@link overlayTiming} at frame end. */
    private readonly pendingRendererDiagnostics: {
        primitiveOverflowCount: number;
        spriteOverflowCount: number;
        primitiveSubmittedVertices: number;
        spriteSubmittedVertices: number;
    } = {
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
    };

    /** When true, {@link captureRendererDiagnostics} reads renderer pipeline counters each frame. */
    private isCollectRendererDiagnosticsEnabled = false;

    /**
     * When true, {@link attachAudioSubsystem} enables bus metering and
     * {@link captureAudioDiagnostics} reads audio bus/voice counters each frame.
     */
    private isCollectAudioMetersEnabled = false;

    /** Pointer / mouse / touch input subsystem. Created during {@link init}. */
    private pointer: PointerInput | null = null;

    /** Keyboard input. Created during {@link init}. */
    private keyboard: KeyboardInput | null = null;

    /** Gamepad input. Created during {@link init}. */
    private gamepad: GamepadInput | null = null;

    /** Audio context, bus graph, and unlock state. Created during {@link init}. */
    private audio: AudioManager | null = null;

    /** Screen wake lock subsystem. Created and attached during {@link init} only when
     *  {@link HardwareSettings.isWakeLockEnabled} is true. */
    private wakeLock: WakeLock | null = null;

    /** Screen orientation detection / lock subsystem. Created and attached during {@link init}. */
    private orientation: Orientation | null = null;

    /** Reduced-motion preference detection. Created and attached during {@link init}. */
    private reducedMotion: ReducedMotion | null = null;

    /**
     * Private constructor to enforce singleton access via `BTAPI.instance`.
     */
    private constructor() {}

    /**
     * Gets the lazily created singleton instance.
     *
     * @returns The global BTAPI instance.
     */
    public static get instance(): BTAPI {
        if (!BTAPI._instance) {
            BTAPI._instance = new BTAPI();
        }

        return BTAPI._instance;
    }

    // TODO: Additional subsystems for future implementation:
    // AssetManager

    /**
     * Whether the demo's `update()` is running right now (false during `render()` and between frames).
     *
     * @returns `true` only inside `update()`.
     */
    public get isUpdating(): boolean {
        return this.updating;
    }

    /**
     * Reads backend override from the current URL query string.
     *
     * Also called by the hot-swap runtime ({@link tryHardReload} in `src/hot/HotSwap.ts`) so a
     * hot-swap candidate's resolved settings can be normalized the same way `init()` normalizes
     * the running settings, before the two are diffed for a Tier 3 hard reload.
     *
     * @returns Supported backend override, or null when absent/invalid.
     */
    public static getBackendQueryOverride(): Backend | null {
        const search =
            typeof globalThis.location?.search === 'string'
                ? globalThis.location.search
                : typeof window === 'undefined'
                  ? ''
                  : window.location?.search;

        if (!search) {
            return null;
        }

        try {
            const backend = new URLSearchParams(search).get('backend');

            if (backend === 'software') {
                return 'software';
            }
        } catch (error) {
            console.warn('[BT] Failed to parse backend query override:', error);
        }

        return null;
    }

    /**
     * Initializes the engine for a demo and starts the main loop on success.
     *
     * The initialization sequence is:
     * - read hardware settings from the demo (`configure()` or defaults)
     * - initialize WebGPU (or software fallback) and create the renderer
     * - create the built-in system font and optional {@link Overlay}
     * - run the demo's async `init()`
     * - start the fixed-timestep game loop
     * - request a screen wake lock when {@link HardwareSettings.isWakeLockEnabled} is true
     * - attach screen orientation detection (and optional lock via
     *   {@link HardwareSettings.preferredOrientation})
     *
     * Initialization failures resolve to `false` rather than throwing - a demo
     * `init()` that returns `false` or throws is caught and reported. The one
     * exception is a splash frame that throws: {@link runSplash} rejects and that
     * error propagates out of this method, because nothing else can settle it and
     * silently reporting `false` would hide a renderer fault. `bootstrap()` catches
     * it and routes it to `onError`.
     *
     * @param demo - Demo implementing the IBTDemo interface.
     * @param canvas - Render target canvas (WebGPU or software backend).
     * @returns `true` when initialization succeeds; otherwise `false`.
     * @throws Error when a splash frame throws while the splash is on screen.
     */
    public async init(demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> {
        console.log(`[BT] Initializing engine v${BTAPI.VERSION_MAJOR}.${BTAPI.VERSION_MINOR}.${BTAPI.VERSION_PATCH}`);

        this.demo = demo;
        this.canvas = canvas;
        this.isDevGuardActive = isDevMode();

        // Hardware settings: demo hook or defaults from defaultConfig() (320x240 logical, 640x480 buffer, 60 FPS).
        console.log('[BT] Reading hardware configuration');

        if (!this.loadHardwareSettings(demo)) {
            return false;
        }

        const hwSettings = this.hwSettings;
        if (!hwSettings) {
            return false;
        }

        const updateInterval = 1000 / hwSettings.targetFPS;

        this.updateIntervalMs = updateInterval;

        this.isCollectAudioMetersEnabled =
            hwSettings.isOverlayEnabled !== false && hwSettings.isOverlayAudioMetersEnabled === true;

        console.log('[BT] Hardware settings:', {
            displaySize: `${hwSettings.displaySize.x}x${hwSettings.displaySize.y}`,
            targetFPS: hwSettings.targetFPS,
        });

        if (!(await this.initRenderer(canvas, hwSettings))) {
            return false;
        }

        // Create the built-in system font (synchronous, no GPU needed yet).
        this.systemFont = createSystemFont();
        this.setupOverlay();
        this.attachInputSubsystems(canvas);
        this.attachAudioSubsystem(canvas);

        // Splash gating resolves here, before the game's init() is invoked, so
        // init() observes 'disabled' or 'fadingIn' and never an undecided state.
        this.splash = createSplashIfEnabled(hwSettings);

        // `?seed=N` lands here, before the game's init(), so a BT.randomSeed() call in init()
        // still wins. Read in release builds too: a seed in a shared URL is the point. Not
        // repeated by hotReplaceDemo() - a hot-reload swap keeps the running stream.
        const urlSeed = readSeedUrlParam();

        if (urlSeed !== null) {
            this.random.seed(urlSeed);
            console.log(`[BT] Seeded BT.random from ?seed=${urlSeed}`);
        }

        console.log('[BT] Initializing demo');

        // Captured after ?seed and before the game's init(), so a 'start' seek replays init() against
        // the same stream the boot run saw - whether that stream was time-seeded or URL-seeded.
        this.bootRandomState = this.random.getState();
        this.bootRandomSeed = this.random.seedValue;
        this.isSeekParked = false;

        if (!(await this.runDemoInitWithSplash(demo, hwSettings))) {
            return false;
        }

        // Start the loop. The GameLoop's double-RAF delay ensures the canvas is
        // fully ready before the first tick.
        const isFrameDropCallbackNeeded =
            hwSettings.isDetectingDroppedFrames === true || hwSettings.isOverlayTimingChartEnabled === true;
        const onFrameDrop: FrameDropCallback | undefined = isFrameDropCallbackNeeded
            ? (event) => this.handleFrameDrop(event, hwSettings.isDetectingDroppedFrames === true)
            : undefined;

        this.isCollectRendererDiagnosticsEnabled = needsOverlayRendererDiagnostics(hwSettings);

        this.pendingUpdateMs = 0;
        this.lastRenderClockMs = 0;
        this.pendingUpdateSteps = 0;
        this.pendingDrawCalls = 0;
        this.lastCameraOffset = Vector2i.zero();
        this.overlayTiming.frameMs = 0;
        this.overlayTiming.updateMs = 0;
        this.overlayTiming.renderMs = 0;
        this.overlayTiming.updateSteps = 0;
        this.overlayTiming.drawCalls = 0;
        this.overlayTiming.droppedFrames = 0;
        this.overlayTiming.primitiveOverflowCount = 0;
        this.overlayTiming.spriteOverflowCount = 0;
        this.overlayTiming.primitiveSubmittedVertices = 0;
        this.overlayTiming.spriteSubmittedVertices = 0;
        this.resetPendingRendererDiagnostics();

        this.audioSnapshot.levels = { main: 0, music: 0, sfx: 0 };
        this.audioSnapshot.activeVoices = 0;
        this.audioSnapshot.totalVoices = 0;
        this.audioSnapshot.voiceStealCount = 0;
        this.audioSnapshot.voiceDropCount = 0;
        this.audioSnapshot.preUnlockDropCount = 0;

        this.loop = new GameLoop(
            updateInterval,
            () => {
                const updateStartMs = performance.now();
                this.commitPendingCameraReset();
                this.updating = true;

                try {
                    this.demo?.update();
                } finally {
                    this.updating = false;
                }

                this.pendingUpdateMs += Math.max(0, performance.now() - updateStartMs);
                this.pendingUpdateSteps++;

                // Palette effects advance once per fixed update, after the game's update(), on the
                // tick clock. Per update rather than per render is what makes BT.renderAt exact: a
                // seek runs the same palette updates as live play instead of one catch-up update at
                // the end (a flash would only take its snapshot then), and the look no longer depends
                // on the display's refresh rate.
                if (this.palette && this.paletteEffects.activeCount > 0) {
                    this.paletteEffects.update(this.palette);
                }

                const tick = this.loop?.getTicks() ?? 0;

                // Sample the overlay toggle key's press edge before endUpdate clears it below.
                // The overlay itself is only checked later, during the render phase (beginRenderFrame),
                // by which point this tick's edge would otherwise already be gone.
                if (this.keyboard?.isKeyPressed(OVERLAY_TOGGLE_KEY_CODE, undefined, tick)) {
                    this.pendingOverlayTogglePress = true;
                }

                // Dev-mode default: Shift+F9 saves a screenshot in every demo, no demo
                // code needed. Unlike the overlay toggle above, this doesn't need to wait
                // for the render phase - it just kicks off an async capture-and-download.
                // Bare F9 (no Shift) instead copies to the OS clipboard, but that path is
                // NOT handled here - see handleClipboardShortcutKeydown's doc comment for
                // why it runs from a dedicated keydown listener instead of this tick.
                if (!this.isFrameCaptureShortcutInFlight && this.isShiftF9ShortcutPressed(tick)) {
                    void this.captureFrameViaShortcut();
                }

                // Keyboard edges and text buffer align with fixed update rate, not display
                // refresh rate (render may run 2x update on 120 Hz / 60 FPS setups).
                this.keyboard?.endUpdate(tick);
            },
            () => {
                const frameStartMs = performance.now();
                let renderMs = 0;

                if (this.renderer) {
                    this.beginRenderFrame();

                    this.renderer.beginFrame();

                    // Re-prime the world camera before the demo draws, in case this render
                    // frame has zero fixed-update steps (see lastCameraOffset doc comment).
                    this.renderer.setCameraOffset(this.lastCameraOffset);

                    const renderStartMs = performance.now();

                    this.demo?.render();

                    renderMs = Math.max(0, performance.now() - renderStartMs);

                    // Overlay: screen-space HUD after demo content (top/bottom bars).
                    if (this.overlay && this.systemFont) {
                        this.overlay.updateAndRender(
                            this.renderer,
                            this.systemFont,
                            this.pointer,
                            this.keyboard,
                            this.loop?.getTicks() ?? 0,
                            this.getDemoOverlayRows,
                            this.overlayTiming,
                            this.palette,
                            this.framePaletteUsageMask,
                            this.audioSnapshot,
                        );
                    }

                    this.captureRendererDiagnostics();
                    this.captureAudioDiagnostics();

                    this.renderer.endFrame(this.consumeFrameDeltaMs());
                }

                // Snapshot pointer state for next frame's edge detection / delta.
                // Must run AFTER demo.update + demo.render have read the current
                // state, so prev = "state when update last looked", letting any
                // event that arrives before the next tick be visible as a transition.
                this.pointer?.endFrame(this.pendingUpdateSteps > 0);

                const tick = this.loop?.getTicks() ?? 0;

                this.gamepad?.endFrame(tick);

                this.overlayTiming.frameMs = Math.max(0, performance.now() - frameStartMs);
                this.overlayTiming.updateMs = this.pendingUpdateMs;
                this.overlayTiming.renderMs = renderMs;
                this.overlayTiming.updateSteps = this.pendingUpdateSteps;
                this.overlayTiming.drawCalls = this.pendingDrawCalls;
                this.overlayTiming.droppedFrames = 0;
                this.overlayTiming.primitiveOverflowCount = this.pendingRendererDiagnostics.primitiveOverflowCount;
                this.overlayTiming.spriteOverflowCount = this.pendingRendererDiagnostics.spriteOverflowCount;
                this.overlayTiming.primitiveSubmittedVertices =
                    this.pendingRendererDiagnostics.primitiveSubmittedVertices;
                this.overlayTiming.spriteSubmittedVertices = this.pendingRendererDiagnostics.spriteSubmittedVertices;

                this.pendingUpdateMs = 0;
                this.pendingUpdateSteps = 0;
                this.pendingDrawCalls = 0;
                this.resetPendingRendererDiagnostics();
            },
            onFrameDrop,
        );

        this.loop.start();

        this.wakeLock?.detach();
        this.wakeLock = null;

        if (hwSettings.isWakeLockEnabled === true) {
            this.wakeLock = new WakeLock();
            this.wakeLock.attach();
        }

        this.orientation?.detach();
        this.orientation = new Orientation();
        this.orientation.attach(hwSettings.preferredOrientation ?? 'any', demo.onOrientationChange?.bind(demo) ?? null);

        this.attachReducedMotion(demo);

        console.log('[BT] Initialization complete');

        return true;
    }

    /**
     * Stops the active game loop and detaches input, audio, wake lock, orientation, and
     * reduced-motion subsystems.
     *
     * Pointer, keyboard, gamepad, audio, wake lock, orientation, and reduced-motion
     * subsystems are detached so listeners, polling state, the audio context, the held
     * wake lock sentinel, and the orientation/reduced-motion change listeners do not leak
     * across engine restarts (relevant in tests where the same DOM persists).
     *
     * Also clears {@link isFrameCaptureShortcutInFlight} and bumps
     * {@link frameCaptureShortcutGeneration}. A Shift+F9 capture or bare-F9 copy in flight
     * when `stop()` runs usually never settles (its render pass will now never happen), so
     * without the clear, every F9/Shift+F9 press after the next `init()` would silently
     * no-op forever. The generation bump additionally covers the rarer case where that
     * capture *was* already mid-GPU-readback (past `FrameCapture.executeInEncoder`) when
     * `stop()` ran - `FrameCapture.resolve()` keeps running independently of the game loop
     * once started, and can settle after a subsequent `init()` starts a new capture on a new
     * renderer; the bump stops that stale completion from clearing the new capture's guard.
     */
    public stop(): void {
        this.loop?.stop();
        this.isSeekParked = false;
        this.clearInputSubsystems();

        this.wakeLock?.detach();
        this.wakeLock = null;

        this.orientation?.detach();
        this.orientation = null;

        this.reducedMotion?.detach();
        this.reducedMotion = null;

        this.isFrameCaptureShortcutInFlight = false;
        this.frameCaptureShortcutGeneration++;
    }

    /**
     * Runs a Tier 2 hot-swap candidate's `init()` while the previous demo instance keeps
     * driving the loop, swapping {@link demo} to it only on success.
     *
     * Deliberately does not delegate to {@link runDemoInit}: that method calls
     * {@link clearInputSubsystems} on failure, which is correct for a cold-boot failure
     * (nothing else is running yet) but would tear down the pointer/keyboard/gamepad/audio
     * subsystems out from under the *previous* demo instance, which is still driving the
     * loop while this candidate's `init()` runs. A failed hot reload must leave the running
     * engine untouched.
     *
     * On success, also rebinds the orientation and reduced-motion subsystems' change
     * callbacks to the new instance via {@link Orientation.setOnChange} and
     * {@link ReducedMotion.setOnChange} - the listeners installed at {@link init} close over
     * the *previous* demo's bound `onOrientationChange` / `onReducedMotionChange`, so without
     * this, those events would keep reaching stale code after the swap.
     *
     * @param newDemo - Freshly constructed candidate demo instance.
     * @returns `true` when `newDemo.init()` succeeds and {@link demo} was swapped to it.
     */
    public async hotReplaceDemo(newDemo: IBTDemo): Promise<boolean> {
        if (typeof newDemo.update !== 'function' || typeof newDemo.render !== 'function') {
            console.error(
                '[BT] Hot reload failed; keeping the previous version running: ' +
                    'the new demo is missing update() or render()',
            );

            return false;
        }

        try {
            const ok = await newDemo.init();

            if (!ok) {
                console.error(
                    '[BT] Hot reload failed; keeping the previous version running: demo initialization failed',
                );

                return false;
            }
        } catch (err) {
            console.error('[BT] Hot reload failed; keeping the previous version running:', err);

            return false;
        }

        this.demo = newDemo;
        this.orientation?.setOnChange(newDemo.onOrientationChange?.bind(newDemo) ?? null);
        this.reducedMotion?.setOnChange(newDemo.onReducedMotionChange?.bind(newDemo) ?? null);

        return true;
    }

    /**
     * Gets the current tick count.
     * Ticks increment once per fixed update step (target rate set by `targetFPS`).
     *
     * @returns Number of update ticks since initialization or last reset.
     */
    public getTicks(): number {
        return this.loop?.getTicks() ?? 0;
    }

    /**
     * Resets the tick counter to zero.
     * Useful for timing-based demo events and animations.
     */
    public resetTicks(): void {
        this.loop?.resetTicks();
    }

    /**
     * Seeks the fixed-step clock and renders exactly the frame at `seconds`. See `BT.renderAt`.
     *
     * Calls are serialized: a second call waits for the first to finish.
     *
     * @param seconds - Target time; rounded to the nearest tick (`Math.round(seconds * targetFPS)`).
     * @param from - `'start'` (default) replays from tick 0; `'current'` steps forward only.
     * @returns Resolves after the target frame's `endFrame`; rejects on bad input, before init, or a failed `init()`.
     */
    public renderAt(seconds: number, from: RenderAtFrom = 'start'): Promise<void> {
        const run = this.seekChain.then(() => this.seek(seconds, from));

        this.seekChain = run.catch(() => undefined);

        return run;
    }

    /**
     * Restarts the game loop after {@link renderAt} left it stopped, from the seeked tick.
     *
     * Runs after every `renderAt` called before it has settled, and before any called after it, so it always
     * resumes from the seeked frame the caller asked for. A no-op when, by then, no seek holds the loop.
     *
     * @returns Resolves once the loop has restarted, or once the call turned out to be a no-op.
     */
    public resume(): Promise<void> {
        return this.seekChain.then(() => this.restartParkedLoop());
    }

    /**
     * Gets the fractional progress between the last completed fixed update and the next.
     *
     * @returns Interpolation alpha in `[0, 1)`; `0` before initialization.
     */
    public getRenderAlpha(): number {
        return this.loop?.getRenderAlpha() ?? 0;
    }

    /**
     * Assigns an event tag on the stats overlay timing chart.
     *
     * No-op when the overlay or timing chart is disabled.
     *
     * @param label - Tag text; empty becomes `"Untitled"`.
     */
    public assignTag(label?: string): void {
        this.overlay?.assignTag(label, this.getTicks());
    }

    /**
     * Gets the hardware settings used for the active demo (from `configure()` or
     * {@link defaultConfig}).
     *
     * @returns Hardware configuration, or null if not initialized.
     */
    public getHardwareSettings(): HardwareSettings | null {
        return this.hwSettings;
    }

    /**
     * Gets the initialized WebGPU device, or `null` on the software backend.
     *
     * @returns GPU device, or null if not initialized.
     */
    public getDevice(): GPUDevice | null {
        return this.device;
    }

    /**
     * Gets the configured WebGPU canvas context, or `null` on the software backend.
     *
     * @returns Canvas context, or null if not initialized.
     */
    public getContext(): GPUCanvasContext | null {
        return this.context;
    }

    /**
     * Gets the canvas bound during initialization.
     *
     * @returns HTML canvas element, or null if not initialized.
     */
    public getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * Gets the active demo instance.
     *
     * @returns Current demo, or null if not initialized.
     */
    public getDemo(): IBTDemo | null {
        return this.demo;
    }

    /**
     * Reports whether the engine has completed initialization.
     *
     * @returns `true` when both a demo and the game loop are live.
     */
    public isInitialized(): boolean {
        return this.demo !== null && this.loop !== null;
    }

    /**
     * Reports whether this is a development build; see {@link isDevMode}.
     *
     * @returns `true` for a dev build, `false` for release.
     */
    public isDevMode(): boolean {
        return isDevMode();
    }

    /**
     * Current splash lifecycle state.
     *
     * Reports `'disabled'` when gating turned the splash off, so no caller has to
     * branch on the animation states to answer "is it on screen".
     *
     * @returns The splash's state.
     */
    public getSplashState(): SplashState {
        return this.splash?.state ?? 'disabled';
    }

    /**
     * Whether the splash is on screen.
     *
     * @returns `true` while the splash is fading in, holding, or fading out.
     */
    public isSplashVisible(): boolean {
        return this.splash?.isVisible ?? false;
    }

    /**
     * Gets the total number of asset loads currently in flight across all loaders.
     *
     * Computed fresh on each read by summing {@link AssetLoader.loadingCount} and
     * {@link AudioClip.loadingCount} - stateless, no subscription or extra bookkeeping.
     *
     * @returns Combined count of in-flight image and audio clip loads.
     */
    public getLoadingAssetsCount(): number {
        return AssetLoader.loadingCount + AudioClip.loadingCount;
    }

    /**
     * Gets the audio subsystem, internal only; never exposed via the `BT` namespace.
     *
     * @returns Audio manager, or null if not initialized.
     */
    public getAudio(): AudioManager | null {
        return this.audio;
    }

    /**
     * Reports whether the audio context has been unlocked by a user gesture.
     *
     * @returns `true` once unlocked; `false` when locked or not initialized.
     */
    public isAudioUnlocked(): boolean {
        return this.audio?.isUnlocked() ?? false;
    }

    /**
     * Sets the logical volume for an audio bus, optionally fading to it.
     *
     * No-op when the audio subsystem is not initialized.
     *
     * @param bus - Audio bus to update.
     * @param volume - Target volume, clamped to `[0, 1]`.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     * @param easing - Easing curve for the fade. Defaults to `'linear'`; ignored when `fadeMs` is omitted.
     */
    public audioVolumeSet(bus: AudioBus, volume: number, fadeMs?: number, easing?: EasingFunction): void {
        this.audio?.volumeSet(bus, volume, fadeMs, easing);
    }

    /**
     * Gets the logical (pre-mute) volume for an audio bus.
     *
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`, or `0` when the audio subsystem is not initialized.
     */
    public audioVolumeGet(bus: AudioBus): number {
        return this.audio?.volumeGet(bus) ?? 0;
    }

    /**
     * Mutes or unmutes an audio bus.
     *
     * No-op when the audio subsystem is not initialized.
     *
     * @param bus - Audio bus to mute or unmute.
     * @param muted - `true` to mute, `false` to unmute.
     */
    public audioMuteSet(bus: AudioBus, muted: boolean): void {
        this.audio?.muteSet(bus, muted);
    }

    /**
     * Reports whether an audio bus is currently muted.
     *
     * @param bus - Audio bus to query.
     * @returns `true` when muted; `false` when unmuted or not initialized.
     */
    public isAudioMuted(bus: AudioBus): boolean {
        return this.audio?.isMuted(bus) ?? false;
    }

    /**
     * Plays a loaded audio clip through the SFX voice pool.
     *
     * Returns {@link INVALID_SOUND_REF} without allocating a voice when the clip's buffer isn't
     * available (not finished loading yet, or already unloaded) or when the audio subsystem is
     * not initialized, or while BT.renderAt is stepping through a seek, so a long seek never queues a burst of
     * sounds.
     *
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options; see {@link SoundPlayOptions}.
     * @returns A {@link SoundRef} identifying the new voice, or {@link INVALID_SOUND_REF}.
     */
    public soundPlay(clip: AudioClip, options?: SoundPlayOptions): SoundRef {
        if (clip.buffer === null || this.isSeeking) {
            return INVALID_SOUND_REF;
        }

        return this.audio?.playSound(clip.buffer, options) ?? INVALID_SOUND_REF;
    }

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @param ref - Sound to stop.
     * @param fadeOutMs - Optional linear fade-out duration in milliseconds.
     */
    public soundStop(ref: SoundRef, fadeOutMs?: number): void {
        this.audio?.soundStop(ref, fadeOutMs);
    }

    /**
     * Reports whether a sound is still playing.
     *
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` on a stale ref or when the audio subsystem is not initialized.
     */
    public isSoundPlaying(ref: SoundRef): boolean {
        return this.audio?.isSoundPlaying(ref) ?? false;
    }

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundVolumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundVolumeSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current gain.
     *
     * @param ref - Sound to query.
     * @returns Current gain in `[0, 1]`, or `1` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundVolumeGet(ref: SoundRef): number {
        return this.audio?.soundVolumeGet(ref) ?? 1;
    }

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundPitchSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current playback rate.
     *
     * @param ref - Sound to query.
     * @returns Current playback rate, or `1` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPitchGet(ref: SoundRef): number {
        return this.audio?.soundPitchGet(ref) ?? 1;
    }

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPanSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundPanSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current stereo pan.
     *
     * @param ref - Sound to query.
     * @returns Current pan, or `0` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPanGet(ref: SoundRef): number {
        return this.audio?.soundPanGet(ref) ?? 0;
    }

    /**
     * Plays a loaded audio clip through the music player, crossfading out whatever is currently
     * playing.
     *
     * No-ops when the clip's buffer isn't available (not finished loading yet, or already
     * unloaded), mirroring {@link soundPlay}, or when the audio subsystem is not initialized.
     *
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options; see {@link MusicPlayOptions}.
     */
    public musicPlay(clip: AudioClip, options?: MusicPlayOptions): void {
        if (clip.buffer === null) {
            return;
        }

        this.audio?.musicPlay(clip.buffer, options);
    }

    /**
     * Stops the music player, optionally fading out first.
     *
     * @param fadeMs - Optional linear fade-out duration in milliseconds; omit to stop immediately.
     */
    public musicStop(fadeMs?: number): void {
        this.audio?.musicStop(fadeMs);
    }

    /**
     * Reports whether music is currently playing.
     *
     * @returns `true` when the music player has a live current track; `false` when stopped, not
     *   yet started, or when the audio subsystem is not initialized.
     */
    public isMusicPlaying(): boolean {
        return this.audio?.isMusicPlaying() ?? false;
    }

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public musicVolumeSet(value: number, fadeMs?: number): void {
        this.audio?.musicVolumeSet(value, fadeMs);
    }

    /**
     * Gets the music player's current target volume.
     *
     * @returns Current target gain, or `1` when the audio subsystem is not initialized.
     */
    public musicVolumeGet(): number {
        return this.audio?.musicVolumeGet() ?? 1;
    }

    /**
     * Gets the renderer created during initialization.
     *
     * @returns Renderer instance, or null if not initialized.
     */
    public getRenderer(): IRenderer | null {
        return this.renderer;
    }

    /**
     * Returns the rendering backend requested for initialization.
     *
     * Mirrors resolved {@link HardwareSettings.backend} after `configure()` merge and
     * any `?backend=software` URL override. Defaults to `'webgpu'` when omitted.
     * Does not reflect WebGPU-to-software fallback; use {@link getActiveBackend} for that.
     *
     * @returns `'webgpu'` or `'software'` once hardware settings are loaded; `null` before that.
     */
    public getRequestedBackend(): Backend | null {
        if (!this.hwSettings) {
            return null;
        }

        return this.hwSettings.backend ?? 'webgpu';
    }

    /**
     * Returns the rendering backend that was actually initialized.
     *
     * @returns `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     */
    public getActiveBackend(): Backend | null {
        return this.activeBackend;
    }

    /**
     * Returns the current `screen.orientation.type` string when available.
     *
     * Does not require a successful init - reads the platform API directly.
     * Examples: `'landscape-primary'`, `'portrait-secondary'`.
     *
     * @returns Orientation type string, or `null` when the Screen Orientation API
     *   is unavailable.
     */
    public getScreenOrientation(): string | null {
        return Orientation.type;
    }

    /**
     * Reports whether reduced motion is currently preferred.
     *
     * Resolves the `?reducedmotion` / `?noreducedmotion` URL flags over the platform's own
     * `prefers-reduced-motion: reduce` match. Does not require a successful init - reads the
     * platform API directly, mirroring {@link getScreenOrientation}.
     *
     * @since 1.7.0
     * @returns `true` when reduced motion should be preferred.
     */
    public isReducedMotionPreferred(): boolean {
        return ReducedMotion.isPreferred;
    }

    /**
     * Gets the pointer input subsystem created during initialization.
     *
     * @returns Pointer input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getPointer(): PointerInput | null {
        return this.pointer;
    }

    /**
     * Gets the keyboard input subsystem created during initialization.
     *
     * @returns Keyboard input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getKeyboard(): KeyboardInput | null {
        return this.keyboard;
    }

    /**
     * Gets the gamepad input subsystem created during initialization.
     *
     * @returns Gamepad input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getGamepad(): GamepadInput | null {
        return this.gamepad;
    }

    /**
     * Gets the active engine palette.
     *
     * @returns Active palette, or null if none has been set.
     */
    public getPalette(): Palette | null {
        // While the splash owns the palette, the game must see its own palette,
        // not the splash's ramp - otherwise in-place slot edits and
        // spritesRefresh() would both target the wrong object. Null until the
        // game sets one, which matches the pre-paletteSet behavior it already
        // expects.
        return this.isCapturingPalette ? this.pendingPalette : this.palette;
    }

    /**
     * Default engine PRNG (live reference).
     *
     * Time-seeded when the singleton is created. Call {@link randomSeed} for a
     * reproducible sequence, or open the page with `?seed=N` - {@link init} applies that
     * seed before the demo's own `init()` runs, so a `randomSeed` call there still wins.
     *
     * @changed 1.7.1 `?seed=N` URL parameter seeds the shared generator before the demo's `init()`.
     * @returns The shared {@link Random} instance.
     */
    public getRandom(): Random {
        return this.random;
    }

    /**
     * Reseeds the default engine PRNG.
     *
     * Calling this from the demo's `init()` overrides a `?seed=N` URL parameter, which
     * {@link init} applies just before the demo's `init()`.
     *
     * @changed 1.7.1 Documented precedence over the `?seed=N` URL parameter.
     * @param seed - Any finite number; only its lower 32 bits are used.
     */
    public randomSeed(seed: number): void {
        this.random.seed(seed);
    }

    /**
     * Sets the active engine palette and propagates it to the renderer.
     *
     * If sprite sheets have already been indexized, emits a warning when
     * **replacing** the palette object (layout/index remapping may require
     * {@link BTAPI.spritesRefresh}). In-place slot value changes on the active
     * palette do not go through this method and need no refresh.
     *
     * @param palette - Palette to store as the active engine palette.
     */
    public setPalette(palette: Palette): void {
        if (this.spriteSheets.size > 0) {
            console.warn('[BT] Active palette structure changed. Call BT.spritesRefresh() to update loaded sprites.');
        }

        if (this.isCapturingPalette) {
            // The splash is on screen and owns the palette. Hold this until
            // handoff; the warning above still fires now, when the caller can
            // act on it.
            this.pendingPalette = palette;

            return;
        }

        this.installPalette(palette);
    }

    /**
     * Arms palette capture for the splash's duration.
     *
     * From here until {@link endPaletteCapture}, {@link setPalette} defers instead
     * of applying, and {@link getPalette} reports the deferred palette.
     */
    public beginPaletteCapture(): void {
        this.isCapturingPalette = true;
        this.pendingPalette = null;
    }

    /**
     * Disarms capture and performs the handoff into the game's palette.
     *
     * Installs the captured palette blackened, then brings it up with an exposure
     * fade so the splash fading down and the game fading up read as one continuous
     * in-camera move rather than a cut. When the game never called
     * `BT.paletteSet()` during `init()`, the splash's own palette is faded to black
     * instead, so the screen is black rather than showing stale splash grays until
     * the game sets a palette of its own.
     *
     * Palette effects started during capture are dropped: they hold snapshots of a
     * palette that is about to be replaced wholesale.
     *
     * @param reducedMotion - When `true`, skips the exposure fade entirely and installs the
     *   target colors immediately - no intermediate blackened state, no animation.
     */
    public endPaletteCapture(reducedMotion: boolean = false): void {
        const captured = this.pendingPalette;

        this.isCapturingPalette = false;
        this.pendingPalette = null;

        if (!captured) {
            const current = this.palette;

            if (current) {
                this.paletteEffects.clear();

                if (reducedMotion) {
                    current.copyFrom(createBlackened(current));
                } else {
                    this.paletteEffects.add(new ExposureFadeEffect(current, createBlackened(current), HANDOFF_FADE_MS));
                }
            }

            return;
        }

        if (reducedMotion) {
            this.installPalette(captured);

            return;
        }

        const target = captured.clone();

        for (let slot = 1; slot < captured.size; slot++) {
            captured.set(slot, Color32.black);
        }

        this.installPalette(captured);
        this.paletteEffects.add(new ExposureFadeEffect(captured, target, HANDOFF_FADE_MS));
    }

    /**
     * Sets the background clear color for each frame using a palette index.
     *
     * @param paletteIndex - Palette index for the clear color.
     */
    public setClearColor(paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.renderer?.setClearColor(paletteIndex);
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public clearRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.clearRect(rect, paletteIndex);
    }

    /**
     * Draws a single pixel at the specified position.
     *
     * @param pos - Pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawPixel(pos, paletteIndex);
    }

    /**
     * Draws a single pixel at raw coordinates.
     * More efficient than {@link drawPixel} when coordinates are already unpacked -
     * avoids constructing a `Vector2i` just to shuttle two numbers.
     *
     * @param x - X coordinate.
     * @param y - Y coordinate.
     * @param paletteIndex - Palette color index.
     */
    public drawPixelXY(x: number, y: number, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawPixelXY(x, y, paletteIndex);
    }

    /**
     * Draws a line between two points using Bresenham's algorithm.
     * Produces pixel-perfect lines without antialiasing.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    public drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawLine(p0, p1, paletteIndex);
    }

    /**
     * Draws a rectangle outline (unfilled).
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawRect(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font stores foreground pixels as palette index 1. The
     * `paletteIndex` parameter is converted to a sprite pipeline palette
     * offset so that each foreground pixel maps to `palette[paletteIndex]`.
     *
     * @param pos - Text position (top-left corner).
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to display.
     */
    public drawSystemText(pos: Vector2i, paletteIndex: number, text: string): void {
        this.assertPaletteIndex(paletteIndex);

        // Palette index 0 is transparent - nothing to draw.
        if (paletteIndex === TRANSPARENT_PALETTE_INDEX) {
            return;
        }

        if (this.systemFont) {
            this.trackPaletteIndexUsed(paletteIndex);
            this.markDrawCall();

            // Offset math: font stores foreground as index 1.
            // Shader computes 1 + (paletteIndex - 1) = paletteIndex.
            this.renderer?.drawBitmapText(this.systemFont, pos, text, paletteIndex - 1);
        }
    }

    /**
     * Returns the built-in system font, or null if not yet initialized.
     *
     * @returns The system BitmapFont instance.
     */
    public getSystemFont(): BitmapFont | null {
        return this.systemFont;
    }

    /**
     * Draws a sprite region from an indexed sprite sheet.
     * The renderer batches compatible sprite draws internally.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized via spriteSheet.indexize()).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw in (the top-left corner).
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the sprite sheet has not been indexized, or (dev mode only) if `destPos` is a `Rect2i`.
     */
    public drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        // Untyped callers passing a Rect2i here would get a silent unscaled draw at its top-left.
        // Dev builds only: release pays one boolean read.
        if (this.isDevGuardActive && (destPos as unknown) instanceof Rect2i) {
            throw new Error(
                'drawSprite with a Rect2i destination needs a params object: drawSprite(sheet, src, destRect, {})',
            );
        }

        this.submitSprite(spriteSheet, srcRect, destPos, paletteOffset, 0);
    }

    /**
     * Draws a sprite region with a params object (the params form of `BT.drawSprite`).
     * The params are read once into locals, never mutated or retained.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized via spriteSheet.indexize()).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param dest - A `Vector2i` (where the pivot lands, or the top-left of the post-flags, post-scale
     *   footprint without one) or a `Rect2i` (the box the footprint is stretched into).
     * @param params - Flags, pivot, scale, and palette offset.
     * @throws If `params` is null or an array, `dest` is neither a `Vector2i` nor a `Rect2i`, the flags,
     *   pivot, or scale are invalid, a `Rect2i` dest has a pivot or a non-neutral scale, or anything
     *   {@link drawSprite} rejects.
     */
    public drawSpriteWithParams(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        dest: Vector2i | Rect2i,
        params: SpriteDrawParams,
    ): void {
        if (params === null || Array.isArray(params)) {
            throw new Error(
                `drawSprite params must be a SpriteDrawParams object like { flags: BT.FLIP_H }, got ${params === null ? 'null' : 'an array'}`,
            );
        }

        // Absent fields take the documented defaults (no flip, scale 1, no palette shift).
        const orientation = resolveSpriteOrientation(params.flags ?? 0);
        const paletteOffset = params.paletteOffset ?? 0;
        const scale = resolveSpriteScale(params.scale, this.spriteScaleScratch);
        const isUnscaled = scale.x === 1 && scale.y === 1;
        const pivot = params.pivot;

        if (dest instanceof Rect2i) {
            if (pivot !== undefined) {
                throw new Error(
                    'drawSprite with a Rect2i destination takes no pivot: the rectangle already places the sprite. Leave pivot undefined',
                );
            }

            if (!isUnscaled) {
                throw new Error(
                    'drawSprite with a Rect2i destination takes no scale: the rectangle already sets the size. Pass scale: 1 or leave it out',
                );
            }

            this.submitSpriteStretched(
                spriteSheet,
                srcRect,
                // Rect2i fields are public and mutable: truncate like the constructor (NaN -> 0 draws nothing).
                dest.x | 0,
                dest.y | 0,
                dest.width | 0,
                dest.height | 0,
                paletteOffset,
                orientation,
            );
            return;
        }

        if (!(dest instanceof Vector2i)) {
            throw new Error('drawSprite with params takes a Vector2i or Rect2i destination');
        }

        const corner = this.resolveSpriteCorner(dest, pivot, orientation, srcRect, scale);

        // An unscaled point keeps the 1:1 / oriented path, so its output stays identical to overload 1.
        if (isUnscaled) {
            this.submitSprite(spriteSheet, srcRect, corner, paletteOffset, orientation);
            return;
        }

        // Scale multiplies the post-flags footprint in screen axes.
        // eslint-disable-next-line security/detect-object-injection
        const swap = (SPRITE_ORIENTATIONS[orientation] as SpriteOrientation).swap;
        const footprintW = swap ? srcRect.height : srcRect.width;
        const footprintH = swap ? srcRect.width : srcRect.height;

        this.submitSpriteStretched(
            spriteSheet,
            srcRect,
            corner.x,
            corner.y,
            footprintW * scale.x,
            footprintH * scale.y,
            paletteOffset,
            orientation,
        );
    }

    /**
     * Draws one tile from a sheet's own grid ({@link SpriteSheet.tileSize}).
     *
     * @param spriteSheet - Indexized sheet with a tile grid.
     * @param colOrIndex - Row-major index when `row` is `undefined`, otherwise the column.
     * @param row - Zero-based row, or `undefined` for the index form.
     * @param destPos - Screen position of the tile's top-left corner.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the sheet has no grid, the tile is outside it, or anything {@link drawSprite} rejects.
     */
    public drawTile(
        spriteSheet: SpriteSheet,
        colOrIndex: number,
        row: number | undefined,
        destPos: Vector2i,
        paletteOffset: number = 0,
    ): void {
        this.drawSprite(
            spriteSheet,
            writeGridTileRect(this.scratchTileRect, spriteSheet, colOrIndex, row),
            destPos,
            paletteOffset,
        );
    }

    /**
     * Draws one tile using a tile size given per call instead of the sheet's grid.
     *
     * @param spriteSheet - Indexized sheet.
     * @param col - Zero-based column.
     * @param row - Zero-based row.
     * @param tileW - Tile width in pixels.
     * @param tileH - Tile height in pixels.
     * @param destPos - Screen position of the tile's top-left corner.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the size or tile is invalid, or anything {@link drawSprite} rejects.
     */
    public drawTileSized(
        spriteSheet: SpriteSheet,
        col: number,
        row: number,
        tileW: number,
        tileH: number,
        destPos: Vector2i,
        paletteOffset: number = 0,
    ): void {
        this.drawSprite(
            spriteSheet,
            writeTileRect(this.scratchTileRect, spriteSheet, col, row, tileW, tileH),
            destPos,
            paletteOffset,
        );
    }

    /**
     * Draws a nine-slice panel into a box: corners at 1:1, edges and center stretched or tiled per the
     * nine-slice's modes. A box smaller than the corners crops them from their outer side.
     *
     * @param nineSlice - Panel from `NineSlice.fromSheet`.
     * @param destRect - Box to fill; empty, negative, or NaN sizes draw nothing.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If `nineSlice` is not a `NineSlice`, `destRect` is not a `Rect2i`, the palette offset is invalid,
     *   or the sheet has not been indexized. Validation runs before any quad is emitted.
     */
    public drawNineSlice(nineSlice: NineSlice, destRect: Rect2i, paletteOffset: number = 0): void {
        if (!(nineSlice instanceof NineSlice)) {
            throw new Error(
                'drawNineSlice expects a NineSlice; build one with NineSlice.fromSheet(sheet, outer, inner)',
            );
        }

        if (!(destRect instanceof Rect2i)) {
            throw new Error('drawNineSlice expects a Rect2i destination box');
        }

        const sheet = nineSlice.sheet;

        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(sheet);

        // Rect2i fields are public and mutable: truncate like the constructor (NaN -> 0 draws nothing).
        const destX = destRect.x | 0;
        const destY = destRect.y | 0;
        const destW = destRect.width | 0;
        const destH = destRect.height | 0;

        if (destW <= 0 || destH <= 0) {
            return;
        }

        // One count per API call (like drawBitmapText), however many quads it emits.
        this.markDrawCall();

        const { outer, inner } = nineSlice;
        const columns = this.nineSliceColumns;
        const rows = this.nineSliceRows;

        splitNineSliceAxis(destW, inner.x - outer.x, outer.right - inner.right, columns);
        splitNineSliceAxis(destH, inner.y - outer.y, outer.bottom - inner.bottom, rows);

        const right = columns[2] as number;
        const bottom = rows[2] as number;
        const srcXs = this.nineSliceSrcX;
        const srcYs = this.nineSliceSrcY;
        const boxXs = this.nineSliceBoxX;
        const boxYs = this.nineSliceBoxY;

        srcXs[0] = outer.x;
        srcXs[1] = inner.x;
        srcXs[2] = outer.right - right;
        srcYs[0] = outer.y;
        srcYs[1] = inner.y;
        srcYs[2] = outer.bottom - bottom;
        boxXs[0] = destX;
        boxXs[1] = destX + (columns[0] as number);
        boxXs[2] = destX + destW - right;
        boxYs[0] = destY;
        boxYs[1] = destY + (rows[0] as number);
        boxYs[2] = destY + destH - bottom;

        for (let row = 0; row < 3; row++) {
            // eslint-disable-next-line security/detect-object-injection
            const boxH = rows[row] as number;

            if (boxH === 0) {
                continue;
            }

            // eslint-disable-next-line security/detect-object-injection
            const srcY = srcYs[row] as number;
            const srcH = row === 1 ? inner.height : boxH;
            // eslint-disable-next-line security/detect-object-injection
            const boxY = boxYs[row] as number;

            for (let col = 0; col < 3; col++) {
                // eslint-disable-next-line security/detect-object-injection
                const boxW = columns[col] as number;

                if (boxW === 0) {
                    continue;
                }

                // eslint-disable-next-line security/detect-object-injection
                const srcX = srcXs[col] as number;
                const srcW = col === 1 ? inner.width : boxW;
                // eslint-disable-next-line security/detect-object-injection
                const boxX = boxXs[col] as number;
                const mode = nineSliceRegionMode(nineSlice, row, col);

                this.emitNineSliceRegion(sheet, srcX, srcY, srcW, srcH, boxX, boxY, boxW, boxH, mode, paletteOffset);
            }
        }
    }

    /**
     * Draws text using a bitmap font with variable-width glyphs.
     * Supports Unicode characters and per-glyph render offsets.
     *
     * @param font - Bitmap font containing character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     * @throws If the font's sprite sheet has not been indexized.
     */
    public drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(font.getSpriteSheet());

        if (this.renderer) {
            this.markBitmapTextPaletteUsage(font, text, paletteOffset);
        }

        this.markDrawCall();

        this.renderer?.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Re-indexizes all tracked sprite sheets against the current active palette.
     *
     * Call this after a **palette-layout swap** (same colors at new slot indices)
     * so every sprite sheet re-maps its original RGBA pixels against the new
     * layout. Not needed for in-place palette value changes.
     *
     * @throws If no active palette has been set.
     */
    public spritesRefresh(): void {
        // getPalette(), not this.palette: while the splash owns the screen this is the
        // game's captured palette, and reindexing sheets against the splash's gray ramp
        // would leave every sprite wrong once the handoff installs the real one.
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        let refreshed = 0;

        for (const sheet of this.spriteSheets) {
            if (!sheet.isIndexed()) {
                this.spriteSheets.delete(sheet);
                continue;
            }

            try {
                sheet.reindexize(palette);
                refreshed++;
            } catch (e) {
                console.error('[BT] spritesRefresh: failed to reindexize sheet, removing from registry:', e);
                this.spriteSheets.delete(sheet);
            }
        }

        console.log(`[BT] Refreshed ${refreshed} sprite sheet(s) against current palette`);
    }

    /**
     * Captures the next rendered frame as a PNG blob.
     * The capture occurs on the next completed render cycle. After `renderAt`, while the loop is stopped, the capture
     * re-renders the seeked frame instead of waiting for the next loop frame. Runs after every `renderAt` called before
     * it, so an un-awaited seek's frame is the one captured; a throw from that re-render rejects the capture.
     *
     * @param size - `'output'` (default) captures at `outputSize`; `'display'` captures at
     *   logical `displaySize` without the upscale or display-tier effects.
     * @returns Promise resolving to a PNG Blob.
     * @throws Error if the renderer is not initialized.
     */
    public captureFrame(size: FrameCaptureSize = 'output'): Promise<Blob> {
        if (!this.renderer) {
            return Promise.reject(new Error("Can't capture frame: renderer not initialized"));
        }

        const capture = size === 'display' ? this.renderer.captureFrameAtDisplaySize() : this.renderer.captureFrame();

        // The returned promise carries this request's result. When the re-render below throws, that
        // promise rejects with the render error and the renderer's request is abandoned; a later
        // supersede or reset rejection of it must not go unhandled.
        capture.catch(() => undefined);

        // After every renderAt called so far: while a seek holds the loop stopped no endFrame is coming,
        // so re-render the current tick (zero updates - no clock moves, the frame is the seeked one) to
        // settle the capture. A throw from render() rejects the returned promise instead of hanging it.
        return this.seekChain.then(() => {
            if (this.isSeekParked) {
                this.loop?.step(0);
            }

            return capture;
        });
    }

    /**
     * Sets the camera offset for scrolling effects.
     * The offset is applied to subsequent renderer draw calls.
     *
     * @param offset - Camera position offset in pixels.
     */
    public setCameraOffset(offset: Vector2i): void {
        this.pendingCameraReset = false;
        this.lastCameraOffset = offset.clone();
        this.renderer?.setCameraOffset(offset);
    }

    /**
     * Gets the current camera offset.
     *
     * @returns Current camera position offset.
     */
    public getCameraOffset(): Vector2i {
        return this.renderer?.getCameraOffset() ?? Vector2i.zero();
    }

    /**
     * Resets the camera offset to (0, 0).
     *
     * Its effect on the offset the engine re-applies at the start of the next frame is
     * deferred to the next fixed-update tick - see {@link pendingCameraReset}.
     */
    public resetCamera(): void {
        this.pendingCameraReset = true;
        this.renderer?.resetCamera();
    }

    /**
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation. Runs indefinitely until canceled
     * via {@link paletteClearEffects}.
     *
     * @param start - First palette index in the cycling range (inclusive).
     * @param end - Last palette index in the cycling range (inclusive).
     * @param speed - Steps per second. Positive = forward, negative = backward.
     */
    public paletteCycle(start: number, end: number, speed: number): void {
        if (!Number.isFinite(speed)) {
            throw new Error(`paletteCycle: 'speed' should be a number (got ${speed}).`);
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
            throw new Error(`paletteCycle: start must be an integer less than end, got [${start}, ${end}].`);
        }

        this.paletteEffects.add(new CycleEffect(start, end, speed));
    }

    /**
     * Smoothly interpolates all palette entries toward a target over time.
     *
     * Snapshots the current palette at start. Auto-removes when complete.
     *
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    public paletteFade(target: Palette, durationMs: number, easing?: EasingFunction): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFade', durationMs);
        this.paletteEffects.add(new FadeEffect(palette, target, durationMs, easing));
    }

    /**
     * Fades all palette entries toward a target the way an iris pull does.
     *
     * Interpolates each RGB channel in linear light rather than in encoded
     * values, and offsets each entry's schedule by its luminance. With black at
     * one end that is a straight scaling of light. Auto-removes when complete.
     *
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param options - Highlight lead and easing curve.
     */
    public paletteFadeExposure(target: Palette, durationMs: number, options?: ExposureFadeOptions): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFadeExposure', durationMs);
        this.paletteEffects.add(new ExposureFadeEffect(palette, target, durationMs, options));
    }

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * @param start - First palette index to fade (inclusive).
     * @param end - Last palette index to fade (inclusive).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    public paletteFadeRange(
        start: number,
        end: number,
        target: Palette,
        durationMs: number,
        easing?: EasingFunction,
    ): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFadeRange', durationMs);
        this.paletteEffects.add(new FadeRangeEffect(start, end, palette, target, durationMs, easing));
    }

    /**
     * Temporarily sets all non-zero palette entries to a single color, then restores.
     *
     * Index 0 (transparent) is preserved. Auto-removes after duration.
     *
     * @param color - Flash color applied to all non-zero entries.
     * @param durationMs - How long the flash lasts in milliseconds.
     */
    public paletteFlash(color: Color32, durationMs: number): void {
        if (!this.getPalette()) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFlash', durationMs);
        this.paletteEffects.add(new FlashEffect(color, durationMs));
    }

    /**
     * Instantly exchanges two palette entries.
     *
     * This is an immediate operation, not an animated effect.
     *
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     */
    public paletteSwap(indexA: number, indexB: number): void {
        // getPalette(), so a swap during the splash edits the game's captured palette
        // instead of corrupting the ramp the splash is still animating on screen.
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        paletteSwap(palette, indexA, indexB);
    }

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when canceled.
     */
    public paletteClearEffects(): void {
        this.paletteEffects.clear();
    }

    /**
     * Appends a fullscreen post-processing effect to the appropriate tier chain.
     *
     * `'pixel'` effects run on the logical `r8uint` index buffer at
     * `displaySize`. `'display'` effects run on the RGBA upscale output and
     * require `drawingBufferSize` in hardware settings. Effects run in
     * registration order within each tier.
     *
     * @param effect - Effect instance to append.
     * @throws Error if the renderer has not been initialized.
     */
    public effectAdd(effect: Effect): void {
        if (!this.renderer) {
            throw new Error('Cannot add effect: renderer not initialized.');
        }

        this.renderer.addEffect(effect);
    }

    /**
     * Removes a previously registered post-processing effect.
     *
     * Calls the effect's optional dispose hook. Removing an effect that was
     * never added is a no-op. When the last effect is removed the renderer
     * reverts to drawing directly to the swap chain on the next frame.
     *
     * @param effect - Effect instance to remove.
     * @throws Error if the renderer has not been initialized.
     */
    public effectRemove(effect: Effect): void {
        if (!this.renderer) {
            throw new Error('Cannot remove effect: renderer not initialized.');
        }

        this.renderer.removeEffect(effect);
    }

    /**
     * Removes every registered post-processing effect.
     *
     * @throws Error if the renderer has not been initialized.
     */
    public effectClear(): void {
        if (!this.renderer) {
            throw new Error('Cannot clear effects: renderer not initialized.');
        }

        this.renderer.clearEffects();
    }

    /**
     * Top-left of the post-flags, post-scale footprint for a `Vector2i` destination: `dest`, minus the pivot
     * sent through the orientation's point map and multiplied by `scale` when one is set. Every draw takes
     * this one path. Components are truncated, since `Vector2i` fields are public and mutable.
     *
     * @param dest - Destination point.
     * @param pivot - `SpriteDrawParams.pivot`.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @param srcRect - Source region (its size is the point map's `sw x sh`).
     * @param scale - Resolved integer scale.
     * @returns A shared scratch vector; renderers copy it when they queue the draw.
     * @throws If `pivot` is neither `undefined` nor a `Vector2i`.
     */
    private resolveSpriteCorner(
        dest: Vector2i,
        pivot: Vector2i | undefined,
        orientation: number,
        srcRect: Rect2i,
        scale: Vector2i,
    ): Vector2i {
        const corner = this.spriteCornerScratch;

        if (pivot === undefined) {
            return corner.set(dest.x | 0, dest.y | 0);
        }

        if (!(pivot instanceof Vector2i)) {
            throw new Error('drawSprite params.pivot must be a Vector2i or undefined');
        }

        mapSpritePoint(orientation, pivot.x | 0, pivot.y | 0, srcRect.width, srcRect.height, corner);

        return corner.set((dest.x | 0) - corner.x * scale.x, (dest.y | 0) - corner.y * scale.y);
    }

    /**
     * Whether Shift+F9 was pressed this tick, per {@link HardwareSettings.isFrameCaptureShortcutEnabled}
     * gating and both Shift key codes. Extracted from the fixed-update tick closure to keep
     * its cyclomatic complexity within lint limits.
     *
     * @param tick - Current fixed-update tick, for the keyboard's edge-detection window.
     * @returns `true` when Shift+F9 was pressed this tick and the shortcut is enabled.
     */
    private isShiftF9ShortcutPressed(tick: number): boolean {
        return (
            isFrameCaptureShortcutEnabled(this.hwSettings?.isFrameCaptureShortcutEnabled) &&
            SHIFT_KEY_CODES.some((code) => this.keyboard?.isKeyDown(code)) &&
            this.keyboard?.isKeyPressed(FRAME_CAPTURE_SHORTCUT_KEY_CODE, undefined, tick) === true
        );
    }

    /**
     * Engine tick clock in milliseconds: `ticks * 1000 / targetFPS`. Palette effects and post-process
     * effects read this instead of `performance.now()`, which is what makes `BT.renderAt` exact.
     *
     * @returns Milliseconds of fixed-step time since init or the last tick reset.
     */
    private getTickClockMs(): number {
        return this.getTicks() * this.updateIntervalMs;
    }

    /**
     * Tick-clock milliseconds since the previous loop render, for post-process effects. Clamped at
     * 0 so a clock reset (`BT.ticksReset()`) never runs effect time backwards.
     *
     * @returns Non-negative effect time for this frame.
     */
    private consumeFrameDeltaMs(): number {
        const nowMs = this.getTickClockMs();
        const deltaMs = Math.max(0, nowMs - this.lastRenderClockMs);

        this.lastRenderClockMs = nowMs;

        return deltaMs;
    }

    /**
     * Applies a deferred {@link resetCamera} to {@link lastCameraOffset}, if one is pending.
     * Called at the start of the fixed-update tick, before the demo's own `update()` runs, so a
     * `setCameraOffset()` call inside that `update()` overrides it normally - see
     * {@link pendingCameraReset}.
     */
    private commitPendingCameraReset(): void {
        if (this.pendingCameraReset) {
            this.pendingCameraReset = false;
            this.lastCameraOffset = Vector2i.zero();
        }
    }

    /**
     * Bound `keydown` listener for the bare-F9 clipboard-copy shortcut, attached directly to
     * the canvas by {@link attachInputSubsystems} alongside {@link KeyboardInput} rather than
     * polled from the fixed-update tick. `navigator.clipboard.write()` needs to run inside
     * the browser's synchronous `keydown` dispatch to reliably count as tied to the
     * triggering user gesture in Firefox and Safari, which can reject the call once a task
     * boundary - not just a microtask/await boundary - has passed since the keypress; a
     * `GameLoop` tick is always scheduled via `requestAnimationFrame`, a later task than the
     * `keydown` event that triggers it. Reads `event.shiftKey` and `event.repeat` directly
     * instead of {@link KeyboardInput}'s tracked state, so this needs no coordination with
     * that tracker. Shift+F9 (the file-download path, see {@link isShiftF9ShortcutPressed})
     * stays on the tick-based check - its `downloadBlob` call has no equivalent
     * user-activation staleness constraint, so there is nothing to gain by moving it too.
     *
     * @param event - Native `keydown` event dispatched to the canvas.
     */
    private readonly handleClipboardShortcutKeydown = (event: KeyboardEvent): void => {
        if (
            event.code !== FRAME_CAPTURE_SHORTCUT_KEY_CODE ||
            event.shiftKey ||
            event.repeat ||
            this.isFrameCaptureShortcutInFlight ||
            !isFrameCaptureShortcutEnabled(this.hwSettings?.isFrameCaptureShortcutEnabled)
        ) {
            return;
        }

        this.copyFrameViaShortcut();
    };

    /**
     * Captures the current frame and downloads it under a timestamped filename, for the
     * Shift+F9 dev-mode shortcut. Captures at logical `BT.displaySize`, not `BT.outputSize`
     * (unlike the public {@link captureFrame}/`downloadFrame`), so the saved file stays
     * pixel-for-pixel with the logical canvas even when `drawingBufferSize` is set for
     * display-tier post-process effects; the shortcut's capture excludes those effects for
     * the same reason. Fire-and-forget from the update tick: errors are logged, not thrown,
     * so a failed capture never crashes the game loop.
     */
    private async captureFrameViaShortcut(): Promise<void> {
        const generation = this.frameCaptureShortcutGeneration;

        this.isFrameCaptureShortcutInFlight = true;

        try {
            if (!this.renderer) {
                throw new Error("Can't capture frame: renderer not initialized");
            }

            const blob = await this.renderer.captureFrameForShortcut();
            const filename = defaultFrameCaptureFilename();

            downloadBlob(blob, filename);
            console.log(`[BT] Frame captured: ${filename}`);
        } catch (error) {
            console.error('[BT] Frame capture (Shift+F9) failed:', error);
        } finally {
            // Only clear the guard if stop() hasn't bumped the generation since this
            // capture started - see frameCaptureShortcutGeneration's doc comment.
            if (generation === this.frameCaptureShortcutGeneration) {
                this.isFrameCaptureShortcutInFlight = false;
            }
        }
    }

    /**
     * Copies the current frame to the OS clipboard as a PNG, for the bare-F9 dev-mode
     * shortcut. Called synchronously from {@link handleClipboardShortcutKeydown}'s DOM
     * keydown handler, not polled from the update tick - see that field's doc comment for
     * why. Errors are logged, not thrown, so a failed copy never crashes the caller.
     *
     * Deliberately not `async`/`await`: this method's own body must stay synchronous up to
     * the `navigator.clipboard.write()` call inside {@link writeBlobToClipboard}, so the
     * call happens within the same synchronous call stack as the triggering `keydown`
     * event - some browsers invalidate sticky user activation once a task boundary (not
     * just a microtask/await) has passed, and reject `clipboard.write()` as not
     * user-initiated if it runs after one. Passing the still-pending
     * `captureFrameForShortcut()` promise straight into `writeBlobToClipboard` (rather
     * than awaiting it here first) is what keeps the write call itself synchronous; the
     * capture completing is unavoidably async (it waits on the next render pass's GPU
     * readback), so this is the most that can be done to keep the write attempt tied to the
     * gesture. Captures at logical `BT.displaySize`, matching the Shift+F9 save shortcut,
     * not `BT.outputSize`.
     */
    private copyFrameViaShortcut(): void {
        if (!this.renderer) {
            console.error('[BT] Frame copy (F9) failed: renderer not initialized');

            return;
        }

        const clipboard = globalThis.navigator?.clipboard;

        if (!clipboard?.write || typeof ClipboardItem === 'undefined') {
            // Expected in a same-origin iframe missing an explicit allow="clipboard-write"
            // attribute, and in insecure (non-HTTPS/non-localhost) contexts - surfaced clearly
            // so it reads as "your embed/host is missing a permissions grant", not an engine bug.
            console.error(
                '[BT] Frame copy (F9) failed: Clipboard API unavailable (missing HTTPS/localhost, or a hosting iframe is missing allow="clipboard-write")',
            );

            return;
        }

        const generation = this.frameCaptureShortcutGeneration;

        this.isFrameCaptureShortcutInFlight = true;

        // The clipboard.write() call inside writeBlobToClipboard() has already started
        // synchronously by this point; awaiting its result is handled separately so this
        // method itself never becomes `async` (see the class doc above).
        void this.settleFrameCopy(writeBlobToClipboard(this.renderer.captureFrameForShortcut()), generation);
    }

    /**
     * Awaits an in-flight bare-F9 clipboard write and clears
     * {@link isFrameCaptureShortcutInFlight} once it settles. Split out of
     * {@link copyFrameViaShortcut} so that method's own body can stay synchronous up to the
     * `navigator.clipboard.write()` call - see its doc comment.
     *
     * @param writePromise - Promise returned by `writeBlobToClipboard`, already in flight.
     * @param generation - {@link frameCaptureShortcutGeneration} at the moment this copy
     *   started; the guard clears only if it still matches once `writePromise` settles.
     */
    private async settleFrameCopy(writePromise: Promise<void>, generation: number): Promise<void> {
        try {
            await writePromise;
            console.log('[BT] Frame copied to clipboard');
        } catch (error) {
            console.error('[BT] Frame copy (F9) failed:', error);
        } finally {
            if (generation === this.frameCaptureShortcutGeneration) {
                this.isFrameCaptureShortcutInFlight = false;
            }
        }
    }

    /**
     * Bound supplier for {@link IBTDemo.overlayRows}, passed to `Overlay.handleFrameInput` and
     * `Overlay.updateAndRender`. A field instead of an inline closure at each call site so the
     * two call sites (input handling, then draw) do not each allocate a fresh arrow function
     * every frame.
     *
     * @returns Current demo's overlay rows, if any.
     */
    private readonly getDemoOverlayRows = (): readonly OverlayRow[] | undefined => this.demo?.overlayRows?.();

    /**
     * Reads and validates demo `configure()` output into resolved hardware settings.
     *
     * @param demo - Demo implementing {@link IBTDemo}.
     * @returns `false` when hardware settings are invalid (bad dimensions, targetFPS, or audioVoices).
     */
    private loadHardwareSettings(demo: IBTDemo): boolean {
        try {
            this.hwSettings = mergeHardwareSettings(demo.configure?.());
        } catch (error) {
            console.error('[BT] demo.configure() threw; falling back to defaultConfig()', error);

            this.hwSettings = defaultConfig();
        }

        this.applyBackendQueryOverride();

        const renderDimensionError = validateDimensions(this.hwSettings);

        if (renderDimensionError) {
            console.error(`[BT] ${renderDimensionError}`);

            return false;
        }

        const { targetFPS } = this.hwSettings;

        if (!Number.isFinite(targetFPS) || targetFPS <= 0) {
            console.error(`[BT] Invalid targetFPS: ${targetFPS}. Must be a finite number > 0.`);

            return false;
        }

        const { audioVoices } = this.hwSettings;

        if (audioVoices !== undefined && (!Number.isInteger(audioVoices) || audioVoices < 1 || audioVoices > 64)) {
            console.error(`[BT] ${errorMessages.audioVoicesRangeError(audioVoices)}`);

            return false;
        }

        return true;
    }

    /**
     * Creates the engine overlay when enabled in hardware settings.
     */
    private setupOverlay(): void {
        this.overlay = null;

        const hw = this.hwSettings;

        if (!hw || hw.isOverlayEnabled === false || !this.systemFont) {
            return;
        }

        const lineHeight = this.systemFont.measureTextSize('A').height;
        const layout = createOverlayLayout(hw.displaySize.x, hw.displaySize.y, lineHeight);
        const pageTitle = typeof globalThis.document === 'undefined' ? undefined : globalThis.document.title;

        if (!this.activeBackend) {
            throw new Error(errorMessages.OVERLAY_NO_BACKEND);
        }

        this.overlay = new Overlay(
            layout,
            resolveOverlayTopLeftLabel(pageTitle),
            hw.targetFPS,
            this.activeBackend,
            hw.overlayStyle,
            hw.isOverlayPaletteEnabled === true,
            hw.overlayPaletteColumns,
            hw.overlayPaletteRowsVisible,
            hw.isOverlayTimingChartEnabled === true,
            hw.overlayTimingChartStyle,
            hw.overlayTimingChartHeight,
            resolveOverlayTimingChartDiagnostics(hw),
            hw.isOverlayRendererDiagnosticsBarEnabled === true,
            hw.isOverlayVisibleAtStart === true,
            hw.isOverlayToggleHintVisible !== false,
            hw.isOverlayToggleEnabled !== false,
            hw.isOverlayToggleHitDebugVisible === true,
            hw.isOverlayAudioMetersEnabled === true,
            hw.overlayAudioMeterStyle,
            hw.overlayAudioMeterHeight,
        );
    }

    /**
     * Attaches pointer, keyboard, and gamepad input to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    private attachInputSubsystems(canvas: HTMLCanvasElement): void {
        const hw = this.hwSettings;

        if (!hw) {
            return;
        }

        this.pointer?.detach();
        this.pointer = new PointerInput();
        this.pointer.attach(canvas, hw.displaySize);
        this.pointer.setIsCapturingScroll(hw.isCapturingPointerScroll === true);

        this.keyboard?.detach();
        this.keyboard = new KeyboardInput();
        this.keyboard.attach(canvas, {
            getTicks: () => this.loop?.getTicks() ?? 0,
        });
        this.keyboard.setIsCapturingScroll(hw.isCapturingKeyboardScroll === true);
        // Seed the keyboard maps before the game's init() runs, so BT.inputMap calls there win.
        setKeyboardLayout(hw.keyboardLayout ?? 'versus');

        // Own listener, separate from KeyboardInput - see handleClipboardShortcutKeydown's
        // doc comment. Remove-before-add guards against a duplicate registration if this
        // method ever runs twice against the same canvas.
        canvas.removeEventListener('keydown', this.handleClipboardShortcutKeydown);
        canvas.addEventListener('keydown', this.handleClipboardShortcutKeydown);

        this.gamepad?.detach();
        this.gamepad = new GamepadInput();
        this.gamepad.attach();
    }

    /**
     * Attaches the audio context, bus graph, and unlock listeners to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    private attachAudioSubsystem(canvas: HTMLCanvasElement): void {
        const hw = this.hwSettings;

        if (!hw) {
            return;
        }

        this.audio?.detach();
        this.audio = new AudioManager();
        this.audio.attach(canvas);

        if (this.isCollectAudioMetersEnabled) {
            this.audio.enableBusMetering();
        }
    }

    /**
     * Attaches the reduced-motion preference listener, binding the demo callback.
     *
     * Extracted from {@link init} to keep that method's cyclomatic complexity within the
     * project's lint threshold, following the same pattern as {@link attachInputSubsystems}
     * and {@link attachAudioSubsystem}.
     *
     * @param demo - Active demo instance whose optional {@link IBTDemo.onReducedMotionChange}
     *   hook is bound.
     */
    private attachReducedMotion(demo: IBTDemo): void {
        this.reducedMotion?.detach();
        this.reducedMotion = new ReducedMotion();
        this.reducedMotion.attach(demo.onReducedMotionChange?.bind(demo) ?? null);
    }

    /**
     * Constructs and initializes the renderer for the active hardware settings.
     *
     * Logs the selected backend name, constructs the matching {@link IRenderer},
     * calls {@link IRenderer.init}, and reports success or failure.
     *
     * @param canvas - Render target canvas.
     * @param hw - Active hardware settings.
     * @returns `true` when the renderer is ready; `false` on failure.
     */
    private async initRenderer(canvas: HTMLCanvasElement, hw: HardwareSettings): Promise<boolean> {
        applyCanvasLayoutStyles(canvas, {
            displaySize: hw.displaySize,
            maxCanvasSize: hw.maxCanvasSize ?? new Vector2i(DEFAULT_MAX_CANVAS_SIZE.x, DEFAULT_MAX_CANVAS_SIZE.y),
            ...(hw.drawingBufferSize === undefined ? {} : { drawingBufferSize: hw.drawingBufferSize }),
        });

        const requestedBackend = hw.backend ?? 'webgpu';

        if (requestedBackend !== 'software') {
            // Try WebGPU. initWebGPU returns null when navigator.gpu is absent and
            // throws when the adapter or device cannot be created. Both cases fall
            // through to the software renderer below.
            let webGPUResult: Awaited<ReturnType<typeof initWebGPU>> = null;

            try {
                webGPUResult = await initWebGPU(canvas, hw.displaySize, hw.drawingBufferSize);
            } catch (error) {
                if (error instanceof RenderDimensionLimitError) {
                    return false;
                }

                // Adapter/device unavailable; fall through to software.
            }

            if (webGPUResult) {
                this.device = webGPUResult.device;
                this.context = webGPUResult.context;

                console.log('[BT] Initializing renderer (backend: webgpu)');

                this.renderer = new WebGPURenderer(
                    webGPUResult.device,
                    webGPUResult.context,
                    hw.displaySize,

                    // Only forward an explicit outputSize when drawingBufferSize was
                    // provided; that is the signal that unlocks the display tier.
                    hw.drawingBufferSize === undefined ? undefined : webGPUResult.drawingBufferSize,
                    hw.outputUpscaleFilter ?? 'nearest',
                    hw.isOverlayEnabled !== false,
                );

                if (!(await this.renderer.init())) {
                    console.error('[BT] Failed to initialize renderer');

                    return false;
                }

                this.activeBackend = 'webgpu';
                console.log('[BT] Renderer initialized');

                return true;
            }

            console.warn('[BT] WebGPU unavailable, falling back to software renderer');
        }

        // Software renderer path: explicit selection or automatic fallback.
        this.device = null;
        this.context = null;

        console.log('[BT] Initializing renderer (backend: software)');

        this.renderer = new SoftwareRenderer(canvas, hw.displaySize, hw.drawingBufferSize);

        if (!(await this.renderer.init())) {
            console.error('[BT] Failed to initialize renderer');

            return false;
        }

        this.activeBackend = 'software';
        console.log('[BT] Renderer initialized');

        return true;
    }

    /**
     * Applies URL backend override from `?backend=...` when present.
     *
     * Supported values:
     * - `software`
     *
     * Unknown values are ignored so accidental query typos do not break startup.
     */
    private applyBackendQueryOverride(): void {
        if (!this.hwSettings) {
            return;
        }

        const override = BTAPI.getBackendQueryOverride();

        if (!override) {
            return;
        }

        this.hwSettings.backend = override;

        console.info(`[BT] URL override selected backend: ${override}`);
    }

    /**
     * Removes pointer, keyboard, gamepad, and audio subsystems.
     *
     * Pointer/keyboard detach DOM listeners; gamepad detaches polling state; audio
     * detaches unlock listeners and closes the audio context. All subsystem
     * references are cleared so listeners/contexts do not leak across restarts. Also
     * removes {@link handleClipboardShortcutKeydown}, the bare-F9 listener attached
     * directly to the canvas outside `KeyboardInput`.
     */
    private clearInputSubsystems(): void {
        this.pointer?.detach();
        this.pointer = null;

        this.keyboard?.detach();
        this.keyboard = null;

        this.canvas?.removeEventListener('keydown', this.handleClipboardShortcutKeydown);

        this.gamepad?.detach();
        this.gamepad = null;

        this.audio?.detach();
        this.audio = null;
    }

    /**
     * Runs the demo's async {@link IBTDemo.init}. On throw or
     * `false`, clears input and audio subsystems that were attached earlier in
     * the init sequence.
     *
     * @param demo - Active demo instance.
     * @returns `true` when the demo reports success.
     */
    private async runDemoInit(demo: IBTDemo): Promise<boolean> {
        try {
            const ok = await demo.init();

            if (!ok) {
                console.error('[BT] Demo initialization failed');

                this.clearInputSubsystems();

                return false;
            }

            return true;
        } catch (err) {
            console.error('[BT] Demo initialization threw', err);

            this.clearInputSubsystems();

            return false;
        }
    }

    /**
     * Records dropped-frame severity for the timing chart and optionally logs a warning.
     *
     * The {@link GameLoop} auto-calibrates its baseline to the actual rAF cadence,
     * so sustained slowness re-baselines instead of generating sustained log spam.
     *
     * @param event - Dropped-frame event from {@link GameLoop}.
     * @param logToConsole - When true, emits a one-line console warning.
     */
    private handleFrameDrop(event: FrameDropEvent, logToConsole: boolean): void {
        this.overlayTiming.droppedFrames = event.droppedFrames;

        if (logToConsole) {
            console.warn(
                `[BT] Dropped ${event.droppedFrames} frame(s) ` +
                    `(frame time ${event.deltaTime.toFixed(1)}ms, expected ${event.expectedInterval.toFixed(1)}ms)`,
            );
        }
    }

    /**
     * Validates and submits one sprite draw shared by {@link drawSprite} and {@link drawSpriteWithParams}.
     * Orientation `0` goes to the renderer's plain `drawSprite`, so overload 1 output stays unchanged.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Top-left of the (post-flags) footprint.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @throws If the palette offset is invalid or the sprite sheet has not been indexized.
     */
    private submitSprite(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(spriteSheet);

        if (this.renderer && this.isTrackingFramePaletteUsage()) {
            spriteSheet.markPaletteIndicesInRect(srcRect, paletteOffset, this.framePaletteUsageMask);
        }

        this.markDrawCall();

        if (orientation === 0) {
            this.renderer?.drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
        } else {
            this.renderer?.drawSpriteOriented(spriteSheet, srcRect, destPos, paletteOffset, orientation);
        }
    }

    /**
     * Validates and submits one stretched draw (integer scale or a `Rect2i` destination). An empty box draws
     * nothing: a computed size of 0 (an empty bar) is normal layout, not an error.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destX - Box left edge.
     * @param destY - Box top edge.
     * @param destW - Box width; `<= 0` draws nothing.
     * @param destH - Box height; `<= 0` draws nothing.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @throws If the palette offset is invalid or the sprite sheet has not been indexized.
     */
    private submitSpriteStretched(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destX: number,
        destY: number,
        destW: number,
        destH: number,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(spriteSheet);

        if (destW <= 0 || destH <= 0 || srcRect.width <= 0 || srcRect.height <= 0) {
            return;
        }

        if (this.renderer && this.isTrackingFramePaletteUsage()) {
            spriteSheet.markPaletteIndicesInRect(srcRect, paletteOffset, this.framePaletteUsageMask);
        }

        this.markDrawCall();

        this.renderer?.drawSpriteStretched(
            spriteSheet,
            srcRect,
            destX,
            destY,
            destW,
            destH,
            paletteOffset,
            orientation,
        );
    }

    /**
     * Emits one nine-slice region straight to the renderer (validation already ran in `drawNineSlice`).
     * Stretch is one stretched quad; tile is 1:1 quads stepping by the strip size from the box's top-left,
     * with the last column and row cropped.
     *
     * @param sheet - Indexized source sheet.
     * @param srcX - Strip left edge in the sheet.
     * @param srcY - Strip top edge in the sheet.
     * @param srcW - Strip width (at least 1).
     * @param srcH - Strip height (at least 1).
     * @param boxX - Box left edge.
     * @param boxY - Box top edge.
     * @param boxW - Box width (at least 1).
     * @param boxH - Box height (at least 1).
     * @param mode - Fill mode (corners arrive as `'tile'`).
     * @param paletteOffset - Validated palette offset.
     */
    private emitNineSliceRegion(
        sheet: SpriteSheet,
        srcX: number,
        srcY: number,
        srcW: number,
        srcH: number,
        boxX: number,
        boxY: number,
        boxW: number,
        boxH: number,
        mode: NineSliceMode,
        paletteOffset: number,
    ): void {
        const src = this.scratchNineSliceSrc;
        const isStretch = mode === 'stretch';

        src.x = srcX;
        src.y = srcY;
        // A stretch samples the whole strip; tiles never reach past the box, so mark only what shows.
        src.width = isStretch ? srcW : Math.min(srcW, boxW);
        src.height = isStretch ? srcH : Math.min(srcH, boxH);

        if (this.renderer && this.isTrackingFramePaletteUsage()) {
            sheet.markPaletteIndicesInRect(src, paletteOffset, this.framePaletteUsageMask);
        }

        if (isStretch) {
            this.renderer?.drawSpriteStretched(sheet, src, boxX, boxY, boxW, boxH, paletteOffset, 0);
            return;
        }

        const dest = this.scratchNineSliceDest;

        for (let tileY = 0; tileY < boxH; tileY += srcH) {
            for (let tileX = 0; tileX < boxW; tileX += srcW) {
                src.width = Math.min(srcW, boxW - tileX);
                src.height = Math.min(srcH, boxH - tileY);
                dest.x = boxX + tileX;
                dest.y = boxY + tileY;
                this.renderer?.drawSprite(sheet, src, dest, paletteOffset);
            }
        }
    }

    /**
     * Validates that a sprite sheet has been indexized and registers it for refresh tracking.
     *
     * @param sheet - Sprite sheet to validate.
     * @throws If the sprite sheet has not been indexized.
     */
    private requireIndexizedSheet(sheet: SpriteSheet): void {
        if (!sheet.isIndexed()) {
            throw new Error(spriteNotIndexizedError());
        }

        this.spriteSheets.add(sheet);
    }

    /**
     * Validates that a duration is a finite, non-negative number.
     *
     * @param method - Calling method name for the error message.
     * @param durationMs - Duration to validate.
     * @throws Error if the duration is not finite or is negative.
     */
    private assertFiniteDuration(method: string, durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            throw new Error(`${method}: the time should be a non-negative number of milliseconds (got ${durationMs}).`);
        }
    }

    /**
     * Tracks one demo-issued draw API call for the current frame snapshot.
     */
    private markDrawCall(): void {
        this.pendingDrawCalls++;
    }

    /**
     * Clears pending renderer diagnostics when collection is disabled or after frame rollover.
     */
    private resetPendingRendererDiagnostics(): void {
        this.pendingRendererDiagnostics.primitiveOverflowCount = 0;
        this.pendingRendererDiagnostics.spriteOverflowCount = 0;
        this.pendingRendererDiagnostics.primitiveSubmittedVertices = 0;
        this.pendingRendererDiagnostics.spriteSubmittedVertices = 0;
    }

    /**
     * Reads renderer pipeline diagnostic counters when overlay diagnostics collection is enabled.
     *
     * Must run after demo and overlay draws and before {@link IRenderer.endFrame}
     * resets pipeline batch state.
     */
    private captureRendererDiagnostics(): void {
        if (!this.isCollectRendererDiagnosticsEnabled || !this.renderer) {
            return;
        }

        const diagnostics = this.renderer.getFrameDiagnostics();

        this.pendingRendererDiagnostics.primitiveOverflowCount = diagnostics.primitiveOverflowCount;
        this.pendingRendererDiagnostics.spriteOverflowCount = diagnostics.spriteOverflowCount;
        this.pendingRendererDiagnostics.primitiveSubmittedVertices = diagnostics.primitiveSubmittedVertices;
        this.pendingRendererDiagnostics.spriteSubmittedVertices = diagnostics.spriteSubmittedVertices;
    }

    /**
     * Reads audio bus levels and voice counters when overlay audio metering is enabled.
     *
     * Must run after demo and overlay draws, mirroring {@link captureRendererDiagnostics}.
     */
    private captureAudioDiagnostics(): void {
        if (!this.isCollectAudioMetersEnabled || !this.audio) {
            return;
        }

        this.audioSnapshot.levels = this.audio.getBusLevels();
        this.audioSnapshot.activeVoices = this.audio.getActiveVoiceCount();
        this.audioSnapshot.totalVoices = this.audio.getVoiceCount();
        this.audioSnapshot.voiceStealCount = this.audio.getVoiceStealCount();
        this.audioSnapshot.voiceDropCount = this.audio.getVoiceDropCount();
        this.audioSnapshot.preUnlockDropCount = this.audio.getDroppedSfxCount();
    }

    /**
     * Applies overlay input (palette swatch copy, then body toggle) and clears per-frame palette usage.
     *
     * Input runs here (not in {@link Overlay.updateAndRender}) so visibility is current
     * when deciding whether to track palette usage during `demo.render()`. The usage mask is
     * only cleared when tracking is actually active this frame (it toggles with overlay/palette
     * visibility above) - nothing reads or repopulates it otherwise, so clearing it would be
     * wasted work on every frame the overlay palette grid is not visible.
     */
    private beginRenderFrame(): void {
        this.isDevGuardActive = isDevMode();

        if (this.overlay) {
            this.overlay.handleFrameInput(
                this.pointer,
                this.pendingOverlayTogglePress,
                this.loop?.getTicks() ?? 0,
                this.getDemoOverlayRows,
                this.palette,
            );
        }

        this.pendingOverlayTogglePress = false;

        if (this.isTrackingFramePaletteUsage()) {
            resetUsage(this.framePaletteUsageMask);
        }
    }

    /**
     * Whether demo draw calls should populate {@link framePaletteUsageMask} this frame.
     *
     * @returns `true` when the overlay palette grid is active and visible.
     */
    private isTrackingFramePaletteUsage(): boolean {
        return this.overlay?.isTrackingPaletteUsage ?? false;
    }

    /**
     * Marks a palette index as used for the current frame.
     *
     * @param index - Palette index to track.
     */
    private trackPaletteIndexUsed(index: number): void {
        if (!this.isTrackingFramePaletteUsage() || !this.renderer) {
            return;
        }

        markIndexUsed(this.framePaletteUsageMask, index);
    }

    /**
     * Marks palette indices referenced by bitmap text glyphs in a string.
     *
     * @param font - Bitmap font whose glyph atlas is scanned.
     * @param text - Text about to be drawn.
     * @param paletteOffset - Palette offset applied at draw time.
     */
    private markBitmapTextPaletteUsage(font: BitmapFont, text: string, paletteOffset: number): void {
        if (!this.isTrackingFramePaletteUsage()) {
            return;
        }

        const sheet = font.getSpriteSheet();

        for (const char of text) {
            const glyph = font.getGlyph(char);

            if (glyph !== null) {
                sheet.markPaletteIndicesInRect(glyph.rect, paletteOffset, this.framePaletteUsageMask);
            }
        }
    }

    /**
     * Validates that a palette index is a non-negative integer and, when a palette
     * is active, that the index is within its range.
     *
     * The non-integer/negative check always runs regardless of palette state.
     * The range check only runs when a palette has been set.
     *
     * @param index - Palette index to validate.
     * @throws Error if the index is not a non-negative integer.
     * @throws Error if a palette is active and the index is out of its range.
     */
    private assertPaletteIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(paletteIndexNegativeError(index));
        }

        // getPalette() so the range check follows the game's captured palette during
        // the splash rather than the splash's own ramp, which has a different size.
        const palette = this.getPalette();

        if (palette && index >= palette.size) {
            throw new Error(paletteIndexOutOfRangeError(index, palette.size));
        }
    }

    /**
     * Drives the splash's own animation frames until it reaches `done`.
     *
     * Deliberately not the {@link GameLoop}: running the splash on a separate
     * driver keeps the loop's fixed-timestep accumulator, its `lastUpdateTime`,
     * and its rolling dropped-frame baseline from ever seeing splash time.
     *
     * The splash frame deliberately skips `beginRenderFrame()` and the overlay -
     * the overlay would draw over the logo and resolve its HUD slots through the
     * splash's ramp, and keeping it out is also what keeps the overlay free of
     * splash-state branching.
     *
     * @param displaySize - Logical display size the splash centers its logo in.
     * @returns Promise resolving once the splash is done.
     */
    private async runSplash(displaySize: Vector2i): Promise<void> {
        const splash = this.splash;
        const renderer = this.renderer;

        if (!splash || !renderer) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const frame = (): void => {
                try {
                    splash.advance();

                    if (splash.state === 'done') {
                        resolve();

                        return;
                    }

                    renderer.beginFrame();
                    renderer.setCameraOffset(Vector2i.zero());
                    splash.draw(renderer, displaySize);
                    // No effect time passes during the splash: the tick clock has not started, and the
                    // splash dissolve reads Splash's own clock, not deltaMs.
                    renderer.endFrame(0);
                } catch (error) {
                    // Settle rather than scheduling another frame. Nothing else can
                    // resolve this promise, so a throw here would leave init() pending
                    // forever behind a splash that has stopped animating.
                    reject(error instanceof Error ? error : new Error(String(error)));

                    return;
                }

                requestAnimationFrame(frame);
            };

            requestAnimationFrame(frame);
        });
    }

    /**
     * Consumes input state accumulated while the splash was up.
     *
     * The skip press must not reach the game's first frame. `endUpdate` clears the
     * pending press and release sets and snapshots the held keys into `prevHeld`,
     * so a key still physically down reads as held (`BT.isKeyDown`) but produces no
     * press edge. Pointer and gamepad previous-state rollover works the same way.
     */
    private drainInputEdges(): void {
        this.keyboard?.endUpdate(0);
        this.pointer?.endFrame();
        this.gamepad?.endFrame(0);
    }

    /**
     * The body of {@link resume}, run once every earlier seek has settled: restarts the loop and resumes
     * parked audio when a seek still holds the loop stopped, otherwise does nothing.
     */
    private restartParkedLoop(): void {
        if (!this.loop || !this.isSeekParked) {
            return;
        }

        this.isSeekParked = false;
        this.audio?.unpark();
        // TODO(BT-513): realign music with BT.musicSeek(BT.timeSeconds) once music transport lands.
        // Until then a track started by a 'start' seek's init() re-run plays from 0 after resume.
        this.loop.start();
    }

    /**
     * One serialized seek: validate, stop and park, optionally replay from tick 0, then step.
     *
     * @param seconds - Target time in seconds.
     * @param from - Seek origin.
     */
    private async seek(seconds: number, from: RenderAtFrom): Promise<void> {
        const loop = this.loop;
        const demo = this.demo;
        const hwSettings = this.hwSettings;

        if (!loop || !demo || !hwSettings) {
            throw new Error(errorMessages.RENDER_AT_NOT_READY_MESSAGE);
        }

        // Rounded, not floored: 3.2 * 60 is 192.00000000000003 and 0.1 * 3 * 60 can land just under.
        const targetTicks = Math.round(seconds * hwSettings.targetFPS);

        // Number.isFinite also rejects non-numbers; the safe-integer check catches a finite time too large
        // to count in ticks (1e300), before anything is stopped or parked.
        if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(targetTicks)) {
            throw new Error(errorMessages.renderAtSecondsError(seconds));
        }

        if (from !== 'start' && from !== 'current') {
            throw new Error(errorMessages.renderAtFromError(from));
        }

        if (from === 'current' && targetTicks < loop.getTicks()) {
            throw new Error(errorMessages.renderAtPastError(targetTicks, loop.getTicks()));
        }

        loop.stop();
        this.isSeekParked = true;
        // Wait for silence: the suspend resolves once the audio output has drained, so nothing from
        // before the seek is still playing while it replays.
        await this.audio?.park();
        this.isSeeking = true;

        try {
            if (from === 'start') {
                await this.resetForSeek(demo, loop);
            }

            loop.step(targetTicks - loop.getTicks());
        } finally {
            this.isSeeking = false;
        }
    }

    /**
     * Resets engine-owned state to how the boot run found it, then re-runs the game's `init()`.
     *
     * Engine-owned: the `BT.random` stream, palette effects, post-process effects, camera, pending
     * input edges, ticks, and the post-process clock. State the game keeps in its own fields is `init()`'s
     * job to reset - that is the documented contract of a `'start'` seek. The splash and its handoff
     * fade are not replayed, but what the handoff did to palette effects is (see the end).
     *
     * @param demo - Running game instance.
     * @param loop - Stopped game loop.
     */
    private async resetForSeek(demo: IBTDemo, loop: GameLoop): Promise<void> {
        // seed() only when it reproduces the captured state exactly (nothing drew between the seed
        // and the capture), so BT.random.seedValue keeps reporting the seed; setState() clears it.
        if (this.bootRandomSeed !== undefined && this.bootRandomSeed === this.bootRandomState) {
            this.random.seed(this.bootRandomSeed);
        } else {
            this.random.setState(this.bootRandomState);
        }

        this.paletteEffects.clear();

        // Gate on activeBackend, like the splash dissolve: the software renderer throws on
        // post-process, and it has no effects to clear.
        if (this.activeBackend === 'webgpu') {
            this.renderer?.clearEffects();
        }

        this.resetCamera();
        this.lastCameraOffset = Vector2i.zero();
        this.drainInputEdges();
        loop.resetTicks();
        this.lastRenderClockMs = 0;

        let ok = false;

        try {
            ok = await demo.init();
        } catch (error) {
            console.error('[BT] renderAt: init() threw while replaying from the start:', error);
        }

        if (!ok) {
            throw new Error(errorMessages.RENDER_AT_INIT_FAILED_MESSAGE);
        }

        // Live, the splash handoff (endPaletteCapture) dropped every palette effect init() started
        // behind the splash. Replaying init() without the splash must drop them too, or the seek
        // shows a cycle the live run never ran. `splash` is set once at boot and never cleared.
        if (this.splash) {
            this.paletteEffects.clear();
        }
    }

    /**
     * Runs the game's `init()`, behind the splash when one is playing.
     *
     * @param demo - Demo whose `init()` runs.
     * @param hwSettings - Resolved hardware settings for this run.
     * @returns Whatever the demo's `init()` resolved to.
     */
    private async runDemoInitWithSplash(demo: IBTDemo, hwSettings: HardwareSettings): Promise<boolean> {
        const splash = this.splash;

        if (!splash) {
            return this.runDemoInit(demo);
        }

        return this.runDemoInitBehindSplash(demo, splash, hwSettings.displaySize);
    }

    /**
     * Runs the game's `init()` behind the splash, then performs the handoff.
     *
     * The two run concurrently, so the splash doubles as a loading screen and
     * costs close to zero perceived time.
     *
     * @param demo - Demo whose `init()` runs behind the splash.
     * @param splash - The splash covering the screen.
     * @param displaySize - Logical display size passed through to the splash.
     * @returns Whatever the demo's `init()` resolved to.
     */
    private async runDemoInitBehindSplash(demo: IBTDemo, splash: Splash, displaySize: Vector2i): Promise<boolean> {
        const reducedMotion = ReducedMotion.isPreferred;

        // Install it as the active palette, not just on the renderer: endPaletteCapture()
        // reads this.palette to fade the splash down when the game never sets one of its
        // own, and the two must not disagree while the splash is the thing on screen.
        this.installPalette(splash.palette);
        this.beginPaletteCapture();
        splash.attachSkipInput(globalThis);
        splash.start(reducedMotion);

        // Gate on activeBackend, not requestedBackend: this is a runtime feature
        // gate, and the software renderer throws on post-process. Reduced motion skips the
        // dissolve entirely - it is a simulated glitch effect, exactly the category of motion
        // the preference exists to suppress.
        if (this.activeBackend === 'webgpu' && !reducedMotion) {
            splash.enableDissolve();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                this.effectAdd(dissolve);
            }
        }

        // markInitSettled fires on failure too, so a failed init() cannot leave the
        // hold running forever.
        const initPromise = this.runDemoInit(demo).then((ok) => {
            splash.markInitSettled();

            return ok;
        });

        try {
            // allSettled, not all: a splash frame that throws must not tear the capture
            // down while the game's init() is still running, or a paletteSet() landing
            // after the teardown would apply straight to the screen mid-handoff.
            const [initSettled, splashSettled] = await Promise.allSettled([initPromise, this.runSplash(displaySize)]);

            if (splashSettled.status === 'rejected') {
                throw splashSettled.reason;
            }

            return initSettled.status === 'fulfilled' ? initSettled.value : false;
        } finally {
            // In a finally so a throw from either side still tears the splash down.
            // Leaving capture armed would make every later BT.paletteSet() a no-op.
            splash.detachSkipInput();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                // By exact reference, never effectClear(): the game's init() ran
                // concurrently and may have registered effects of its own.
                this.effectRemove(dissolve);
            }

            this.endPaletteCapture(reducedMotion);
            this.drainInputEdges();
        }
    }

    /**
     * Stores a palette as the active engine palette and propagates it to the renderer.
     *
     * The warning-free half of {@link setPalette}: the splash handoff installs an
     * already-warned-about palette, and warning twice for one `BT.paletteSet()`
     * call would be noise.
     *
     * @param palette - Palette to store as the active engine palette.
     */
    private installPalette(palette: Palette): void {
        // In-flight effects hold snapshots of the old palette. Drop them so they
        // don't apply stale colors to the new palette.
        this.paletteEffects.clear();

        this.palette = palette;
        this.renderer?.setPalette(palette);
    }
}

/**
 * Fill mode of a nine-slice region: `center` for the middle, `edges` for the edges, and `'tile'` for a corner -
 * a corner's box always equals its strip, so one 1:1 tile draws it.
 *
 * @param nineSlice - Panel being drawn.
 * @param row - Row index 0-2.
 * @param col - Column index 0-2.
 * @returns The region's fill mode.
 */
function nineSliceRegionMode(nineSlice: NineSlice, row: number, col: number): NineSliceMode {
    if (row === 1 && col === 1) {
        return nineSlice.center;
    }

    return row === 1 || col === 1 ? nineSlice.edges : 'tile';
}

/**
 * Creates the splash when gating says it should play on this page load.
 *
 * A module-level helper rather than a method so `init()` stays within its
 * complexity budget; it needs no instance state.
 *
 * @param hwSettings - Resolved hardware settings for this run.
 * @returns A fresh splash, or `null` when gating turned it off.
 */
function createSplashIfEnabled(hwSettings: HardwareSettings): Splash | null {
    if (!isSplashEnabled(hwSettings.isSplashEnabled)) {
        return null;
    }

    return new Splash({ colorDark: hwSettings.splashColorDark, colorLight: hwSettings.splashColorLight });
}
