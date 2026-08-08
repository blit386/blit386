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

/** Maximum number of simultaneously tracked pointers (slot 0 = mouse, 1-3 = touch / pen). */
export const POINTER_SLOT_COUNT = 4;

/** Pixels-per-line conversion for `WheelEvent.deltaMode === DOM_DELTA_LINE`. */
const WHEEL_LINE_HEIGHT_PX = 16;

/** Primary pointer button code (mouse left / touch contact). Maps to `BT.BTN_POINTER_A`. */
const BTN_A = 20;

/** Secondary pointer button code (mouse right). Maps to `BT.BTN_POINTER_B`. */
const BTN_B = 21;

/** Tertiary pointer button code (mouse middle). Maps to `BT.BTN_POINTER_C`. */
const BTN_C = 22;

/** Auxiliary pointer button code (mouse back / forward). Maps to `BT.BTN_POINTER_D`. */
const BTN_D = 23;

/**
 * Internal per-slot pointer state.
 *
 * `pos` and `prevPos` are reused `Vector2i` instances; allocation discipline
 * keeps the event hot path free of per-call object churn.
 */
interface Slot {
    /** Native `pointerId` currently bound to this slot, or `null` when the slot is empty. */
    pointerId: number | null;

    /** Source pointer device kind, or `null` when the slot is empty. */
    pointerType: 'mouse' | 'touch' | 'pen' | null;

    /** True when this slot represents an active pointer (mouse hovering, touch in contact). */
    isActive: boolean;

    /** Last known position in display coordinates (mutated in place by event handlers). */
    pos: Vector2i;

    /** Snapshot of `pos` taken at `endFrame()`; used to compute the per-frame delta. */
    prevPos: Vector2i;

    /** Current state of `BTN_A` for this slot. */
    a: boolean;

    /** Current state of `BTN_B` for this slot. */
    b: boolean;

    /** Current state of `BTN_C` for this slot. */
    c: boolean;

    /** Current state of `BTN_D` for this slot. */
    d: boolean;

    /** Snapshot of `a` taken at `endFrame()`, used for isPressed/released edge detection. */
    prevA: boolean;

    /** Snapshot of `b` taken at `endFrame()`. */
    prevB: boolean;

    /** Snapshot of `c` taken at `endFrame()`. */
    prevC: boolean;

    /** Snapshot of `d` taken at `endFrame()`. */
    prevD: boolean;
}

