/**
 * Unit tests for palette swatch hit testing, tooltip layout, and clipboard copy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { DEFAULT_IDX_BG, DEFAULT_IDX_TEXT } from '../constants';
import { createOverlayLayout } from '../layout/layoutHelpers';
import { hintBarY, paletteBandY } from '../layout/layoutPlan';
import type { OverlayLayoutPlan } from '../layout/types';
import { mockFont } from '../testFixtures';
import {
    clampScrollRowOffset,
    drawTooltipChrome,
    drawTooltipLabel,
    hitTestSwatch,
    isPointerInScrollbarTrack,
    layoutTooltip,
    maxScrollRowOffset,
    PALETTE_COPY_STATUS_SECONDS,
    PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
    PaletteInteraction,
    resolveScrollRowOffsetFromTrackPointerY,
    writeIndexToClipboard,
} from './PaletteInteraction';
import {
    computeGrid,
    computeScrollbarThumbHeight,
    DEFAULT_PALETTE_SWATCH_SIZE,
    PALETTE_SCROLLBAR_EDGE_PADDING_PX,
    PALETTE_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
    PALETTE_SWATCH_GAP_PX,
    resolveHintExclusionRect,
    writeScrollbarRects,
    writeSwatchTopLeft,
} from './PaletteView';

/** Minimal layout plan with only the palette band populated. */
function paletteOnlyPlan(paletteBand: Rect2i): OverlayLayoutPlan {
    return { paletteBand } as OverlayLayoutPlan;
}

/** Builds hint exclusion for the golden 320x240 layout. */
function goldenHintExclusion(): Rect2i {
    const layout = createOverlayLayout(320, 240, 14);

    return resolveHintExclusionRect(hintBarY(layout.displayHeight), layout.displayWidth);
}

describe('hitTestSwatch', () => {
    const layout = createOverlayLayout(320, 240, 14);
    const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);
    const paletteBandTop = paletteBandY(240, grid.totalHeight);
    const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
    const hintExclusion = goldenHintExclusion();

    it('maps pointer inside a swatch to its palette index', () => {
        const index = 42;
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, index, paletteBand, grid);

        const hit = hitTestSwatch(
            swatch.x + 1,
            swatch.y + 1,
            paletteBand,
            grid,
            256,
            hintExclusion,
            layout.displayWidth,
        );

        expect(hit).toBe(index);
    });

    it('returns null in horizontal and vertical gaps between swatches', () => {
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 0, paletteBand, grid);
        const gapX = swatch.x + grid.swatchSize;

        expect(
            hitTestSwatch(gapX, swatch.y + 1, paletteBand, grid, 256, hintExclusion, layout.displayWidth),
        ).toBeNull();

        const gapY = swatch.y + grid.swatchSize;

        expect(
            hitTestSwatch(swatch.x + 1, gapY, paletteBand, grid, 256, hintExclusion, layout.displayWidth),
        ).toBeNull();
    });

    it('returns null over the hint exclusion band', () => {
        const hit = hitTestSwatch(
            hintExclusion.x + 1,
            hintExclusion.y + 1,
            paletteBand,
            grid,
            256,
            hintExclusion,
            layout.displayWidth,
        );

        expect(hit).toBeNull();
    });

    it('excludes the right scrollbar track from hits', () => {
        const trackWidth = PALETTE_SCROLLBAR_TRACK_WIDTH_PX;
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 31, paletteBand, grid);

        expect(
            hitTestSwatch(
                layout.displayWidth - 1,
                swatch.y + 1,
                paletteBand,
                grid,
                256,
                hintExclusion,
                layout.displayWidth,
                0,
                trackWidth,
            ),
        ).toBeNull();
    });

    it('applies scroll row offset to visible row mapping', () => {
        const scrollRowOffset = 2;
        const index = scrollRowOffset * grid.cols + 5;
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, index, paletteBand, grid, scrollRowOffset);

        expect(
            hitTestSwatch(
                swatch.x + 1,
                swatch.y + 1,
                paletteBand,
                grid,
                256,
                hintExclusion,
                layout.displayWidth,
                scrollRowOffset,
            ),
        ).toBe(index);
    });

    it('hits the bottom-left palette swatch, which no longer overlaps the shrunk toggle rect', () => {
        const index = grid.cols * (grid.rows - 1);
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, index, paletteBand, grid);

        expect(
            hitTestSwatch(swatch.x + 1, swatch.y + 1, paletteBand, grid, 256, hintExclusion, layout.displayWidth),
        ).toBe(index);
        // The 17x13 toggle rect matches the hint bar footprint exactly, so the row gap above it
        // keeps the palette grid clear; this used to overlap when the corner was 48x48.
        expect(layout.toggleRect.isContaining(new Vector2i(swatch.x + 1, swatch.y + 1))).toBe(false);
    });
});

