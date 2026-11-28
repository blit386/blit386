/**
 * The engine's init lifecycle: `init`, `stop`, the Tier 2 hot swap, and the demo-init helpers the splash and seek
 * parts call. Part of {@link BTAPI}; not part of the BT API.
 */

import { createSystemFont } from '../../assets/SystemFont';
import { isDevMode } from '../../utils/devMode';
import { Vector2i } from '../../utils/Vector2i';
// A value import back into BTAPI, safe because it is only read inside runInit, never while modules load.
import { BTAPI } from '../BTAPI';
import type { FrameDropCallback } from '../GameLoop';
import { GameLoop } from '../GameLoop';
import type { IBTDemo } from '../IBTDemo';
import { needsOverlayRendererDiagnostics } from '../mergeHardwareSettings';
import { Orientation } from '../Orientation';
import { readSeedUrlParam } from '../SeedUrlParam';
import { WakeLock } from '../WakeLock';
import { RendererSetup } from './RendererSetup';
import { createSplashIfEnabled, isSplashFinished, SplashBoot } from './SplashBoot';

/** Engine init, stop and hot replace, and the demo-init helpers around them. */
export class Lifecycle {
    /** True while an `init()` call is running; rejects overlapping inits and keeps {@link BTAPI#isInitialized} false. */
    public isInitInProgress = false;

    /** True once an init has resolved splash gating; later inits create a splash only if the last one never finished. */
    private isSplashResolved = false;

    /** Screen wake lock subsystem. Created and attached during {@link init} only when
     *  {@link HardwareSettings#isWakeLockEnabled} is true. */
    private wakeLock: WakeLock | null = null;

    /** Screen orientation detection / lock subsystem. Created and attached during {@link init}. */
    private orientation: Orientation | null = null;

    /** Hardware settings and renderer construction for init(). */
    private readonly rendererSetup: RendererSetup;

    /** Boot splash around the game's init(). */
    private readonly splashBoot: SplashBoot;

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {
        this.rendererSetup = new RendererSetup(engine);
        this.splashBoot = new SplashBoot(engine);
    }

    /**
     * Initializes the engine for a demo and starts the main loop on success.
     *
     * The initialization sequence is:
     * - read hardware settings from the demo (`configure()` or defaults)
     * - initialize WebGPU (or software fallback) and create the renderer
     * - create the built-in system font and optional `Overlay`
     * - run the demo's async `init()`
     * - start the fixed-timestep game loop
     * - request a screen wake lock when {@link HardwareSettings#isWakeLockEnabled} is true
     * - attach screen orientation detection (and optional lock via
     *   {@link HardwareSettings#preferredOrientation})
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
     * so a restart runs the new `init()` without it - unless a splash frame threw, which plays it again. A `Seek#renderAt` seek already
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
            await this.engine.seekChain;

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
     * Also clears `FrameCaptureCommands#isFrameCaptureShortcutInFlight` and bumps
     * `FrameCaptureCommands#frameCaptureShortcutGeneration`. A Shift+F9 capture or bare-F9 copy in flight
     * when `stop()` runs usually never settles (its render pass will now never happen), so
     * without the clear, every F9/Shift+F9 press after the next `init()` would silently
     * no-op forever. The generation bump additionally covers the rarer case where that
     * capture *was* already mid-GPU-readback (past `FrameCapture.executeInEncoder`) when
     * `stop()` ran - `FrameCapture.resolve()` keeps running independently of the game loop
     * once started, and can settle after a subsequent `init()` starts a new capture on a new
     * renderer; the bump stops that stale completion from clearing the new capture's guard.
     */
    public stop(): void {
        this.engine.loop?.stop();
        this.engine.isSeekParked = false;
        this.engine.subsystems.clearInputSubsystems();

        this.wakeLock?.detach();
        this.wakeLock = null;

        this.orientation?.detach();
        this.orientation = null;

        this.engine.reducedMotion?.detach();
        this.engine.reducedMotion = null;

        this.engine.capture.isFrameCaptureShortcutInFlight = false;
        this.engine.capture.frameCaptureShortcutGeneration++;
    }

