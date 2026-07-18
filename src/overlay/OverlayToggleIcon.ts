/**
 * Draw helper for the inline overlay toggle hint bitmap icon.
 */

import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { OVERLAY_BAR_HEIGHT } from './layout/constants';
import { overlayToggleHintIconX } from './layout/layoutHelpers';
import type { OverlayDrawTarget } from './OverlayDrawTarget';
import { ICON_HEIGHT, ICON_MASK, ICON_WIDTH } from './toggleIconData';

/** Reused fill rect for icon horizontal runs (one overlay draw at a time). */
const iconDrawScratch = {
    run: new Rect2i(),
    origin: new Vector2i(),
};

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
 * Backward-compatible alias for {@link hintIconY}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link hintIconY} instead.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon top Y in display pixels.
 */
export function overlayToggleHintIconY(hintBarTopY: number): number {
    return hintIconY(hintBarTopY);
}

/**
 * Returns the top-left screen position for the toggle hint icon inside the hint bar.
 *
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon anchor in display pixels.
 */
export function hintIconPos(hintBarTopY: number): Vector2i {
    return new Vector2i(overlayToggleHintIconX(), hintIconY(hintBarTopY));
}

/**
 * Backward-compatible alias for {@link hintIconPos}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link hintIconPos} instead.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon anchor in display pixels.
 */
export function overlayToggleHintIconPos(hintBarTopY: number): Vector2i {
    return hintIconPos(hintBarTopY);
}

/**
 * Returns the screen-space rect reserved for the toggle hint icon (palette swatch exclusion).
 *
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon bounding rect in display pixels.
 */
export function hintIconExclusionRect(hintBarTopY: number): Rect2i {
    return new Rect2i(overlayToggleHintIconX(), hintIconY(hintBarTopY), ICON_WIDTH, ICON_HEIGHT);
}

/**
 * Backward-compatible alias for {@link hintIconExclusionRect}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link hintIconExclusionRect} instead.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @returns Icon bounding rect in display pixels.
 */
export function overlayToggleHintIconExclusionRect(hintBarTopY: number): Rect2i {
    return hintIconExclusionRect(hintBarTopY);
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
    writeHintIconOrigin(iconDrawScratch.origin, hintBarTopY);

    const originX = iconDrawScratch.origin.x;
    const originY = iconDrawScratch.origin.y;
    const run = iconDrawScratch.run;
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

/**
 * Backward-compatible alias for {@link toggleIcon}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link toggleIcon} instead.
 * @param target - Overlay draw target.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @param textPaletteIndex - Overlay text palette index (`OverlayStyle.textPaletteIndex`, default `2`).
 * @param inverted - Legacy parameter name forwarded to `isInverted`.
 */
export function drawOverlayToggleIcon(
    target: OverlayDrawTarget,
    hintBarTopY: number,
    textPaletteIndex: number,
    inverted = false,
): void {
    toggleIcon(target, hintBarTopY, textPaletteIndex, inverted);
}

/**
 * Writes the toggle hint icon top-left origin into {@link target} without allocating.
 *
 * @param target - Reusable vector mutated in place.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 */
function writeHintIconOrigin(target: Vector2i, hintBarTopY: number): void {
    target.x = overlayToggleHintIconX();
    target.y = hintIconY(hintBarTopY);
}