describe('palette scroll helpers', () => {
    const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 3);

    it('computes maxScrollRowOffset from total and visible rows', () => {
        expect(maxScrollRowOffset(grid)).toBe(grid.rows - grid.visibleRows);
    });

    it('clamps scroll row offset into valid bounds', () => {
        expect(clampScrollRowOffset(-4, grid)).toBe(0);
        expect(clampScrollRowOffset(999, grid)).toBe(maxScrollRowOffset(grid));
        expect(clampScrollRowOffset(2, grid)).toBe(2);
    });

    it('sizes thumb proportionally to visible rows with a 4 px minimum', () => {
        const paletteBand = new Rect2i(0, 200, 320, grid.totalHeight);
        const trackHeight = paletteBand.height - PALETTE_SCROLLBAR_EDGE_PADDING_PX * 2;
        const thumbHeight = computeScrollbarThumbHeight(trackHeight, grid);

        expect(thumbHeight).toBeGreaterThanOrEqual(PALETTE_SCROLLBAR_MIN_THUMB_HEIGHT_PX);
        expect(thumbHeight).toBe(Math.floor((grid.visibleRows / grid.rows) * trackHeight));
    });

    it('positions scrollbar thumb by scroll ratio', () => {
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
        const track = new Rect2i();
        const thumb = new Rect2i();
        const scrollRowOffset = 3;
        const pad = PALETTE_SCROLLBAR_EDGE_PADDING_PX;

        writeScrollbarRects(track, thumb, paletteBand, grid, scrollRowOffset, PALETTE_SCROLLBAR_TRACK_WIDTH_PX);

        expect(track).toMatchObject({
            x: paletteBand.x + paletteBand.width - PALETTE_SCROLLBAR_TRACK_WIDTH_PX - pad,
            y: paletteBand.y + pad,
            width: PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
            height: paletteBand.height - pad * 2,
        });
        expect(thumb.width).toBe(PALETTE_SCROLLBAR_TRACK_WIDTH_PX);
        expect(thumb.height).toBeGreaterThanOrEqual(PALETTE_SCROLLBAR_MIN_THUMB_HEIGHT_PX);
        expect(thumb.y).toBeGreaterThanOrEqual(track.y);
        expect(thumb.y + thumb.height).toBeLessThanOrEqual(track.y + track.height);

        const maxOffset = maxScrollRowOffset(grid);
        const topThumb = new Rect2i();
        const bottomThumb = new Rect2i();

        writeScrollbarRects(track, topThumb, paletteBand, grid, 0, PALETTE_SCROLLBAR_TRACK_WIDTH_PX);
        writeScrollbarRects(track, bottomThumb, paletteBand, grid, maxOffset, PALETTE_SCROLLBAR_TRACK_WIDTH_PX);

        expect(topThumb.y).toBe(track.y);
        expect(bottomThumb.y + bottomThumb.height).toBe(track.y + track.height);
    });

    it('maps track pointer Y to scroll row offset', () => {
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
        const track = new Rect2i();
        const thumb = new Rect2i();

        writeScrollbarRects(track, thumb, paletteBand, grid, 0, PALETTE_SCROLLBAR_TRACK_WIDTH_PX);

        expect(
            resolveScrollRowOffsetFromTrackPointerY(track.y, paletteBand, grid, PALETTE_SCROLLBAR_TRACK_WIDTH_PX),
        ).toBe(0);
        expect(
            resolveScrollRowOffsetFromTrackPointerY(
                track.y + track.height,
                paletteBand,
                grid,
                PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
            ),
        ).toBe(maxScrollRowOffset(grid));
    });
});

