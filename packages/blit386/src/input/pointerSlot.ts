/**
 * Per-slot pointer state for {@link PointerInput}: the slot shape, the pointer button codes and
 * DOM button tables, the button-mask helpers, and the pure functions that create, reset and edge-mark a slot.
 */

import type { Vector2i } from '../utils/Vector2i';
import { Vector2i as Vector2iImpl } from '../utils/Vector2i';

/** Primary pointer button code (mouse left / touch contact). Maps to `BT.BTN_POINTER_A`. */
export const CODE_A = 20;

/** Secondary pointer button code (mouse right). Maps to `BT.BTN_POINTER_B`. */
const CODE_B = 21;

/** Tertiary pointer button code (mouse middle). Maps to `BT.BTN_POINTER_C`. */
const CODE_C = 22;

/** Auxiliary pointer button code (mouse back / forward). Maps to `BT.BTN_POINTER_D`. */
export const CODE_D = 23;

/** The four button codes in `BT.BTN_POINTER_A..D` order; read by the dev-only input trace. */
export const POINTER_BUTTON_CODES = [CODE_A, CODE_B, CODE_C, CODE_D] as const;

/**
 * Bit for a pointer button code in a pending-edge mask.
 *
 * @param button - One of `CODE_A..D`.
 * @returns `1 << (button - CODE_A)`, or `0` for any other code.
 */
export const buttonBit = (button: number): number =>
    button >= CODE_A && button <= CODE_D ? 1 << (button - CODE_A) : 0;

/** Number of pointer buttons per slot (`CODE_A..D`); every per-button array has this length. */
export const BUTTON_COUNT = POINTER_BUTTON_CODES.length;

/** `PointerEvent.buttons` bits that hold each pointer button down, in `CODE_A..D` order (left, right, middle, back/forward). */
export const DOM_BUTTONS_MASKS: readonly number[] = [1, 2, 4, 24];

/** Maps a DOM `PointerEvent.button` (0 left, 1 middle, 2 right, 3 back, 4 forward) to its `button - CODE_A` index. */
export const MOUSE_BUTTON_INDEX: readonly number[] = [0, 2, 1, 3, 3];

/**
 * Builds a fresh all-up button-state array.
 *
 * @returns Array of {@link BUTTON_COUNT} `false` values.
 */
const createButtons = (): boolean[] => new Array<boolean>(BUTTON_COUNT).fill(false);

/**
 * Internal per-slot pointer state.
 *
 * `pos`, `prevPos` and `updatePrevPos` are reused `Vector2i` instances; allocation discipline
 * keeps the event hot path free of per-call object churn.
 */
export interface Slot {
    /** Native `pointerId` bound to a touch / pen slot, or `null` when empty. The mouse slot never sets it. */
    pointerId: number | null;

    /** True when this slot represents an active pointer (mouse hovering, touch in contact). */
    isActive: boolean;

    /** Last known position in display coordinates (mutated in place by event handlers). */
    pos: Vector2i;

    /** Snapshot of `pos` taken at `endFrame()`; used to compute the per-frame delta. */
    prevPos: Vector2i;

    /** Held state per button, indexed by `button - CODE_A` (A, B, C, D). */
    down: boolean[];

    /** Snapshot of `down` taken at `endFrame()`, used for isPressed/released edge detection. */
    prevDown: boolean[];

    /** Snapshot of `pos` taken at `endUpdate()`; the update-clock delta. */
    updatePrevPos: Vector2i;

    /** Snapshot of `down` taken at `endUpdate()`, for update-clock edges. */
    updatePrevDown: boolean[];

    /** Buttons (bit `1 << (code - CODE_A)`) that went down since `endUpdate()`, even if they are up again. */
    updatePendingPress: number;

    /** Buttons that went up since `endUpdate()`, even if they went down first. */
    updatePendingRelease: number;

    /** Buttons that went down since `endFrame()`, even if they are up again. */
    framePendingPress: number;

    /** Buttons that went up since `endFrame()`. */
    framePendingRelease: number;
}

/**
 * Packs a slot's four held buttons into a bitmask (see {@link buttonBit}).
 *
 * @param slot - Slot to read.
 * @returns The held-button mask.
 */
