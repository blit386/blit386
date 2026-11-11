/**
 * Palette band hit testing: swatch under a pointer, scroll offsets, and the scrollbar track.
 */

import { Rect2i } from '../../utils/Rect2i';
import { OVERLAY_EDGE_MARGIN_PX } from '../layout/constants';
import type { PaletteGridLayout } from '../types';
import {
    computeScrollbarThumbHeight,
    PALETTE_GRID_PADDING_PX,
    PALETTE_SCROLLBAR_EDGE_PADDING_PX,
    writeScrollbarRects,
} from './PaletteView';

/** Reserved width on the right edge of the palette band excluded from swatch hits (scrollbar). */
export const PALETTE_SCROLLBAR_TRACK_WIDTH_PX = 4;

/** Scrollbar track and thumb rects reused by the track queries (one overlay at a time). */
const scrollbarScratch = {
    track: new Rect2i(),
    thumb: new Rect2i(),
};

/**
 * Tests whether a pointer lies outside the palette band, including the scrollbar track.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param bandRight - Right edge of the hittable band (excludes scrollbar track).
 * @returns `true` when the pointer is outside the swatch hit region (including over the scrollbar track).
 */
function isPointerOutsideBand(pointerX: number, pointerY: number, paletteBand: Rect2i, bandRight: number): boolean {
    return (
        pointerX < paletteBand.x ||
        pointerX >= bandRight ||
        pointerY < paletteBand.y ||
        pointerY >= paletteBand.y + paletteBand.height
    );
}

/**
 * Maps band-local coordinates to a palette index, or `null` when not over a swatch cell.
 *
 * @param localX - X relative to the grid origin inside the palette band.
 * @param localY - Y relative to the grid origin inside the palette band.
 * @param cols - Grid column count.
 * @param swatchSize - Swatch side length in pixels.
 * @param gap - Gap between swatches.
 * @param visibleRows - Rows drawn in the band viewport; lower rows sit in the bottom padding.
 * @param scrollRowOffset - First visible grid row.
 * @param colorCount - Active palette slot count.
 * @returns Palette index, or `null` when the point is in padding or out of range.
 */
function resolveIndexAtBandLocal(
    localX: number,
    localY: number,
    cols: number,
    swatchSize: number,
    gap: number,
    visibleRows: number,
    scrollRowOffset: number,
    colorCount: number,
): number | null {
    if (localX < 0 || localY < 0) {
        return null;
    }

    const pitch = swatchSize + gap;
    const col = Math.floor(localX / pitch);
    const row = Math.floor(localY / pitch);

    if (col >= cols || row >= visibleRows) {
        return null;
    }

    const inSwatchX = localX - col * pitch;

    if (inSwatchX >= swatchSize) {
        return null;
    }

    const inSwatchY = localY - row * pitch;

    if (inSwatchY >= swatchSize) {
        return null;
    }

    const index = (scrollRowOffset + row) * cols + col;

    if (index < 0 || index >= colorCount) {
        return null;
    }

    return index;
}

/**
 * Maps a pointer position to a palette swatch index, or `null` when no swatch is under the point.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param colorCount - Active palette slot count.
 * @param scrollRowOffset - First visible grid row (default `0`).
 * @param scrollbarTrackWidth - Right-edge track width excluded from hits (default {@link PALETTE_SCROLLBAR_TRACK_WIDTH_PX}).
 * @returns Palette index, or `null` when the pointer is not over a hittable swatch.
 */
export function hitTestSwatch(
    pointerX: number,
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    colorCount: number,
    scrollRowOffset = 0,
    scrollbarTrackWidth = PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
): number | null {
    const { cols, swatchSize, gap, visibleRows } = grid;

    if (cols <= 0 || swatchSize <= 0 || colorCount <= 0) {
        return null;
    }

    const bandRight = paletteBand.x + paletteBand.width - scrollbarTrackWidth - PALETTE_SCROLLBAR_EDGE_PADDING_PX;

    if (isPointerOutsideBand(pointerX, pointerY, paletteBand, bandRight)) {
        return null;
    }

    const localX = pointerX - (paletteBand.x + OVERLAY_EDGE_MARGIN_PX);
    const localY = pointerY - (paletteBand.y + PALETTE_GRID_PADDING_PX);
    return resolveIndexAtBandLocal(localX, localY, cols, swatchSize, gap, visibleRows, scrollRowOffset, colorCount);
}

/**
 * Returns the maximum scroll row offset for a palette grid viewport.
 *
 * @param grid - Precomputed grid layout.
 * @returns Last valid `scrollRowOffset` (0 when all rows are visible).
 */
export function maxScrollRowOffset(grid: PaletteGridLayout): number {
    return Math.max(0, grid.rows - grid.visibleRows);
}

/**
 * Clamps a scroll row offset into the valid range for a palette grid viewport.
 *
 * @param offset - Requested first visible row.
 * @param grid - Precomputed grid layout.
 * @returns Clamped offset in `[0, maxScrollRowOffset]`.
 */
export function clampScrollRowOffset(offset: number, grid: PaletteGridLayout): number {
    const maxOffset = maxScrollRowOffset(grid);

    if (offset <= 0) {
        return 0;
    }

    if (offset >= maxOffset) {
        return maxOffset;
    }

    return offset;
}

/**
 * Returns whether a pointer lies inside the palette footer scroll region.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @returns `true` when wheel or drag scrolling may apply.
 */
export function isPointerInScrollRegion(pointerX: number, pointerY: number, paletteBand: Rect2i): boolean {
    return (
        pointerX >= paletteBand.x &&
        pointerX < paletteBand.x + paletteBand.width &&
        pointerY >= paletteBand.y &&
        pointerY < paletteBand.y + paletteBand.height
    );
}

/**
 * Returns whether a pointer lies inside the palette scrollbar track.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns `true` when the pointer is over the track rect.
 */
export function isPointerInScrollbarTrack(
    pointerX: number,
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    scrollRowOffset: number,
    trackWidth: number,
): boolean {
    if (
        !writeScrollbarRects(
            scrollbarScratch.track,
            scrollbarScratch.thumb,
            paletteBand,
            grid,
            scrollRowOffset,
            trackWidth,
        )
    ) {
        return false;
    }

    return (
        pointerX >= scrollbarScratch.track.x &&
        pointerX < scrollbarScratch.track.x + scrollbarScratch.track.width &&
        pointerY >= scrollbarScratch.track.y &&
        pointerY < scrollbarScratch.track.y + scrollbarScratch.track.height
    );
}

/**
 * Maps a pointer Y position within the scrollbar track to a scroll row offset.
 *
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns Clamped scroll row offset.
 */
export function resolveScrollRowOffsetFromTrackPointerY(
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    trackWidth: number,
): number {
    const maxOffset = maxScrollRowOffset(grid);

    if (maxOffset <= 0) {
        return 0;
    }

    writeScrollbarRects(scrollbarScratch.track, scrollbarScratch.thumb, paletteBand, grid, 0, trackWidth);

    const trackTop = scrollbarScratch.track.y;
    const trackHeight = scrollbarScratch.track.height;
    const thumbHeight = computeScrollbarThumbHeight(trackHeight, grid);
    const scrollRange = Math.max(1, trackHeight - thumbHeight);
    const localY = pointerY - trackTop - Math.floor(thumbHeight / 2);
    const ratio = localY / scrollRange;
    const offset = Math.round(ratio * maxOffset);

    return clampScrollRowOffset(offset, grid);
}
