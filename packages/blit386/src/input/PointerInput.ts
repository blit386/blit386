/**
 * Pointer / mouse / touch input subsystem.
 *
 * Tracks up to four logical pointer slots:
 * - slot 0 is reserved for the mouse
 * - slots 1-3 fill from touch / pen contacts in arrival order
 *
 * Mirrors the slot-allocation rules of RetroBlit's `RBInput.cs` while adapting
 * the event source from Unity's polling input API to DOM `PointerEvent` /
 * `WheelEvent` listeners on the rendering canvas.
 *
 * Coordinate output is in the engine's logical display space (the
 * `displaySize` configured by the demo via `HardwareSettings`), independent
 * of the canvas's CSS or backing-buffer pixel size. This matches the rest of
 * the rendering API where everything works in display coordinates.
 */

import type { Rect2i } from '../utils/Rect2i';
import type { Vector2i } from '../utils/Vector2i';
import { Vector2i as Vector2iImpl } from '../utils/Vector2i';
import { clientToDisplayPos } from './clientToDisplayPos';
import { type PointerRouter, routeDown, routeExit, routeMove, routeUp } from './pointerRouting';
import {
    BTN_A,
    BTN_D,
    buttonBit,
    copyButtons,
    createEmptySlot,
    heldMask,
    prevMask,
    resetSlot,
    type Slot,
} from './pointerSlot';

export { POINTER_BUTTON_CODES } from './pointerSlot';

/** Maximum number of simultaneously tracked pointers (slot 0 = mouse, 1-3 = touch / pen). */
export const POINTER_SLOT_COUNT = 4;

/**
 * Which previous state a reader compares against. `'frame'` rolls over once per rendered frame ({@link
 * PointerInput.endFrame}) and serves render-side readers such as the overlay; `'update'` rolls over once per fixed
 * `update()` ({@link PointerInput.endUpdate}), so a frame that runs no update loses nothing and a frame that runs
 * several reports each edge once.
 */
export type PointerClock = 'frame' | 'update';

/** Pixels-per-line conversion for `WheelEvent.deltaMode === DOM_DELTA_LINE`. */
const WHEEL_LINE_HEIGHT_PX = 16;

/**
 * DOM-backed pointer input tracker.
 *
 * Construct, then call {@link attach} with the rendering canvas and the
 * engine's logical display size. Call {@link endUpdate} after each fixed
 * `update()` and {@link endFrame} once per rAF tick AFTER the demo's
 * `render()`, so each clock's deltas reset and its edge-detection prev-state
 * is captured for the next update or frame.
 *
 * Position queries return display-space coordinates. The slot index parameter
 * (`0` = mouse, `1`..`3` = touch / pen in arrival order) is range-checked;
 * out-of-range queries return safe defaults rather than throwing.
 */
export class PointerInput {
    /**
     * Per-slot pointer state. Fixed-length tuple of {@link POINTER_SLOT_COUNT}
     * entries (0 = mouse, 1-3 = touch / pen).
     */
    private readonly slots: readonly [Slot, Slot, Slot, Slot];

    /** Maps native `pointerId` -> slot index, so up / move / cancel events can route correctly. */
    private readonly idToSlot: Map<number, number> = new Map();

    /** Accumulated wheel delta in pixels for the current frame. */
    private scrollDeltaY: number = 0;

    /** Accumulated wheel delta in pixels since the last `update()`. */
    private updateScrollDeltaY: number = 0;

    /** Whether an `update()` has run since the last `endFrame()`, so it already read this frame's wheel delta. */
    private hasUpdatedThisFrame: boolean = false;

    /** Canvas to receive listeners; `null` until {@link attach} is called. */
    private canvas: HTMLCanvasElement | null = null;

    /** Logical display size used for screen-to-display coordinate conversion. */
    private displaySize: Vector2i | null = null;

    /** Captured `canvas.style.touchAction` value, restored by {@link detach}. */
    private originalTouchAction: string | null = null;

    /** Captured `canvas.style.cursor` value, restored by {@link detach}. */
    private originalCursor: string | null = null;

