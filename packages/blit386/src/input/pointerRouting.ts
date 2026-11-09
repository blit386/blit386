/**
 * DOM pointer event routing for {@link PointerInput}: `pointermove` / `pointerdown` / `pointerup` /
 * `pointercancel` / `pointerleave` onto the four slots (slot 0 the mouse, 1-3 touch / pen in arrival order).
 */

import {
    BTN_A,
    BTN_D,
    BUTTON_COUNT,
    DOM_BUTTONS_MASKS,
    heldMask,
    markEdges,
    MOUSE_BUTTON_INDEX,
    setMouseButton,
    type Slot,
} from './pointerSlot';

/** What the routing functions need from {@link PointerInput}; built once in its constructor. */
export interface PointerRouter {
    /** The four slots (0 = mouse, 1-3 = touch / pen). */
    readonly slots: readonly [Slot, Slot, Slot, Slot];

    /** Native `pointerId` -> touch / pen slot index. */
    readonly idToSlot: Map<number, number>;

    /** The attached canvas, or `null` when detached. */
    getCanvas(): HTMLCanvasElement | null;

    /** Writes an event's client position into `slot.pos` in display pixels. */
    place(slot: Slot, clientX: number, clientY: number): void;
}

/** Index of the D button (mouse back / forward) in a slot's button arrays. */
const D_INDEX = BTN_D - BTN_A;

/**
 * True for mouse events. An empty `pointerType` (synthetic events from test
 * harnesses that omit it, or a browser that cannot detect the device) counts
 * as the mouse; synthetic touch / pen events must set `pointerType` explicitly.
 *
 * @param event - DOM pointer event from the canvas.
 * @returns `true` when the event should be routed to the mouse slot.
 */
const isMousePointer = (event: PointerEvent): boolean => event.pointerType === 'mouse' || event.pointerType === '';

/**
 * Routes a `pointermove` event: updates slot 0 for mouse, or the slot
 * already bound to this `pointerId` for touch / pen. Drops touch / pen
 * moves with no slot binding (allocation only happens on `pointerdown`).
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param event - DOM pointer event from the canvas.
 */
export function routeMove(ctx: PointerRouter, event: PointerEvent): void {
    if (isMousePointer(event)) {
        const slot = ctx.slots[0];
        const isPreviouslyActive = slot.isActive;

        slot.isActive = true;

        ctx.place(slot, event.clientX, event.clientY);

        // A release outside the page never reaches pointerup, and pointerleave clears every button;
        // `buttons` is the browser's truth, so rebuild all four from it (1 left, 2 right, 4 middle, 8/16 back/forward).
        const heldBefore = heldMask(slot);

        for (let i = 0; i < BUTTON_COUNT; i++) {
            // eslint-disable-next-line security/detect-object-injection -- bounded loop counter over fixed-length arrays
            slot.down[i] = (event.buttons & (DOM_BUTTONS_MASKS[i] ?? 0)) !== 0;
        }

        markEdges(slot, heldBefore);

        // Activation: sync prevPos to the entry pos so the first frame's
        // delta is zero rather than a jump from (0, 0) (or wherever the
        // slot was previously zeroed) to the entry point.
        if (!isPreviouslyActive) {
            slot.prevPos.copyFrom(slot.pos);
            slot.updatePrevPos.copyFrom(slot.pos);
        }

        return;
    }

    const slot = lookupSlotById(ctx, event.pointerId);

    if (slot === null) {
        return;
    }

    ctx.place(slot, event.clientX, event.clientY);
}

/**
 * Routes a `pointerdown` event. Mouse events claim slot 0 and set the
 * mapped button. Touch / pen events allocate the first free slot in
 * 1..3 and set `BTN_A`; events that arrive while all touch
 * slots are full are dropped silently.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param event - DOM pointer event from the canvas.
 */
export function routeDown(ctx: PointerRouter, event: PointerEvent): void {
    if (isMousePointer(event)) {
        const slot = ctx.slots[0];
        const isPreviouslyActive = slot.isActive;

        slot.isActive = true;

        ctx.place(slot, event.clientX, event.clientY);

        const heldBefore = heldMask(slot);

        setMouseButton(slot, event.button, true);
        markEdges(slot, heldBefore);

        // Activation: sync prevPos so the first delta is zero. Without
        // this, the very first read after the mouse enters would see a
        // delta from (0, 0) to the entry point.
        if (!isPreviouslyActive) {
            slot.prevPos.copyFrom(slot.pos);
            slot.updatePrevPos.copyFrom(slot.pos);
        }

        return;
    }

    // Touch or pen: route to the first free slot in 1..POINTER_SLOT_COUNT - 1.
    if (ctx.idToSlot.has(event.pointerId)) {
        return;
    }

    const slotIndex = allocateTouchSlot(ctx);

    if (slotIndex === -1) {
        // All touch slots are full; drop this event silently.
        return;
    }

    // eslint-disable-next-line security/detect-object-injection -- slotIndex returned by allocateTouchSlot is bounded to [1, POINTER_SLOT_COUNT)
    const slot = ctx.slots[slotIndex];

    if (slot === undefined) {
        return;
    }

    slot.pointerId = event.pointerId;
    slot.isActive = true;
    slot.down[0] = true;
    markEdges(slot, 0);

    ctx.place(slot, event.clientX, event.clientY);

    // Touch / pen always allocates a fresh slot; sync prevPos so the
    // first delta is zero. Without this, prevPos still holds the freed
    // position from the previous occupant of this slot.
    slot.prevPos.copyFrom(slot.pos);
    slot.updatePrevPos.copyFrom(slot.pos);

    ctx.idToSlot.set(event.pointerId, slotIndex);

    // Capture so off-canvas drags keep delivering events to this canvas.
    try {
        ctx.getCanvas()?.setPointerCapture(event.pointerId);
    } catch {
        // The pointer may already be gone (a synthetic event, or a contact the browser ended first).
    }
}

