/**
 * Live palette swatch grid for the overlay bottom band.
 *
 * {@link computeGrid} picks adaptive column counts from the active palette
 * size; {@link PaletteView.draw} renders indexed swatches with gaps, unused-slot
 * markers, and toggle-icon exclusion.
 */

import type { Palette } from '../../assets/Palette';
import { Rect2i } from '../../utils/Rect2i';
import { OVERLAY_EDGE_MARGIN_PX } from '../layout/constants';
import { overlayToggleHintIconX } from '../layout/layoutHelpers';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';
import { hintIconY } from '../OverlayToggleIcon';
import { ICON_HEIGHT, ICON_WIDTH } from '../toggleIconData';
import type { PaletteGridLayout } from '../types';

/** Default swatch size in pixels. */
export const DEFAULT_PALETTE_SWATCH_SIZE = 7;

/** Horizontal and vertical gap between swatches in pixels. */
export const PALETTE_SWATCH_GAP_PX = 1;

/** Padding below the swatch grid inside the bottom band. */
export const PALETTE_GRID_PADDING_PX = 3;

/** Minimum palette scrollbar thumb height in pixels (macOS-style overlay scroll indicator). */
export const PALETTE_SCROLLBAR_MIN_THUMB_HEIGHT_PX = 4;

/** Inset of the scrollbar track from the palette band top, right, and bottom edges. */
export const PALETTE_SCROLLBAR_EDGE_PADDING_PX = 1;

/** Empty grid placeholder when the palette view is disabled. */
export const DEFAULT_PALETTE_GRID: PaletteGridLayout = {
    cols: 0,
    rows: 0,
    visibleRows: 0,
    swatchSize: 0,
    gap: 0,
    totalHeight: 0,
};

/**
 * Computes the horizontal span of one grid row.
 *
 * @param cols - Column count.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @returns Row width in pixels.
 */
export function gridRowWidth(cols: number, swatchSize: number, gap: number): number {
    if (cols <= 0) {
        return 0;
    }

    return cols * swatchSize + (cols - 1) * gap;
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link gridRowWidth} instead.
 * @param cols - Column count.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @returns Row width in pixels.
 */
export const paletteGridRowWidth = gridRowWidth;

/**
 * Computes the vertical span of the full grid.
 *
 * @param rows - Row count.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @returns Grid height in pixels.
 */
export function gridRowStackHeight(rows: number, swatchSize: number, gap: number): number {
    if (rows <= 0) {
        return 0;
    }

    return rows * swatchSize + (rows - 1) * gap;
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link gridRowStackHeight} instead.
 * @param rows - Row count.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @returns Grid height in pixels.
 */
export const paletteGridRowStackHeight = gridRowStackHeight;

/**
 * Picks the widest column count that fits the display while halving from the palette size.
 *
 * @param displayWidth - Logical display width in pixels.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @param colorCount - Active palette slot count.
 * @param maxColumns - Optional cap from {@link HardwareSettings.overlayPaletteColumns}.
 * @returns Column count (at least 1).
 */
export function pickGridColumnCount(
    displayWidth: number,
    swatchSize: number,
    gap: number,
    colorCount: number,
    maxColumns?: number,
): number {
    const availableWidth = displayWidth - OVERLAY_EDGE_MARGIN_PX * 2;
    let candidate = Math.max(1, colorCount);

    if (maxColumns !== undefined && maxColumns > 0) {
        candidate = Math.min(candidate, maxColumns);
    }

    while (candidate > 1) {
        if (gridRowWidth(candidate, swatchSize, gap) <= availableWidth) {
            return candidate;
        }

        candidate = Math.floor(candidate / 2);
    }

    return 1;
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link pickGridColumnCount} instead.
 * @param displayWidth - Logical display width in pixels.
 * @param swatchSize - Side length of each swatch.
 * @param gap - Gap between swatches.
 * @param colorCount - Active palette slot count.
 * @param maxColumns - Optional cap from {@link HardwareSettings.overlayPaletteColumns}.
 * @returns Column count (at least 1).
 */
