/**
 * Integration tests for {@link Overlay} draw layout and toggle behavior.
 */

import { describe, expect, it, vi } from 'vitest';

import { Palette } from '../assets/Palette';
import type { OverlayAudioMeterStyle } from '../core/IBTDemo';
import { markIndexUsed } from '../core/RenderPaletteUsage';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { AUDIO_METER_BAR_WIDTH_PX } from './audio-meter/constants';
import { OVERLAY_DIVIDER_GAP_PX, SYSTEM_CHAR_ADVANCE } from './constants';
import { OVERLAY_BAR_HEIGHT, OVERLAY_ROW_GAP_PX } from './layout/constants';
import {
    createOverlayLayout,
    overlayRightAlignedDividerLabelX,
    overlayRightAlignedTextX,
} from './layout/layoutHelpers';
import { hintBarY, paletteBandY } from './layout/layoutPlan';
import { Overlay } from './Overlay';
import { hintIconPos } from './OverlayToggleIcon';
import { computeGrid, writeScrollbarRects, writeSwatchTopLeft } from './palette/PaletteView';
import {
    createMockRenderer,
    customRowBarY,
    getBitmapTextCalls,
    getRectFillCalls,
    mockFont,
    OVERLAY_EDGE_MARGIN_PX,
    OVERLAY_TOP_TEXT_Y,
} from './testFixtures';
import type { OverlayAudioSnapshot } from './types';

/** Default overlay tests use the 13 px hint bar (palette grid opt-in off). */
const PALETTE_GRID_OFF = false;

interface OverlayTestOptions {
    style?: { barPaletteIndex?: number; textPaletteIndex?: number; gapPaletteIndex?: number };

    isOverlayPaletteEnabled?: boolean;
    paletteColumns?: number;
    paletteRowsVisible?: number;
    isOverlayTimingChartEnabled?: boolean;

    overlayTimingChartStyle?: {
        updateBarPaletteIndex?: number;
        renderBarPaletteIndex?: number;
        warningPaletteIndex?: number;
        errorPaletteIndex?: number;
        tagPaletteIndex?: number;
    };

    overlayTimingChartHeight?: number;
    overlayTimingChartDiagnostics?: false | 'minimal' | 'rich';
    isOverlayRendererDiagnosticsBarEnabled?: boolean;
    isOverlayVisibleAtStart?: boolean;
    isOverlayToggleHintVisible?: boolean;
    isOverlayToggleEnabled?: boolean;
    isOverlayToggleHitDebugVisible?: boolean;
    backend?: 'webgpu' | 'software';
    isOverlayAudioMetersEnabled?: boolean;
    audioMeterStyle?: OverlayAudioMeterStyle;
    audioMeterHeight?: number;
}

/** Builds a {@link Overlay} with explicit visibility defaults for tests. */
function createOverlay(
    layout: ReturnType<typeof createOverlayLayout>,
    label: string,
    options: OverlayTestOptions = {},
): Overlay {
    return new Overlay(
        layout,
        label,
        60,
        options.backend ?? 'webgpu',
        options.style,
        options.isOverlayPaletteEnabled ?? PALETTE_GRID_OFF,
        options.paletteColumns,
        options.paletteRowsVisible,
        options.isOverlayTimingChartEnabled ?? false,
        options.overlayTimingChartStyle,
        options.overlayTimingChartHeight,
        options.overlayTimingChartDiagnostics ?? false,
        options.isOverlayRendererDiagnosticsBarEnabled ?? false,
        options.isOverlayVisibleAtStart ?? false,
        options.isOverlayToggleHintVisible ?? true,
        options.isOverlayToggleEnabled ?? true,
        options.isOverlayToggleHitDebugVisible ?? false,
        options.isOverlayAudioMetersEnabled ?? false,
        options.audioMeterStyle,
        options.audioMeterHeight,
    );
}

/** Builds a usage mask from palette slot indices for tests. */
function buildUsageMask(indices: readonly number[], size = 256): Uint8Array {
    const mask = new Uint8Array(size);

    for (const index of indices) {
        markIndexUsed(mask, index);
    }

    return mask;
}

