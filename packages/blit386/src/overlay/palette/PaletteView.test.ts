/**
 * Unit tests for {@link computeGrid} and palette swatch drawing.
 */

import { describe, expect, it, vi } from 'vitest';

import { Palette } from '../../assets/Palette';
import { markIndexUsed } from '../../core/RenderPaletteUsage';
import { Rect2i } from '../../utils/Rect2i';
import { DEFAULT_IDX_TEXT } from '../constants';
import { OVERLAY_EDGE_MARGIN_PX, OVERLAY_ROW_GAP_PX } from '../layout/constants';
import { createOverlayLayout } from '../layout/layoutHelpers';
import { hintBarY, paletteBandY } from '../layout/layoutPlan';
import {
    computeGrid,
    computeUnusedSwatchMarkerRect,
    DEFAULT_PALETTE_SWATCH_SIZE,
    gridRowStackHeight,
    gridRowWidth,
    PALETTE_GRID_PADDING_PX,
    PALETTE_SWATCH_GAP_PX,
    PaletteView,
    pickGridColumnCount,
    resolveGridVisibleRows,
} from './PaletteView';

/** Builds a usage mask from palette slot indices for tests. */
function buildUsageMask(indices: readonly number[], size = 256): Uint8Array {
    const mask = new Uint8Array(size);

    for (const index of indices) {
        markIndexUsed(mask, index);
    }

    return mask;
}

/** Mock that snapshots each rect fill at call time (production reuses scratch rects). */
function createRectFillMock(): {
    drawBarFill: ReturnType<typeof vi.fn>;
    calls: { rect: Rect2i; index: number }[];
} {
    const calls: { rect: Rect2i; index: number }[] = [];
    const drawBarFill = vi.fn((rect: Rect2i, index: number) => {
        calls.push({
            rect: new Rect2i(rect.x, rect.y, rect.width, rect.height),
            index,
        });
    });

    return { drawBarFill, calls };
}

/** Returns the top-left pixel for one palette index in the bottom-band grid. */
function swatchTopLeft(
    index: number,
    cols: number,
    paletteBandTopY: number,
    swatchSize: number,
    gap: number,
): { x: number; y: number } {
    const col = index % cols;
    const row = Math.floor(index / cols);

    return {
        x: OVERLAY_EDGE_MARGIN_PX + col * (swatchSize + gap),
        y: paletteBandTopY + PALETTE_GRID_PADDING_PX + row * (swatchSize + gap),
    };
}

describe('computeGrid', () => {
    it('uses 32 columns and 8 rows at 320 px width for a 256-color palette', () => {
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);

        expect(grid.cols).toBe(32);
        expect(grid.rows).toBe(8);
        expect(grid.swatchSize).toBe(DEFAULT_PALETTE_SWATCH_SIZE);
        expect(grid.gap).toBe(PALETTE_SWATCH_GAP_PX);
        expect(grid.totalHeight).toBe(
            gridRowStackHeight(grid.rows, grid.swatchSize, grid.gap) + PALETTE_GRID_PADDING_PX * 2,
        );
        expect(gridRowWidth(grid.cols, grid.swatchSize, grid.gap)).toBeLessThanOrEqual(320 - 6);
    });

    it('keeps small palettes on one row when width allows', () => {
        expect(computeGrid(320, 4, 2).cols).toBe(2);
        expect(computeGrid(320, 4, 4).cols).toBe(4);
        expect(computeGrid(320, 4, 16).cols).toBe(16);
    });

    it('halves column count when a single row no longer fits', () => {
        const narrowWidth = gridRowWidth(16, 4, 1) + OVERLAY_EDGE_MARGIN_PX * 2 - 1;
        const grid = computeGrid(narrowWidth, 4, 16, 1);

        expect(grid.cols).toBe(8);
        expect(grid.rows).toBe(2);
    });

    it('falls back to one column when only one swatch fits horizontally', () => {
        const grid = computeGrid(10, 4, 256, 1);

        expect(grid.cols).toBe(1);
        expect(grid.rows).toBe(256);
        expect(grid.totalHeight).toBe(
            gridRowStackHeight(grid.rows, grid.swatchSize, grid.gap) + PALETTE_GRID_PADDING_PX * 2,
        );
    });

    it('returns an empty grid when color count is zero', () => {
        expect(computeGrid(320, 4, 0, 1)).toEqual({
            cols: 0,
            rows: 0,
            visibleRows: 0,
            swatchSize: 4,
            gap: 1,
            totalHeight: 0,
        });
    });

    it('caps visible rows and band height when overlayPaletteRowsVisible is set', () => {
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 3);

        expect(grid.rows).toBe(8);
        expect(grid.visibleRows).toBe(3);
        expect(grid.totalHeight).toBe(gridRowStackHeight(3, grid.swatchSize, grid.gap) + PALETTE_GRID_PADDING_PX * 2);
    });

    it('clamps overlayPaletteRowsVisible below 1 up to one visible row', () => {
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 0);

        expect(grid.visibleRows).toBe(1);
    });

    it('clamps overlayPaletteRowsVisible above total rows down to total rows', () => {
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 16, PALETTE_SWATCH_GAP_PX, undefined, 99);

        expect(grid.rows).toBe(1);
        expect(grid.visibleRows).toBe(1);
    });

    it('matches pickGridColumnCount helper cases', () => {
        expect(pickGridColumnCount(320, 4, 1, 256)).toBe(32);
        expect(pickGridColumnCount(320, 4, 1, 32)).toBe(32);
        expect(pickGridColumnCount(120, 4, 1, 32)).toBe(16);
    });

    it('caps column count when overlayPaletteColumns is set', () => {
        expect(computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 16, PALETTE_SWATCH_GAP_PX, 8).cols).toBe(8);
        expect(computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 16, PALETTE_SWATCH_GAP_PX, 8).rows).toBe(2);
        expect(pickGridColumnCount(320, DEFAULT_PALETTE_SWATCH_SIZE, PALETTE_SWATCH_GAP_PX, 256, 8)).toBe(8);
    });
});

