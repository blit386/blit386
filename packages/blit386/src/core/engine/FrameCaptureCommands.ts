/**
 * Frame capture: `BT.captureFrame()` (with the re-render while `BT.renderAt` holds the loop stopped) and the
 * dev-mode F9 (copy to clipboard) and Shift+F9 (download) shortcuts. Part of {@link BTAPI}; not part of the BT API.
 */

import { downloadBlob, type FrameCaptureSize, writeBlobToClipboard } from '../../utils/FrameCapture';
import { defaultFrameCaptureFilename, isFrameCaptureShortcutEnabled } from '../../utils/FrameCaptureShortcut';
import type { BTAPI } from '../BTAPI';

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

/** Frame capture and the F9 / Shift+F9 shortcuts. */
export class FrameCaptureCommands {
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
    public isFrameCaptureShortcutInFlight = false;

    /**
     * Incremented by {@link BTAPI.stop}; both shortcut methods capture the current value before
     * starting and only clear {@link isFrameCaptureShortcutInFlight} in their completion
     * handler if it still matches. `FrameCapture.resolve()` captures its pending
     * resolve/reject callbacks into locals before its own `await`s, so a capture already
     * mid-readback when `stop()` runs keeps running independently of the game loop and can
     * still settle after a subsequent `init()` has created a new renderer and started its
     * own capture; without this check that stale completion would clear the new capture's
     * guard early.
     */
    public frameCaptureShortcutGeneration = 0;

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

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
        if (!this.engine.renderer) {
            return Promise.reject(new Error("Can't capture frame: renderer not initialized"));
        }

        const capture =
            size === 'display' ? this.engine.renderer.captureFrameAtDisplaySize() : this.engine.renderer.captureFrame();

        // The returned promise carries this request's result. When the re-render below throws, that
        // promise rejects with the render error and the renderer's request is abandoned; a later
        // supersede or reset rejection of it must not go unhandled.
        capture.catch(() => undefined);

        // A throw from the parked re-render rejects the returned promise instead of hanging it.
        return this.renderParkedFrame().then(() => capture);
    }

    /**
     * Whether Shift+F9 was pressed this tick, per {@link HardwareSettings.isFrameCaptureShortcutEnabled}
     * gating and both Shift key codes. Extracted from the fixed-update tick closure to keep
     * its cyclomatic complexity within lint limits.
     *
     * @param tick - Current fixed-update tick, for the keyboard's edge-detection window.
     * @returns `true` when Shift+F9 was pressed this tick and the shortcut is enabled.
     */
    public isShiftF9ShortcutPressed(tick: number): boolean {
        return (
            isFrameCaptureShortcutEnabled(this.engine.hwSettings?.isFrameCaptureShortcutEnabled) &&
            SHIFT_KEY_CODES.some((code) => this.engine.keyboard?.isKeyDown(code)) &&
            this.engine.keyboard?.isKeyPressed(FRAME_CAPTURE_SHORTCUT_KEY_CODE, undefined, tick) === true
        );
    }

    /**
     * Bound `keydown` listener for the bare-F9 clipboard-copy shortcut, attached directly to
     * the canvas by {@link Subsystems.attachInputSubsystems} alongside {@link KeyboardInput} rather than
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
    public readonly handleClipboardShortcutKeydown = (event: KeyboardEvent): void => {
        if (
            event.code !== FRAME_CAPTURE_SHORTCUT_KEY_CODE ||
            event.shiftKey ||
            event.repeat ||
            this.isFrameCaptureShortcutInFlight ||
            !isFrameCaptureShortcutEnabled(this.engine.hwSettings?.isFrameCaptureShortcutEnabled)
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
    public async captureFrameViaShortcut(): Promise<void> {
        const generation = this.frameCaptureShortcutGeneration;

        this.isFrameCaptureShortcutInFlight = true;

        try {
            if (!this.engine.renderer) {
                throw new Error("Can't capture frame: renderer not initialized");
            }

            const blob = await this.engine.renderer.captureFrameForShortcut();
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
     * Copies the current frame to the OS clipboard as a PNG, for the bare-F9 dev-mode shortcut, at logical
     * `BT.displaySize`. Synchronous up to `navigator.clipboard.write()` so the write stays tied to the keypress -
     * see {@link handleClipboardShortcutKeydown}. Errors are logged, not thrown.
     */
    private copyFrameViaShortcut(): void {
        if (!this.engine.renderer) {
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
        void this.settleFrameCopy(writeBlobToClipboard(this.engine.renderer.captureFrameForShortcut()), generation);
        this.renderParkedFrame().catch((error: unknown) => {
            console.error('[BT] Frame copy (F9) failed:', error);
        });
    }

    /**
     * Settles a pending frame capture while {@link Seek.renderAt} holds the loop stopped. Runs after every
     * `renderAt` called so far; when a seek has parked the loop no frame end is coming, so this re-renders the
     * current tick with zero updates (no clock moves, the frame is the seeked one). Does nothing while the loop runs.
     *
     * @returns Promise that settles after the re-render; rejects when the game's `render()` throws.
     */
    private async renderParkedFrame(): Promise<void> {
        await this.engine.seekChain;

        if (this.engine.isSeekParked) {
            this.engine.loop?.step(0);
        }
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
}
