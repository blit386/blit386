/**
 * Allocation regression tests for the {@link Overlay} hovered-frame path: palette tooltip and
 * divider labels.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFont } from '../__test__/overlayFixtures';
import type * as Rect2iModule from '../utils/Rect2i';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { createOverlayLayout } from './layout/layoutHelpers';
import { paletteBandY } from './layout/layoutPlan';
import { Overlay } from './Overlay';
import { computeGrid, writeSwatchTopLeft } from './palette/PaletteView';
import type { OverlayAudioSnapshot, OverlayTimingSnapshot } from './types';

const { rect2iAllocStats } = vi.hoisted(() => ({ rect2iAllocStats: { count: 0 } }));

vi.mock('../utils/Rect2i', async (importOriginal) => {
    const mod = await importOriginal<typeof Rect2iModule>();

    class CountingRect2i extends mod.Rect2i {
        constructor(...args: ConstructorParameters<typeof mod.Rect2i>) {
            rect2iAllocStats.count++;
            super(...args);
        }
    }

    return { ...mod, Rect2i: CountingRect2i };
});

/** Renderer that draws nothing and records nothing, so the test counts only overlay work. */
const noopRenderer = {
    getCameraOffset: () => Vector2i.zero(),
    resetCamera: () => {},
    setCameraOffset: () => {},
    drawBarFill: () => {},
    drawBarFillOnTop: () => {},
    drawLabel: () => {},
    drawLabelOnTop: () => {},
} as never;

const timing: OverlayTimingSnapshot = {
    frameMs: 16.7,
    updateMs: 1,
    renderMs: 2,
    updateSteps: 1,
    drawCalls: 10,
    droppedFrames: 0,
    primitiveOverflowCount: 0,
    spriteOverflowCount: 0,
    primitiveSubmittedVertices: 0,
    spriteSubmittedVertices: 0,
};

describe('Overlay hovered-frame allocation', () => {
    beforeEach(() => {
        rect2iAllocStats.count = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds no tooltip or divider strings and no Rect2i while a swatch stays hovered', () => {
        let nowMs = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

        const layout = createOverlayLayout(320, 240, 14);
        const overlay = new Overlay(layout, 'Demo', 'webgpu', { targetFPS: 60, isOverlayPaletteEnabled: true });
        const grid = computeGrid(320);
        const paletteBand = new Rect2i(0, paletteBandY(240, grid.totalHeight), 320, grid.totalHeight);
        const swatch = new Rect2i();

        writeSwatchTopLeft(swatch, 42, paletteBand, grid);

        const hoverPos = new Vector2i(swatch.x + 1, swatch.y + 1);
        const pointer = {
            isActive: (slot: number) => slot === 0,
            getPos: () => hoverPos,
            isButtonPressed: () => false,
            isButtonDown: () => false,
            isSlotInRect: (slot: number, rect: Rect2i) => slot === 0 && rect.isContaining(hoverPos),
            getScrollDelta: () => 0,
            consumeScrollDelta: () => {},
            setIsScrollCaptureForced: () => {},
        } as never;

        overlay.handleFrameInput(null, true, 0);

        const renderFrame = (): void => {
            nowMs += 1000 / 60;
            overlay.handleFrameInput(pointer, false, 1);
            overlay.updateAndRender(noopRenderer, mockFont, pointer, null, 1, undefined, timing);
        };

        for (let frame = 0; frame < 8; frame++) {
            renderFrame();
        }

        const sliceSpy = vi.spyOn(String.prototype, 'slice');
        const splitSpy = vi.spyOn(String.prototype, 'split');
        const stringSpy = vi.spyOn(globalThis, 'String');
        const rectCountAfterWarmup = rect2iAllocStats.count;

        for (let frame = 0; frame < 32; frame++) {
            renderFrame();
        }

        expect(overlay.isBodyVisible).toBe(true);
        expect(sliceSpy).not.toHaveBeenCalled();
        expect(splitSpy).not.toHaveBeenCalled();
        expect(stringSpy).not.toHaveBeenCalled();
        expect(rect2iAllocStats.count).toBe(rectCountAfterWarmup);
    });
});

describe('Overlay audio meter and renderer diagnostics row allocation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Template literals never call the global `String`, so the audio counters are `Number` objects whose
     * `toString` counts the conversions a template literal performs on them.
     */
    const toStringCalls = { count: 0 };
    const countedNumber = (value: number): number => {
        const boxed = new Number(value);

        boxed.toString = (): string => {
            toStringCalls.count++;

            return `${value}`;
        };

        return boxed as unknown as number;
    };
    const audio: OverlayAudioSnapshot = {
        levels: { main: 0.5, music: 0.25, sfx: 0.1 },
        activeVoices: countedNumber(2),
        totalVoices: countedNumber(16),
        voiceStealCount: countedNumber(3),
        voiceDropCount: countedNumber(4),
        preUnlockDropCount: countedNumber(1),
    };

    const countStringBuilding = (settings: ConstructorParameters<typeof Overlay>[3]): number => {
        let nowMs = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

        const layout = createOverlayLayout(320, 240, 14);
        const overlay = new Overlay(layout, 'Demo', 'webgpu', settings);

        overlay.handleFrameInput(null, true, 0);

        const renderFrame = (): void => {
            nowMs += 1000 / 60;
            overlay.updateAndRender(
                noopRenderer,
                mockFont,
                null,
                null,
                1,
                undefined,
                timing,
                undefined,
                undefined,
                audio,
            );
        };

        for (let frame = 0; frame < 8; frame++) {
            renderFrame();
        }

        const padStartSpy = vi.spyOn(String.prototype, 'padStart');
        const stringSpy = vi.spyOn(globalThis, 'String');

        toStringCalls.count = 0;

        for (let frame = 0; frame < 32; frame++) {
            renderFrame();
        }

        expect(overlay.isBodyVisible).toBe(true);

        return stringSpy.mock.calls.length + padStartSpy.mock.calls.length + toStringCalls.count;
    };

    it('builds no strings for the audio meter row while its inputs are unchanged', () => {
        expect(countStringBuilding({ targetFPS: 60, isOverlayAudioMetersEnabled: true })).toBe(0);
    });

    it('builds no strings for the renderer diagnostics row while its inputs are unchanged', () => {
        expect(countStringBuilding({ targetFPS: 60, isOverlayRendererDiagnosticsBarEnabled: true })).toBe(0);
    });
});