describe('resolveGridVisibleRows', () => {
    it('ignores non-finite caps and returns all rows', () => {
        expect(resolveGridVisibleRows(8, Number.NaN)).toBe(8);
        expect(resolveGridVisibleRows(8, Number.POSITIVE_INFINITY)).toBe(8);
    });

    it('truncates fractional caps before clamping', () => {
        expect(resolveGridVisibleRows(8, 2.9)).toBe(2);
    });
});

describe('computeUnusedSwatchMarkerRect', () => {
    it('returns a centered 3x3 marker for a 7px swatch', () => {
        expect(computeUnusedSwatchMarkerRect(10, 20, 7)).toEqual(new Rect2i(12, 22, 3, 3));
    });

    it('returns a zero-area rect for non-positive swatch sizes', () => {
        expect(computeUnusedSwatchMarkerRect(10, 20, 0)).toEqual(new Rect2i(10, 20, 0, 0));
        expect(computeUnusedSwatchMarkerRect(10, 20, -2)).toEqual(new Rect2i(10, 20, 0, 0));
    });

    it('clamps marker size for small swatches', () => {
        expect(computeUnusedSwatchMarkerRect(0, 0, 4)).toEqual(new Rect2i(1, 1, 1, 1));
    });
});

describe('PaletteView.draw', () => {
    it('draws filled swatches for used indices and empty X marks for unused slots', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = Palette.cga();
        const usedMask = buildUsageMask([5]);
        const swatchSize = DEFAULT_PALETTE_SWATCH_SIZE;
        const grid = computeGrid(320, swatchSize, palette.size, 1);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const view = new PaletteView(true);
        const { drawBarFill, calls } = createRectFillMock();
        const renderer = {
            drawBarFill,
        } as never;

        view.draw(
            renderer,
            new Rect2i(0, paletteBandTop, 320, grid.totalHeight),
            palette,
            grid,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
            usedMask,
            DEFAULT_IDX_TEXT,
        );

        expect(drawBarFill).toHaveBeenCalled();

        const usedPos = swatchTopLeft(5, grid.cols, paletteBandTop, swatchSize, grid.gap);
        const usedSwatch = calls.find(
            (call) =>
                call.rect.x === usedPos.x &&
                call.rect.y === usedPos.y &&
                call.rect.width === swatchSize &&
                call.rect.height === swatchSize &&
                call.index === 5,
        );
        expect(usedSwatch).toBeDefined();

        const unusedPos = swatchTopLeft(6, grid.cols, paletteBandTop, swatchSize, grid.gap);
        const unusedSwatchMarker = calls.find(
            (call) =>
                call.rect.x === unusedPos.x + 2 &&
                call.rect.y === unusedPos.y + 2 &&
                call.rect.width === 3 &&
                call.rect.height === 3 &&
                call.index === DEFAULT_IDX_TEXT,
        );
        expect(unusedSwatchMarker).toBeDefined();

        const unusedSwatchFill = calls.find(
            (call) =>
                call.rect.x === unusedPos.x &&
                call.rect.y === unusedPos.y &&
                call.rect.width === swatchSize &&
                call.index === 6,
        );
        expect(unusedSwatchFill).toBeUndefined();
    });

    it('usage mask ignores slot 0 and out-of-range indices', () => {
        const mask = buildUsageMask([0, 1, 99], 16);

        expect(mask).toEqual(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    });

    it('draws swatches with gaps between cells', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = Palette.cga();
        const usedMask = buildUsageMask([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        const swatchSize = DEFAULT_PALETTE_SWATCH_SIZE;
        const grid = computeGrid(320, swatchSize, palette.size, 1);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const view = new PaletteView(true);
        const { drawBarFill, calls } = createRectFillMock();
        const renderer = {
            drawBarFill,
        } as never;

        view.draw(
            renderer,
            new Rect2i(0, paletteBandTop, 320, grid.totalHeight),
            palette,
            grid,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
            usedMask,
            DEFAULT_IDX_TEXT,
        );

        expect(drawBarFill).toHaveBeenCalled();

        const swatch1 = swatchTopLeft(1, grid.cols, paletteBandTop, swatchSize, grid.gap);
        const swatch3 = swatchTopLeft(3, grid.cols, paletteBandTop, swatchSize, grid.gap);
        const gapX = swatch1.x + swatchSize;

        expect(calls.some((call) => call.rect.x === swatch1.x && call.rect.y === swatch1.y && call.index === 1)).toBe(
            true,
        );
        expect(calls.find((call) => call.rect.x === gapX && call.rect.y === swatch1.y)).toBeUndefined();
        expect(
            calls.find(
                (call) =>
                    call.rect.x === swatch3.x &&
                    call.rect.y === swatch3.y &&
                    call.rect.width === swatchSize &&
                    call.index === 3,
            ),
        ).toBeDefined();
    });

    it('keeps palette swatches above the dedicated hint bar', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = new Palette(256);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size, 1, 36);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const swatchOriginY = paletteBandTop + PALETTE_GRID_PADDING_PX;
        const view = new PaletteView(true);
        const drawBarFill = vi.fn();
        const renderer = { drawBarFill } as never;

        view.draw(
            renderer,
            new Rect2i(0, paletteBandTop, 320, grid.totalHeight),
            palette,
            grid,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
            buildUsageMask([0]),
            DEFAULT_IDX_TEXT,
        );

        const bottomRowY = swatchOriginY + (grid.rows - 1) * (grid.swatchSize + grid.gap);

        expect(bottomRowY + grid.swatchSize).toBeLessThanOrEqual(hintBarY(240) - OVERLAY_ROW_GAP_PX);
    });

    it('is a no-op when disabled', () => {
        const view = new PaletteView(false);
        const drawBarFill = vi.fn();
        const renderer = { drawBarFill } as never;

        view.draw(
            renderer,
            new Rect2i(0, 201, 320, 39),
            Palette.cga(),
            computeGrid(320),
            227,
            320,
            buildUsageMask([1, 2, 3]),
            DEFAULT_IDX_TEXT,
        );

        expect(drawBarFill).not.toHaveBeenCalled();
    });

    it('draws only the visible row window when scroll offset is non-zero', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = new Palette(256);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size, 1, undefined, 3);
        const scrollRowOffset = 2;
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const view = new PaletteView(true);
        const { drawBarFill, calls } = createRectFillMock();
        const renderer = { drawBarFill } as never;
        const usedMask = buildUsageMask([grid.cols * scrollRowOffset]);

        view.draw(
            renderer,
            new Rect2i(0, paletteBandTop, 320, grid.totalHeight),
            palette,
            grid,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
            usedMask,
            DEFAULT_IDX_TEXT,
            scrollRowOffset,
        );

        const visibleIndex = grid.cols * scrollRowOffset;
        const hiddenIndex = visibleIndex - grid.cols;

        expect(calls.some((call) => call.index === visibleIndex)).toBe(true);
        expect(calls.some((call) => call.index === hiddenIndex)).toBe(false);
    });
});