/**
 * Routes a `pointerup` event. Mouse events clear the matching button on
 * slot 0 but leave the slot valid. Touch / pen events free their slot
 * completely so a subsequent contact can reuse it.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param event - DOM pointer event from the canvas.
 */
export function routeUp(ctx: PointerRouter, event: PointerEvent): void {
    if (isMousePointer(event)) {
        const slot = ctx.slots[0];

        ctx.place(slot, event.clientX, event.clientY);

        const heldBefore = heldMask(slot);

        setMouseButton(slot, event.button, false);

        // Back and forward share the D button; keep it down while the other one is still held.
        if (MOUSE_BUTTON_INDEX[event.button] === D_INDEX) {
            // eslint-disable-next-line security/detect-object-injection -- D_INDEX is a constant in [0, 3]
            slot.down[D_INDEX] = (event.buttons & (DOM_BUTTONS_MASKS[D_INDEX] ?? 0)) !== 0;
        }

        markEdges(slot, heldBefore);

        return;
    }

    const slotIndex = ctx.idToSlot.get(event.pointerId);

    if (slotIndex === undefined) {
        return;
    }

    // eslint-disable-next-line security/detect-object-injection -- slotIndex resolved from idToSlot, always in [0, POINTER_SLOT_COUNT)
    const slot = ctx.slots[slotIndex];

    if (slot !== undefined) {
        ctx.place(slot, event.clientX, event.clientY);
    }

    freeSlot(ctx, slotIndex);
}

/**
 * Routes a `pointercancel` (browser-initiated abort) or `pointerleave` (pointer left the canvas bounds) event.
 * For mouse: deactivates slot 0 and clears all buttons. For touch / pen: frees the slot.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param event - DOM pointer event from the canvas.
 */
export function routeExit(ctx: PointerRouter, event: PointerEvent): void {
    if (isMousePointer(event)) {
        deactivateMouseSlot(ctx);

        return;
    }

    const slotIndex = ctx.idToSlot.get(event.pointerId);

    if (slotIndex === undefined) {
        return;
    }

    freeSlot(ctx, slotIndex);
}

/**
 * Finds the first free touch / pen slot in `[1, POINTER_SLOT_COUNT)`.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @returns Index of the free slot, or `-1` when slots 1..3 are all in use.
 */
function allocateTouchSlot(ctx: PointerRouter): number {
    for (let i = 1; i < ctx.slots.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
        if (ctx.slots[i]?.pointerId === null) {
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
 * Deliberately preserves `pos`, `prevPos` and `updatePrevPos` so the
 * release-tick caller can still read the final position via `getPos` and
 * the release velocity via `getDelta`. The next pointerdown that reuses
 * this slot resyncs both so the first delta starts at zero.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param slotIndex - Index of the slot to free.
 */
function freeSlot(ctx: PointerRouter, slotIndex: number): void {
    // eslint-disable-next-line security/detect-object-injection -- slotIndex resolved from idToSlot, always in [0, POINTER_SLOT_COUNT)
    const slot = ctx.slots[slotIndex];

    if (slot === undefined) {
        return;
    }

    if (slot.pointerId !== null) {
        const canvas = ctx.getCanvas();

        if (canvas?.hasPointerCapture(slot.pointerId)) {
            canvas.releasePointerCapture(slot.pointerId);
        }

        ctx.idToSlot.delete(slot.pointerId);
    }

    const heldBefore = heldMask(slot);

    slot.pointerId = null;
    slot.isActive = false;
    slot.down.fill(false);
    markEdges(slot, heldBefore);
}

/**
 * Deactivates slot 0 (mouse) on `pointerleave` / `pointercancel`.
 *
 * Clears all four buttons and sets `isActive = false`, but leaves `pos`
 * intact so a subsequent `pointermove` can pick up where it left off.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 */
function deactivateMouseSlot(ctx: PointerRouter): void {
    const slot = ctx.slots[0];
    const heldBefore = heldMask(slot);

    slot.isActive = false;
    slot.down.fill(false);
    markEdges(slot, heldBefore);
}

/**
 * Looks up the slot bound to a native `pointerId`, or `null` when none is bound.
 *
 * Resolves the `idToSlot` map and the indexed slot lookup in one
 * helper so event handlers can early-return without repeating the guards.
 *
 * @param ctx - Slots and canvas access from {@link PointerInput}.
 * @param pointerId - Native `pointerId` from a DOM pointer event.
 * @returns Slot bound to this `pointerId`, or `null` when no slot is bound.
 */
function lookupSlotById(ctx: PointerRouter, pointerId: number): Slot | null {
    const index = ctx.idToSlot.get(pointerId);

    if (index === undefined) {
        return null;
    }

    // eslint-disable-next-line security/detect-object-injection -- index originated from idToSlot, always in [0, POINTER_SLOT_COUNT)
    return ctx.slots[index] ?? null;
}