describe('PaletteInteraction scroll', () => {
    it('advances scroll offset from wheel delta over the palette band and consumes scroll', () => {
        const interaction = new PaletteInteraction(60);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 3);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 0, plan.paletteBand, grid);

        const pointer = {
            isActive: () => true,
            getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            getScrollDelta: () => 16,
            consumeScrollDelta: vi.fn(),
            isButtonPressed: () => false,
            isButtonDown: () => false,
        };

        interaction.handleScroll(pointer as never, plan, grid, false);

        expect(interaction.scrollRowOffset).toBe(2);
        expect(pointer.consumeScrollDelta).toHaveBeenCalled();
    });

    it('does not consume wheel delta when pointer is outside the palette band', () => {
        const interaction = new PaletteInteraction(60);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 3);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const pointer = {
            isActive: () => true,
            getPos: () => new Vector2i(0, 0),
            getScrollDelta: () => 16,
            consumeScrollDelta: vi.fn(),
            isButtonPressed: () => false,
            isButtonDown: () => false,
        };

        interaction.handleScroll(pointer as never, plan, grid, false);

        expect(interaction.scrollRowOffset).toBe(0);
        expect(pointer.consumeScrollDelta).not.toHaveBeenCalled();
    });

    it('blocks toggle when primary press starts on the scrollbar track', () => {
        const interaction = new PaletteInteraction(60);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX, undefined, 3);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const track = new Rect2i();
        const thumb = new Rect2i();

        writeScrollbarRects(track, thumb, plan.paletteBand, grid, 0, PALETTE_SCROLLBAR_TRACK_WIDTH_PX);

        const consumed = interaction.handleScroll(
            {
                isActive: () => true,
                getPos: () => new Vector2i(track.x + 1, track.y + 2),
                getScrollDelta: () => 0,
                consumeScrollDelta: vi.fn(),
                isButtonPressed: () => true,
                isButtonDown: () => true,
            } as never,
            plan,
            grid,
            false,
        );

        expect(consumed).toBe(true);
        expect(
            isPointerInScrollbarTrack(
                track.x + 1,
                track.y + 2,
                plan.paletteBand,
                grid,
                interaction.scrollRowOffset,
                PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
            ),
        ).toBe(true);
    });
});

describe('layoutTooltip', () => {
    const layoutScratch = {
        body: new Rect2i(),
        swatch: new Rect2i(),
        textPos: new Vector2i(),
    };

    it('clamps tooltip body inside the display on the right edge', () => {
        const swatch = new Rect2i(300, 180, 7, 7);
        const label = '255';

        layoutTooltip(layoutScratch, swatch, label, 320, 240);

        expect(layoutScratch.body.x + layoutScratch.body.width).toBeLessThanOrEqual(320);
        expect(layoutScratch.body.x).toBeGreaterThanOrEqual(0);
    });

    it('clamps tooltip body inside the display on the left edge', () => {
        const swatch = new Rect2i(0, 180, 7, 7);
        const label = '255';

        layoutTooltip(layoutScratch, swatch, label, 320, 240);

        expect(layoutScratch.body.x).toBeGreaterThanOrEqual(0);
    });

    it('places tooltip body above the swatch with a one-pixel gap', () => {
        const swatch = new Rect2i(40, 180, 7, 7);

        layoutTooltip(layoutScratch, swatch, '12', 320, 240);

        expect(layoutScratch.body.y + layoutScratch.body.height).toBe(swatch.y - 1);
    });

    it('keeps tooltip body fully inside the display on the bottom edge', () => {
        const swatch = new Rect2i(0, 235, 7, 7);

        layoutTooltip(layoutScratch, swatch, '12', 320, 240);

        expect(layoutScratch.body.y + layoutScratch.body.height).toBeLessThanOrEqual(240);
        expect(layoutScratch.body.y).toBeGreaterThanOrEqual(0);
    });
});

