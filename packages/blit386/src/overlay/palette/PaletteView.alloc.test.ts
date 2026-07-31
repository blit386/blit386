/**
 * Allocation regression tests for {@link PaletteView} draw hot path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Palette } from '../../assets/Palette';
import { markIndexUsed } from '../../core/RenderPaletteUsage';
import type * as Rect2iModule from '../../utils/Rect2i';
import { Rect2i } from '../../utils/Rect2i';
import { createOverlayLayout } from '../layout/layoutHelpers';
import { hintBarY, paletteBandY } from '../layout/layoutPlan';
import { computeGrid, DEFAULT_PALETTE_SWATCH_SIZE, PaletteView } from './PaletteView';

const { rect2iAllocStats } = vi.hoisted(() => ({ rect2iAllocStats: { count: 0 } }));

vi.mock('../../utils/Rect2i', async (importOriginal) => {
    const mod = await importOriginal<typeof Rect2iModule>();

    class CountingRect2i extends mod.Rect2i {
        constructor(...args: ConstructorParameters<typeof mod.Rect2i>) {
            rect2iAllocStats.count++;
            super(...args);
        }
    }

    return { ...mod, Rect2i: CountingRect2i };
});

/** Builds a usage mask from palette slot indices for tests. */
function buildUsageMask(indices: readonly number[], size = 256): Uint8Array {
    const mask = new Uint8Array(size);

    for (const index of indices) {
        markIndexUsed(mask, index);
    }

    return mask;
}

describe('PaletteView allocation', () => {
    beforeEach(() => {
        rect2iAllocStats.count = 0;
    });

    it('does not construct Rect2i during repeated 16-slot palette grid draws', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = Palette.cga();
        const usedMask = buildUsageMask([1, 2, 3]);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size);
        const paletteBand = new Rect2i(0, paletteBandY(240, grid.totalHeight), 320, grid.totalHeight);
        const view = new PaletteView(true);
        const renderer = { drawBarFill: vi.fn() } as never;

        for (let i = 0; i < 8; i++) {
            view.draw(
                renderer,
                paletteBand,
                palette,
                grid,
                hintBarY(layout.displayHeight),
                layout.displayWidth,
                usedMask,
                2,
            );
        }

        const afterWarmup = rect2iAllocStats.count;

        for (let i = 0; i < 64; i++) {
            view.draw(
                renderer,
                paletteBand,
                palette,
                grid,
                hintBarY(layout.displayHeight),
                layout.displayWidth,
                usedMask,
                2,
            );
        }

        expect(rect2iAllocStats.count).toBe(afterWarmup);
    });

    it('does not construct Rect2i during repeated 256-slot palette grid draws', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const palette = Palette.vga();
        const usedMask = buildUsageMask([1, 2, 3, 4, 5]);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size);
        const paletteBand = new Rect2i(0, paletteBandY(240, grid.totalHeight), 320, grid.totalHeight);
        const view = new PaletteView(true);
        const renderer = { drawBarFill: vi.fn() } as never;

        for (let i = 0; i < 4; i++) {
            view.draw(
                renderer,
                paletteBand,
                palette,
                grid,
                hintBarY(layout.displayHeight),
                layout.displayWidth,
                usedMask,
                2,
            );
        }

        const afterWarmup = rect2iAllocStats.count;

        for (let i = 0; i < 32; i++) {
            view.draw(
                renderer,
                paletteBand,
                palette,
                grid,
                hintBarY(layout.displayHeight),
                layout.displayWidth,
                usedMask,
                2,
            );
        }

        expect(rect2iAllocStats.count).toBe(afterWarmup);
    });
});
