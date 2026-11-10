/**
 * Engine lifecycle and state: init, configured sizes, loop timing, readiness, splash, test state, frame capture, and seeking.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { BTAPI } from '../core/BTAPI';
import {
    type Backend,
    defaultConfig,
    type IBTDemo,
    type RenderAtOptions,
    type TestStateSnapshot,
} from '../core/IBTDemo';
import type { SplashState } from '../splash';
import { renderAtOptionsError } from '../utils/errorMessages';
import { downloadBlob, type FrameCaptureOptions } from '../utils/FrameCapture';
import type { Vector2i } from '../utils/Vector2i';
import { describeTestStateError, settingsOrDefault } from './internal';

/** Lifecycle, sizing, timing, readiness, and capture members of `BT`. */
export const lifecycle = {
    /**
     * Initializes the engine against a demo instance and target canvas.
     *
     * The canvas element must be attached to the DOM before this call.
     * In Electron environments, wait for DOM-ready first.
     *
     * When not using {@link bootstrap}, set `canvas.tabIndex = 0` and call
     * `canvas.focus()` so keyboard events reach the canvas.
     *
     * {@link BT.renderAt} replays a `'start'` seek by building a new instance of `demo`'s class with
     * no constructor arguments. A class instance you built with arguments (`new MyGame(config)`)
     * replays as a default-built copy, so keep per-run setup in `init()`.
     *
     * Calling `init()` again after an earlier call resolved restarts the engine: the old game loop
     * stops and the old GPU device is destroyed before the new run starts.
     *
     * @since 0.1.0
     * @changed 1.8.0 A call made while another `init()` is still running resolves to `false` and changes nothing.
     * @changed 1.8.1 A call after an earlier `init()` resolved now stops the running game and destroys the previous GPU device instead of leaving the old loop running.
     * @param demo - Demo implementation that provides lifecycle hooks.
     * @param canvas - Canvas used as the engine render target.
     * @returns `true` when initialization succeeds; otherwise `false`.
     */
    init: async (demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> => {
        return await BTAPI.instance.init(demo, canvas);
    },

    /**
     * Active logical render resolution in pixels.
     *
     * This is the game/simulation coordinate space configured by the demo, not
     * the canvas element's CSS size. Each read returns a clone.
     *
     * @since 1.0.4
     * @changed 1.8.1 Before initialization, returns the configure default (`320×240`) instead of the frozen
     *   `Vector2i.zero()`.
     * @returns Configured logical size, or the default `320×240` before initialization.
     */
    get displaySize(): Vector2i {
        return settingsOrDefault().displaySize.clone();
    },

    /**
     * Configured output drawing-buffer size in pixels, when set in `configure()`.
     *
     * `null` when `drawingBufferSize` was omitted (logical resolution only; no
     * display-tier post-process). Each read returns a clone when non-null.
     *
     * @since 1.1.0
     * @changed 1.8.1 Before initialization, returns the configure default (`640×480`) instead of `null`.
     * @returns Configured drawing-buffer size, `null` when not set, or the default `640×480` before initialization.
     */
    get drawingBufferSize(): Vector2i | null {
        const size = settingsOrDefault().drawingBufferSize;

        return size ? size.clone() : null;
    },

    /**
     * Effective drawing-buffer size in pixels (`drawingBufferSize ?? displaySize`).
     *
     * Each read returns a clone.
     *
     * @since 1.0.4
     * @changed 1.8.1 Before initialization, returns the configure default (`640×480`) instead of the frozen
     *   `Vector2i.zero()`.
     * @returns Effective output buffer size, or the default `640×480` before initialization.
     */
    get outputSize(): Vector2i {
        const settings = settingsOrDefault();

        return (settings.drawingBufferSize ?? settings.displaySize).clone();
    },

    /**
     * Target fixed-update rate in frames per second.
     *
     * Mirrors {@link HardwareSettings.targetFPS} from `configure()`.
     * `update()` runs at this frequency; rendering may occur at a different cadence.
     *
     * @since 1.0.4
     * @returns Target updates per second, or `60` before initialization.
     */
    get targetFPS(): number {
        return settingsOrDefault().targetFPS;
    },

    /**
     * Backend requested for initialization (`configure().backend` after merge).
     *
     * Includes `?backend=software` URL overrides applied before the renderer starts.
     * Defaults to `'webgpu'` when `backend` is omitted. Does **not** change when WebGPU
     * falls back to software; use {@link BT.activeBackend} for the backend that actually started.
     *
     * @since 1.1.0
     * @returns `'webgpu'` or `'software'` once hardware settings are loaded; `null` before `BT.init()`.
     */
    get requestedBackend(): Backend | null {
        return BTAPI.instance.getRequestedBackend();
    },

    /**
     * Fixed-step seconds per update tick.
     *
     * Equivalent to `1 / BT.targetFPS` when `BT.targetFPS` is finite and positive.
     * Falls back to `1 / 60` when target FPS is non-finite or non-positive.
     *
     * @since 1.0.4
     * @returns Seconds advanced by one fixed update tick.
     */
    get deltaSeconds(): number {
        const fps = lifecycle.targetFPS;
        const validatedFps = Number.isFinite(fps) && fps > 0 ? fps : defaultConfig().targetFPS;

        return 1 / validatedFps;
    },

    /**
     * Fixed-step elapsed time in seconds (`BT.ticks * BT.deltaSeconds`).
     *
     * @since 1.0.4
     * @returns Elapsed fixed-step time in seconds since initialization.
     */
    get timeSeconds(): number {
        return lifecycle.ticks * lifecycle.deltaSeconds;
    },

    /**
     * Current fixed-update tick counter.
     *
     * Increments once per engine update. Reset via {@link BT.ticksReset}.
     *
     * @since 1.0.4
     * @returns Current tick count since initialization or last reset.
     */
    get ticks(): number {
        return BTAPI.instance.getTicks();
    },

    /**
     * Resets the fixed-update tick counter back to zero.
     *
     * @since 0.1.0
     */
    ticksReset: (): void => {
        BTAPI.instance.resetTicks();
    },

    /**
     * Fractional progress between the last completed fixed update and the next.
     *
     * Intended for interpolating render state between fixed-update steps.
     *
     * @since 1.3.0
     * @returns Interpolation alpha in `[0, 1)`.
     */
    get renderAlpha(): number {
        return BTAPI.instance.getRenderAlpha();
    },

    /**
     * Places a labeled marker on the overlay timing chart at the current tick.
     *
     * Requires `isOverlayTimingChartEnabled: true` in `configure()`. Tags scroll with the chart
     * history and are pruned when they leave the visible window. Empty labels become
     * `"Untitled"`. Chart width resets add an automatic `"Start"` tag.
     *
     * @since 1.1.0
     * @param label - Short event name (for example `'Round start'`).
     */
    assignTag: (label?: string): void => {
        BTAPI.instance.assignTag(label);
    },

    /**
     * Rendering backend that is currently active.
     *
     * `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     * May differ from {@link BT.requestedBackend} when WebGPU was requested but unavailable
     * (automatic software fallback). Use this getter for runtime behavior - for example,
     * skipping post-process effects that only work under WebGPU:
     *
     * ```ts
     * if (BT.activeBackend === 'webgpu') {
     *   for (const fx of BT.preset.crtPipBoy()) {
     *     BT.effectAdd(fx);
     *   }
     * }
     * ```
     *
     * @since 1.0.4
     * @returns `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     */
    get activeBackend(): Backend | null {
        return BTAPI.instance.getActiveBackend();
    },

    /**
     * Whether this is a development build, not a release build.
     *
     * Resolves from the `blit386/vite` plugin's injected runtime marker, falling back to a live
     * Vite HMR context, otherwise release. (The underlying resolver also accepts an explicit
     * override that always wins over both; nothing in the public `BT` surface supplies one today.)
     * This is UX/DX gating, not DRM - any consumer can flip the underlying global by hand.
     *
     * @since 1.5.0
     * @returns `true` for a dev build, `false` for release.
     */
    get isDevMode(): boolean {
        return BTAPI.instance.isDevMode();
    },

    /**
     * Whether the engine has finished `init()` and the game loop exists.
     *
     * `true` only after a successful {@link BT.init} (or {@link bootstrap}) has assigned
     * both the demo and the loop - the same moment `BT.renderAt`, `BT.captureFrame`, and
     * `BT.testState` become safe to call. Stays `false` before init, during splash (the
     * loop is not created until after the splash handoff), and after a failed init.
     * Remains `true` while a seek parks the loop: the loop object still exists, so a
     * parked `renderAt` does not flip this back to `false`.
     *
     * Poll this from an external driver (a screenshot tool, a play-testing harness) that
     * loads the page and needs to wait before seeking or reading state. Prefer it over
     * matching the error text from a premature `renderAt`.
     *
     * @since 1.8.0
     * @returns `true` when a demo and the game loop are live.
     */
    get isReady(): boolean {
        return BTAPI.instance.isInitialized();
    },

    /**
     * JSON readout of the running game for automated play-testing.
     *
     * Returns the current tick and active backend plus a deep copy of the game's optional
     * {@link IBTDemo.testState} result (`null` when the game has no hook). In dev builds `BT`
     * is exposed as `window.BT`, so a browser-driving agent or a CDP script reads it with
     * `window.BT.testState()` - no per-game global needed.
     *
     * The hook is looked up on the active demo instance on every call, so it keeps working
     * after a `'reinit'` hot reload replaces that instance. The result is snapshotted through
     * `JSON.parse(JSON.stringify(...))`: callers get plain data they cannot use to mutate live
     * game objects. Never throws - a throwing hook or an unserializable result (a cycle or a
     * `BigInt`) is logged as `[BT] testState() threw:` and reported as `state: null` with the
     * message in `error`.
     *
     * Available in release builds too; it only reads state and does nothing until called.
     *
     * @since 1.8.0
     * @returns `{ ticks, backend, state }`, plus `error` when the readout failed.
     */
    testState: (): TestStateSnapshot => {
        const ticks = lifecycle.ticks;
        const backend = lifecycle.activeBackend;
        const demo = BTAPI.instance.getDemo();

        if (typeof demo?.testState !== 'function') {
            return { ticks, backend, state: null };
        }

        try {
            // `JSON.stringify` returns `undefined` (despite its lib typing) for `undefined` or a function.
            const json = JSON.stringify(demo.testState()) as string | undefined;
            const state: unknown = json === undefined ? null : JSON.parse(json);

            return { ticks, backend, state };
        } catch (err) {
            console.error('[BT] testState() threw:', err);

            return { ticks, backend, state: null, error: describeTestStateError(err) };
        }
    },

    /**
     * Current BLIT386 splash lifecycle state.
     *
     * `'disabled'` when the splash was gated off, `'done'` once it has finished.
     * Both mean "not on screen, never will be again" - prefer
     * {@link BT.isSplashVisible} in game code, and reach for this only when the
     * distinction genuinely matters (debugging, the engine overlay).
     *
     * With the splash disabled this always reads `'disabled'`. With it enabled, an
     * `init()` observes `'fadingIn'` and, if it lives long enough, `'shown'`; the
     * first `update()` after handoff reads `'done'`. `'fadingOut'` is never visible
     * outside the engine, because `update()` and `render()` are suspended while the
     * splash is on screen.
     *
     * @since 1.5.0
     * @returns The splash's state.
     */
    get splashState(): SplashState {
        return BTAPI.instance.getSplashState();
    },

    /**
     * Whether the BLIT386 splash is on screen right now.
     *
     * The useful thing this buys a game: `init()` can ask whether something is
     * covering for it and preload extra assets while the splash holds.
     *
     * @since 1.5.0
     * @returns `true` while the splash is fading in, holding, or fading out.
     */
    get isSplashVisible(): boolean {
        return BTAPI.instance.isSplashVisible();
    },

    /**
     * Total number of asset loads currently in flight (images and audio clips combined).
     *
     * Useful for a loading-screen progress indicator: poll this each frame and show a
     * spinner or bar until it drops back to `0`.
     *
     * @since 1.4.0
     * @returns Combined count of in-flight `AssetLoader` and `AudioClip` loads.
     */
    get loadingAssetsCount(): number {
        return BTAPI.instance.getLoadingAssetsCount();
    },

    /**
     * Current screen orientation type from the Screen Orientation API.
     *
     * Examples: `'landscape-primary'`, `'portrait-secondary'`. Returns `null` when
     * `screen.orientation` is unavailable. Pair with
     * {@link HardwareSettings.preferredOrientation} to request a lock after init, and
     * with {@link IBTDemo.onOrientationChange} to react when the user rotates the device.
     *
     * Named `screenOrientation` (not `orientation`) to leave room for a future
     * device-orientation (alpha/beta/gamma) getter.
     *
     * @since 1.3.1
     * @returns Orientation type string, or `null` when the API is unavailable.
     */
    get screenOrientation(): string | null {
        return BTAPI.instance.getScreenOrientation();
    },

    /**
     * Whether reduced motion is currently preferred.
     *
     * Resolves `window.matchMedia('(prefers-reduced-motion: reduce)')`, or the
     * `?reducedmotion` / `?noreducedmotion` URL flags when either is present. Pair with
     * {@link IBTDemo.onReducedMotionChange} to react when the preference changes at runtime -
     * it is not fixed for the session, the same way {@link BT.screenOrientation} is not.
     *
     * @since 1.7.0
     * @returns `true` when reduced motion should be preferred.
     */
    get isReducedMotionPreferred(): boolean {
        return BTAPI.instance.isReducedMotionPreferred();
    },

    /**
     * Captures the next rendered frame as a PNG blob.
     *
     * The returned promise resolves after the next render pass has completed. By default
     * the PNG matches {@link BT.outputSize} (`drawingBufferSize ?? displaySize`), including
     * display-tier post-process effects. Pass `{ size: 'display' }` for an exact 1:1 frame
     * at logical {@link BT.displaySize}, resolved straight from the palette-indexed scene
     * buffer - no upscale and no display-tier effects (scanlines, vignette, bloom) - which
     * is what tests and agents want for pixel comparisons. The display-size capture has
     * its own pending slot, so it never contends with the F9 / Shift+F9 dev shortcuts.
     *
     * @since 1.0.3
     * @changed 1.7.1 Accepts `{ size: 'display' }` to capture at logical `BT.displaySize`.
     * @changed 1.8.0 While `BT.renderAt` holds the loop stopped, re-renders the seeked frame to capture it instead of
     * waiting for the next loop frame. Runs after every `BT.renderAt` called before it, so an un-awaited seek's frame
     * is the one captured.
     * @param options - Capture options; `size` defaults to `'output'`.
     * @returns PNG image data for the captured frame.
     *
     * @example
     * const blob = await BT.captureFrame();
     * const url = URL.createObjectURL(blob);
     * console.log('Captured frame:', url);
     *
     * // Exact game pixels, one PNG pixel per logical pixel:
     * const exact = await BT.captureFrame({ size: 'display' });
     */
    captureFrame: async (options: FrameCaptureOptions = {}): Promise<Blob> => {
        return await BTAPI.instance.captureFrame(options.size);
    },

    /**
     * Seeks the fixed-step clock and renders exactly the frame at `seconds` - on demand, with no
     * `requestAnimationFrame`, so it works in hidden and headless pages.
     *
     * `from: 'start'` (default) stops the loop, resets engine-owned state (the `BT.random` stream,
     * palette and post-process effects, camera, ticks), builds a fresh instance of your game class
     * and runs its `init()`, then steps `update()` to the target tick and renders once. The fresh
     * instance starts from the constructor, exactly like the boot run, so no field carries over from
     * the run being replaced; an object-literal game has no class, so its `init()` re-runs on the
     * same object. The class is built with no constructor arguments, so a game that needs them must
     * reset its fields in `init()` instead. If the constructor throws, nothing was reset. If `init()`
     * fails, the call rejects, the previous instance stays active, and the ticks, the `BT.random`
     * stream position, the camera offset and the post-process clock are put back, so `BT.resume()` continues the
     * old game where it was. Palette effects and post-process effects the seek cleared stay lost,
     * as do pending input edges; an object-literal game keeps any field the failed `init()` wrote, because
     * it has no fresh instance. The splash is not replayed; as in the live run, palette effects that
     * `init()` started behind it are dropped.
     * Palette slot colors are not restored, so build the palette inside `init()`. `from: 'current'` steps
     * forward from the tick the game is on and rejects a target in the past. Either way the loop
     * stays stopped afterwards: `BT.captureFrame()` captures the seeked frame, and `BT.resume()`
     * keeps playing from it.
     *
     * Cost is one `update()` per tick: three minutes at 60 FPS is 10,800 calls. Animation driven by
     * `BT.timeSeconds` seeks instantly; heavy per-tick simulation seeks slowly by design. Audio is
     * parked during the seek and sound effects played by stepped updates are dropped.
     *
     * `BT.resume()` and `BT.captureFrame()` called before the returned promise settles wait for the
     * seek to finish, so an un-awaited `BT.renderAt(5)` followed by `BT.captureFrame()` captures
     * the frame at 5 seconds.
     *
     * @since 1.8.0
     * @changed 1.9.0 A failed `init()` on a `from: 'start'` seek restores ticks, the random stream and the camera.
     * @param seconds - Target time in seconds; rounded to the nearest tick.
     * @param options - `{ from: 'start' | 'current' }`; defaults to `'start'`. Must be an object - a
     *   bare `'current'` rejects.
     * @returns Resolves once the target frame has rendered.
     *
     * @example
     * await BT.renderAt(3.2);
     * const png = await BT.captureFrame({ size: 'display' }); // the frame at tick 192
     */
    renderAt: (seconds: number, options: RenderAtOptions = {}): Promise<void> => {
        // Agents drive window.BT without TypeScript: a positional 'current' would otherwise read as
        // options.from === undefined and silently replay from the start.
        if (typeof options !== 'object' || options === null || Array.isArray(options)) {
            return Promise.reject(new Error(renderAtOptionsError(options)));
        }

        return BTAPI.instance.renderAt(seconds, options.from);
    },

    /**
     * Restarts the game loop after `BT.renderAt` left it stopped, continuing from the seeked tick.
     * Takes effect after every `BT.renderAt` called before it (awaited or not) and before any called
     * after it. Does nothing when, by then, no seek is holding the loop. Awaiting it is optional.
     *
     * Music started by a `'start'` seek's `init()` re-run plays from its beginning after resume until
     * music seeking lands.
     *
     * @since 1.8.0
     * @returns Resolves once the loop has restarted, or once the call turned out to be a no-op.
     */
    resume: (): Promise<void> => {
        return BTAPI.instance.resume();
    },

    /**
     * Captures the next rendered frame and downloads it from the browser.
     *
     * Convenience wrapper around {@link BT.captureFrame} that creates a temporary
     * object URL and clicks a synthetic anchor element. Takes the same `options` as
     * {@link BT.captureFrame}.
     *
     * @since 1.0.3
     * @changed 1.7.1 Accepts `{ size: 'display' }` to download at logical `BT.displaySize`.
     * @param filename - Target download filename.
     * @param options - Capture options; `size` defaults to `'output'`.
     *
     * @example
     * await BT.downloadFrame();
     * await BT.downloadFrame('screenshot-001.png');
     * await BT.downloadFrame('exact.png', { size: 'display' });
     */
    downloadFrame: async (
        filename: string = 'blit386-capture.png',
        options: FrameCaptureOptions = {},
    ): Promise<void> => {
        const blob = await BTAPI.instance.captureFrame(options.size);

        downloadBlob(blob, filename);
    },
};