export const pickPaletteGridColumnCount = pickGridColumnCount;

/**
 * Resolves the visible row count for a palette grid viewport.
 *
 * @param totalRows - Full palette row count.
 * @param maxVisibleRows - Optional cap from {@link HardwareSettings.overlayPaletteRowsVisible}.
 * @returns Visible rows (0 when `totalRows` is 0; otherwise clamped to `[1, totalRows]`).
 */
export function resolveGridVisibleRows(totalRows: number, maxVisibleRows?: number): number {
    if (totalRows <= 0) {
        return 0;
    }

    if (maxVisibleRows === undefined || !Number.isFinite(maxVisibleRows)) {
        return totalRows;
    }

    const parsedMax = Math.max(1, Math.trunc(maxVisibleRows));

    return Math.min(totalRows, parsedMax);
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link resolveGridVisibleRows} instead.
 * @param totalRows - Full palette row count.
 * @param maxVisibleRows - Optional cap from {@link HardwareSettings.overlayPaletteRowsVisible}.
 * @returns Visible rows (0 when `totalRows` is 0; otherwise clamped to `[1, totalRows]`).
 */
export const resolvePaletteGridVisibleRows = resolveGridVisibleRows;

/**
 * Computes palette grid layout for the bottom band.
 *
 * @param displayWidth - Logical display width in pixels.
 * @param swatchSize - Side length of each swatch (default {@link DEFAULT_PALETTE_SWATCH_SIZE}).
 * @param colorCount - Number of palette slots to show (default 256).
 * @param gap - Gap between swatches (default 1).
 * @param maxColumns - Optional cap from {@link HardwareSettings.overlayPaletteColumns}.
 * @param maxVisibleRows - Optional cap from {@link HardwareSettings.overlayPaletteRowsVisible}.
 * @returns Grid dimensions and viewport band height.
 */
export function computeGrid(
    displayWidth: number,
    swatchSize = DEFAULT_PALETTE_SWATCH_SIZE,
    colorCount = 256,
    gap = PALETTE_SWATCH_GAP_PX,
    maxColumns?: number,
    maxVisibleRows?: number,
): PaletteGridLayout {
    if (colorCount <= 0) {
        return { cols: 0, rows: 0, visibleRows: 0, swatchSize, gap, totalHeight: 0 };
    }

    const cols = pickGridColumnCount(displayWidth, swatchSize, gap, colorCount, maxColumns);
    const rows = Math.ceil(colorCount / cols);
    const visibleRows = resolveGridVisibleRows(rows, maxVisibleRows);
    const totalHeight = gridRowStackHeight(visibleRows, swatchSize, gap) + PALETTE_GRID_PADDING_PX * 2;

    return { cols, rows, visibleRows, swatchSize, gap, totalHeight };
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link computeGrid} instead.
 * @param displayWidth - Logical display width in pixels.
 * @param swatchSize - Side length of each swatch.
 * @param colorCount - Number of palette slots to show.
 * @param gap - Gap between swatches.
 * @param maxColumns - Optional cap from {@link HardwareSettings.overlayPaletteColumns}.
 * @param maxVisibleRows - Optional cap from {@link HardwareSettings.overlayPaletteRowsVisible}.
 * @returns Grid dimensions and viewport band height.
 */
export const computePaletteGrid = computeGrid;

/**
 * Returns whether two axis-aligned rects overlap (zero allocation).
 *
 * @param ax - Left edge of rect A.
 * @param ay - Top edge of rect A.
 * @param aw - Width of rect A.
 * @param ah - Height of rect A.
 * @param bx - Left edge of rect B.
 * @param by - Top edge of rect B.
 * @param bw - Width of rect B.
 * @param bh - Height of rect B.
 * @returns `true` when the rects overlap.
 */