    /**
     * Runs a Tier 2 hot-swap candidate's `init()` while the previous demo instance keeps
     * driving the loop, swapping {@link BTAPI#demo} to it only on success.
     *
     * Deliberately does not delegate to {@link runDemoInit}: that method calls
     * `Subsystems#clearInputSubsystems` on failure, which is correct for a cold-boot failure
     * (nothing else is running yet) but would tear down the pointer/keyboard/gamepad/audio
     * subsystems out from under the *previous* demo instance, which is still driving the
     * loop while this candidate's `init()` runs. A failed hot reload must leave the running
     * engine untouched.
     *
     * The orientation and reduced-motion listeners need no rebinding: they forward through
     * {@link BTAPI#demo} at call time, so they reach the new instance as soon as it is installed.
     *
     * @param newDemo - Freshly constructed candidate demo instance.
     * @returns `true` when `newDemo.init()` succeeds and {@link BTAPI#demo} was swapped to it.
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
     * Runs the demo's async {@link IBTDemo#init}. On throw or
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

                this.engine.subsystems.clearInputSubsystems();

                return false;
            }

            return true;
        } catch (err) {
            console.error('[BT] Demo initialization threw', err);

            this.engine.subsystems.clearInputSubsystems();

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
        this.engine.keyboard?.endUpdate();
        this.engine.pointer?.endUpdate();
        this.engine.pointer?.endFrame();
        this.engine.gamepad?.endFrame();
        this.engine.gamepad?.endUpdate(tick);
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
        this.engine.demo = demo;
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
        this.engine.stop();
        this.engine.loop = null;
        this.releaseRenderer();
        // The new game starts from nothing, like a first boot: no palette until its init() sets one.
        this.engine.palette = null;
        this.engine.paletteEffects.clear();
        this.engine.pendingCameraReset = false;

        this.engine.demo = demo;
        this.engine.canvas = canvas;
        this.engine.isDevGuardActive = isDevMode();

        // Hardware settings: demo hook or defaults from defaultConfig() (320x240 logical, 640x480 buffer, 60 FPS).
        console.log('[BT] Reading hardware configuration');

        if (!this.rendererSetup.loadHardwareSettings(demo)) {
            return false;
        }

        const hwSettings = this.engine.hwSettings;
        if (!hwSettings) {
            return false;
        }

        const updateInterval = 1000 / hwSettings.targetFPS;

        this.engine.updateIntervalMs = updateInterval;

        this.engine.diagnostics.isCollectAudioMetersEnabled =
            hwSettings.isOverlayEnabled !== false && hwSettings.isOverlayAudioMetersEnabled === true;

        console.log('[BT] Hardware settings:', {
            displaySize: `${hwSettings.displaySize.x}x${hwSettings.displaySize.y}`,
            targetFPS: hwSettings.targetFPS,
        });

        if (!(await this.rendererSetup.initRenderer(canvas, hwSettings))) {
            return false;
        }

        // Create the built-in system font (synchronous, no GPU needed yet).
        this.engine.systemFont = createSystemFont();
        this.engine.subsystems.setupOverlay();
        this.engine.subsystems.attachInputSubsystems(canvas);
        this.engine.subsystems.attachAudioSubsystem(canvas);

        // Splash gating resolves here, before the game's init() is invoked, so
        // init() observes 'disabled' or 'fadingIn' and never an undecided state.
        // One-shot per page load: a "back to title" restart keeps the finished boot
        // splash (splashState stays 'done') and runs init() without it. A splash a thrown
        // frame left unfinished plays again.
        this.engine.isRestartAfterSplash = this.isSplashResolved && isSplashFinished(this.engine.splash);

        if (!this.engine.isRestartAfterSplash) {
            this.engine.splash = createSplashIfEnabled(hwSettings);
            this.isSplashResolved = true;
        }

        // `?seed=N` lands here, before the game's init(), so a BT.randomSeed() call in init()
        // still wins. Read in release builds too: a seed in a shared URL is the point. Not
        // repeated by hotReplaceDemo() - a hot-reload swap keeps the running stream.
        const urlSeed = readSeedUrlParam();

        if (urlSeed !== null) {
            this.engine.random.seed(urlSeed);
            console.log(`[BT] Seeded BT.random from ?seed=${urlSeed}`);
        }

        console.log('[BT] Initializing demo');

        // Captured after ?seed and before the game's init(), so a 'start' seek replays init() against
        // the same stream the boot run saw - whether that stream was time-seeded or URL-seeded.
        this.engine.bootRandomState = this.engine.random.getState();
        this.engine.bootRandomSeed = this.engine.random.seedValue;
        this.engine.isSeekParked = false;

        if (!(await this.splashBoot.runDemoInitWithSplash(demo, hwSettings))) {
            return false;
        }

        // Build the loop; it starts below, after the optional subsystems. The GameLoop's
        // double-RAF delay ensures the canvas is fully ready before the first tick.
        const isFrameDropCallbackNeeded =
            hwSettings.isDetectingDroppedFrames === true || hwSettings.isOverlayTimingChartEnabled === true;
        const onFrameDrop: FrameDropCallback | undefined = isFrameDropCallbackNeeded
            ? (event) => this.engine.diagnostics.handleFrameDrop(event, hwSettings.isDetectingDroppedFrames === true)
            : undefined;

        this.engine.diagnostics.isCollectRendererDiagnosticsEnabled = needsOverlayRendererDiagnostics(hwSettings);

        this.engine.pendingUpdateMs = 0;
        this.engine.lastRenderClockMs = 0;
        this.engine.pendingUpdateSteps = 0;
        this.engine.pendingDrawCalls = 0;
        this.engine.lastCameraOffset = Vector2i.zero();
        this.engine.diagnostics.reset();

        this.engine.loop = new GameLoop(
            updateInterval,
            () => this.engine.frameLoop.update(),
            () => this.engine.frameLoop.render(),
            onFrameDrop,
        );

        // Optional subsystems attach before the loop starts, so a throw in one can never leave a
        // running game under the Initialization Failed panel. None of them needs the loop.
        this.wakeLock?.detach();
        this.wakeLock = null;

        if (hwSettings.isWakeLockEnabled === true) {
            this.wakeLock = new WakeLock();
            this.wakeLock.attach();
        }

        this.orientation?.detach();
        this.orientation = new Orientation();
        // Forward through this.engine.demo at call time so a method-only hot swap reaches the new handler.
        this.orientation.attach(hwSettings.preferredOrientation ?? 'any', (type) =>
            this.engine.demo?.onOrientationChange?.(type),
        );

        this.engine.subsystems.attachReducedMotion();

        this.engine.loop.start();

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
        if (this.engine.activeBackend === 'webgpu') {
            this.engine.renderer?.clearEffects();
        }

        // Before the device goes, so a captureFrame() still pending rejects instead of hanging.
        this.engine.renderer?.destroy();
        this.engine.device?.destroy();
        this.engine.device = null;
        this.engine.context = null;
        this.engine.renderer = null;
        this.engine.activeBackend = null;
    }
}
