/**
 * Pure conversion from DOM client coordinates to logical display coordinates.
 *
 * Shared by `PointerInput` (every pointer event) and the public
 * `BT.nativeScreenToDisplayPos`, so the two can never disagree.
 */

import type { Vector2i } from '../utils/Vector2i';

/** The subset of `DOMRect` the conversion reads. */
export type ViewportRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/**
 * Converts viewport coordinates to display-space pixels.
 *
 * Each axis is `floor((client - rect.start) / rect.size * displaySize)`, clamped to
 * `[0, displaySize - 1]`, so points outside the canvas land on the nearest edge pixel.
 *
 * @param clientX - Viewport X, such as DOM `clientX`.
 * @param clientY - Viewport Y, such as DOM `clientY`.
 * @param rect - Canvas bounding rect in viewport coordinates.
 * @param displaySize - Logical display size.
 * @param out - Vector written and returned on success. The caller owns it, which keeps the pointer hot path
 *   allocation-free.
 * @returns `out`, or `null` (leaving `out` untouched) when the rect has zero width or
 *   height or a coordinate is not finite.
 */
export function clientToDisplayPos(
    clientX: number,
    clientY: number,
    rect: ViewportRect,
    displaySize: Vector2i,
    out: Vector2i,
): Vector2i | null {
    if (rect.width === 0 || rect.height === 0 || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return null;
    }

    const x = Math.floor(((clientX - rect.left) / rect.width) * displaySize.x);
    const y = Math.floor(((clientY - rect.top) / rect.height) * displaySize.y);

    out.set(Math.max(0, Math.min(x, displaySize.x - 1)), Math.max(0, Math.min(y, displaySize.y - 1)));

    return out;
}