export const heldMask = (slot: Slot): number => buttonsMask(slot.down);

/**
 * Packs a button-state array into a bitmask (see {@link buttonBit}).
 *
 * Unrolled on purpose: this runs on every edge query. Keep it in step with {@link BUTTON_COUNT}.
 *
 * @param buttons - Four button states in `CODE_A..D` order.
 * @returns The mask.
 */
const buttonsMask = (buttons: readonly boolean[]): number =>
    (buttons[0] ? 1 : 0) | (buttons[1] ? 2 : 0) | (buttons[2] ? 4 : 0) | (buttons[3] ? 8 : 0);

/**
 * Packs the buttons a slot held at the last rollover of one clock into a bitmask.
 *
 * @param slot - Slot to read.
 * @param isUpdate - `true` for the update clock, `false` for the frame clock.
 * @returns The previous-state mask.
 */
export const prevMask = (slot: Slot, isUpdate: boolean): number =>
    buttonsMask(isUpdate ? slot.updatePrevDown : slot.prevDown);

/**
 * Copies one button-state array into another in place.
 *
 * @param from - Source states.
 * @param to - Destination states, same length.
 */
export const copyButtons = (from: readonly boolean[], to: boolean[]): void => {
    for (let i = 0; i < BUTTON_COUNT; i++) {
        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter over fixed four-element arrays
        to[i] = from[i] ?? false;
    }
};

/**
 * Builds a fresh `Slot` with newly allocated `Vector2i` instances
 * so each slot owns its own position storage.
 *
 * @returns Slot in the empty / inactive state.
 */
export function createEmptySlot(): Slot {
    return {
        pointerId: null,
        isActive: false,
        pos: new Vector2iImpl(0, 0),
        prevPos: new Vector2iImpl(0, 0),
        down: createButtons(),
        prevDown: createButtons(),
        updatePrevPos: new Vector2iImpl(0, 0),
        updatePrevDown: createButtons(),
        updatePendingPress: 0,
        updatePendingRelease: 0,
        framePendingPress: 0,
        framePendingRelease: 0,
    };
}

/**
 * Returns a slot to the empty / inactive state without reallocating its
 * `Vector2i` storage.
 *
 * @param slot - Slot to reset in place.
 */
export function resetSlot(slot: Slot): void {
    slot.pointerId = null;
    slot.isActive = false;
    slot.pos.set(0, 0);
    slot.prevPos.set(0, 0);
    slot.down.fill(false);
    slot.prevDown.fill(false);
    slot.updatePrevPos.set(0, 0);
    slot.updatePrevDown.fill(false);
    slot.updatePendingPress = 0;
    slot.updatePendingRelease = 0;
    slot.framePendingPress = 0;
    slot.framePendingRelease = 0;
}

/**
 * Records the press and release edges between a slot's held buttons `before` a DOM event and now, on both clocks.
 * The pending bits outlive the held state, so a tap that starts and ends between two rollovers still reports one
 * press and one release, and they survive the routing `freeSlot`.
 *
 * @param slot - Slot the event changed.
 * @param before - {@link heldMask} taken before the event changed it.
 */
export function markEdges(slot: Slot, before: number): void {
    const after = heldMask(slot);
    const pressed = after & ~before;
    const released = before & ~after;

    slot.updatePendingPress |= pressed;
    slot.framePendingPress |= pressed;
    slot.updatePendingRelease |= released;
    slot.framePendingRelease |= released;
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
 * @param slot - Mouse slot to update (always slot 0).
 * @param button - DOM `PointerEvent.button` value.
 * @param isPressed - `true` to set the button down, `false` to release it.
 */
export function setMouseButton(slot: Slot, button: number, isPressed: boolean): void {
    // eslint-disable-next-line security/detect-object-injection -- DOM button code only reads a fixed lookup table; misses are undefined
    const index = MOUSE_BUTTON_INDEX[button];

    if (index !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- index comes from MOUSE_BUTTON_INDEX, always in [0, 3]
        slot.down[index] = isPressed;
    }
}
