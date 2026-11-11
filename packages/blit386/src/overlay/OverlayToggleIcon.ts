/**
 * Draw helper for the inline overlay toggle hint bitmap icon.
 */

import { Rect2i } from '../utils/Rect2i';
import { OVERLAY_BAR_HEIGHT } from './layout/constants';
import { overlayToggleHintIconX } from './layout/layoutHelpers';
import type { OverlayDrawTarget } from './OverlayDrawTarget';
import { ICON_HEIGHT, ICON_MASK, ICON_WIDTH } from './toggleIconData';

/** Reused fill rect for icon horizontal runs (one overlay draw at a time). */
const runScratch = new Rect2i();

/**
 * Computes the icon top-left Y inside the hint bar without allocating.
 *
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon top Y in display pixels.
 */
export function hintIconY(hintBarTopY: number): number {
    return hintBarTopY + Math.floor((OVERLAY_BAR_HEIGHT - ICON_HEIGHT) / 2);
}

/**
 * Draws the toggle hint icon from {@link ICON_MASK} using on-top bar fills.
 *
 * Collapses each mask row into horizontal runs to minimize draw calls. Reuses scratch rects
 * so the path stays allocation-free after warmup.
 *
 * @param target - Overlay draw target.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @param textPaletteIndex - Overlay text palette index (`OverlayStyle.textPaletteIndex`, default `2`).
 * @param isInverted - When `true`, draw the complement mask so the symbol reads against the hint bar fill.
 */
export function toggleIcon(
    target: OverlayDrawTarget,
    hintBarTopY: number,
    textPaletteIndex: number,
    isInverted = false,
): void {
    const originX = overlayToggleHintIconX();
    const originY = hintIconY(hintBarTopY);
    const run = runScratch;
    const foregroundBit = isInverted ? 0 : 1;

    for (let row = 0; row < ICON_HEIGHT; row++) {
        let col = 0;

        while (col < ICON_WIDTH) {
            const rowOffset = row * ICON_WIDTH;

            if (ICON_MASK[rowOffset + col] !== foregroundBit) {
                col++;
                continue;
            }

            const runStart = col;

            while (col < ICON_WIDTH && ICON_MASK[rowOffset + col] === foregroundBit) {
                col++;
            }

            run.set(originX + runStart, originY + row, col - runStart, 1);

            target.drawBarFillOnTop(run, textPaletteIndex);
        }
    }
}