function doRectsOverlap(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
): boolean {
    return !(bx >= ax + aw || bx + bw <= ax || by >= ay + ah || by + bh <= ay);
}

/**
 * Returns whether a swatch rect intersects an exclusion region.
 *
 * @param x - Swatch left edge in display pixels.
 * @param y - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 * @param exclusion - Region to avoid (for example the toggle hint icon).
 * @returns `true` when any part of the swatch overlaps the exclusion rect.
 */
function doesSwatchIntersectExclusion(x: number, y: number, swatchSize: number, exclusion: Rect2i): boolean {
    return doRectsOverlap(x, y, swatchSize, swatchSize, exclusion.x, exclusion.y, exclusion.width, exclusion.height);
}

/** Cached hint exclusion rect; recomputed only when layout inputs change. */
const hintExclusionCache = {
    hintBarTopY: Number.NaN,
    displayWidth: Number.NaN,
    rect: new Rect2i(),
};

/**
 * Returns the screen-space rect reserved for the bottom-left toggle hint icon.
 *
 * Reuses {@link hintExclusionCache.rect} when `hintBarTopY` and `displayWidth` match the previous call.
 *
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @param displayWidth - Logical display width (cache key only; icon X is margin-based).
 * @returns Exclusion rect for swatch placement and hit testing.
 */
export function resolveHintExclusionRect(hintBarTopY: number, displayWidth: number): Rect2i {
    if (hintExclusionCache.hintBarTopY === hintBarTopY && hintExclusionCache.displayWidth === displayWidth) {
        return hintExclusionCache.rect;
    }

    hintExclusionCache.hintBarTopY = hintBarTopY;
    hintExclusionCache.displayWidth = displayWidth;

    hintExclusionCache.rect.set(overlayToggleHintIconX(), hintIconY(hintBarTopY), ICON_WIDTH, ICON_HEIGHT);

    return hintExclusionCache.rect;
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link resolveHintExclusionRect} instead.
 * @param hintBarTopY - Top Y of the bottom hint bar from the layout plan.
 * @param displayWidth - Logical display width (cache key only; icon X is margin-based).
 * @returns Exclusion rect for swatch placement and hit testing.
 */
export const resolvePaletteHintExclusionRect = resolveHintExclusionRect;

/** Preferred side length for the filled marker drawn inside unused swatches. */
const UNUSED_SWATCH_MARKER_SIZE = 3;

/** Reused draw scratch rects for the palette grid hot loop (one overlay draw at a time). */
const gridDrawScratch = {
    swatch: new Rect2i(),
    marker: new Rect2i(),
};

/**
 * Writes the filled marker rect for an unused swatch into {@link target}.
 *
 * @param target - Reusable rect mutated in place.
 * @param x - Swatch left edge in display pixels.
 * @param y - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 */
function writeUnusedSwatchMarkerRect(target: Rect2i, x: number, y: number, swatchSize: number): void {
    if (swatchSize <= 0) {
        target.set(x, y, 0, 0);
        return;
    }

    const markerSize = Math.max(1, Math.min(UNUSED_SWATCH_MARKER_SIZE, swatchSize - 4));
    const offset = Math.floor((swatchSize - markerSize) / 2);

    target.set(x + offset, y + offset, markerSize, markerSize);
}

/**
 * Computes the filled marker rect drawn inside an unused swatch.
 *
 * @param x - Swatch left edge in display pixels.
 * @param y - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 * @returns Marker rect clamped and centered within the swatch bounds, or a
 * zero-area rect at `(x, y)` when `swatchSize` is not positive.
 */
export function computeUnusedSwatchMarkerRect(x: number, y: number, swatchSize: number): Rect2i {
    const result = new Rect2i();

    writeUnusedSwatchMarkerRect(result, x, y, swatchSize);

    return result;
}