describe('Overlay', () => {
    it('isTrackingPaletteUsage is false when palette grid is disabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Test Demo');

        expect(overlay.isTrackingPaletteUsage).toBe(false);
    });

    it('isTrackingPaletteUsage follows palette grid opt-in and visibility toggle', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Test Demo', {
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,
        });

        expect(overlay.isTrackingPaletteUsage).toBe(true);

        overlay.handleToggle(
            null,
            {
                isKeyPressed: (key: string) => key === 'Backquote',
            } as never,
            1,
        );

        expect(overlay.isTrackingPaletteUsage).toBe(false);
    });

    it('swatch press in the toggle corner does not toggle overlay body', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Test Demo', {
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,
        });

        const grid = computeGrid(320);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
        const swatch = new Rect2i();
        const index = grid.cols * (grid.rows - 1);

        writeSwatchTopLeft(swatch, index, paletteBand, grid);

        overlay.handleFrameInput(
            {
                isButtonPressed: () => true,
                getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
            } as never,
            false,
            1,
        );

        expect(overlay.isBodyVisible).toBe(true);
    });

    it('scrollbar track press blocks toggle but swatch press still copies first', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Test Demo', {
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,
            paletteRowsVisible: 3,
        });

        const grid = computeGrid(320, undefined, 256, undefined, undefined, 3);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
        const track = new Rect2i();
        const thumb = new Rect2i();

        writeScrollbarRects(track, thumb, paletteBand, grid, 0, 4);

        overlay.handleFrameInput(
            {
                isButtonPressed: () => true,
                isButtonDown: () => true,
                isActive: () => true,
                getPos: () => new Vector2i(track.x + 1, track.y + 1),
                getScrollDelta: () => 0,
                consumeScrollDelta: vi.fn(),
            } as never,
            false,
            1,
        );

        expect(overlay.isBodyVisible).toBe(true);
    });

    it('starts hidden by default and toggles body visibility', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Test Demo');

        expect(overlay.isBodyVisible).toBe(false);

        overlay.handleToggle(
            null,
            {
                isKeyPressed: (key: string) => key === 'Backquote',
            } as never,
            1,
        );

        expect(overlay.isBodyVisible).toBe(true);

        overlay.handleToggle(
            null,
            {
                isKeyPressed: (key: string) => key === 'Backquote',
            } as never,
            2,
        );

        expect(overlay.isBodyVisible).toBe(false);
    });

    it('draws top and bottom overlay labels when body is visible', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const topLeftLabel = 'Patterns Demo';
        const overlay = createOverlay(layout, topLeftLabel, { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        const calls = getBitmapTextCalls(renderer);

        // Segmented engine labels: each '|' marker becomes its own drawLabel segment.
        const topRightX = overlayRightAlignedDividerLabelX('webgpu|320x240', 320);
        const metricsY = OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX + OVERLAY_TOP_TEXT_Y;
        const timingY = (OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX) * 2 + OVERLAY_TOP_TEXT_Y;

        expect(calls).toHaveLength(9);

        expect(calls[0]).toEqual({
            pos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, OVERLAY_TOP_TEXT_Y),
            text: topLeftLabel,
            paletteOffset: 1,
        });

        expect(calls[1]).toEqual({
            pos: new Vector2i(topRightX, OVERLAY_TOP_TEXT_Y),
            text: 'webgpu',
            paletteOffset: 1,
        });

        expect(calls[2]).toEqual({
            pos: new Vector2i(topRightX + 6 * SYSTEM_CHAR_ADVANCE + 2 * OVERLAY_DIVIDER_GAP_PX, OVERLAY_TOP_TEXT_Y),
            text: '320x240',
            paletteOffset: 1,
        });

        expect(calls[3]).toMatchObject({
            pos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, metricsY),
            // Present FPS pads to OVERLAY_FPS_FIELD_WIDTH (3): "60" -> " 60", plus the literal template space.
            text: expect.stringMatching(/^Present {2}\d+ FPS$/),
            paletteOffset: 1,
        });

        expect(calls[4]).toMatchObject({ pos: expect.objectContaining({ y: metricsY }), text: 'Target 60 FPS' });
        expect(calls[5]?.text).toMatch(/^Draw Calls \d+$/);
        expect(calls[5]?.pos.y).toBe(metricsY);

        expect(calls[6]).toMatchObject({
            pos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, timingY),
            // Frame ms pads to OVERLAY_MS_FIELD_WIDTH (4): "0.0" -> " 0.0", plus the literal template space.
            text: expect.stringMatching(/^Frame {2}\d+\.\dms$/),
            paletteOffset: 1,
        });

        // update() ms has the same 2-space lead-in, plus a 2-space trailing gap reserved for the absent xN suffix.
        expect(calls[7]?.text).toMatch(/^update\(\) {2}\d+\.\dms {2}$/);
        expect(calls[8]?.text).toMatch(/^render\(\) {2}\d+\.\dms$/);
        expect(renderer.drawBarFillOnTop).toHaveBeenCalled();

        expect(renderer.drawBarFillOnTop.rectSnapshots[0]).toMatchObject({
            x: OVERLAY_EDGE_MARGIN_PX,
            y: 230,
            width: 11,
            height: 1,
        });
    });

    it('uses activeBackend for the top-right label', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { backend: 'software', isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        const calls = getBitmapTextCalls(renderer);

        expect(calls[1]?.text).toBe('software');
        expect(calls[2]?.text).toBe('320x240');
    });

    it('draws in-row label separators as 1 px full-row-height dividers in the gap index', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            style: { gapPaletteIndex: 7 },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        // Row gaps share palette 7 but span the full display width; dividers are the width-1 fills.
        const dividers = renderer.drawBarFill.mock.calls
            .map((call, callIndex) => ({
                paletteIndex: call[1] as number,
                rect: renderer.drawBarFill.rectSnapshots.at(callIndex) as Rect2i,
            }))
            .filter((fill) => fill.paletteIndex === 7 && fill.rect.width === 1);

        // 1 pipe in the top-right label, 2 in the metrics row, 2 in the timing row.
        expect(dividers).toHaveLength(5);

        const topRightDivider = dividers[0]?.rect;
        expect(topRightDivider).toMatchObject({
            x:
                overlayRightAlignedDividerLabelX('webgpu|320x240', 320) +
                6 * SYSTEM_CHAR_ADVANCE +
                OVERLAY_DIVIDER_GAP_PX -
                1,
            y: 0,
            width: 1,
            height: OVERLAY_BAR_HEIGHT,
        });

        const metricsRowY = OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX;
        const timingRowY = (OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX) * 2;

        expect(dividers.filter((fill) => fill.rect.y === metricsRowY)).toHaveLength(2);
        expect(dividers.filter((fill) => fill.rect.y === timingRowY)).toHaveLength(2);

        for (const divider of dividers) {
            expect(divider.rect.height).toBe(OVERLAY_BAR_HEIGHT);
        }
    });

    it('uses provided frame timings and shows update-step suffix when multiple updates ran', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 8.25,
            updateMs: 1.5,
            renderMs: 3.75,
            updateSteps: 3,
            drawCalls: 42,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        const texts = getBitmapTextCalls(renderer).map((call) => call.text);

        expect(texts).toContain('Draw Calls 42');
        expect(texts).toContain('Frame  8.3ms');
        expect(texts).toContain('update()  1.5msx3');
        expect(texts).toContain('render()  3.8ms');
    });

    it('skips draw calls when body is hidden and the toggle hint is disabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayToggleHintVisible: false });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
        expect(renderer.drawLabel).not.toHaveBeenCalled();
        expect(renderer.drawBarFillOnTop).not.toHaveBeenCalled();
    });

    it('draws the toggle hit debug outline when enabled even if the hint is hidden', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', {
            isOverlayToggleHintVisible: false,
            isOverlayToggleHitDebugVisible: true,
        });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
        expect(renderer.drawLabel).not.toHaveBeenCalled();
        expect(renderer.drawBarFillOnTop.rectSnapshots).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ x: 0, y: 227, width: 17, height: 1 }),
                expect.objectContaining({ x: 0, y: 239, width: 17, height: 1 }),
                expect.objectContaining({ x: 0, y: 228, width: 1, height: 11 }),
                expect.objectContaining({ x: 16, y: 228, width: 1, height: 11 }),
            ]),
        );
        expect(renderer.drawBarFillOnTop).toHaveBeenCalledTimes(4);
    });

    it('draws hint-only path while body is hidden and toggle hint is visible', () => {
        const overlay = createOverlay(createOverlayLayout(320, 240, 14), 'Demo');
        const renderer = createMockRenderer();
        const iconPos = hintIconPos(hintBarY(240));

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(getRectFillCalls(renderer)).toHaveLength(0);
        expect(renderer.drawLabel).not.toHaveBeenCalled();
        expect(renderer.drawBarFillOnTop).toHaveBeenCalled();
        expect(renderer.drawBarFillOnTop.rectSnapshots[0]).toMatchObject({
            x: iconPos.x + 3,
            y: iconPos.y + 2,
            width: 2,
            height: 1,
        });
    });

    it('does not draw the palette band while body is hidden even when palette view is enabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayPaletteEnabled: true });
        const renderer = createMockRenderer();
        const grid = computeGrid(320, undefined, 256);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, undefined, Palette.vga());

        const fills = getRectFillCalls(renderer);

        expect(fills).toHaveLength(0);
        expect(fills.some((rect) => rect.y === paletteBandY(240, grid.totalHeight))).toBe(false);
        expect(renderer.drawBarFillOnTop).toHaveBeenCalled();
    });

    it('resets camera for overlay draws then restores the saved offset', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const saved = new Vector2i(12, 34);

        renderer.getCameraOffset = vi.fn(() => saved);
        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.resetCamera).toHaveBeenCalledOnce();
        expect(renderer.setCameraOffset).toHaveBeenCalledWith(saved);
    });

    it('uses default overlay palette indices when style is omitted', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        const calls = getBitmapTextCalls(renderer);

        expect(calls.every((call) => call.paletteOffset === 1)).toBe(true);
        expect(renderer.drawBarFill).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it('uses overlayStyle gap palette index when provided', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', {
            style: { barPaletteIndex: 8, textPaletteIndex: 9, gapPaletteIndex: 12 },
            isOverlayVisibleAtStart: true,
        });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.drawBarFill).toHaveBeenCalledWith(
            expect.objectContaining({ y: 13, height: OVERLAY_ROW_GAP_PX }),
            12,
        );

        expect(renderer.drawBarFill).toHaveBeenCalledWith(
            expect.objectContaining({ y: 41, height: OVERLAY_ROW_GAP_PX }),
            12,
        );
    });

    it('falls back gap fills to bar palette index when gapPaletteIndex is omitted', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            style: { barPaletteIndex: 8, textPaletteIndex: 9 },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.drawBarFill).toHaveBeenCalledWith(
            expect.objectContaining({ y: 13, height: OVERLAY_ROW_GAP_PX }),
            8,
        );
    });

    it('uses overlayStyle palette indices when provided', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            style: { barPaletteIndex: 8, textPaletteIndex: 9 },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.drawBarFill).toHaveBeenCalledWith(expect.anything(), 8);

        const calls = getBitmapTextCalls(renderer);

        expect(calls[0]?.paletteOffset).toBe(8);
    });

    it('draws custom rows with per-row palette indices', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            style: { barPaletteIndex: 2, textPaletteIndex: 3 },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();
        const customRows = [{ leftText: 'Left', barPaletteIndex: 5, textPaletteIndex: 6 }];

        overlay.updateAndRender(renderer, mockFont, null, null, 0, () => customRows);

        const fills = getRectFillCalls(renderer);

        expect(renderer.drawBarFill).toHaveBeenCalledWith(fills[3], 5);

        const calls = getBitmapTextCalls(renderer);

        expect(calls[0]?.paletteOffset).toBe(5);
    });

    it('draws custom rows stacked above the bottom bar with 1px gaps', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const customRows = [{ leftText: 'Position (10, 20)' }, { leftText: 'Bounces 3', rightText: 'ok' }];

        overlay.updateAndRender(renderer, mockFont, null, null, 0, () => customRows);

        const fills = getRectFillCalls(renderer);
        const row0BarY = customRowBarY(240, 0);
        const row1BarY = customRowBarY(240, 1);

        // 12 band/gap fills plus 5 in-row separator dividers from the top labels.
        expect(fills).toHaveLength(17);
        expect(fills[3]).toMatchObject({ y: row0BarY, width: 320, height: OVERLAY_BAR_HEIGHT });
        expect(fills[4]).toMatchObject({ y: row1BarY, width: 320, height: OVERLAY_BAR_HEIGHT });
        expect(fills[11]).toMatchObject({ y: hintBarY(240), width: 320, height: OVERLAY_BAR_HEIGHT });
        expect(row0BarY - row1BarY).toBe(OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX);

        const calls = getBitmapTextCalls(renderer);
        const rightX = overlayRightAlignedTextX('ok', 320);

        // 3 custom row labels plus 9 segmented top-label draws.
        expect(calls).toHaveLength(12);

        expect(calls[0]).toEqual({
            pos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, row0BarY + OVERLAY_TOP_TEXT_Y),
            text: 'Position (10, 20)',
            paletteOffset: 1,
        });

        expect(calls[1]).toEqual({
            pos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, row1BarY + OVERLAY_TOP_TEXT_Y),
            text: 'Bounces 3',
            paletteOffset: 1,
        });

        expect(calls[2]).toEqual({
            pos: new Vector2i(rightX, row1BarY + OVERLAY_TOP_TEXT_Y),
            text: 'ok',
            paletteOffset: 1,
        });
    });

    it('skips extra custom row draws when customRows is empty', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, () => []);

        // 8 band/gap fills plus 5 in-row separator dividers from the top labels.
        expect(getRectFillCalls(renderer)).toHaveLength(13);

        // Top labels split into segments: title, backend + resolution, 3 metrics, 3 timing.
        expect(getBitmapTextCalls(renderer)).toHaveLength(9);
    });

    it('does not invoke getCustomRows while the overlay is hidden', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo');
        const renderer = createMockRenderer();
        const getCustomRows = vi.fn(() => [{ leftText: 'Hidden row' }] as const);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, getCustomRows);

        expect(getCustomRows).not.toHaveBeenCalled();
    });

    it('renders palette grid when isOverlayPaletteEnabled is enabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayPaletteEnabled: true, isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const palette = Palette.vga();
        const usedMask = buildUsageMask([1, 2, 3, 4, 5, 6, 7, 8]);
        const grid = computeGrid(320, undefined, palette.size);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, undefined, palette, usedMask);

        const fills = getRectFillCalls(renderer);

        const paletteBandFill = fills.find(
            (rect) =>
                rect.y === paletteBandY(240, grid.totalHeight) &&
                rect.height === grid.totalHeight &&
                rect.width === 320,
        );

        expect(paletteBandFill).toBeDefined();

        expect(
            fills.some((rect) => rect.y === hintBarY(240) && rect.height === OVERLAY_BAR_HEIGHT && rect.width === 320),
        ).toBe(true);

        expect(renderer.drawBarFill.mock.calls.length).toBeGreaterThan(4);
    });

    it('preserves default hint bar height when palette view is disabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const palette = Palette.vga();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, undefined, palette);

        const fills = getRectFillCalls(renderer);

        expect(fills.some((rect) => rect.y === hintBarY(240) && rect.height === OVERLAY_BAR_HEIGHT)).toBe(true);

        // Width-1 top-label separator dividers are bar-height; palette swatch fills are not.
        const swatchCalls = renderer.drawBarFill.rectSnapshots.filter(
            (rect) => rect.width === 1 && rect.height !== OVERLAY_BAR_HEIGHT,
        );

        expect(swatchCalls).toHaveLength(0);
    });

    it('stacks custom rows above the palette grid bottom band', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayPaletteEnabled: true, isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const palette = Palette.vga();
        const usedMask = buildUsageMask([1, 2, 3, 4, 5, 6, 7, 8]);
        const grid = computeGrid(320, undefined, palette.size);
        const customRows = [{ leftText: 'Palette row' }];

        overlay.updateAndRender(renderer, mockFont, null, null, 0, () => customRows, undefined, palette, usedMask);

        const fills = getRectFillCalls(renderer);
        const row0BarY = customRowBarY(240, 0, grid.totalHeight + OVERLAY_ROW_GAP_PX + OVERLAY_BAR_HEIGHT);
        const customRowFill = fills.find((rect) => rect.height === OVERLAY_BAR_HEIGHT && rect.y === row0BarY);

        expect(customRowFill).toMatchObject({ y: row0BarY, width: 320, height: OVERLAY_BAR_HEIGHT });
    });

    it('draws palette tooltip label after custom row and hint labels', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayPaletteEnabled: true, isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();
        const palette = Palette.vga();
        const usedMask = buildUsageMask([1, 2, 3, 4, 5, 6, 7, 8]);
        const grid = computeGrid(320, undefined, palette.size);
        const paletteBandTop = paletteBandY(240, grid.totalHeight);
        const paletteBand = new Rect2i(0, paletteBandTop, 320, grid.totalHeight);
        const swatch = new Rect2i();
        const hoveredIndex = 7;

        writeSwatchTopLeft(swatch, hoveredIndex, paletteBand, grid);

        const customRows = [{ leftText: 'Bounces: 11' }, { leftText: 'Position (43, 166)' }];

        const pointer = {
            isActive: () => true,
            getPos: () => new Vector2i(swatch.x + 1, swatch.y + 1),
        };

        overlay.updateAndRender(
            renderer,
            mockFont,
            pointer as never,
            null,
            0,
            () => customRows,
            undefined,
            palette,
            usedMask,
        );

        const calls = getBitmapTextCalls(renderer);
        const positionLabelIndex = renderer.drawLabel.mock.calls.findIndex((call) => call[2] === 'Position (43, 166)');

        expect(calls.some((call) => call.text === 'Position (43, 166)')).toBe(true);
        expect(positionLabelIndex).toBeGreaterThanOrEqual(0);

        const labelDrawOrder = renderer.drawLabel.mock.invocationCallOrder.at(positionLabelIndex);
        const tooltipLabelDrawOrder = renderer.drawLabelOnTop.mock.invocationCallOrder.at(0);
        const lastBarFillOrder = renderer.drawBarFill.mock.invocationCallOrder.at(-1);
        const firstBarFillOnTopOrder = renderer.drawBarFillOnTop.mock.invocationCallOrder.at(0);

        if (
            labelDrawOrder === undefined ||
            tooltipLabelDrawOrder === undefined ||
            lastBarFillOrder === undefined ||
            firstBarFillOnTopOrder === undefined
        ) {
            expect.fail('overlay draw-order snapshots missing');
        }

        expect(labelDrawOrder).toBeLessThan(tooltipLabelDrawOrder);
        expect(lastBarFillOrder).toBeLessThan(firstBarFillOnTopOrder);

        expect(renderer.drawLabelOnTop).toHaveBeenCalledWith(
            mockFont,
            expect.any(Vector2i),
            String(hoveredIndex),
            expect.any(Number),
        );

        expect(renderer.drawBarFillOnTop).toHaveBeenCalled();
    });

    it('forwards timing chart tags to drawLabelOnTop with event palette offset', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: { tagPaletteIndex: 7 },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.assignTag('Spawn', 42);

        overlay.updateAndRender(renderer, mockFont, null, null, 42, undefined, {
            frameMs: 1,
            updateMs: 1,
            renderMs: 1,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        const tagCall = renderer.drawLabelOnTop.mock.calls.find((call) => call[2] === 'Spawn');

        expect(tagCall).toBeDefined();
        expect(tagCall?.[3]).toBe(6);
    });

    it('draws timing chart dots when isOverlayTimingChartEnabled is enabled', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            style: { barPaletteIndex: 8, textPaletteIndex: 9 },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: { updateBarPaletteIndex: 10, renderBarPaletteIndex: 11 },
            overlayTimingChartHeight: 36,
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 8,
            updateMs: 200,
            renderMs: 100,
            updateSteps: 1,
            drawCalls: 4,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        const dotCalls = renderer.drawBarFill.mock.calls.filter(
            (call) => (call[0] as { width: number }).width === 1 && (call[0] as { height: number }).height === 1,
        );
        const paletteIndices = dotCalls.map((call) => call[1] as number);

        expect(paletteIndices).toContain(10);
        expect(paletteIndices).toContain(11);
    });

    it('tints timing chart dots with warning palette when frame exceeds soft budget', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: 10,
                renderBarPaletteIndex: 11,
                warningPaletteIndex: 3,
                errorPaletteIndex: 4,
            },
            isOverlayVisibleAtStart: true,
        });

        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 20,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 4,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        const dotCalls = renderer.drawBarFill.mock.calls.filter(
            (call) => (call[0] as { width: number }).width === 1 && (call[0] as { height: number }).height === 1,
        );

        const paletteIndices = dotCalls.map((call) => call[1] as number);

        expect(paletteIndices.length).toBeGreaterThan(0);
        expect(paletteIndices.every((index) => index === 3)).toBe(true);
    });

    it('does not draw overlay while hidden but keeps timing chart samples for re-show', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: { updateBarPaletteIndex: 10, renderBarPaletteIndex: 11 },
            isOverlayVisibleAtStart: true,
            isOverlayToggleHintVisible: false,
        });

        const renderer = createMockRenderer();

        overlay.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 1);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 8,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 4,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        expect(renderer.drawBarFill).not.toHaveBeenCalled();

        overlay.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 2);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 8,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 4,
            droppedFrames: 1,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        expect(renderer.drawBarFill.mock.calls.some((call) => call[1] === 10)).toBe(true);
    });

    it('does not draw timing chart dots when isOverlayTimingChartEnabled is disabled', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
        const renderer = createMockRenderer();

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 8,
            updateMs: 200,
            renderMs: 100,
            updateSteps: 1,
            drawCalls: 4,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        expect(renderer.drawBarFill.mock.calls.some((call) => call[1] === 10)).toBe(false);
    });

    it('records drop severity in chart history while body is hidden', () => {
        const layout = createOverlayLayout(320, 240, 14);

        const overlay = createOverlay(layout, 'Demo', {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: { warningPaletteIndex: 3, errorPaletteIndex: 4 },
            isOverlayVisibleAtStart: true,
            isOverlayToggleHintVisible: false,
        });

        const renderer = createMockRenderer();

        overlay.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 1);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 0,
            updateMs: 0,
            renderMs: 0,
            updateSteps: 0,
            drawCalls: 0,
            droppedFrames: 1,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        expect(renderer.drawBarFill).not.toHaveBeenCalled();

        overlay.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 2);

        overlay.updateAndRender(renderer, mockFont, null, null, 0, undefined, {
            frameMs: 0,
            updateMs: 0,
            renderMs: 0,
            updateSteps: 0,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        expect(renderer.drawBarFill.mock.calls.some((call) => call[1] === 3)).toBe(true);
    });

    it('ignores toggle input when isOverlayToggleEnabled is false', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo', { isOverlayToggleEnabled: false });

        expect(overlay.isBodyVisible).toBe(false);

        overlay.handleToggle(
            null,
            {
                isKeyPressed: () => true,
            } as never,
            1,
        );

        expect(overlay.isBodyVisible).toBe(false);
    });

    it('resets camera for hint-only draws then restores the saved offset', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const overlay = createOverlay(layout, 'Demo');
        const renderer = createMockRenderer();
        const saved = new Vector2i(12, 34);

        renderer.getCameraOffset = vi.fn(() => saved);
        overlay.updateAndRender(renderer, mockFont, null, null, 0);

        expect(renderer.resetCamera).toHaveBeenCalledOnce();
        expect(renderer.setCameraOffset).toHaveBeenCalledWith(saved);
    });

    describe('audio meter', () => {
        function audioSnapshot(overrides: Partial<OverlayAudioSnapshot> = {}): OverlayAudioSnapshot {
            return {
                levels: { main: 0, music: 0, sfx: 0 },
                activeVoices: 0,
                totalVoices: 16,
                voiceStealCount: 0,
                voiceDropCount: 0,
                preUnlockDropCount: 0,
                ...overrides,
            };
        }

        it('does not draw audio meter bars when isOverlayAudioMetersEnabled is disabled', () => {
            const layout = createOverlayLayout(320, 240, 14);
            const overlay = createOverlay(layout, 'Demo', { isOverlayVisibleAtStart: true });
            const renderer = createMockRenderer();

            overlay.updateAndRender(
                renderer,
                mockFont,
                null,
                null,
                0,
                undefined,
                undefined,
                undefined,
                undefined,
                audioSnapshot({ levels: { main: 1, music: 1, sfx: 1 } }),
            );

            const barWidthBars = renderer.drawBarFill.mock.calls.filter(
                (call) => (call[0] as Rect2i).width === AUDIO_METER_BAR_WIDTH_PX,
            );

            expect(barWidthBars).toHaveLength(0);
        });

        it('draws audio meter track and level bars when isOverlayAudioMetersEnabled is enabled', () => {
            const layout = createOverlayLayout(320, 240, 14);

            const overlay = createOverlay(layout, 'Demo', {
                isOverlayAudioMetersEnabled: true,
                isOverlayVisibleAtStart: true,
            });

            const renderer = createMockRenderer();

            overlay.updateAndRender(
                renderer,
                mockFont,
                null,
                null,
                0,
                undefined,
                undefined,
                undefined,
                undefined,
                audioSnapshot({ levels: { main: 0.5, music: 0, sfx: 0 } }),
            );

            const barWidthBars = renderer.drawBarFill.mock.calls.filter(
                (call) => (call[0] as Rect2i).width === AUDIO_METER_BAR_WIDTH_PX,
            );

            // 3 tracks (always drawn) + 1 fill (only main is non-zero)
            expect(barWidthBars).toHaveLength(4);
        });

        it('draws the voices/steal/drop text readout when enabled', () => {
            const layout = createOverlayLayout(320, 240, 14);

            const overlay = createOverlay(layout, 'Demo', {
                isOverlayAudioMetersEnabled: true,
                isOverlayVisibleAtStart: true,
            });

            const renderer = createMockRenderer();

            overlay.updateAndRender(
                renderer,
                mockFont,
                null,
                null,
                0,
                undefined,
                undefined,
                undefined,
                undefined,
                audioSnapshot({ activeVoices: 7, totalVoices: 16, voiceStealCount: 2, voiceDropCount: 1 }),
            );

            const textCalls = getBitmapTextCalls(renderer);

            expect(textCalls.some((call) => call.text.includes('7/16'))).toBe(true);
        });

        it('honors audio meter palette overrides', () => {
            const layout = createOverlayLayout(320, 240, 14);

            const overlay = createOverlay(layout, 'Demo', {
                isOverlayAudioMetersEnabled: true,
                isOverlayVisibleAtStart: true,
                audioMeterStyle: { trackPaletteIndex: 30, levelBarPaletteIndex: 31 },
            });

            const renderer = createMockRenderer();

            overlay.updateAndRender(
                renderer,
                mockFont,
                null,
                null,
                0,
                undefined,
                undefined,
                undefined,
                undefined,
                audioSnapshot({ levels: { main: 0.3, music: 0, sfx: 0 } }),
            );

            const paletteIndices = renderer.drawBarFill.mock.calls
                .filter((call) => (call[0] as Rect2i).width === AUDIO_METER_BAR_WIDTH_PX)
                .map((call) => call[1] as number);

            expect(paletteIndices).toContain(30);
            expect(paletteIndices).toContain(31);
        });

        it('does not draw audio meter content when no audio snapshot is supplied', () => {
            const layout = createOverlayLayout(320, 240, 14);

            const overlay = createOverlay(layout, 'Demo', {
                isOverlayAudioMetersEnabled: true,
                isOverlayVisibleAtStart: true,
                audioMeterHeight: 13,
            });

            const renderer = createMockRenderer();

            overlay.updateAndRender(renderer, mockFont, null, null, 0);

            const barWidthBars = renderer.drawBarFill.mock.calls.filter(
                (call) => (call[0] as Rect2i).width === AUDIO_METER_BAR_WIDTH_PX,
            );

            // Tracks still draw (3, one per bus) since the band reserves space; no level fills without a sample.
            expect(barWidthBars).toHaveLength(3);
        });
    });
});
