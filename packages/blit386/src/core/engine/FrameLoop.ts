/**
 * The game loop's two callbacks - one fixed-update tick and one rendered frame - and the tick clock
 * they run on. Part of {@link BTAPI}; not part of the BT API.
 */

import { OVERLAY_TOGGLE_KEY_CODE } from '../../overlay';
import { isDevMode } from '../../utils/devMode';
import { Vector2i } from '../../utils/Vector2i';
import type { BTAPI } from '../BTAPI';
import type { OverlayRow } from '../IBTDemo';
import { resetUsage } from '../RenderPaletteUsage';

/** The game loop's update and render callbacks and the tick clock. */
export class FrameLoop {
    /**
     * Overlay Backquote toggle press captured during a fixed-update tick, before
     * {@link KeyboardInput.endUpdate} clears that tick's press edge. Read and reset by
     * {@link beginRenderFrame} so the overlay (checked during the render phase, after every
     * update tick for the frame has already run) still observes a press that landed inside a tick.
     */
    private pendingOverlayTogglePress = false;

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * One fixed-update tick: the game's `update()`, palette effects, input edge sampling and rollover.
     * The loop's update callback.
     */
    public update(): void {
        const updateStartMs = performance.now();
        this.commitPendingCameraReset();
        this.engine.updating = true;

        try {
            this.engine.demo?.update();
        } finally {
            this.engine.updating = false;
        }

        this.engine.pendingUpdateMs += Math.max(0, performance.now() - updateStartMs);
        this.engine.pendingUpdateSteps++;

        // Palette effects advance once per fixed update, after the game's update(), on the
        // tick clock. Per update rather than per render is what makes BT.renderAt exact: a
        // seek runs the same palette updates as live play instead of one catch-up update at
        // the end (a flash would only take its snapshot then), and the look no longer depends
        // on the display's refresh rate.
        if (this.engine.palette && this.engine.paletteEffects.activeCount > 0) {
            this.engine.paletteEffects.update(this.engine.palette);
        }

        const tick = this.engine.loop?.getTicks() ?? 0;

        // Sample the overlay toggle key's press edge before endUpdate clears it below.
        // The overlay itself is only checked later, during the render phase (beginRenderFrame),
        // by which point this tick's edge would otherwise already be gone.
        if (this.engine.keyboard?.isKeyPressed(OVERLAY_TOGGLE_KEY_CODE, undefined, tick)) {
            this.pendingOverlayTogglePress = true;
        }

        // Dev-mode default: Shift+F9 saves a screenshot in every demo, no demo
        // code needed. Unlike the overlay toggle above, this doesn't need to wait
        // for the render phase - it just kicks off an async capture-and-download.
        // Bare F9 (no Shift) instead copies to the OS clipboard, but that path is
        // NOT handled here - see handleClipboardShortcutKeydown's doc comment for
        // why it runs from a dedicated keydown listener instead of this tick.
        if (!this.engine.capture.isFrameCaptureShortcutInFlight && this.engine.capture.isShiftF9ShortcutPressed(tick)) {
            void this.engine.capture.captureFrameViaShortcut();
        }

        if (this.engine.inputTrace.isRecording) {
            this.engine.inputTrace.record(
                'update',
                tick,
                this.engine.pointer,
                this.engine.keyboard,
                this.engine.gamepad,
            );
        }

        // Keyboard, gamepad and pointer edges (plus the keyboard text buffer, pointer delta and
        // wheel scroll) align with fixed update rate, not display refresh rate (render may run 2x
        // update on 120 Hz / 60 FPS setups), so each edge reaches exactly one update.
        this.engine.keyboard?.endUpdate();
        this.engine.gamepad?.endUpdate(tick);
        this.engine.pointer?.endUpdate();
    }