    /**
     * Cached result of `canvas.getBoundingClientRect()`, reused by every
     * pointer event in a frame instead of forcing a fresh layout read per
     * event. `null` until first computed by {@link getCanvasRect}.
     */
    private cachedRect: DOMRect | null = null;

    /**
     * True when {@link cachedRect} must be recomputed before its next use.
     * Set by the resize observer, the window `resize` / `scroll` listeners,
     * and once per {@link endFrame} tick as a safety net for layout changes
     * that fire none of those (a CSS transform or class toggle on an
     * ancestor) - see {@link endFrame}'s JSDoc for the tradeoff.
     */
    private isRectDirty = true;

    /** Observes the canvas's own box for CSS-driven size changes; created by {@link attach}. */
    private resizeObserver: ResizeObserver | null = null;

    /**
     * The canvas's owning `window` (`canvas.ownerDocument.defaultView`), captured
     * by {@link attach} so the `resize` / `scroll` invalidation listeners are
     * registered on - and removed from - the same window the canvas actually
     * lives in, not the global `window`. These differ when the canvas sits in an
     * iframe or a secondary document.
     */
    private canvasWindow: (Window & typeof globalThis) | null = null;

    /**
     * When true, wheel events call `preventDefault` and accumulate into
     * {@link getScrollDelta}. Set from `HardwareSettings.isCapturingPointerScroll`.
     */
    private isCapturingScroll = false;

    /**
     * When true, forces the same capture behavior as {@link isCapturingScroll}.
     * Used by the overlay palette band so wheel scroll works without a demo opt-in.
     */
    private isScrollCaptureForced = false;

    private readonly onMove: (event: PointerEvent) => void;
    private readonly onDown: (event: PointerEvent) => void;
    private readonly onUp: (event: PointerEvent) => void;
    private readonly onPointerExit: (event: PointerEvent) => void;
    private readonly onWheel: (event: WheelEvent) => void;
    private readonly onContextMenu: (event: Event) => void;
    /** Marks {@link cachedRect} dirty on the canvas window's `resize` event. */
    private readonly onWindowResize: () => void;

    /** Marks {@link cachedRect} dirty on the canvas window's `scroll` event (capture phase). */
    private readonly onWindowScroll: () => void;