/**
 * Draws a centered filled marker inside an unused swatch.
 *
 * @param target - Overlay draw target.
 * @param markerScratch - Reusable marker rect mutated in place.
 * @param x - Swatch left edge in display pixels.
 * @param y - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 * @param markIndex - Palette index for the marker fill.
 */
function drawUnusedSwatch(
    target: OverlayDrawTarget,
    markerScratch: Rect2i,
    x: number,
    y: number,
    swatchSize: number,
    markIndex: number,
): void {
    if (swatchSize <= 0) {
        return;
    }

    writeUnusedSwatchMarkerRect(markerScratch, x, y, swatchSize);

    if (markerScratch.width <= 0 || markerScratch.height <= 0) {
        return;
    }

    target.drawBarFill(markerScratch, markIndex);
}

/**
 * Returns whether a palette slot was referenced by demo draw calls this frame.
 *
 * @param usedMask - Per-frame usage mask from BTAPI.
 * @param index - Palette slot to query.
 * @returns `true` when the slot is marked used.
 */
function isSlotUsed(usedMask: Uint8Array, index: number): boolean {
    // eslint-disable-next-line security/detect-object-injection -- index bounds checked below
    return index > 0 && index < usedMask.length && usedMask[index] === 1;
}

/**
 * Draws one palette swatch or its unused marker.
 *
 * @param target - Overlay draw target.
 * @param swatchScratch - Reusable swatch rect mutated in place.
 * @param markerScratch - Reusable marker rect mutated in place.
 * @param x - Swatch left edge in display pixels.
 * @param y - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 * @param index - Palette slot index for this swatch.
 * @param usedMask - Per-frame usage mask from BTAPI.
 * @param unusedMarkIndex - Palette index for unused swatch marker fills.
 */
function drawSwatch(
    target: OverlayDrawTarget,
    swatchScratch: Rect2i,
    markerScratch: Rect2i,
    x: number,
    y: number,
    swatchSize: number,
    index: number,
    usedMask: Uint8Array,
    unusedMarkIndex: number,
): void {
    if (isSlotUsed(usedMask, index)) {
        swatchScratch.set(x, y, swatchSize, swatchSize);
        target.drawBarFill(swatchScratch, index);
    } else {
        drawUnusedSwatch(target, markerScratch, x, y, swatchSize, unusedMarkIndex);
    }
}

/**
 * Writes the top-left corner of a palette swatch into {@link target}.
 *
 * @param target - Reusable rect mutated in place.
 * @param index - Palette slot index.
 * @param paletteBand - Palette band rect from layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row (default `0`).
 */
export function writeSwatchTopLeft(
    target: Rect2i,
    index: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    scrollRowOffset = 0,
): void {
    const { cols, swatchSize, gap } = grid;

    if (cols === 0) {
        target.set(0, 0, 0, 0);
        return;
    }

    const col = index % cols;
    const row = Math.floor(index / cols) - scrollRowOffset;
    const originX = paletteBand.x + OVERLAY_EDGE_MARGIN_PX;
    const originY = paletteBand.y + PALETTE_GRID_PADDING_PX;
    const x = originX + col * (swatchSize + gap);
    const y = originY + row * (swatchSize + gap);

    target.set(x, y, swatchSize, swatchSize);
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link writeSwatchTopLeft} instead.
 * @param target - Reusable rect mutated in place.
 * @param index - Palette slot index.
 * @param paletteBand - Palette band rect from layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row (default `0`).
 */
export const writePaletteSwatchTopLeft = writeSwatchTopLeft;

/**
 * Draws the visible palette swatch window inside the bottom band.
 *
 * @param target - Overlay draw target.
 * @param paletteBand - Palette band rect from layout plan.
 * @param colorCount - Active palette slot count.
 * @param grid - Precomputed grid layout.
 * @param hintExclusion - Region to skip for the toggle hint icon.
 * @param usedMask - Per-frame usage mask from BTAPI.
 * @param unusedMarkIndex - Palette index for unused swatch marker fills.
 * @param scrollRowOffset - First visible grid row (default `0`).
 */
