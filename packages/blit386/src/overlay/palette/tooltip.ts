/**
 * Palette swatch tooltip layout and draw, plus the clipboard write behind copy-on-press.
 */

import type { BitmapFont } from '../../assets/BitmapFont';
import type { Rect2i } from '../../utils/Rect2i';
import type { Vector2i } from '../../utils/Vector2i';
import { SYSTEM_CHAR_ADVANCE } from '../constants';
import { drawOutline } from '../drawOutline';
import { overlayBitmapTextPaletteOffset } from '../layout/layoutHelpers';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';

/** Gap between the tooltip body bottom edge and the swatch top edge. */
const TOOLTIP_GAP_ABOVE_SWATCH_PX = 1;

/** Layout output for a docked palette swatch tooltip. */
export interface PaletteTooltipLayout {
    /** Tooltip label body in display coordinates. */
    readonly body: Rect2i;

    /** Bitmap text draw position (top-left of glyphs). */
    readonly textPos: Vector2i;
}

/**
 * Lays out a docked tooltip above a swatch with clamping inside the display.
 *
 * @param target - Reusable layout object written in place.
 * @param swatchRect - Swatch bounds in display coordinates.
 * @param label - Tooltip label text.
 * @param displayWidth - Logical display width.
 * @param displayHeight - Logical display height.
 * @returns `target` for chaining.
 */
export function layoutTooltip(
    target: PaletteTooltipLayout,
    swatchRect: Rect2i,
    label: string,
    displayWidth: number,
    displayHeight: number,
): PaletteTooltipLayout {
    const textWidth = label.length * SYSTEM_CHAR_ADVANCE;
    const bodyWidth = textWidth + 7;
    const bodyHeight = 13;
    const swatchCenterX = swatchRect.x + Math.floor(swatchRect.width / 2);

    let bodyX = swatchCenterX - Math.floor(bodyWidth / 2);
    let bodyY = swatchRect.y - bodyHeight - TOOLTIP_GAP_ABOVE_SWATCH_PX;

    if (bodyX < 0) {
        bodyX = 0;
    }

    if (bodyX + bodyWidth > displayWidth) {
        bodyX = Math.max(0, displayWidth - bodyWidth);
    }

    if (bodyY < 0) {
        bodyY = 0;
    }

    if (bodyY + bodyHeight > displayHeight) {
        bodyY = Math.max(0, displayHeight - bodyHeight);
    }

    target.body.set(bodyX, bodyY, bodyWidth, bodyHeight);
    target.textPos.set(bodyX + 4, bodyY);

    return target;
}

/**
 * Draws a docked palette swatch tooltip body and 1px border.
 *
 * @param target - Overlay draw target.
 * @param layout - Tooltip layout from {@link layoutTooltip}.
 * @param barIndex - Palette index for tooltip body fill (overlay background).
 * @param textIndex - Palette index for the border stroke.
 */
export function drawTooltipChrome(
    target: OverlayDrawTarget,
    layout: PaletteTooltipLayout,
    barIndex: number,
    textIndex: number,
): void {
    target.drawBarFillOnTop(layout.body, barIndex);
    drawOutline(target, layout.body, textIndex);
}

/**
 * Draws a docked palette swatch tooltip label.
 *
 * @param target - Overlay draw target.
 * @param font - System bitmap font.
 * @param layout - Tooltip layout from {@link layoutTooltip}.
 * @param label - Tooltip label text.
 * @param textIndex - Palette index for label text.
 */
export function drawTooltipLabel(
    target: OverlayDrawTarget,
    font: BitmapFont,
    layout: PaletteTooltipLayout,
    label: string,
    textIndex: number,
): void {
    if (label.length === 0) {
        return;
    }

    const textPaletteOffset = overlayBitmapTextPaletteOffset(textIndex);

    target.drawLabelOnTop(font, layout.textPos, label, textPaletteOffset);
}

/**
 * Writes palette index text to the clipboard when the API is available.
 *
 * @param index - Palette slot to copy.
 * @returns Resolves on success; rejects when clipboard is unavailable or denied.
 */
export async function writeIndexToClipboard(index: number): Promise<void> {
    const clipboard = globalThis.navigator?.clipboard;

    if (!clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
    }

    await clipboard.writeText(String(index));
}