    /**
     * Creates a `PointerInput` with all slots inactive.
     *
     * Listeners are bound here so {@link detach} can remove the same function
     * references that {@link attach} added.
     */
    constructor() {
        this.slots = [createEmptySlot(), createEmptySlot(), createEmptySlot(), createEmptySlot()];

        const router: PointerRouter = {
            slots: this.slots,
            idToSlot: this.idToSlot,
            getCanvas: () => this.canvas,
            place: (slot, clientX, clientY) => this.updateSlotPosition(slot, clientX, clientY),
        };

        this.onMove = (event) => routeMove(router, event);
        this.onDown = (event) => routeDown(router, event);
        this.onUp = (event) => routeUp(router, event);
        this.onPointerExit = (event) => routeExit(router, event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onContextMenu = (event) => event.preventDefault();
        this.onWindowResize = () => {
            this.isRectDirty = true;
        };
        this.onWindowScroll = () => {
            this.isRectDirty = true;
        };
    }

    /**
     * Attaches DOM listeners to the canvas and stores the logical display size.
     *
     * Installs page-interaction guards on the canvas:
     * - `wheel` with `{ passive: false }` so `preventDefault` can run when scroll
     *   capture is active ({@link setIsCapturingScroll} or {@link setIsScrollCaptureForced})
     * - `canvas.style.touchAction` gated by the same scroll-capture state (see
     *   {@link updateTouchAction}) so the host page keeps vertical touch scroll
     *   over the canvas except while scroll capture is active
     * - `contextmenu.preventDefault()` so right-click feeds `BTN_B`
     *   instead of popping the OS context menu
     *
     * Also installs the {@link cachedRect} invalidation sources: a
     * `ResizeObserver` on the canvas, and `resize` / `scroll` listeners on
     * the canvas's owning window (`canvas.ownerDocument.defaultView`, not
     * necessarily the global `window` - they differ for a canvas in an
     * iframe or a secondary document). `scroll` uses the capture phase
     * since a scroll on any ancestor can shift the canvas's client rect
     * without resizing it. These mark the cache dirty instead of reading
     * the rect synchronously, so a high-frequency scroll gesture doesn't
     * reintroduce the same layout-thrash risk this cache exists to avoid.
     *
     * @param canvas - Canvas element rendering the engine output.
     * @param displaySize - Logical display size used to convert screen coordinates.
     */
    public attach(canvas: HTMLCanvasElement, displaySize: Vector2i): void {
        this.detach();

        this.canvas = canvas;
        this.displaySize = displaySize;
        this.isRectDirty = true;

        this.originalTouchAction = canvas.style.touchAction;
        this.originalCursor = canvas.style.cursor;

        this.updateTouchAction();

        canvas.addEventListener('pointermove', this.onMove);
        canvas.addEventListener('pointerdown', this.onDown);
        canvas.addEventListener('pointerup', this.onUp);
        canvas.addEventListener('pointercancel', this.onPointerExit);
        canvas.addEventListener('pointerleave', this.onPointerExit);
        canvas.addEventListener('wheel', this.onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this.onContextMenu);

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.isRectDirty = true;
            });
            this.resizeObserver.observe(canvas);
        }

        this.canvasWindow = canvas.ownerDocument?.defaultView ?? null;

        if (this.canvasWindow !== null) {
            this.canvasWindow.addEventListener('resize', this.onWindowResize);
            this.canvasWindow.addEventListener('scroll', this.onWindowScroll, { capture: true, passive: true });
        }
    }

    /**
     * Removes all DOM listeners and resets per-slot state.
     *
     * Restores the canvas's original `touchAction` value (whatever it was at
     * the time of {@link attach}) so this class doesn't leak CSS state.
     * Safe to call repeatedly or before {@link attach}.
     */
    public detach(): void {
        const canvas = this.canvas;

        if (canvas !== null) {
            for (const [pointerId] of this.idToSlot) {
                try {
                    if (canvas.hasPointerCapture(pointerId)) {
                        canvas.releasePointerCapture(pointerId);
                    }
                } catch {
                    // Element may have been removed from the DOM already.
                }
            }

            canvas.removeEventListener('pointermove', this.onMove);
            canvas.removeEventListener('pointerdown', this.onDown);
            canvas.removeEventListener('pointerup', this.onUp);
            canvas.removeEventListener('pointercancel', this.onPointerExit);
            canvas.removeEventListener('pointerleave', this.onPointerExit);
            canvas.removeEventListener('wheel', this.onWheel);
            canvas.removeEventListener('contextmenu', this.onContextMenu);

            if (this.originalTouchAction !== null) {
                canvas.style.touchAction = this.originalTouchAction;
            }

            if (this.originalCursor !== null) {
                canvas.style.cursor = this.originalCursor;
            }
        }

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.canvasWindow !== null) {
            this.canvasWindow.removeEventListener('resize', this.onWindowResize);
            this.canvasWindow.removeEventListener('scroll', this.onWindowScroll, { capture: true });
        }

        this.canvasWindow = null;
        this.canvas = null;
        this.displaySize = null;
        this.originalTouchAction = null;
        this.originalCursor = null;
        this.isCapturingScroll = false;
        this.isScrollCaptureForced = false;
        this.cachedRect = null;
        this.isRectDirty = true;

        this.idToSlot.clear();
        this.scrollDeltaY = 0;
        this.updateScrollDeltaY = 0;
        this.hasUpdatedThisFrame = false;

        for (const slot of this.slots) {
            resetSlot(slot);
        }
    }

    /**
     * Snapshots `'frame'`-clock state at the END of each rAF tick, and clears the frame clock's pending press and
     * release flags.
     *
     * Must be called once per tick after demo `update()` and `render()`, overlay
     * draws, and renderer submit. Snapshots `pos -> prevPos` so the
     * next frame's `getDelta` reflects movement during the inter-frame gap,
     * snapshots `down -> prevDown` so the next frame's `isButtonPressed`
     * / `isButtonReleased` see the transition, and clears the accumulated
     * wheel delta so the next frame's `getScrollDelta` accumulates fresh.
     *
     * The end-of-tick timing matters: DOM pointer / wheel events fire
     * asynchronously between rAF callbacks. Snapshotting at the START of a
     * tick would capture the post-event state as `prev`, hiding edges that
     * occurred during the inter-frame gap. By snapshotting at the END of the
     * tick, `prev` is the state at the end of the last rendered frame, and any
     * event that arrives before the next frame is visible to render-side
     * readers as a transition. Update-side readers compare against the state
     * {@link endUpdate} snapshotted instead.
     *
     * Also marks {@link cachedRect} dirty for the next tick. This is a
     * safety net on top of the `ResizeObserver` / `resize` / `scroll`
     * invalidation sources installed by {@link attach}: none of those fire
     * for a layout change with no dedicated DOM event (a CSS transform or a
     * class toggle on an ancestor resizing the canvas). Recomputing at most
     * once per tick bounds the staleness window to a single frame
     * (~16 ms at 60 fps) while still cutting reads from once per pointer
     * event (up to 500-1000/s for a high-poll-rate mouse) down to once per
     * rendered frame.
     *
     * Rolls over the `'frame'` clock only. The `'update'` clock that `update()`
     * reads is rolled by {@link endUpdate}, so a frame that runs no update
     * (display faster than `targetFPS`) loses no update-side delta, edge, or
     * wheel scroll.
     */
    public endFrame(): void {
        for (const slot of this.slots) {
            slot.prevPos.copyFrom(slot.pos);
            copyButtons(slot.down, slot.prevDown);
            slot.framePendingPress = 0;
            slot.framePendingRelease = 0;
        }

        this.scrollDeltaY = 0;
        this.hasUpdatedThisFrame = false;
        this.isRectDirty = true;
    }

    /**
     * Snapshots `'update'`-clock state after each fixed `update()` step, and clears the update clock's pending press
     * and release flags.
     *
     * Snapshots `pos -> updatePrevPos` and `down -> updatePrevDown`, and clears
     * the update-side wheel delta, so the next `update()` sees exactly what
     * happened since this one, however many frames render in between.
     */
    public endUpdate(): void {
        for (const slot of this.slots) {
            slot.updatePrevPos.copyFrom(slot.pos);
            copyButtons(slot.down, slot.updatePrevDown);
            slot.updatePendingPress = 0;
            slot.updatePendingRelease = 0;
        }

        this.updateScrollDeltaY = 0;
        this.hasUpdatedThisFrame = true;
    }

    /**
     * Returns the position of the pointer in slot `slot` in display coordinates.
     *
     * Returns `Vector2i.zero()` when the slot index is out of `[0, POINTER_SLOT_COUNT - 1]`.
     * Valid slots return a clone; invalid slots return the shared zero singleton
     * (do not mutate the return value when the slot is invalid).
     *
     * @param slot - Pointer slot index (0 = mouse, 1-3 = touch / pen).
     * @returns Pointer position in display coordinates, or `Vector2i.zero()` for invalid slots.
     */
    public getPos(slot: number): Vector2i {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            return Vector2iImpl.zero();
        }

        return s.pos.clone();
    }

    /**
     * Writes the position of the pointer in slot `slot`, in display coordinates, into `out`.
     *
     * Zero-allocation alternative to `getPos()`. Writes `(0, 0)` into `out` when the slot index is
     * out of `[0, POINTER_SLOT_COUNT - 1]`.
     *
     * @param slot - Pointer slot index (0 = mouse, 1-3 = touch / pen).
     * @param out - Vector to write the pointer position into.
     * @returns The `out` vector, for chaining.
     */
    public getPosTo(slot: number, out: Vector2i): Vector2i {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        return s.pos.cloneTo(out);
    }

    /**
     * Returns the position delta for slot `slot` since the last `endFrame()` (`'frame'`) or `endUpdate()`
     * (`'update'`).
     *
     * Returns `Vector2i.zero()` when the slot index is out of range.
     *
     * @param slot - Pointer slot index.
     * @param clock - Which previous state to compare against.
     * @returns Delta in display coordinates.
     */
    public getDelta(slot: number, clock: PointerClock = 'frame'): Vector2i {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            return Vector2iImpl.zero();
        }

        const prev = clock === 'update' ? s.updatePrevPos : s.prevPos;

        return new Vector2iImpl(s.pos.x - prev.x, s.pos.y - prev.y);
    }

    /**
     * Writes the position delta for slot `slot` since the last `endFrame()` (`'frame'`) or `endUpdate()`
     * (`'update'`) into `out`.
     *
     * Zero-allocation alternative to `getDelta()`. Writes `(0, 0)` into `out` when the slot index
     * is out of range.
     *
     * @param slot - Pointer slot index.
     * @param out - Vector to write the delta into.
     * @param clock - Which previous state to compare against.
     * @returns The `out` vector, for chaining.
     */
    public getDeltaTo(slot: number, out: Vector2i, clock: PointerClock = 'frame'): Vector2i {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        const prev = clock === 'update' ? s.updatePrevPos : s.prevPos;

        out.x = s.pos.x - prev.x;
        out.y = s.pos.y - prev.y;

        return out;
    }

    /**
     * Reports whether the pointer in slot `slot` is currently active.
     *
     * For slot 0 (mouse) this means a `pointermove` has been observed inside
     * the canvas and no subsequent `pointerleave` has cleared it. For touch /
     * pen slots this means the contact is still down.
     *
     * @param slot - Pointer slot index.
     * @returns `true` when the slot has live position data.
     */
    public isActive(slot: number): boolean {
        return this.getSlotOrNull(slot)?.isActive ?? false;
    }

    /**
     * Reports whether the pointer in slot `slot` is positioned inside `rect`, without
     * allocating a `Vector2i` (unlike `getPos(slot)` followed by a containment check).
     *
     * @param slot - Pointer slot index.
     * @param rect - Rectangle to test against, in display coordinates.
     * @returns `true` when the slot is active and its position is inside `rect`.
     */
    public isSlotInRect(slot: number, rect: Rect2i): boolean {
        const s = this.getSlotOrNull(slot);

        return s?.isActive === true && rect.isContainingXY(s.pos.x, s.pos.y);
    }

    /**
     * Returns the wheel scroll delta accumulated during the current frame (`'frame'`) or since the last
     * `update()` (`'update'`), in pixels.
     *
     * Reset to zero by `endFrame()` or `endUpdate()` respectively. Aggregates `WheelEvent.deltaY` across
     * all wheel events received since the last reset, normalizing
     * `deltaMode === DOM_DELTA_LINE` (1 line = 16 px) and `DOM_DELTA_PAGE`
     * (1 page = the canvas window's `innerHeight` px).
     *
     * @param clock - Which accumulator to read.
     * @returns Vertical scroll delta in pixels.
     */
    public getScrollDelta(clock: PointerClock = 'frame'): number {
        return clock === 'update' ? this.updateScrollDeltaY : this.scrollDeltaY;
    }

    /**
     * Removes this frame's wheel delta from both clocks.
     *
     * Used when the overlay consumes scroll input over the palette footer so
     * demo code reading {@link BT.pointerScrollDelta} does not see the same delta,
     * including in the next `update()` after a frame that ran none. Wheel scroll
     * from earlier render-only frames, which the overlay did not use, stays in
     * the update-side total. On a frame that ran an `update()`, that update has
     * already read the wheel and reset its total, so there is nothing to remove.
     */
    public consumeScrollDelta(): void {
        if (!this.hasUpdatedThisFrame) {
            this.updateScrollDeltaY -= this.scrollDeltaY;
        }

        this.scrollDeltaY = 0;
    }

    /**
     * Enables or disables configure-time wheel capture on the canvas.
     *
     * When enabled, wheel events call `preventDefault` and accumulate into
     * {@link getScrollDelta}. When disabled (the default), the host page can
     * scroll while the pointer is over the canvas unless
     * {@link setIsScrollCaptureForced} is active.
     *
     * @param enabled - Whether the demo opted into pointer scroll capture.
     */
    public setIsCapturingScroll(enabled: boolean): void {
        this.isCapturingScroll = enabled;
        this.updateTouchAction();
    }

    /**
     * Forces wheel capture for the current hover state (overlay palette band).
     *
     * Independent of {@link setIsCapturingScroll}. Cleared when the pointer
     * leaves the palette band or the overlay body is hidden.
     *
     * @param forced - Whether overlay scroll capture is active this frame.
     */
    public setIsScrollCaptureForced(forced: boolean): void {
        this.isScrollCaptureForced = forced;
        this.updateTouchAction();
    }

    /**
     * Reports whether the given pointer button is held in slot `slot`.
     *
     * For slot 0 (mouse): `BTN_A` is left, `B` is right, `C` is middle,
     * `D` is back / forward (matches RetroBlit canonical, not DOM
     * `PointerEvent.button` index order).
     *
     * For slots 1-3 (touch / pen): only `BTN_A` is ever true while the
     * contact is down; `B`, `C`, `D` always return `false`.
     *
     * @param button - One of `BTN_A..D`.
     * @param slot - Pointer slot index.
     * @returns `true` while the button remains pressed and the slot is active.
     */
    public isButtonDown(button: number, slot: number): boolean {
        const s = this.getSlotOrNull(slot);

        if (s === null || !s.isActive) {
            return false;
        }

        return button >= BTN_A && button <= BTN_D && s.down[button - BTN_A] === true;
    }

    /**
     * Reports whether the given pointer button went down since the last frame or update (see `clock`).
     * Unlike {@link isButtonDown}, does not require the slot to be active, so press
     * edges remain visible after deactivation.
     *
     * @param button - One of `BTN_A..D`.
     * @param slot - Pointer slot index.
     * @param clock - Which previous state to compare against.
     * @returns `true` if the button went down since the last frame (`'frame'`) or update (`'update'`).
     */
    public isButtonPressed(button: number, slot: number, clock: PointerClock = 'frame'): boolean {
        const s = this.getSlotOrNull(slot);
        const bit = buttonBit(button);

        if (s === null || bit === 0) {
            return false;
        }

        const isUpdate = clock === 'update';

        // A down and up that both landed since the last rollover leave no held-versus-previous difference.
        if (((isUpdate ? s.updatePendingPress : s.framePendingPress) & bit) !== 0) {
            return true;
        }

        return (heldMask(s) & ~prevMask(s, isUpdate) & bit) !== 0;
    }

    /**
     * Reports whether the given pointer button went up since the last frame or update (see `clock`).
     * Unlike {@link isButtonDown}, does not require the slot to be active.
     *
     * @param button - One of `BTN_A..D`.
     * @param slot - Pointer slot index.
     * @param clock - Which previous state to compare against.
     * @returns `true` if the button went up since the last frame (`'frame'`) or update (`'update'`).
     */
    public isButtonReleased(button: number, slot: number, clock: PointerClock = 'frame'): boolean {
        const s = this.getSlotOrNull(slot);
        const bit = buttonBit(button);

        if (s === null || bit === 0) {
            return false;
        }

        const isUpdate = clock === 'update';

        if (((isUpdate ? s.updatePendingRelease : s.framePendingRelease) & bit) !== 0) {
            return true;
        }

        return (~heldMask(s) & prevMask(s, isUpdate) & bit) !== 0;
    }

    /**
     * Hides the native OS cursor while the pointer is over the canvas.
     *
     * Sets `canvas.style.cursor = 'none'`. No-op when not attached.
     */
    public hideCursor(): void {
        if (this.canvas !== null) {
            this.canvas.style.cursor = 'none';
        }
    }

    /**
     * Restores the native OS cursor to the value it had at {@link attach} time.
     *
     * No-op when not attached.
     */
    public showCursor(): void {
        if (this.canvas !== null) {
            this.canvas.style.cursor = this.originalCursor ?? '';
        }
    }

    /**
     * Routes a `wheel` event: when scroll capture is active, normalizes `deltaY`
     * to pixels (line and page delta modes are converted), accumulates into
     * `scrollDeltaY` for the current frame, and calls `preventDefault` so the
     * page does not scroll. When capture is inactive, leaves the event alone
     * so the host page can scroll.
     *
     * Capture is active when {@link setIsCapturingScroll} or
     * {@link setIsScrollCaptureForced} is enabled.
     *
     * @param event - DOM wheel event from the canvas.
     */
    private handleWheel(event: WheelEvent): void {
        if (!this.isCapturingScroll && !this.isScrollCaptureForced) {
            return;
        }

        event.preventDefault();

        let pixels = event.deltaY;

        if (event.deltaMode === 1) {
            // DOM_DELTA_LINE
            pixels *= WHEEL_LINE_HEIGHT_PX;
        } else if (event.deltaMode === 2) {
            // DOM_DELTA_PAGE
            pixels *= (this.canvasWindow ?? window).innerHeight;
        }

        this.scrollDeltaY += pixels;
        this.updateScrollDeltaY += pixels;
    }

    /**
     * Syncs `canvas.style.touchAction` to the current scroll-capture state:
     * `'none'` while either {@link setIsCapturingScroll} or
     * {@link setIsScrollCaptureForced} is active, so iOS Safari doesn't
     * intercept touches for pinch-zoom or double-tap-zoom over a canvas that
     * wants the wheel/scroll gesture; `'pan-y'` otherwise, so the host page
     * still scrolls vertically past the canvas on touch devices. No-op
     * when not attached.
     */
    private updateTouchAction(): void {
        if (this.canvas === null) {
            return;
        }

        this.canvas.style.touchAction = this.isCapturingScroll || this.isScrollCaptureForced ? 'none' : 'pan-y';
    }

    /**
     * Converts viewport coordinates from a DOM event to display-space pixels
     * and writes them to the slot's `pos` in place.
     *
     * Skips the update when the canvas has zero size (no layout yet) so the
     * division does not produce NaN coordinates.
     *
     * @param slot - Slot whose position to update.
     * @param clientX - DOM `clientX` from the source event.
     * @param clientY - DOM `clientY` from the source event.
     */
    private updateSlotPosition(slot: Slot, clientX: number, clientY: number): void {
        const displaySize = this.displaySize;

        if (displaySize === null) {
            return;
        }

        const rect = this.getCanvasRect();

        if (rect === null) {
            return;
        }

        // Returns null on a zero-sized canvas (no layout yet), leaving the slot untouched.
        clientToDisplayPos(clientX, clientY, rect, displaySize, slot.pos);
    }

    /**
     * Returns the canvas's bounding client rect, reusing {@link cachedRect}
     * unless {@link isRectDirty} demands a fresh `getBoundingClientRect()`
     * read. This is what keeps a burst of pointer events (a high-poll-rate
     * mouse firing `pointermove` at 500-1000 Hz) from each forcing a
     * synchronous style/layout flush.
     *
     * @returns The current canvas rect, or `null` when not attached.
     */
    private getCanvasRect(): DOMRect | null {
        const canvas = this.canvas;

        if (canvas === null) {
            return null;
        }

        if (this.isRectDirty || this.cachedRect === null) {
            this.cachedRect = canvas.getBoundingClientRect();
            this.isRectDirty = false;
        }

        return this.cachedRect;
    }

    /**
     * Returns the slot at `index` if `index` is a valid slot, or `null` otherwise.
     *
     * Used by all public read methods to bounds-check the caller-supplied slot
     * argument while keeping `noUncheckedIndexedAccess` happy.
     *
     * @param index - Slot index to look up.
     * @returns Slot at the index, or `null` for out-of-range indices.
     */
    private getSlotOrNull(index: number): Slot | null {
        if (!Number.isInteger(index) || index < 0 || index >= POINTER_SLOT_COUNT) {
            return null;
        }

        // eslint-disable-next-line security/detect-object-injection -- bounds checked above
        return this.slots[index] ?? null;
    }
}