function drawSwatchGrid(
    target: OverlayDrawTarget,
    paletteBand: Rect2i,
    colorCount: number,
    grid: PaletteGridLayout,
    hintExclusion: Rect2i,
    usedMask: Uint8Array,
    unusedMarkIndex: number,
    scrollRowOffset = 0,
): void {
    const { cols, visibleRows, swatchSize } = grid;
    const swatchScratch = gridDrawScratch.swatch;
    const markerScratch = gridDrawScratch.marker;
    const firstIndex = scrollRowOffset * cols;
    const lastIndex = Math.min(colorCount, (scrollRowOffset + visibleRows) * cols);

    for (let index = firstIndex; index < lastIndex; index++) {
        writeSwatchTopLeft(swatchScratch, index, paletteBand, grid, scrollRowOffset);
        const x = swatchScratch.x;
        const y = swatchScratch.y;

        // Reserve only the toggle hint icon band; do not clip against the 17×13 toggle hit rect
        // (it overlaps many grid rows and would truncate every row below it).
        if (doesSwatchIntersectExclusion(x, y, swatchSize, hintExclusion)) {
            continue;
        }

        drawSwatch(target, swatchScratch, markerScratch, x, y, swatchSize, index, usedMask, unusedMarkIndex);
    }
}

/**
 * Computes macOS-style thumb height: visible fraction of total rows, clamped to the track.
 *
 * @param trackHeight - Full palette band height in pixels.
 * @param grid - Precomputed grid layout.
 * @returns Thumb height in pixels, or `0` when inputs are invalid.
 */
export function computeScrollbarThumbHeight(trackHeight: number, grid: PaletteGridLayout): number {
    const { rows, visibleRows } = grid;

    if (rows <= 0 || trackHeight <= 0) {
        return 0;
    }

    const proportional = Math.floor((visibleRows / rows) * trackHeight);

    return Math.min(trackHeight, Math.max(PALETTE_SCROLLBAR_MIN_THUMB_HEIGHT_PX, proportional));
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link computeScrollbarThumbHeight} instead.
 * @param trackHeight - Full palette band height in pixels.
 * @param grid - Precomputed grid layout.
 * @returns Thumb height in pixels, or `0` when inputs are invalid.
 */
export const computePaletteScrollbarThumbHeight = computeScrollbarThumbHeight;

/**
 * Writes the palette scrollbar track and thumb rects for the bottom band.
 *
 * The track is inset 1 px from the palette band top, right, and bottom edges. Only the
 * thumb is drawn; the track rect is used for hit testing and thumb placement.
 *
 * @param trackTarget - Reusable track rect mutated in place.
 * @param thumbTarget - Reusable thumb rect mutated in place.
 * @param paletteBand - Palette band rect from layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns `true` when scrolling is possible and rects were written.
 */
export function writeScrollbarRects(
    trackTarget: Rect2i,
    thumbTarget: Rect2i,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    scrollRowOffset: number,
    trackWidth: number,
): boolean {
    const maxOffset = Math.max(0, grid.rows - grid.visibleRows);

    if (maxOffset <= 0 || trackWidth <= 0 || grid.visibleRows <= 0) {
        trackTarget.set(paletteBand.x, paletteBand.y, 0, 0);
        thumbTarget.set(paletteBand.x, paletteBand.y, 0, 0);

        return false;
    }

    const pad = PALETTE_SCROLLBAR_EDGE_PADDING_PX;
    const trackX = paletteBand.x + paletteBand.width - trackWidth - pad;
    const trackY = paletteBand.y + pad;
    const trackHeight = paletteBand.height - pad * 2;

    if (trackHeight <= 0) {
        trackTarget.set(paletteBand.x, paletteBand.y, 0, 0);
        thumbTarget.set(paletteBand.x, paletteBand.y, 0, 0);

        return false;
    }

    trackTarget.set(trackX, trackY, trackWidth, trackHeight);

    const thumbHeight = computeScrollbarThumbHeight(trackHeight, grid);
    const scrollRange = Math.max(0, trackHeight - thumbHeight);
    const thumbY = trackY + Math.floor((scrollRowOffset / maxOffset) * scrollRange);

    thumbTarget.set(trackX, thumbY, trackWidth, thumbHeight);

    return true;
}

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link writeScrollbarRects} instead.
 * @param trackTarget - Reusable track rect mutated in place.
 * @param thumbTarget - Reusable thumb rect mutated in place.
 * @param paletteBand - Palette band rect from layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns `true` when scrolling is possible and rects were written.
 */