describe('drawTooltipChrome', () => {
    it('draws tooltip body and border via drawBarFillOnTop', () => {
        const layoutScratch = {
            body: new Rect2i(),
            swatch: new Rect2i(40, 180, 7, 7),
            textPos: new Vector2i(),
        };
        const layout = layoutTooltip(layoutScratch, layoutScratch.swatch, '42', 320, 240);
        const target = {
            drawBarFill: vi.fn(),
            drawBarFillOnTop: vi.fn(),
            drawLabel: vi.fn(),
            drawLabelOnTop: vi.fn(),
        };

        drawTooltipChrome(target, layout, DEFAULT_IDX_BG, DEFAULT_IDX_TEXT);

        expect(target.drawBarFillOnTop).toHaveBeenCalled();
        expect(target.drawBarFill).not.toHaveBeenCalled();
        expect(target.drawLabelOnTop).not.toHaveBeenCalled();
    });
});

describe('drawTooltipLabel', () => {
    it('draws tooltip text via drawLabelOnTop', () => {
        const layoutScratch = {
            body: new Rect2i(),
            swatch: new Rect2i(40, 180, 7, 7),
            textPos: new Vector2i(),
        };
        const layout = layoutTooltip(layoutScratch, layoutScratch.swatch, '42', 320, 240);
        const target = {
            drawBarFill: vi.fn(),
            drawBarFillOnTop: vi.fn(),
            drawLabel: vi.fn(),
            drawLabelOnTop: vi.fn(),
        };

        drawTooltipLabel(target, mockFont, layout, '42', DEFAULT_IDX_TEXT);

        expect(target.drawLabelOnTop).toHaveBeenCalled();
        expect(target.drawBarFill).not.toHaveBeenCalled();
        expect(target.drawBarFillOnTop).not.toHaveBeenCalled();
    });
});