    /**
     * One rendered frame: the game's `render()`, the overlay, diagnostics, and the render-side input clocks.
     * The loop's render callback.
     */
    public render(): void {
        const frameStartMs = performance.now();
        let renderMs = 0;

        if (this.engine.renderer) {
            this.beginRenderFrame();

            this.engine.renderer.beginFrame();

            // Re-prime the world camera before the demo draws, in case this render
            // frame has zero fixed-update steps (see lastCameraOffset doc comment).
            this.engine.renderer.setCameraOffset(this.engine.lastCameraOffset);

            const renderStartMs = performance.now();

            this.engine.demo?.render();

            renderMs = Math.max(0, performance.now() - renderStartMs);

            // Before the overlay, which can consume this frame's wheel scroll.
            if (this.engine.inputTrace.isRecording) {
                this.engine.inputTrace.record(
                    'render',
                    this.engine.loop?.getTicks() ?? 0,
                    this.engine.pointer,
                    this.engine.keyboard,
                    this.engine.gamepad,
                );
            }

            // Overlay: screen-space HUD after demo content (top/bottom bars).
            if (this.engine.overlay && this.engine.systemFont) {
                this.engine.overlay.updateAndRender(
                    this.engine.renderer,
                    this.engine.systemFont,
                    this.engine.pointer,
                    this.engine.keyboard,
                    this.engine.loop?.getTicks() ?? 0,
                    this.getDemoOverlayRows,
                    this.engine.diagnostics.overlayTiming,
                    this.engine.palette,
                    this.engine.draw.framePaletteUsageMask,
                    this.engine.diagnostics.audioSnapshot,
                );
            }

            this.engine.diagnostics.captureRendererDiagnostics();
            this.engine.diagnostics.captureAudioDiagnostics();

            this.engine.renderer.endFrame(this.consumeFrameDeltaMs());
        }

        // Roll the pointer's render-side ('frame') clock for the overlay and render() readers.
        // update() reads the 'update' clock, rolled in the update callback above, so a frame
        // that runs no update loses nothing for it.
        this.engine.pointer?.endFrame();

        // One Gamepad API poll per rendered frame. It does not roll edges over (the update
        // callback does), so a press polled here survives a frame that runs no update.
        this.engine.gamepad?.endFrame();

        this.engine.diagnostics.commitFrame(frameStartMs, renderMs);

        this.engine.pendingUpdateMs = 0;
        this.engine.pendingUpdateSteps = 0;
        this.engine.pendingDrawCalls = 0;
    }

    /**
     * Engine tick clock in milliseconds: `ticks * 1000 / targetFPS`. Palette effects and post-process
     * effects read this instead of `performance.now()`, which is what makes `BT.renderAt` exact.
     *
     * @returns Milliseconds of fixed-step time since init or the last tick reset.
     */
    public getTickClockMs(): number {
        return this.engine.getTicks() * this.engine.updateIntervalMs;
    }

    /**
     * Tick-clock milliseconds since the previous loop render, for post-process effects. Clamped at
     * 0 so a clock reset (`BT.ticksReset()`) never runs effect time backwards.
     *
     * @returns Non-negative effect time for this frame.
     */
    private consumeFrameDeltaMs(): number {
        const nowMs = this.getTickClockMs();
        const deltaMs = Math.max(0, nowMs - this.engine.lastRenderClockMs);

        this.engine.lastRenderClockMs = nowMs;

        return deltaMs;
    }

    /**
     * Applies a deferred {@link resetCamera} to {@link lastCameraOffset}, if one is pending.
     * Called at the start of the fixed-update tick, before the demo's own `update()` runs, so a
     * `setCameraOffset()` call inside that `update()` overrides it normally - see
     * {@link pendingCameraReset}.
     */
    private commitPendingCameraReset(): void {
        if (this.engine.pendingCameraReset) {
            this.engine.pendingCameraReset = false;
            this.engine.lastCameraOffset = Vector2i.zero();
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
    private readonly getDemoOverlayRows = (): readonly OverlayRow[] | undefined => this.engine.demo?.overlayRows?.();

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
        this.engine.isDevGuardActive = isDevMode();

        if (this.engine.overlay) {
            this.engine.overlay.handleFrameInput(
                this.engine.pointer,
                this.pendingOverlayTogglePress,
                this.engine.loop?.getTicks() ?? 0,
                this.getDemoOverlayRows,
                this.engine.palette,
            );
        }

        this.pendingOverlayTogglePress = false;

        if (this.engine.draw.isTrackingFramePaletteUsage()) {
            resetUsage(this.engine.draw.framePaletteUsageMask);
        }
    }
}
