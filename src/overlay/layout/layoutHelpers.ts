import { Rect2i } from '../../utils/Rect2i';
import type { Vector2i } from '../../utils/Vector2i';
import { SYSTEM_CHAR_ADVANCE } from '../constants';
import { OVERLAY_TOGGLE_CORNER_HEIGHT, OVERLAY_TOGGLE_CORNER_WIDTH } from '../input/constants';
import { overlayDividerLabelWidth } from '../labels';
import {
    OVERLAY_BAR_HEIGHT,
    OVERLAY_EDGE_MARGIN_PX,
    OVERLAY_ROW_GAP_PX,
    OVERLAY_TOGGLE_HINT_ICON_NUDGE_X_PX,
    OVERLAY_TOP_TEXT_Y,
} from './constants';
import type { OverlayLayout } from './types';

/**
 * Builds cached layout from logical display size and system font line height.
 *
 * @param displayWidth - Logical display width in pixels.
 * @param displayHeight - Logical display height in pixels.
 * @param lineHeight - System font line height in pixels.
 * @returns Frozen layout used for the lifetime of the overlay instance.
 */
export function createOverlayLayout(displayWidth: number, displayHeight: number, lineHeight: number): OverlayLayout {
    const toggleRect = new Rect2i(
        0,
        displayHeight - OVERLAY_TOGGLE_CORNER_HEIGHT,
        OVERLAY_TOGGLE_CORNER_WIDTH,
        OVERLAY_TOGGLE_CORNER_HEIGHT,
    );

    return {
        displayWidth,
        displayHeight,
        lineHeight,
        topTextY: OVERLAY_TOP_TEXT_Y,
        toggleRect,
    };
}

/**
 * Returns whether a pointer position lies inside the toggle corner rect.
 *
 * @param pos - Pointer position in display coordinates.
 * @param toggleRect - Bottom-left toggle region.
 * @returns `true` when the point is inside the rect (`Rect2i.isContaining` half-open bounds).
 */
export function isPointerInOverlayToggleCorner(pos: Vector2i, toggleRect: Rect2i): boolean {
    return toggleRect.isContaining(pos);
}

/**
 * X position for right-aligned overlay text inside a bar.
 *
 * @param text - Text to place flush right with {@link OVERLAY_EDGE_MARGIN_PX} inset.
 * @param displayWidth - Logical display width in pixels.
 * @returns Left edge X for {@link OverlayDrawTarget.drawLabel} (never less than the margin).
 */
export function overlayRightAlignedTextX(text: string, displayWidth: number): number {
    const width = text.length * SYSTEM_CHAR_ADVANCE;

    return Math.max(OVERLAY_EDGE_MARGIN_PX, displayWidth - width - OVERLAY_EDGE_MARGIN_PX + 1);
}

/**
 * X position for a right-aligned engine-composed label whose `|` markers render as
 * dividers via {@link drawOverlayLabelWithDividers}.
 *
 * Same flush-right convention as {@link overlayRightAlignedTextX}, but measured with
 * {@link overlayDividerLabelWidth} so the divider spacing is accounted for.
 *
 * @param text - Engine-composed label with `|` separator markers.
 * @param displayWidth - Logical display width in pixels.
 * @returns Left edge X for {@link drawOverlayLabelWithDividers} (never less than the margin).
 */
export function overlayRightAlignedDividerLabelX(text: string, displayWidth: number): number {
    const width = overlayDividerLabelWidth(text);

    return Math.max(OVERLAY_EDGE_MARGIN_PX, displayWidth - width - OVERLAY_EDGE_MARGIN_PX + 1);
}

/**
 * X position for the bottom-left toggle hint icon.
 *
 * Starts at {@link OVERLAY_EDGE_MARGIN_PX}, then applies {@link OVERLAY_TOGGLE_HINT_ICON_NUDGE_X_PX}.
 *
 * @returns Left edge X for the inline toggle icon.
 */
export function overlayToggleHintIconX(): number {
    return OVERLAY_EDGE_MARGIN_PX + OVERLAY_TOGGLE_HINT_ICON_NUDGE_X_PX;
}

/**
 * Palette offset for system-font overlay text (foreground glyphs stored as index 1).
 *
 * @param paletteIndex - Palette color index for overlay text.
 * @returns Offset passed to {@link OverlayDrawTarget.drawLabel}, or `0` when index 0 (transparent).
 */
export function overlayBitmapTextPaletteOffset(paletteIndex: number): number {
    return paletteIndex > 0 ? paletteIndex - 1 : 0;
}

/**
 * Y coordinate of the top edge of a custom row bar stacked above the footer.
 *
 * @param footerStackTopY - Top Y of the footer stack (palette band or hint bar).
 * @param rowIndex - `0` is directly above the footer stack.
 * @returns Bar top Y in display pixels.
 */
export function customBarY(footerStackTopY: number, rowIndex: number): number {
    return footerStackTopY - (rowIndex + 1) * (OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX);
}