export const writePaletteScrollbarRects = writeScrollbarRects;

/**
 * Draws the palette scrollbar thumb inside the bottom band (no track fill).
 *
 * @param target - Overlay draw target.
 * @param paletteBand - Palette band rect from layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row.
 * @param trackWidth - Scrollbar track width in pixels.
 * @param thumbIndex - Palette index for the thumb fill.
 */
function drawScrollbar(
    target: OverlayDrawTarget,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    scrollRowOffset: number,
    trackWidth: number,
    thumbIndex: number,
): void {
    const trackScratch = gridDrawScratch.swatch;
    const thumbScratch = gridDrawScratch.marker;

    if (!writeScrollbarRects(trackScratch, thumbScratch, paletteBand, grid, scrollRowOffset, trackWidth)) {
        return;
    }

    target.drawBarFill(thumbScratch, thumbIndex);
}

/**
 * Live palette swatch renderer for the overlay bottom band.
 */
export class PaletteView {
    readonly #isEnabled: boolean;

    /**
     * Creates a palette view with the given feature flag.
     *
     * @param isEnabled - When false, draw is a no-op (default matches public opt-in API).
     */
    constructor(isEnabled = false) {
        this.#isEnabled = isEnabled;
    }

    /**
     * Whether the palette grid is active.
     *
     * @returns Feature flag state.
     */
    get isEnabled(): boolean {
        return this.#isEnabled;
    }

    /**
     * Draws palette swatches in the bottom band.
     *
     * @param target - Overlay draw target.
     * @param paletteBand - Palette band rect from layout plan.
     * @param palette - Active demo palette.
     * @param grid - Precomputed grid layout.
     * @param hintBarTopY - Top Y of the bottom hint bar for icon exclusion.
     * @param displayWidth - Logical display width for hint exclusion cache key.
     * @param usedMask - Per-frame usage mask populated during demo render.
     * @param unusedMarkIndex - Palette index for unused swatch marker fills.
     * @param scrollRowOffset - First visible grid row (default `0`).
     * @param scrollbarTrackWidth - Right-edge scrollbar track width (default `0`).
     * @param scrollbarThumbIndex - Palette index for scrollbar thumb fill.
     */
    draw(
        target: OverlayDrawTarget,
        paletteBand: Rect2i,
        palette: Palette | null,
        grid: PaletteGridLayout,
        hintBarTopY: number,
        displayWidth: number,
        usedMask: Uint8Array,
        unusedMarkIndex: number,
        scrollRowOffset = 0,
        scrollbarTrackWidth = 0,
        scrollbarThumbIndex = unusedMarkIndex,
    ): void {
        if (!this.#isEnabled || palette === null || grid.cols <= 0) {
            return;
        }

        const hintExclusion = resolveHintExclusionRect(hintBarTopY, displayWidth);

        drawSwatchGrid(
            target,
            paletteBand,
            palette.size,
            grid,
            hintExclusion,
            usedMask,
            unusedMarkIndex,
            scrollRowOffset,
        );

        drawScrollbar(target, paletteBand, grid, scrollRowOffset, scrollbarTrackWidth, scrollbarThumbIndex);
    }
}
