/**
 * One-pixel outline drawer shared by the palette tooltip and the toggle hit-zone debug view.
 */

import { Rect2i } from '../utils/Rect2i';
import type { OverlayDrawTarget } from './OverlayDrawTarget';

/** Reused edge rect; {@link OverlayDrawTarget.drawBarFillOnTop} consumes it immediately. */
const edgeScratch = new Rect2i();

/**
 * Draws a 1 px on-top outline just inside `rect`, without allocating.
 *
 * @param target - Overlay draw target.
 * @param rect - Rect whose border to stroke.
 * @param paletteIndex - Palette index for the stroke.
 */
export function drawOutline(target: OverlayDrawTarget, rect: Rect2i, paletteIndex: number): void {
    const { x, y, width, height } = rect;

    target.drawBarFillOnTop(edgeScratch.set(x, y, width, 1), paletteIndex);
    target.drawBarFillOnTop(edgeScratch.set(x, y + height - 1, width, 1), paletteIndex);

    if (height > 2) {
        target.drawBarFillOnTop(edgeScratch.set(x, y + 1, 1, height - 2), paletteIndex);
        target.drawBarFillOnTop(edgeScratch.set(x + width - 1, y + 1, 1, height - 2), paletteIndex);
    }
}