describe('PaletteInteraction clipboard', () => {
    beforeEach(() => {
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('writes plain index strings to the clipboard', async () => {
        await writeIndexToClipboard(42);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('42');
    });

    it('shows Copied N after successful press', async () => {
        const interaction = new PaletteInteraction(60);
        const layout = createOverlayLayout(320, 240, 14);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 7, plan.paletteBand, grid);

        const consumed = interaction.handlePress(
            {
                isButtonPressed: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            10,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );

        expect(consumed).toBe(true);

        await vi.waitFor(async () => {
            await Promise.resolve();
            const probe = {
                drawBarFill: vi.fn(),
                drawLabelOnTop: vi.fn(),
                drawPixel: vi.fn(),
            };

            interaction.drawTooltipLabel(
                probe as never,
                mockFont,
                plan,
                grid,
                layout.displayWidth,
                layout.displayHeight,
                DEFAULT_IDX_TEXT,
            );

            expect(probe.drawLabelOnTop).toHaveBeenCalled();
        });

        const renderer = {
            drawBarFill: vi.fn(),
            drawLabelOnTop: vi.fn(),
            drawPixel: vi.fn(),
        };

        interaction.drawTooltipLabel(
            renderer as never,
            mockFont,
            plan,
            grid,
            layout.displayWidth,
            layout.displayHeight,
            DEFAULT_IDX_TEXT,
        );

        expect(renderer.drawLabelOnTop).toHaveBeenCalledWith(
            mockFont,
            expect.any(Vector2i),
            'Copied 7',
            expect.any(Number),
        );
    });

    it('shows Copy failed when clipboard write is denied', async () => {
        vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));

        const interaction = new PaletteInteraction(60);
        const layout = createOverlayLayout(320, 240, 14);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 3, plan.paletteBand, grid);

        interaction.handlePress(
            {
                isButtonPressed: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            5,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );

        await vi.waitFor(() => {
            const renderer = {
                drawBarFill: vi.fn(),
                drawLabelOnTop: vi.fn(),
                drawPixel: vi.fn(),
            };

            interaction.drawTooltipLabel(
                renderer as never,
                mockFont,
                plan,
                grid,
                layout.displayWidth,
                layout.displayHeight,
                DEFAULT_IDX_TEXT,
            );

            expect(renderer.drawLabelOnTop).toHaveBeenCalledWith(
                mockFont,
                expect.any(Vector2i),
                'Copy failed',
                expect.any(Number),
            );
        });
    });

    it('clears copy status after the configured duration', async () => {
        const interaction = new PaletteInteraction(60);
        const layout = createOverlayLayout(320, 240, 14);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 9, plan.paletteBand, grid);

        interaction.handlePress(
            {
                isButtonPressed: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            10,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );

        await vi.waitFor(async () => {
            await Promise.resolve();
        });

        const expiryTick = 10 + Math.ceil(PALETTE_COPY_STATUS_SECONDS * 60);

        interaction.tickCopyStatus(expiryTick);

        const renderer = {
            drawBarFill: vi.fn(),
            drawLabelOnTop: vi.fn(),
            drawPixel: vi.fn(),
        };

        interaction.updateHover(
            {
                isActive: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );

        interaction.drawTooltipLabel(
            renderer as never,
            mockFont,
            plan,
            grid,
            layout.displayWidth,
            layout.displayHeight,
            DEFAULT_IDX_TEXT,
        );

        expect(renderer.drawLabelOnTop).toHaveBeenCalledWith(mockFont, expect.any(Vector2i), '9', expect.any(Number));
    });

    it('starts copy-status expiry from clipboard completion tick', async () => {
        let resolveWrite!: () => void;

        vi.mocked(navigator.clipboard.writeText).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveWrite = resolve;
                }),
        );

        const interaction = new PaletteInteraction(60);
        const layout = createOverlayLayout(320, 240, 14);
        const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, 256, PALETTE_SWATCH_GAP_PX);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const plan = paletteOnlyPlan(new Rect2i(0, paletteBandTop, 320, grid.totalHeight));
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 9, plan.paletteBand, grid);

        interaction.handlePress(
            {
                isButtonPressed: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            10,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );

        for (let tick = 11; tick <= 25; tick++) {
            interaction.tickCopyStatus(tick);
        }

        resolveWrite();
        await vi.waitFor(async () => {
            await Promise.resolve();

            const probe = {
                drawBarFill: vi.fn(),
                drawLabelOnTop: vi.fn(),
            };

            interaction.drawTooltipLabel(
                probe as never,
                mockFont,
                plan,
                grid,
                layout.displayWidth,
                layout.displayHeight,
                DEFAULT_IDX_TEXT,
            );

            expect(probe.drawLabelOnTop).toHaveBeenCalledWith(
                mockFont,
                expect.any(Vector2i),
                'Copied 9',
                expect.any(Number),
            );
        });

        const completionExpiryTick = 25 + Math.ceil(PALETTE_COPY_STATUS_SECONDS * 60);
        const pressExpiryTick = 10 + Math.ceil(PALETTE_COPY_STATUS_SECONDS * 60);

        const renderer = {
            drawBarFill: vi.fn(),
            drawLabelOnTop: vi.fn(),
            drawPixel: vi.fn(),
        };

        interaction.tickCopyStatus(pressExpiryTick);
        interaction.drawTooltipLabel(
            renderer as never,
            mockFont,
            plan,
            grid,
            layout.displayWidth,
            layout.displayHeight,
            DEFAULT_IDX_TEXT,
        );

        expect(renderer.drawLabelOnTop).toHaveBeenCalledWith(
            mockFont,
            expect.any(Vector2i),
            'Copied 9',
            expect.any(Number),
        );

        interaction.tickCopyStatus(completionExpiryTick);
        interaction.updateHover(
            {
                isActive: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            plan,
            grid,
            256,
            hintBarY(layout.displayHeight),
            layout.displayWidth,
        );
        interaction.drawTooltipLabel(
            renderer as never,
            mockFont,
            plan,
            grid,
            layout.displayWidth,
            layout.displayHeight,
            DEFAULT_IDX_TEXT,
        );

        expect(renderer.drawLabelOnTop).toHaveBeenLastCalledWith(
            mockFont,
            expect.any(Vector2i),
            '9',
            expect.any(Number),
        );
    });
});
