import { AssetLoader } from '../assets/AssetLoader';
import { AudioClip } from '../assets/AudioClip';
import { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import { PaletteEffectManager } from '../assets/PaletteEffect';
import type { AudioManager } from '../audio/AudioManager';
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
import { Random } from '../utils/Random';
import { Vector2i } from '../utils/Vector2i';
import { AudioCommands } from './engine/AudioCommands';
import { DrawCommands } from './engine/DrawCommands';
import { FrameCaptureCommands } from './engine/FrameCaptureCommands';
import { FrameLoop } from './engine/FrameLoop';
import { Lifecycle } from './engine/Lifecycle';
import { OverlayDiagnostics } from './engine/OverlayDiagnostics';
import { PaletteController } from './engine/PaletteController';
import { Seek } from './engine/Seek';
import { Subsystems } from './engine/Subsystems';
import type { GameLoop } from './GameLoop';
import type { Backend, HardwareSettings, IBTDemo } from './IBTDemo';
import { Orientation } from './Orientation';
import { ReducedMotion } from './ReducedMotion';

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

    /** Bus volume and mute, sound effects and music; the `BT` audio members call it. */
    public readonly audioCommands = new AudioCommands(this);

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
     * True after `renderAt` stopped the loop, until {@link Seek#resume}; `captureFrame` then renders on demand.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public isSeekParked = false;

    /**
     * Settles after every {@link Seek#renderAt} called so far. Seeks chain onto it so they never interleave,
     * and {@link Seek#resume} and {@link FrameCaptureCommands#captureFrame} chain onto it so they act on the
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
     * {@link FrameLoop#render}). Without this, a render frame with zero
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
     * deferred to the next fixed-update tick (see {@link FrameLoop#commitPendingCameraReset}).
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
     * Engine overlay; non-null when {@link HardwareSettings#isOverlayEnabled}
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

    /**
     * The game loop's update and render callbacks and the tick clock.
     *
     * Shared with the parts in `core/engine/`; not part of the BT API.
     */
    public readonly frameLoop = new FrameLoop(this);

    /** Init, stop and hot replace, and the demo-init helpers the splash and seek parts call. */
    public readonly lifecycle = new Lifecycle(this);

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
     * Initializes the engine for a demo and starts the main loop on success; the full contract is on
     * {@link Lifecycle#init}.
     *
     * @param demo - Demo implementing the IBTDemo interface.
     * @param canvas - Render target canvas (WebGPU or software backend).
     * @returns `true` when initialization succeeds; otherwise `false`.
     * @throws Error when a splash frame throws while the splash is on screen.
     */
    public init(demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> {
        return this.lifecycle.init(demo, canvas);
    }

    /**
     * Stops the game loop and detaches the input, audio, wake lock, orientation and reduced-motion subsystems;
     * see {@link Lifecycle#stop}.
     */
    public stop(): void {
        this.lifecycle.stop();
    }

    /**
     * Runs a Tier 2 hot-swap candidate's `init()` and swaps {@link demo} to it only on success; see
     * {@link Lifecycle#hotReplaceDemo}.
     *
     * @param newDemo - Freshly constructed candidate demo instance.
     * @returns `true` when `newDemo.init()` succeeds and {@link demo} was swapped to it.
     */
    public hotReplaceDemo(newDemo: IBTDemo): Promise<boolean> {
        return this.lifecycle.hotReplaceDemo(newDemo);
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
     * purpose. That includes a {@link Seek#renderAt} seek: its `stop()` clears the halt, so only
     * {@link Seek#resume} ends a seek.
     *
     * Input edges are drained first: the update that threw never reached its input rollover, so its presses would
     * otherwise reach the first update after the restart a second time.
     */
    public resumeHaltedLoop(): void {
        if (!this.loop?.isHaltedOnError()) {
            return;
        }

        this.lifecycle.drainInputEdges(this.loop.getTicks());
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
        return this.lifecycle.isInitInProgress;
    }

    /**
     * Reports whether the engine has completed initialization.
     *
     * @returns `true` when both a demo and the game loop are live and no `init()` is in flight.
     */
    public isInitialized(): boolean {
        return !this.lifecycle.isInitInProgress && this.demo !== null && this.loop !== null;
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
     * Computed fresh on each read by summing {@link AssetLoader.loadingCount},
     * {@link AudioClip.loadingCount} and {@link BitmapFont.loadingCount} - stateless, no subscription or
     * extra bookkeeping.
     *
     * @changed 1.9.0 Includes in-flight bitmap font loads.
     * @returns Combined count of in-flight image, audio clip and bitmap font loads.
     */
    public getLoadingAssetsCount(): number {
        return AssetLoader.loadingCount + AudioClip.loadingCount + BitmapFont.loadingCount;
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
     * Mirrors resolved {@link HardwareSettings#backend} after `configure()` merge and
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
}
