import { AssetLoader } from '../assets/AssetLoader';
import { AudioClip } from '../assets/AudioClip';
import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import { PaletteEffectManager } from '../assets/PaletteEffect';
import { createSystemFont } from '../assets/SystemFont';
import { type AudioManager, DEFAULT_BUS_VOLUME } from '../audio/AudioManager';
import { type MusicPlayOptions, validateFinite } from '../audio/MusicPlayer';
import {
    DEFAULT_PAN,
    DEFAULT_PITCH,
    DEFAULT_VOLUME,
    INVALID_SOUND_REF,
    type SoundPlayOptions,
    type SoundRef,
} from '../audio/VoicePool';
import type { GamepadInput } from '../input/GamepadInput';
import { InputTrace } from '../input/InputTrace';
import type { KeyboardInput } from '../input/KeyboardInput';
import type { PointerInput } from '../input/PointerInput';
import type { OverlayDrawTarget } from '../overlay';
import type { Overlay } from '../overlay';
import type { Effect } from '../render/effects/Effect';
import type { IRenderer } from '../render/IRenderer';
import type { SplashState } from '../splash';
import type { Splash } from '../splash';
import { isDevMode } from '../utils/devMode';
import type { EasingFunction } from '../utils/Easing';
import { Random } from '../utils/Random';
import { Vector2i } from '../utils/Vector2i';
import { DrawCommands } from './engine/DrawCommands';
import { FrameCaptureCommands } from './engine/FrameCaptureCommands';
import { FrameLoop } from './engine/FrameLoop';
import { OverlayDiagnostics } from './engine/OverlayDiagnostics';
import { PaletteController } from './engine/PaletteController';
import { RendererSetup } from './engine/RendererSetup';
import { Seek } from './engine/Seek';
import { createSplashIfEnabled, isSplashFinished, SplashBoot } from './engine/SplashBoot';
import { Subsystems } from './engine/Subsystems';
import type { FrameDropCallback } from './GameLoop';
import { GameLoop } from './GameLoop';
import type { AudioBus, Backend, HardwareSettings, IBTDemo } from './IBTDemo';
import { needsOverlayRendererDiagnostics } from './mergeHardwareSettings';
import { Orientation } from './Orientation';
import { ReducedMotion } from './ReducedMotion';
import { readSeedUrlParam } from './SeedUrlParam';
import { WakeLock } from './WakeLock';

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
    public static readonly VERSION_MINOR = 8;

    /** Patch version number. */
    public static readonly VERSION_PATCH = 0;

    /** Singleton instance of BTAPI. */
    private static _instance: BTAPI | null = null;

    /**
     * Dev-only input-edge trace, exposed as `window.__btInputTrace` by `bootstrap()`. Off until
     * started, so the game loop pays one field read per update and per frame.
     */
    public readonly inputTrace = new InputTrace();

    /**
     * Hardware configuration settings from the demo.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public hwSettings: HardwareSettings | null = null;

    /**
     * WebGPU device for GPU operations.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public device: GPUDevice | null = null;

    /**
     * WebGPU canvas context for presenting frames.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public context: GPUCanvasContext | null = null;

    /**
     * Renderer subsystem for all drawing operations.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public renderer: (IRenderer & OverlayDrawTarget) | null = null;

    /**
     * Backend that was successfully initialized, or null before init.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public activeBackend: Backend | null = null;

    /**
     * Accumulated fixed-step update time for the frame currently being rendered.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public pendingUpdateMs = 0;

    /**
     * Number of fixed-step updates accumulated for the current render frame.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public pendingUpdateSteps = 0;

    /**
     * Number of demo draw API calls issued since the last rendered frame.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public pendingDrawCalls = 0;

    /**
     * Audio context, bus graph, and unlock state. Created during {@link init}.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public audio: AudioManager | null = null;

    /**
     * Active splash, or null when gating turned it off. One-shot per page load.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public splash: Splash | null = null;

    /**
     * True when this run is a restart after gating resolved, so its `init()` runs without the boot splash.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public isRestartAfterSplash = false;

    /**
     * Game loop managing fixed-timestep updates and variable-rate rendering.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public loop: GameLoop | null = null;

    /**
     * True after `renderAt` stopped the loop, until {@link Seek.resume}; `captureFrame` then renders on demand.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public isSeekParked = false;

    /**
     * Settles after every {@link Seek.renderAt} called so far. Seeks chain onto it so they never interleave,
     * and {@link Seek.resume} and {@link FrameCaptureCommands.captureFrame} chain onto it so they act on the
     * seeked frame, in call order.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public seekChain: Promise<void> = Promise.resolve();

    /**
     * Keyboard input. Created during {@link init}.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public keyboard: KeyboardInput | null = null;

    /** Frame capture and the F9 shortcuts; `BT.captureFrame` and `BT.downloadFrame` call it. */
    public readonly capture = new FrameCaptureCommands(this);

    /**
     * Current demo instance implementing IBTDemo.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public demo: IBTDemo | null = null;

    /**
     * World camera offset last applied via {@link setCameraOffset}, persisted across frames.
     *
     * Re-applied at the start of every render pass, before the demo's `render()` runs (see
     * {@link FrameLoop.render}). Without this, a render frame with zero
     * fixed-update steps (common once the render rate approaches or exceeds the fixed update
     * rate, for example at 120 Hz) would draw the world with whatever the *previous* frame's
     * `render()` left the live offset at after its own {@link resetCamera} call for
     * screen-space UI - which is always `(0, 0)` - producing a visible snap-to-origin flash
     * instead of holding the last correct scroll position.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public lastCameraOffset: Vector2i = Vector2i.zero();

    /**
     * True when {@link resetCamera} ran and its effect on {@link lastCameraOffset} is still
     * deferred to the next fixed-update tick (see {@link FrameLoop.commitPendingCameraReset}).
     *
     * `resetCamera()` is also the documented way to flip to screen space for UI at the end of
     * `render()`, with the demo's next `update()` restoring the world offset via
     * {@link setCameraOffset}. Committing the reset to `lastCameraOffset` immediately would make
     * it durable right away, which would incorrectly override the world offset during a render
     * frame with zero fixed-update steps that falls between that reset and the restoring
     * `setCameraOffset()` call - the exact snap-to-origin flash `lastCameraOffset` exists to
     * prevent. Deferring the commit lets a following `setCameraOffset()` supersede it normally,
     * while still making the reset durable once nothing calls `setCameraOffset()` again.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public pendingCameraReset = false;

    /**
     * Tick-clock time of the previous loop render, for the post-process delta.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public lastRenderClockMs = 0;

    /**
     * `BT.random` state captured just before the boot `init()`, restored by a `'start'` seek.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public bootRandomState = 0;

    /**
     * `BT.random.seedValue` at the same moment, so a restored seeded stream still reports its seed.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public bootRandomSeed: number | undefined = undefined;

    /**
     * True while a seek runs the game's code (the `init()` re-run and the stepped updates); drops SFX.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public isSeeking = false;

    /**
     * Manages animated palette effects (cycling, fading, flashing). Runs on the tick clock, so
     * `BT.renderAt` can seek it and it never reads `performance.now()`.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public readonly paletteEffects = new PaletteEffectManager(() => this.frameLoop.getTickClockMs());

    /**
     * Default engine PRNG; time-seeded when the singleton is created.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public readonly random = new Random();

    /** `BT.renderAt` and `BT.resume`. */
    public readonly seek = new Seek(this);

    /**
     * Active engine palette used by palette-first rendering.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public palette: Palette | null = null;

    /** The active palette, palette effects, and splash-time palette capture. */
    public readonly palettes = new PaletteController(this);

    /**
     * Engine overlay; non-null when {@link HardwareSettings.isOverlayEnabled}
     * is not `false`. Layout is fixed at init; drawn after demo `render()` each frame.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public overlay: Overlay | null = null;

    /**
     * Built-in 6x14 system font for BT.systemPrint().
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public systemFont: BitmapFont | null = null;

    /**
     * Cached {@link isDevMode} for dev-only draw checks. Refreshed in {@link init} and once per render
     * frame (HMR can switch on after init), never per draw: `isDevMode()` resolves several signals.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public isDevGuardActive = false;

    /** Draw calls and the per-frame palette-usage marks they leave for the overlay. */
    public readonly draw = new DrawCommands(this);

    /**
     * Milliseconds per fixed update (`1000 / targetFPS`); set by {@link init}, `0` before.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public updateIntervalMs = 0;

    /**
     * True only while the demo's `update()` runs; lets `BT.isPressed` hand carried pointer presses to update alone.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public updating = false;

    /**
     * Pointer / mouse / touch input subsystem. Created during {@link init}.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public pointer: PointerInput | null = null;

    /**
     * Gamepad input. Created during {@link init}.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public gamepad: GamepadInput | null = null;

    /**
     * Timing, renderer and audio snapshots for the overlay.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public readonly diagnostics = new OverlayDiagnostics(this);

    /**
     * HTML canvas element used for rendering.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public canvas: HTMLCanvasElement | null = null;

    /**
     * Reduced-motion preference detection. Created and attached during {@link init}.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public reducedMotion: ReducedMotion | null = null;

    /** Attaches and clears the input, audio, overlay and reduced-motion subsystems. */
    public readonly subsystems = new Subsystems(this);

    /** The game loop's update and render callbacks and the tick clock. */
    private readonly frameLoop = new FrameLoop(this);

    /** True once an init has resolved splash gating; later inits create a splash only if the last one never finished. */
    private isSplashResolved = false;

    /** True while an `init()` call is running; rejects overlapping inits and keeps {@link isInitialized} false. */
    private isInitInProgress = false;

    /** Screen wake lock subsystem. Created and attached during {@link init} only when
     *  {@link HardwareSettings.isWakeLockEnabled} is true. */
    private wakeLock: WakeLock | null = null;

    /** Screen orientation detection / lock subsystem. Created and attached during {@link init}. */
    private orientation: Orientation | null = null;

    /** Hardware settings and renderer construction for init(). */
    private readonly rendererSetup = new RendererSetup(this);

    /** Boot splash around the game's init(). */
    private readonly splashBoot = new SplashBoot(this);

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

    /**
     * Whether the demo's `update()` is running right now (false during `render()` and between frames).
     *
     * @returns `true` only inside `update()`.
     */
    public get isUpdating(): boolean {
        return this.updating;
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
     * exception is a splash frame that throws: the splash run (`core/engine/SplashBoot.ts`) rejects and that
     * error propagates out of this method, because nothing else can settle it and
     * silently reporting `false` would hide a renderer fault. `bootstrap()` catches
     * it and routes it to `onError`.
     *
     * Calling `init()` again after an earlier call resolved restarts the engine cleanly: it runs
     * {@link stop} on the previous run and destroys the previous `GPUDevice` before creating a new
     * one, so only one game loop ever runs and restarts do not leak GPU memory. Sprite sheets kept
     * across the restart rebuild their texture on the new device. The splash plays once per page load,
     * so a restart runs the new `init()` without it - unless a splash frame threw, which plays it again. A {@link Seek.renderAt} seek already
     * running finishes first; one called while the init runs rejects, as before init.
     *
     * @param demo - Demo implementing the IBTDemo interface.
     * @param canvas - Render target canvas (WebGPU or software backend).
     * @returns `true` when initialization succeeds; otherwise `false`, including when
     *   another `init()` call is still in flight (the second call is rejected without side effects).
     * @throws Error when a splash frame throws while the splash is on screen.
     */
    public async init(demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> {
        if (this.isInitInProgress) {
            console.error('[BT] init() ignored: another init() is still in progress');

            return false;
        }

        this.isInitInProgress = true;

        try {
            // A seek already running would otherwise resume against the new run's demo, renderer, and loop.
            await this.seekChain;

            return await this.runInit(demo, canvas);
        } finally {
            this.isInitInProgress = false;
        }
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
     * Also clears {@link FrameCaptureCommands.isFrameCaptureShortcutInFlight} and bumps
     * {@link FrameCaptureCommands.frameCaptureShortcutGeneration}. A Shift+F9 capture or bare-F9 copy in flight
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
        this.subsystems.clearInputSubsystems();

        this.wakeLock?.detach();
        this.wakeLock = null;

        this.orientation?.detach();
        this.orientation = null;

        this.reducedMotion?.detach();
        this.reducedMotion = null;

        this.capture.isFrameCaptureShortcutInFlight = false;
        this.capture.frameCaptureShortcutGeneration++;
    }

    /**
     * Runs a Tier 2 hot-swap candidate's `init()` while the previous demo instance keeps
     * driving the loop, swapping {@link demo} to it only on success.
     *
     * Deliberately does not delegate to {@link runDemoInit}: that method calls
     * {@link Subsystems.clearInputSubsystems} on failure, which is correct for a cold-boot failure
     * (nothing else is running yet) but would tear down the pointer/keyboard/gamepad/audio
     * subsystems out from under the *previous* demo instance, which is still driving the
     * loop while this candidate's `init()` runs. A failed hot reload must leave the running
     * engine untouched.
     *
     * The orientation and reduced-motion listeners need no rebinding: they forward through
     * {@link demo} at call time, so they reach the new instance as soon as it is installed.
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

        this.installDemo(newDemo);

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
     * Restarts the game loop after a successful hot swap when a throw in `update()` or `render()` stopped it, so
     * saving the fix resumes the game without a page reload. A no-op when the loop is running or was stopped on
     * purpose. That includes a {@link Seek.renderAt} seek: its `stop()` clears the halt, so only
     * {@link Seek.resume} ends a seek.
     *
     * Input edges are drained first: the update that threw never reached its input rollover, so its presses would
     * otherwise reach the first update after the restart a second time.
     */
    public resumeHaltedLoop(): void {
        if (!this.loop?.isHaltedOnError()) {
            return;
        }

        this.drainInputEdges(this.loop.getTicks());
        this.loop.start();
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
     * `defaultConfig()`).
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
     * Reports whether an {@link init} call is currently running.
     *
     * @returns `true` from the start of `init()` until it settles.
     */
    public isInitializing(): boolean {
        return this.isInitInProgress;
    }

    /**
     * Reports whether the engine has completed initialization.
     *
     * @returns `true` when both a demo and the game loop are live and no `init()` is in flight.
     */
    public isInitialized(): boolean {
        return !this.isInitInProgress && this.demo !== null && this.loop !== null;
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
     * @returns Volume in `[0, 1]`, or {@link DEFAULT_BUS_VOLUME} when the audio subsystem is not initialized.
     */
    public audioVolumeGet(bus: AudioBus): number {
        return this.audio?.volumeGet(bus) ?? DEFAULT_BUS_VOLUME;
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
        // musicPlay deliberately has no isSeeking gate; see the note there.
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
        this.audio?.voices?.stop(ref, fadeOutMs);
    }

    /**
     * Reports whether a sound is still playing.
     *
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` on a stale ref or when the audio subsystem is not initialized.
     */
    public isSoundPlaying(ref: SoundRef): boolean {
        return this.audio?.voices?.isPlaying(ref) ?? false;
    }

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundVolumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.voices?.volumeSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current gain.
     *
     * @param ref - Sound to query.
     * @returns Current gain in `[0, 1]`, or {@link DEFAULT_VOLUME} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundVolumeGet(ref: SoundRef): number {
        return this.audio?.voices?.volumeGet(ref) ?? DEFAULT_VOLUME;
    }

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.voices?.pitchSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current playback rate.
     *
     * @param ref - Sound to query.
     * @returns Current playback rate, or {@link DEFAULT_PITCH} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPitchGet(ref: SoundRef): number {
        return this.audio?.voices?.pitchGet(ref) ?? DEFAULT_PITCH;
    }

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPanSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.voices?.panSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current stereo pan.
     *
     * @param ref - Sound to query.
     * @returns Current pan, or {@link DEFAULT_PAN} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPanGet(ref: SoundRef): number {
        return this.audio?.voices?.panGet(ref) ?? DEFAULT_PAN;
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
        // Unlike soundPlay, not dropped while seeking: one track is never a burst, and a replayed
        // musicPlay leaves the seeked frame's track queued in the parked context for BT.resume().
        // Validate before the early returns, so a bad option fails the same way before init or before the clip loads.
        validateFinite(options?.fadeMs, options?.volume, 'BT.musicPlay', options?.overlap);

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
        validateFinite(fadeMs, undefined, 'BT.musicStop');
        this.audio?.musicStop(fadeMs);
    }

    /**
     * Reports whether music is currently playing.
     *
     * @returns `true` when the music player has a live current track; `false` when stopped, not
     *   yet started, or when the audio subsystem is not initialized.
     */
    public isMusicPlaying(): boolean {
        return this.audio?.music?.isPlaying() ?? false;
    }

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public musicVolumeSet(value: number, fadeMs?: number): void {
        this.audio?.music?.volumeSet(value, fadeMs);
    }

    /**
     * Gets the music player's current target volume.
     *
     * @returns Current target gain, or {@link DEFAULT_VOLUME} when the audio subsystem is not initialized.
     */
    public musicVolumeGet(): number {
        return this.audio?.music?.volumeGet() ?? DEFAULT_VOLUME;
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
     * Returns the built-in system font, or null if not yet initialized.
     *
     * @returns The system BitmapFont instance.
     */
    public getSystemFont(): BitmapFont | null {
        return this.systemFont;
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
        return this.renderer?.getCameraOffset() ?? new Vector2i();
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
     * Runs the demo's async {@link IBTDemo.init}. On throw or
     * `false`, clears input and audio subsystems that were attached earlier in
     * the init sequence.
     *
     * @param demo - Active demo instance.
     * @returns `true` when the demo reports success.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public async runDemoInit(demo: IBTDemo): Promise<boolean> {
        try {
            const ok = await demo.init();

            if (!ok) {
                console.error('[BT] Demo initialization failed');

                this.subsystems.clearInputSubsystems();

                return false;
            }

            return true;
        } catch (err) {
            console.error('[BT] Demo initialization threw', err);

            this.subsystems.clearInputSubsystems();

            return false;
        }
    }

    /**
     * Consumes input state accumulated while the splash was up.
     *
     * The skip press must not reach the game's first frame. `endUpdate` clears the
     * pending press and release sets and snapshots the held keys into `prevHeld`,
     * so a key still physically down reads as held (`BT.isKeyDown`) but produces no
     * press edge. Pointer previous-state rollover (both clocks) works the same way. The gamepad is
     * polled first and then rolled over, so a pad button held through the splash also
     * reads as held with no press edge.
     *
     * @param tick - Current tick, so a pad button pressed during the drain times its auto-repeat from now.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public drainInputEdges(tick: number): void {
        this.keyboard?.endUpdate();
        this.pointer?.endUpdate();
        this.pointer?.endFrame();
        this.gamepad?.endFrame();
        this.gamepad?.endUpdate(tick);
    }

    /**
     * Makes `demo` the active game: the loop's update/render callbacks and the orientation and
     * reduced-motion hooks all route to it from now on.
     *
     * @param demo - Game instance to activate.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public installDemo(demo: IBTDemo): void {
        this.demo = demo;
    }

    /**
     * Runs the init sequence; callers go through {@link init} for the overlap guard.
     * @param demo - Demo to initialize.
     * @param canvas - Render target canvas.
     * @returns `true` when initialization succeeds; otherwise `false`.
     */
    private async runInit(demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> {
        console.log(`[BT] Initializing engine v${BTAPI.VERSION_MAJOR}.${BTAPI.VERSION_MINOR}.${BTAPI.VERSION_PATCH}`);

        // A re-init restarts cleanly: tear down the previous run so its loop never keeps ticking beside the new one.
        this.stop();
        this.loop = null;
        this.releaseRenderer();
        // The new game starts from nothing, like a first boot: no palette until its init() sets one.
        this.palette = null;
        this.paletteEffects.clear();
        this.pendingCameraReset = false;

        this.demo = demo;
        this.canvas = canvas;
        this.isDevGuardActive = isDevMode();

        // Hardware settings: demo hook or defaults from defaultConfig() (320x240 logical, 640x480 buffer, 60 FPS).
        console.log('[BT] Reading hardware configuration');

        if (!this.rendererSetup.loadHardwareSettings(demo)) {
            return false;
        }

        const hwSettings = this.hwSettings;
        if (!hwSettings) {
            return false;
        }

        const updateInterval = 1000 / hwSettings.targetFPS;

        this.updateIntervalMs = updateInterval;

        this.diagnostics.isCollectAudioMetersEnabled =
            hwSettings.isOverlayEnabled !== false && hwSettings.isOverlayAudioMetersEnabled === true;

        console.log('[BT] Hardware settings:', {
            displaySize: `${hwSettings.displaySize.x}x${hwSettings.displaySize.y}`,
            targetFPS: hwSettings.targetFPS,
        });

        if (!(await this.rendererSetup.initRenderer(canvas, hwSettings))) {
            return false;
        }

        // Create the built-in system font (synchronous, no GPU needed yet).
        this.systemFont = createSystemFont();
        this.subsystems.setupOverlay();
        this.subsystems.attachInputSubsystems(canvas);
        this.subsystems.attachAudioSubsystem(canvas);

        // Splash gating resolves here, before the game's init() is invoked, so
        // init() observes 'disabled' or 'fadingIn' and never an undecided state.
        // One-shot per page load: a "back to title" restart keeps the finished boot
        // splash (splashState stays 'done') and runs init() without it. A splash a thrown
        // frame left unfinished plays again.
        this.isRestartAfterSplash = this.isSplashResolved && isSplashFinished(this.splash);

        if (!this.isRestartAfterSplash) {
            this.splash = createSplashIfEnabled(hwSettings);
            this.isSplashResolved = true;
        }

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

        if (!(await this.splashBoot.runDemoInitWithSplash(demo, hwSettings))) {
            return false;
        }

        // Start the loop. The GameLoop's double-RAF delay ensures the canvas is
        // fully ready before the first tick.
        const isFrameDropCallbackNeeded =
            hwSettings.isDetectingDroppedFrames === true || hwSettings.isOverlayTimingChartEnabled === true;
        const onFrameDrop: FrameDropCallback | undefined = isFrameDropCallbackNeeded
            ? (event) => this.diagnostics.handleFrameDrop(event, hwSettings.isDetectingDroppedFrames === true)
            : undefined;

        this.diagnostics.isCollectRendererDiagnosticsEnabled = needsOverlayRendererDiagnostics(hwSettings);

        this.pendingUpdateMs = 0;
        this.lastRenderClockMs = 0;
        this.pendingUpdateSteps = 0;
        this.pendingDrawCalls = 0;
        this.lastCameraOffset = Vector2i.zero();
        this.diagnostics.reset();

        this.loop = new GameLoop(
            updateInterval,
            () => this.frameLoop.update(),
            () => this.frameLoop.render(),
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
        // Forward through this.demo at call time so a method-only hot swap reaches the new handler.
        this.orientation.attach(hwSettings.preferredOrientation ?? 'any', (type) =>
            this.demo?.onOrientationChange?.(type),
        );

        this.subsystems.attachReducedMotion();

        console.log('[BT] Initialization complete');

        return true;
    }

    /**
     * Clears the previous run's post-process effects (running their `dispose()` hooks), then
     * destroys its GPU device and drops its renderer, so a restart frees that GPU
     * memory even when it fails before a new renderer exists. Every buffer and texture on the
     * device goes with it.
     */
    private releaseRenderer(): void {
        // Effects first, while the device is alive, so each effect's dispose() hook runs. Gated like
        // resetForSeek: the software renderer throws on post-process.
        if (this.activeBackend === 'webgpu') {
            this.renderer?.clearEffects();
        }

        // Before the device goes, so a captureFrame() still pending rejects instead of hanging.
        this.renderer?.destroy();
        this.device?.destroy();
        this.device = null;
        this.context = null;
        this.renderer = null;
        this.activeBackend = null;
    }
}