/**
 * DOM-backed pointer input tracker.
 *
 * Construct, then call {@link attach} with the rendering canvas and the
 * engine's logical display size. Call {@link endFrame} once per rAF tick
 * AFTER the demo's `update()` and `render()` so per-frame deltas reset and
 * edge-detection prev-state is captured for the next tick.
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

    /** Canvas to receive listeners; `null` until {@link attach} is called. */
    private canvas: HTMLCanvasElement | null = null;

    /** Logical display size used for screen-to-display coordinate conversion. */
    private displaySize: Vector2i | null = null;

    /** Captured `canvas.style.touchAction` value, restored by {@link detach}. */
    private originalTouchAction: string | null = null;

    /** Captured `canvas.style.cursor` value, restored by {@link detach}. */
    private originalCursor: string | null = null;

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
    private readonly onCancel: (event: PointerEvent) => void;
    private readonly onPointerLeave: (event: PointerEvent) => void;
    private readonly onWheel: (event: WheelEvent) => void;
    private readonly onContextMenu: (event: Event) => void;

    /**
     * Creates a `PointerInput` with all slots inactive.
     *
     * Listeners are bound here so {@link detach} can remove the same function
     * references that {@link attach} added.
     */
    constructor() {
        this.slots = [this.createEmptySlot(), this.createEmptySlot(), this.createEmptySlot(), this.createEmptySlot()];

        this.onMove = (event) => this.handleMove(event);
        this.onDown = (event) => this.handleDown(event);
        this.onUp = (event) => this.handleUp(event);
        this.onCancel = (event) => this.handleCancel(event);
        this.onPointerLeave = (event) => this.handlePointerLeave(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onContextMenu = (event) => event.preventDefault();
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
     * @param canvas – Canvas element rendering the engine output.
     * @param displaySize – Logical display size used to convert screen coordinates.
     */
    public attach(canvas: HTMLCanvasElement, displaySize: Vector2i): void {
        this.detach();

        this.canvas = canvas;
        this.displaySize = displaySize;

        this.originalTouchAction = canvas.style.touchAction;
        this.originalCursor = canvas.style.cursor;

        this.updateTouchAction();

        canvas.addEventListener('pointermove', this.onMove);
        canvas.addEventListener('pointerdown', this.onDown);
        canvas.addEventListener('pointerup', this.onUp);
        canvas.addEventListener('pointercancel', this.onCancel);
        canvas.addEventListener('pointerleave', this.onPointerLeave);
        canvas.addEventListener('wheel', this.onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this.onContextMenu);
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
            canvas.removeEventListener('pointercancel', this.onCancel);
            canvas.removeEventListener('pointerleave', this.onPointerLeave);
            canvas.removeEventListener('wheel', this.onWheel);
            canvas.removeEventListener('contextmenu', this.onContextMenu);

            if (this.originalTouchAction !== null) {
                canvas.style.touchAction = this.originalTouchAction;
            }

            if (this.originalCursor !== null) {
                canvas.style.cursor = this.originalCursor;
            }
        }

        this.canvas = null;
        this.displaySize = null;
        this.originalTouchAction = null;
        this.originalCursor = null;
        this.isCapturingScroll = false;
        this.isScrollCaptureForced = false;

        this.idToSlot.clear();
        this.scrollDeltaY = 0;

        for (const slot of this.slots) {
            this.resetSlot(slot);
        }
    }

    /**
     * Snapshots per-frame state at the END of each rAF tick.
     *
     * Must be called once per tick after demo `update()` and `render()`, overlay
     * draws, and renderer submit. Snapshots `pos -> prevPos` so the
     * next frame's `getDelta` reflects movement during the inter-frame gap,
     * snapshots `a..d -> prevA..prevD` so the next frame's `isButtonPressed`
     * / `isButtonReleased` see the transition, and clears the accumulated
     * wheel delta so the next frame's `getScrollDelta` accumulates fresh.
     *
     * The end-of-tick timing matters: DOM pointer / wheel events fire
     * asynchronously between rAF callbacks. Snapshotting at the START of a
     * tick would capture the post-event state as `prev`, hiding edges that
     * occurred during the inter-frame gap. By snapshotting at the END of the
     * tick, `prev` is the state at the moment `update()` last looked, and
     * any event that arrives before the next `update()` is correctly visible
     * as a transition.
     */
    public endFrame(): void {
        for (const slot of this.slots) {
            slot.prevPos.copyFrom(slot.pos);
            slot.prevA = slot.a;
            slot.prevB = slot.b;
            slot.prevC = slot.c;
            slot.prevD = slot.d;
        }

        this.scrollDeltaY = 0;
    }

    /**
     * Returns the position of the pointer in slot `slot` in display coordinates.
     *
     * Returns `Vector2i.zero()` when the slot index is out of `[0, POINTER_SLOT_COUNT - 1]`.
     * Valid slots return a clone; invalid slots return the shared zero singleton
     * (do not mutate the return value when the slot is invalid).
     *
     * @param slot – Pointer slot index (0 = mouse, 1-3 = touch / pen).
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
     * Returns the position delta `(pos - prevPos)` for slot `slot` since the last `endFrame()`.
     *
     * Returns `Vector2i.zero()` when the slot index is out of range.
     *
     * @param slot – Pointer slot index.
     * @returns Per-frame delta in display coordinates.
     */
    public getDelta(slot: number): Vector2i {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            return Vector2iImpl.zero();
        }

        return new Vector2iImpl(s.pos.x - s.prevPos.x, s.pos.y - s.prevPos.y);
    }

    /**
     * Reports whether the pointer in slot `slot` is currently active.
     *
     * For slot 0 (mouse) this means a `pointermove` has been observed inside
     * the canvas and no subsequent `pointerleave` has cleared it. For touch /
     * pen slots this means the contact is still down.
     *
     * @param slot – Pointer slot index.
     * @returns `true` when the slot has live position data.
     */
    public isActive(slot: number): boolean {
        return this.getSlotOrNull(slot)?.isActive ?? false;
    }

    /**
     * Reports whether the pointer in slot `slot` is positioned inside `rect`, without
     * allocating a `Vector2i` (unlike `getPos(slot)` followed by a containment check).
     *
     * @param slot – Pointer slot index.
     * @param rect – Rectangle to test against, in display coordinates.
     * @returns `true` when the slot is active and its position is inside `rect`.
     */
    public isSlotInRect(slot: number, rect: Rect2i): boolean {
        const s = this.getSlotOrNull(slot);

        return s?.isActive === true && rect.isContainingXY(s.pos.x, s.pos.y);
    }

    /**
     * Returns the wheel scroll delta accumulated during the current frame, in pixels.
     *
     * Reset to zero by `endFrame()`. Aggregates `WheelEvent.deltaY` across
     * all wheel events received since the last reset, normalizing
     * `deltaMode === DOM_DELTA_LINE` (1 line = 16 px) and `DOM_DELTA_PAGE`
     * (1 page = `window.innerHeight` px).
     *
     * @returns Vertical scroll delta for the current frame in pixels.
     */
    public getScrollDelta(): number {
        return this.scrollDeltaY;
    }

    /**
     * Clears accumulated wheel delta for the current frame.
     *
     * Used when the overlay consumes scroll input over the palette footer so
     * demo code reading {@link BT.pointerScrollDelta} does not see the same delta.
     */
    public consumeScrollDelta(): void {
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
     * @param enabled – Whether the demo opted into pointer scroll capture.
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
     * @param forced – Whether overlay scroll capture is active this frame.
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
     * @param button – One of `BTN_A..D`.
     * @param slot – Pointer slot index.
     * @returns `true` while the button remains pressed and the slot is active.
     */
    public isButtonDown(button: number, slot: number): boolean {
        const s = this.getSlotOrNull(slot);

        if (s === null || !s.isActive) {
            return false;
        }

        switch (button) {
            case BTN_A:
                return s.a;
            case BTN_B:
                return s.b;
            case BTN_C:
                return s.c;
            case BTN_D:
                return s.d;
            default:
                return false;
        }
    }

    /**
     * Reports whether the given pointer button transitioned to down on the current frame.
     * Unlike {@link isButtonDown}, does not require the slot to be active, so press
     * edges remain visible after deactivation.
     *
     * @param button – One of `BTN_A..D`.
     * @param slot – Pointer slot index.
     * @returns `true` only on the frame the button transitions from up to down.
     */
    public isButtonPressed(button: number, slot: number): boolean {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            return false;
        }

        switch (button) {
            case BTN_A:
                return s.a && !s.prevA;
            case BTN_B:
                return s.b && !s.prevB;
            case BTN_C:
                return s.c && !s.prevC;
            case BTN_D:
                return s.d && !s.prevD;
            default:
                return false;
        }
    }

    /**
     * Reports whether the given pointer button transitioned to up on the current frame.
     * Unlike {@link isButtonDown}, does not require the slot to be active.
     *
     * @param button – One of `BTN_A..D`.
     * @param slot – Pointer slot index.
     * @returns `true` only on the frame the button transitions from down to up.
     */
    public isButtonReleased(button: number, slot: number): boolean {
        const s = this.getSlotOrNull(slot);

        if (s === null) {
            return false;
        }

        switch (button) {
            case BTN_A:
                return !s.a && s.prevA;
            case BTN_B:
                return !s.b && s.prevB;
            case BTN_C:
                return !s.c && s.prevC;
            case BTN_D:
                return !s.d && s.prevD;
            default:
                return false;
        }
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
     * Routes a `pointermove` event: updates slot 0 for mouse, or the slot
     * already bound to this `pointerId` for touch / pen. Drops touch / pen
     * moves with no slot binding (allocation only happens on `pointerdown`).
     *
     * @param event – DOM pointer event from the canvas.
     */
    private handleMove(event: PointerEvent): void {
        if (event.pointerType === 'mouse') {
            const slot = this.slots[0];
            const isPreviouslyActive = slot.isActive;

            slot.pointerId = event.pointerId;
            slot.pointerType = 'mouse';
            slot.isActive = true;

            this.updateSlotPosition(slot, event.clientX, event.clientY);

            // Activation: sync prevPos to the entry pos so the first frame's
            // delta is zero rather than a jump from (0, 0) (or wherever the
            // slot was previously zeroed) to the entry point.
            if (!isPreviouslyActive) {
                slot.prevPos.copyFrom(slot.pos);
            }

            return;
        }

        const slot = this.lookupSlotById(event.pointerId);

        if (slot === null) {
            return;
        }

        this.updateSlotPosition(slot, event.clientX, event.clientY);
    }

    /**
     * Routes a `pointerdown` event. Mouse events claim slot 0 and set the
     * mapped button. Touch / pen events allocate the first free slot in
     * 1..3 and set `BTN_A`; events that arrive while all touch
     * slots are full are dropped silently.
     *
     * @param event – DOM pointer event from the canvas.
     */
    private handleDown(event: PointerEvent): void {
        if (event.pointerType === 'mouse') {
            const slot = this.slots[0];
            const isPreviouslyActive = slot.isActive;

            slot.pointerId = event.pointerId;
            slot.pointerType = 'mouse';
            slot.isActive = true;

            this.updateSlotPosition(slot, event.clientX, event.clientY);
            this.setMouseButton(slot, event.button, true);

            // Activation: sync prevPos so the first delta is zero. Without
            // this, the very first read after the mouse enters would see a
            // delta from (0, 0) to the entry point.
            if (!isPreviouslyActive) {
                slot.prevPos.copyFrom(slot.pos);
            }

            return;
        }

        // Touch or pen: route to the first free slot in 1..POINTER_SLOT_COUNT – 1.
        if (this.idToSlot.has(event.pointerId)) {
            return;
        }

        const slotIndex = this.allocateTouchSlot();

        if (slotIndex === -1) {
            // All touch slots are full; drop this event silently.
            return;
        }

        // eslint-disable-next-line security/detect-object-injection -- slotIndex returned by allocateTouchSlot is bounded to [1, POINTER_SLOT_COUNT)
        const slot = this.slots[slotIndex];

        if (slot === undefined) {
            return;
        }

        slot.pointerId = event.pointerId;
        slot.pointerType = event.pointerType === 'pen' ? 'pen' : 'touch';
        slot.isActive = true;
        slot.a = true;

        this.updateSlotPosition(slot, event.clientX, event.clientY);

        // Touch / pen always allocates a fresh slot; sync prevPos so the
        // first delta is zero. Without this, prevPos still holds the freed
        // position from the previous occupant of this slot.
        slot.prevPos.copyFrom(slot.pos);

        this.idToSlot.set(event.pointerId, slotIndex);

        // Capture so off-canvas drags keep delivering events to this canvas.
        this.canvas?.setPointerCapture(event.pointerId);
    }

    /**
     * Routes a `pointerup` event. Mouse events clear the matching button on
     * slot 0 but leave the slot valid. Touch / pen events free their slot
     * completely so a subsequent contact can reuse it.
     *
     * @param event – DOM pointer event from the canvas.
     */
    private handleUp(event: PointerEvent): void {
        if (event.pointerType === 'mouse') {
            const slot = this.slots[0];

            this.updateSlotPosition(slot, event.clientX, event.clientY);
            this.setMouseButton(slot, event.button, false);

            return;
        }

        const slotIndex = this.idToSlot.get(event.pointerId);

        if (slotIndex === undefined) {
            return;
        }

        // eslint-disable-next-line security/detect-object-injection -- slotIndex resolved from idToSlot, always in [0, POINTER_SLOT_COUNT)
        const slot = this.slots[slotIndex];

        if (slot !== undefined) {
            this.updateSlotPosition(slot, event.clientX, event.clientY);
        }

        this.freeSlot(slotIndex);
    }

    /**
     * Routes a `pointercancel` event (browser-initiated abort). Behaves the
     * same as `pointerleave`: deactivates slot 0 for mouse, frees the slot
     * for touch / pen.
     *
     * @param event – DOM pointer event from the canvas.
     */
    private handleCancel(event: PointerEvent): void {
        if (event.pointerType === 'mouse') {
            this.deactivateMouseSlot();

            return;
        }

        const slotIndex = this.idToSlot.get(event.pointerId);

        if (slotIndex === undefined) {
            return;
        }

        this.freeSlot(slotIndex);
    }

    /**
     * Routes a `pointerleave` event (pointer left the canvas bounds). For
     * mouse: deactivates slot 0 and clears all buttons. For touch / pen:
     * frees the slot.
     *
     * @param event – DOM pointer event from the canvas.
     */
    private handlePointerLeave(event: PointerEvent): void {
        if (event.pointerType === 'mouse') {
            this.deactivateMouseSlot();

            return;
        }

        const slotIndex = this.idToSlot.get(event.pointerId);

        if (slotIndex === undefined) {
            return;
        }

        this.freeSlot(slotIndex);
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
     * @param event – DOM wheel event from the canvas.
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
            pixels *= window.innerHeight;
        }

        this.scrollDeltaY += pixels;
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
     * Builds a fresh `Slot` with newly allocated `Vector2i` instances
     * so each slot owns its own position storage.
     *
     * @returns Slot in the empty / inactive state.
     */
    private createEmptySlot(): Slot {
        return {
            pointerId: null,
            pointerType: null,
            isActive: false,
            pos: new Vector2iImpl(0, 0),
            prevPos: new Vector2iImpl(0, 0),
            a: false,
            b: false,
            c: false,
            d: false,
            prevA: false,
            prevB: false,
            prevC: false,
            prevD: false,
        };
    }

    /**
     * Returns a slot to the empty / inactive state without reallocating its
     * `Vector2i` storage.
     *
     * @param slot – Slot to reset in place.
     */
    private resetSlot(slot: Slot): void {
        slot.pointerId = null;
        slot.pointerType = null;
        slot.isActive = false;
        slot.pos.set(0, 0);
        slot.prevPos.set(0, 0);
        slot.a = false;
        slot.b = false;
        slot.c = false;
        slot.d = false;
        slot.prevA = false;
        slot.prevB = false;
        slot.prevC = false;
        slot.prevD = false;
    }

    /**
     * Finds the first free touch / pen slot in `[1, POINTER_SLOT_COUNT)`.
     *
     * @returns Index of the free slot, or `-1` when slots 1..3 are all in use.
     */
    private allocateTouchSlot(): number {
        for (let i = 1; i < POINTER_SLOT_COUNT; i++) {
            // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
            if (this.slots[i]?.pointerId === null) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Marks a touch / pen slot inactive: clears pointerId, `isActive`, button
     * state, and the pointerId -> slot mapping. Called on `pointerup`,
     * `pointercancel`, and `pointerleave` for touch / pen events.
     *
     * Deliberately preserves `pos` and `prevPos` so the release-frame caller
     * can still read the final position via `getPos` and the release-frame
     * velocity via `getDelta`. The next pointerdown that reuses this slot
     * resyncs `prevPos` so the first frame's delta starts at zero.
     *
     * @param slotIndex – Index of the slot to free.
     */
    private freeSlot(slotIndex: number): void {
        // eslint-disable-next-line security/detect-object-injection -- slotIndex resolved from idToSlot, always in [0, POINTER_SLOT_COUNT)
        const slot = this.slots[slotIndex];

        if (slot === undefined) {
            return;
        }

        if (slot.pointerId !== null) {
            if (this.canvas?.hasPointerCapture(slot.pointerId)) {
                this.canvas.releasePointerCapture(slot.pointerId);
            }

            this.idToSlot.delete(slot.pointerId);
        }

        slot.pointerId = null;
        slot.pointerType = null;
        slot.isActive = false;
        slot.a = false;
        slot.b = false;
        slot.c = false;
        slot.d = false;
    }

    /**
     * Deactivates slot 0 (mouse) on `pointerleave` / `pointercancel`.
     *
     * Clears all four buttons and sets `isActive = false`, but leaves `pos`
     * intact so a subsequent `pointermove` can pick up where it left off.
     */
    private deactivateMouseSlot(): void {
        const slot = this.slots[0];

        if (slot.pointerId !== null) {
            this.idToSlot.delete(slot.pointerId);
        }

        slot.pointerId = null;
        slot.pointerType = null;
        slot.isActive = false;
        slot.a = false;
        slot.b = false;
        slot.c = false;
        slot.d = false;
    }

    /**
     * Maps a DOM `PointerEvent.button` value to the corresponding pointer
     * button on slot 0 and sets it to `isPressed`.
     *
     * The mapping intentionally follows RetroBlit canonical (A=left, B=right,
     * C=middle), not the DOM index order (where 1 is middle and 2 is right).
     * Buttons 3 and 4 (back / forward) both map to `D`. Other values are
     * silently ignored.
     *
     * @param slot – Mouse slot to update (always slot 0).
     * @param button – DOM `PointerEvent.button` value.
     * @param isPressed - `true` to set the button down, `false` to release it.
     */
    private setMouseButton(slot: Slot, button: number, isPressed: boolean): void {
        switch (button) {
            case 0:
                slot.a = isPressed;
                break;
            case 2:
                slot.b = isPressed;
                break;
            case 1:
                slot.c = isPressed;
                break;
            case 3:
            case 4:
                slot.d = isPressed;
                break;
            default:
                break;
        }
    }

    /**
     * Converts viewport coordinates from a DOM event to display-space pixels
     * and writes them to the slot's `pos` in place.
     *
     * Skips the update when the canvas has zero size (no layout yet) so the
     * division does not produce NaN coordinates.
     *
     * @param slot – Slot whose position to update.
     * @param clientX – DOM `clientX` from the source event.
     * @param clientY – DOM `clientY` from the source event.
     */
    private updateSlotPosition(slot: Slot, clientX: number, clientY: number): void {
        const canvas = this.canvas;
        const displaySize = this.displaySize;

        if (canvas === null || displaySize === null) {
            return;
        }

        const rect = canvas.getBoundingClientRect();

        // Guard against a zero-sized canvas (no layout yet) which would
        // produce NaN coordinates from the division below.
        if (rect.width === 0 || rect.height === 0) {
            return;
        }

        const x = Math.max(
            0,
            Math.min(Math.floor(((clientX - rect.left) / rect.width) * displaySize.x), displaySize.x - 1),
        );
        const y = Math.max(
            0,
            Math.min(Math.floor(((clientY - rect.top) / rect.height) * displaySize.y), displaySize.y - 1),
        );

        slot.pos.set(x, y);
    }

    /**
     * Returns the slot at `index` if `index` is a valid slot, or `null` otherwise.
     *
     * Used by all public read methods to bounds-check the caller-supplied slot
     * argument while keeping `noUncheckedIndexedAccess` happy.
     *
     * @param index – Slot index to look up.
     * @returns Slot at the index, or `null` for out-of-range indices.
     */
    private getSlotOrNull(index: number): Slot | null {
        if (!Number.isInteger(index) || index < 0 || index >= POINTER_SLOT_COUNT) {
            return null;
        }

        // eslint-disable-next-line security/detect-object-injection -- bounds checked above
        return this.slots[index] ?? null;
    }

    /**
     * Looks up the slot bound to a native `pointerId`, or `null` when none is bound.
     *
     * Resolves the `idToSlot` map and the indexed slot lookup in one
     * helper so event handlers can early-return without repeating the guards.
     *
     * @param pointerId – Native `pointerId` from a DOM pointer event.
     * @returns Slot bound to this `pointerId`, or `null` when no slot is bound.
     */
    private lookupSlotById(pointerId: number): Slot | null {
        const index = this.idToSlot.get(pointerId);

        if (index === undefined) {
            return null;
        }

        // eslint-disable-next-line security/detect-object-injection -- index originated from idToSlot, always in [0, POINTER_SLOT_COUNT)
        return this.slots[index] ?? null;
    }
}
