/**
 * Pointer input: position, delta, scroll, activity, and the cursor.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { BTAPI } from '../core/BTAPI';
import { clientToDisplayPos } from '../input/clientToDisplayPos';
import { Vector2i } from '../utils/Vector2i';
import { pointerClock } from './internal';

/** Pointer input members of `BT`. */
export const pointer = {
    /**
     * Returns the position of the pointer in the given slot, in display coordinates.
     *
     * Slot 0 is the mouse; slots 1 through 3 are touch / pen contacts assigned
     * in arrival order. Returns a new `(0, 0)` when the engine has not been
     * initialized, the slot index is out of `[0, 3]`, or the slot has no live
     * pointer.
     *
     * @since 1.0.3
     * @changed 1.8.1 Before initialization or for an out-of-range slot, returns a new `(0, 0)` instead of the frozen
     *   `Vector2i.zero()`.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Pointer position in display coordinates.
     */
    pointerPos: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getPos(pointerIndex) ?? new Vector2i();
    },

    /**
     * Converts viewport coordinates, such as a DOM event's `clientX` / `clientY`, to display
     * coordinates, using the same conversion as pointer input.
     *
     * Use it for DOM events the engine does not wrap, for example a file dropped onto the canvas.
     * Each axis is `floor((client - canvasRect.start) / canvasRect.size * displaySize)`, clamped to
     * `[0, displaySize - 1]`, so a point outside the canvas lands on the nearest edge pixel. Reads the
     * canvas rect on every call, so the result is correct after a resize or scroll.
     *
     * @since 1.8.0
     * @param clientX - Viewport X, such as DOM `clientX`.
     * @param clientY - Viewport Y, such as DOM `clientY`.
     * @returns A new display-space position, or `null` when the engine has not been initialized,
     *   the canvas has zero width or height, or a coordinate is not finite.
     */
    nativeScreenToDisplayPos: (clientX: number, clientY: number): Vector2i | null => {
        const canvas = BTAPI.instance.getCanvas();
        const displaySize = BTAPI.instance.getHardwareSettings()?.displaySize;

        if (!canvas || !displaySize) {
            return null;
        }

        return clientToDisplayPos(clientX, clientY, canvas.getBoundingClientRect(), displaySize, new Vector2i());
    },

    /**
     * Writes the position of the pointer in the given slot, in display coordinates, into `out`.
     *
     * Zero-allocation counterpart to {@link pointerPos}. Slot 0 is the mouse; slots 1 through 3 are
     * touch / pen contacts assigned in arrival order. Writes `(0, 0)` into `out` when the engine has
     * not been initialized, the slot index is out of `[0, 3]`, or the slot has no live pointer.
     *
     * @since 1.7.0
     * @param out - Vector2i to write the pointer position into.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns The `out` vector, for chaining.
     */
    pointerPosTo: (out: Vector2i, pointerIndex: number = 0): Vector2i => {
        const pointer = BTAPI.instance.getPointer();

        if (!pointer) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        return pointer.getPosTo(pointerIndex, out);
    },

    /**
     * Returns how far a pointer slot moved since the previous `update()` (read from `update()`) or since the previous
     * rendered frame (read anywhere else).
     *
     * Read from `update()` it covers every frame rendered since the last update, so a drag or a flick moves at the
     * same speed on a 60 Hz and a 120 Hz display. Returns a new `(0, 0)` when the engine is not initialized or
     * `pointerIndex` is out of range.
     *
     * @since 1.0.3
     * @changed 1.8.1 Read from `update()`, the delta covers all movement since the previous `update()`, not only the last rendered frame. Before initialization or for an out-of-range slot, returns a new `(0, 0)` instead of the frozen `Vector2i.zero()`.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Movement in display coordinates.
     */
    pointerDelta: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getDelta(pointerIndex, pointerClock()) ?? new Vector2i();
    },

    /**
     * Writes how far a pointer slot moved into `out`: since the previous `update()` when read from `update()`, since
     * the previous rendered frame anywhere else.
     *
     * Zero-allocation counterpart to {@link pointerDelta}, with the same timing. Writes `(0, 0)` into `out` when the
     * engine is not initialized or `pointerIndex` is out of range.
     *
     * @since 1.7.0
     * @changed 1.8.1 Read from `update()`, the delta covers all movement since the previous `update()`, not only the last rendered frame.
     * @param out - Vector2i to write the movement into.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns The `out` vector, for chaining.
     */
    pointerDeltaTo: (out: Vector2i, pointerIndex: number = 0): Vector2i => {
        const pointer = BTAPI.instance.getPointer();

        if (!pointer) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        return pointer.getDeltaTo(pointerIndex, out, pointerClock());
    },

    /**
     * Reports whether the given pointer slot has a live pointer.
     *
     * For slot 0 (mouse) this is true while the mouse is hovering inside the
     * canvas; cleared on `pointerleave`. For slots 1-3 (touch / pen) this is
     * true while the contact is down.
     *
     * @since 1.1.1
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns `true` while the slot has live position data.
     */
    isPointerActive: (pointerIndex: number = 0): boolean => {
        return BTAPI.instance.getPointer()?.isActive(pointerIndex) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isPointerActive}.
     *
     * @since 1.0.3
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isPointerActive} instead.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns `true` while the slot has live position data.
     */
    pointerPosValid: (pointerIndex: number = 0): boolean => {
        return pointer.isPointerActive(pointerIndex);
    },

    /**
     * Wheel scroll delta in pixels: accumulated since the previous `update()` when read from `update()`, since the
     * previous rendered frame anywhere else.
     *
     * Aggregates `WheelEvent.deltaY` across those wheel events, normalizing line and page delta modes to pixels.
     * Requires {@link HardwareSettings.isCapturingPointerScroll} (or overlay
     * palette-band force capture); otherwise this stays `0` and the host page
     * scrolls normally.
     *
     * @since 1.0.4
     * @changed 1.3.1 Requires `HardwareSettings.isCapturingPointerScroll` (or overlay force); opt-in now, not default.
     * @changed 1.8.1 Read from `update()`, the delta covers every wheel event since the previous `update()`, not only the last rendered frame.
     * @returns Vertical scroll delta in pixels, or `0` when not initialized.
     */
    get pointerScrollDelta(): number {
        return BTAPI.instance.getPointer()?.getScrollDelta(pointerClock()) ?? 0;
    },

    /**
     * Hides the native OS cursor while the pointer is over the canvas.
     *
     * Call once from `init()` when the demo draws its own crosshair or
     * cursor sprite in place of the system arrow. The cursor is restored
     * automatically when the engine shuts down.
     *
     * No-op before the engine is initialized.
     *
     * @since 1.0.3
     */
    hideCursor: (): void => {
        BTAPI.instance.getPointer()?.hideCursor();
    },

    /**
     * Restores the native OS cursor over the canvas.
     *
     * Reverses a prior {@link hideCursor} call. No-op before the engine is
     * initialized.
     *
     * @since 1.0.3
     */
    showCursor: (): void => {
        BTAPI.instance.getPointer()?.showCursor();
    },
};
