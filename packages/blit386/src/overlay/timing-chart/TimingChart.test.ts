import { describe, expect, it } from 'vitest';

import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { createMockRenderer, getLabelOnTopCalls, getRectFillCalls, mockFont } from '../testFixtures';
import { TIMING_CHART_FULL_SCALE_MS } from './constants';
import { computeTimingChartBarHeight, computeTimingChartDotY } from './style';
import {
    computeTimingChartTagLabelY,
    computeTimingChartTagTextX,
    computeTimingChartTagTickY,
    TIMING_CHART_TAG_TEXT_X_OFFSET,
} from './tags';
import { TimingChart } from './TimingChart';

const defaultStyle = {
    updateBarIndex: 8,
    renderBarIndex: 9,
    warningBarIndex: 3,
    errorBarIndex: 4,
    tagBarIndex: 5,
    gridBarIndex: 6,
    overflowBarIndex: 7,
};

/**
 * Draws a chart band in tests with the required font and tick arguments.
 *
 * @param chart - Timing chart under test.
 * @param renderer - Mock overlay renderer.
 * @param chartRect - Chart band rectangle.
 * @param currentTick - Simulated fixed-update tick.
 */
function drawChart(
    chart: TimingChart,
    renderer: ReturnType<typeof createMockRenderer>,
    chartRect: Rect2i,
    currentTick: number,
): void {
    chart.draw(renderer, chartRect, defaultStyle, mockFont, currentTick);
}

describe('computeTimingChartBarHeight', () => {
    it('maps ms proportionally to chart height and clamps at band bounds', () => {
        expect(computeTimingChartBarHeight(0, 22, TIMING_CHART_FULL_SCALE_MS)).toBe(0);
        expect(computeTimingChartBarHeight(0.1, 22, TIMING_CHART_FULL_SCALE_MS)).toBe(1);
        expect(computeTimingChartBarHeight(8, 22, TIMING_CHART_FULL_SCALE_MS)).toBe(11);
        expect(computeTimingChartBarHeight(32, 22, TIMING_CHART_FULL_SCALE_MS)).toBe(22);
    });
});

describe('TimingChart', () => {
    it('does not draw when disabled', () => {
        const chart = new TimingChart(false);
        const renderer = createMockRenderer();

        chart.reset(4);
        chart.sample({
            frameMs: 1,
            updateMs: 2,
            renderMs: 3,
            updateSteps: 1,
            drawCalls: 1,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, new Rect2i(0, 14, 4, 22), 0);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
        expect(renderer.drawLabelOnTop).not.toHaveBeenCalled();
    });

    it('wraps ring buffer and keeps newest samples on the right', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 0, 3, 22);

        chart.reset(3, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 4,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        chart.sample({
            frameMs: 0,
            updateMs: 8,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        chart.sample({
            frameMs: 0,
            updateMs: 12,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        chart.sample({
            frameMs: 0,
            updateMs: 16,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        drawChart(chart, renderer, chartRect, 4);

        const updateDotY = (ms: number) => computeTimingChartDotY(ms, chartRect, TIMING_CHART_FULL_SCALE_MS);

        const updateDots = getRectFillCalls(renderer).filter(
            (rect) => rect.width === 1 && rect.height === 1 && rect.y === updateDotY(8),
        );

        expect(updateDots.some((rect) => rect.x === 0)).toBe(true);
        expect(
            getRectFillCalls(renderer).some(
                (rect) => rect.width === 1 && rect.height === 1 && rect.y === updateDotY(16) && rect.x === 2,
            ),
        ).toBe(true);
    });

    it('draws render dots for sub-millisecond samples', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();

        chart.reset(4, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 0,
            renderMs: 0.1,
            updateSteps: 1,
            drawCalls: 1,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, new Rect2i(0, 14, 4, 32), 1);

        expect(
            renderer.drawBarFill.mock.calls.some(
                (call) =>
                    (call[0] as { width: number; height: number }).width === 1 &&
                    (call[0] as { height: number }).height === 1 &&
                    call[1] === 9,
            ),
        ).toBe(true);
    });

    it('draws update and render dots with distinct palette indices', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();

        chart.reset(1, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, new Rect2i(10, 14, 1, 22), 1);

        const dotPaletteIndices = renderer.drawBarFill.mock.calls
            .filter((call) => call[1] === 8 || call[1] === 9)
            .map((call) => call[1] as number);

        expect(dotPaletteIndices).toContain(8);
        expect(dotPaletteIndices).toContain(9);
        expect(dotPaletteIndices).toHaveLength(2);
    });

    it('tints both dots with warning palette when frame is over soft budget', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();

        chart.reset(1, 0);
        chart.sample({
            frameMs: 20,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, new Rect2i(0, 14, 1, 22), 1);

        const dotPaletteIndices = renderer.drawBarFill.mock.calls
            .filter((call) => call[1] === 3)
            .map((call) => call[1] as number);

        expect(dotPaletteIndices.length).toBeGreaterThanOrEqual(2);
        expect(renderer.drawBarFill.mock.calls.some((call) => call[1] === 8)).toBe(false);
        expect(renderer.drawBarFill.mock.calls.some((call) => call[1] === 9)).toBe(false);
    });

    it('tints with error palette when two or more frames were dropped', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();

        chart.reset(1, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 0,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 2,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, new Rect2i(0, 14, 1, 22), 1);

        const severityCalls = renderer.drawBarFill.mock.calls.filter((call) => call[1] === 4);

        expect(severityCalls.length).toBeGreaterThanOrEqual(1);
        expect(renderer.drawBarFill.mock.calls.every((call) => call[1] === 4 || call[1] === 6)).toBe(true);
    });

    it('draws a baseline error marker when drop severity is active with zero timing samples', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(5, 14, 1, 22);
        const baselineY = chartRect.y + chartRect.height - 1;

        chart.reset(1, 0);
        chart.sample({
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
        drawChart(chart, renderer, chartRect, 1);

        expect(renderer.drawBarFill).toHaveBeenCalledWith(expect.objectContaining({ x: 5, y: baselineY }), 3);
    });

    it('draws full-width grid lines before dots when enabled', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(10, 14, 8, 22);

        chart.reset(chartRect.width, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 12,
            renderMs: 8,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, chartRect, 1);

        const mockCalls = renderer.drawBarFill.mock.calls;
        const firstDotIndex = mockCalls.findIndex(
            (call) => call[1] === defaultStyle.updateBarIndex || call[1] === defaultStyle.renderBarIndex,
        );
        const lastGridIndex = mockCalls.reduce((last, call, index) => (call[1] === 6 ? index : last), -1);

        expect(lastGridIndex).toBeGreaterThanOrEqual(0);
        expect(firstDotIndex).toBeGreaterThanOrEqual(0);
        expect(lastGridIndex).toBeLessThan(firstDotIndex);
    });

    it('omits grid lines on top and bottom band rows', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 4, 22);

        chart.reset(chartRect.width, 0);
        drawChart(chart, renderer, chartRect, 0);

        const fills = getRectFillCalls(renderer);
        const horizontalGrid = fills.filter((rect) => rect.height === 1 && rect.width === chartRect.width);
        const initMarker = fills.filter((rect) => rect.width === 1 && rect.height === chartRect.height);

        expect(horizontalGrid).toHaveLength(2);
        expect(initMarker).toHaveLength(1);
    });

    it('draws grid lines even when the ring buffer has no samples yet', () => {
        const chart = new TimingChart(true, 60);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 4, 22);

        chart.reset(4, 0);
        drawChart(chart, renderer, chartRect, 0);

        const gridCallCount = renderer.drawBarFill.mock.calls.filter((call) => call[1] === 6).length;

        expect(gridCallCount).toBeGreaterThan(0);
    });

    it('does not draw grid lines when disabled', () => {
        const chart = new TimingChart(false, 60);
        const renderer = createMockRenderer();

        chart.reset(4);
        drawChart(chart, renderer, new Rect2i(0, 14, 4, 22), 0);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
    });

    it('adds Start tag when chart width is first allocated', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 8, 22);

        drawChart(chart, renderer, chartRect, 100);

        const labels = getLabelOnTopCalls(renderer).map((call) => call.text);

        expect(labels).toContain('Start');
    });

    it('defaults empty assignTag labels to Untitled', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 8, 22);

        const sample = {
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        };

        drawChart(chart, renderer, chartRect, 50);
        chart.sample(sample);
        renderer.drawLabelOnTop.mockClear();
        chart.assignTag('', 51);
        drawChart(chart, renderer, chartRect, 52);

        expect(getLabelOnTopCalls(renderer).some((call) => call.text === 'Untitled')).toBe(true);
    });

    it('draws a vertical grid-colored marker at each tag column', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(10, 20, 100, 22);

        chart.reset(chartRect.width, 0);
        chart.assignTag('Bounce 1', 40);
        chart.sample({
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, chartRect, 1);

        const markerRect = getRectFillCalls(renderer).find(
            (rect) => rect.width === 1 && rect.height === chartRect.height && rect.y === chartRect.y,
        );

        expect(markerRect).toEqual(expect.objectContaining({ x: 10, width: 1, height: 22 }));
    });

    it('draws tags aligned with ring-buffer columns and event palette offset', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(10, 20, 100, 22);
        const tagTick = 450;
        const currentTick = 500;

        const sample = {
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        };

        chart.reset(chartRect.width, 0);
        for (let tick = 1; tick < tagTick; tick++) {
            chart.sample(sample);
        }
        chart.assignTag('Milestone', tagTick);
        for (let tick = tagTick; tick <= currentTick; tick++) {
            chart.sample(sample);
        }
        drawChart(chart, renderer, chartRect, currentTick);

        const expectedTextX = computeTimingChartTagTextX(chartRect.x, chartRect.width, tagTick - 1, currentTick);

        expect(expectedTextX).not.toBeNull();

        const labelCall = getLabelOnTopCalls(renderer).find((call) => call.text === 'Milestone');

        expect(labelCall).toEqual({
            pos: new Vector2i(expectedTextX as number, computeTimingChartTagLabelY(chartRect.y, 0)),
            text: 'Milestone',
            paletteOffset: defaultStyle.tagBarIndex - 1,
        });

        const tickCall = getLabelOnTopCalls(renderer).find((call) => call.text === String(tagTick));

        expect(tickCall?.pos).toEqual(new Vector2i(expectedTextX as number, computeTimingChartTagTickY(chartRect.y)));
    });

    it('stacks multiple labels on the same column below one tick row', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 30, 80, 22);
        chart.reset(chartRect.width, 0);
        chart.assignTag('First', 0);
        chart.assignTag('Second', 0);
        drawChart(chart, renderer, chartRect, 0);

        const calls = getLabelOnTopCalls(renderer);
        const tickCall = calls.find((call) => call.text === '0');
        const firstCall = calls.find((call) => call.text === 'First');
        const secondCall = calls.find((call) => call.text === 'Second');

        expect(tickCall?.pos.y).toBe(computeTimingChartTagTickY(chartRect.y));
        expect(firstCall?.pos.y).toBe(computeTimingChartTagLabelY(chartRect.y, 1));
        expect(secondCall?.pos.y).toBe(computeTimingChartTagLabelY(chartRect.y, 2));
        expect(
            getRectFillCalls(renderer).filter((rect) => rect.width === 1 && rect.height === chartRect.height).length,
        ).toBe(1);
    });

    it('places Start on the left edge before the chart buffer fills', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(5, 10, 80, 22);

        chart.reset(chartRect.width, 0);
        chart.sample({
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, chartRect, 1);

        const startCall = getLabelOnTopCalls(renderer).find((call) => call.text === 'Start');

        expect(startCall?.pos.x).toBe(chartRect.x + TIMING_CHART_TAG_TEXT_X_OFFSET);
    });

    it('draws tags while they slide off the left edge of the chart', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(10, 20, 100, 22);
        const sample = {
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        };

        chart.reset(chartRect.width, 0);
        chart.assignTag('Exit', 0);
        for (let index = 0; index < 160; index++) {
            chart.sample(sample);
        }
        drawChart(chart, renderer, chartRect, 0);

        const exitCall = getLabelOnTopCalls(renderer).find((call) => call.text === 'Exit');

        expect(exitCall?.pos.x).toBeLessThan(chartRect.x + TIMING_CHART_TAG_TEXT_X_OFFSET);
        expect(exitCall?.pos.x).toBeGreaterThan(chartRect.x - chartRect.width);
    });

    it('does not jump tags when the ring buffer becomes full', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 100, 22);
        const width = chartRect.width;
        const sample = {
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        };

        chart.reset(width, 0);
        for (let index = 0; index < 40; index++) {
            chart.sample(sample);
        }
        chart.assignTag('Milestone', 9999);
        for (let index = 40; index < width - 1; index++) {
            chart.sample(sample);
        }

        drawChart(chart, renderer, chartRect, 99_999);
        const beforeFull = getLabelOnTopCalls(renderer).find((call) => call.text === 'Milestone')?.pos.x;

        renderer.drawLabelOnTop.mockClear();
        chart.sample(sample);
        drawChart(chart, renderer, chartRect, 99_999);

        const afterFull = getLabelOnTopCalls(renderer).find((call) => call.text === 'Milestone')?.pos.x;

        expect(beforeFull).toBe(chartRect.x + 40 + TIMING_CHART_TAG_TEXT_X_OFFSET);
        expect(afterFull).toBe(beforeFull);
    });

    it('prunes tags once they scroll one chart width past the left edge', () => {
        const chart = new TimingChart(true);
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 100, 22);
        const width = chartRect.width;
        const sample = {
            frameMs: 0,
            updateMs: 1,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 0,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        };

        chart.reset(width, 0);
        chart.assignTag('Old', 0);
        for (let tick = 0; tick < 450; tick++) {
            chart.sample(sample);
        }
        chart.assignTag('Fresh', 450);
        for (let tick = 450; tick < 500; tick++) {
            chart.sample(sample);
        }

        drawChart(chart, renderer, chartRect, 500);

        renderer.drawLabelOnTop.mockClear();
        chart.sample(sample);
        drawChart(chart, renderer, chartRect, 501);

        const labels = getLabelOnTopCalls(renderer).map((call) => call.text);

        expect(labels).not.toContain('Old');
        expect(labels).toContain('Fresh');
    });

    it('draws overflow baseline marker when minimal diagnostics reports overflow', () => {
        const chart = new TimingChart(true, 60, 'minimal');
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 4, 22);
        const baselineY = chartRect.y + chartRect.height - 1;

        chart.reset(4);
        chart.sample({
            frameMs: 1,
            updateMs: 1,
            renderMs: 1,
            updateSteps: 1,
            drawCalls: 1,
            droppedFrames: 0,
            primitiveOverflowCount: 2,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 100,
            spriteSubmittedVertices: 0,
        });
        drawChart(chart, renderer, chartRect, 0);

        const overflowCalls = renderer.drawBarFill.mock.calls.filter(
            (call) => (call[1] as number) === defaultStyle.overflowBarIndex && (call[0] as Rect2i).y === baselineY,
        );

        expect(overflowCalls.length).toBeGreaterThan(0);
    });

    it('draws vertex pressure dots in rich diagnostics mode', () => {
        const chart = new TimingChart(true, 60, 'rich');
        const renderer = createMockRenderer();
        const chartRect = new Rect2i(0, 14, 8, 22);
        const baselineY = chartRect.y + chartRect.height - 1;

        chart.reset(8);
        chart.sample({
            frameMs: 1,
            updateMs: 0,
            renderMs: 0,
            updateSteps: 1,
            drawCalls: 1,
            droppedFrames: 0,
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 25000,
            spriteSubmittedVertices: 25000,
        });
        drawChart(chart, renderer, chartRect, 0);

        const pressureDots = renderer.drawBarFill.mock.calls.filter((call) => {
            const paletteIndex = call[1] as number;
            const y = (call[0] as Rect2i).y;

            return (
                (paletteIndex === defaultStyle.updateBarIndex || paletteIndex === defaultStyle.renderBarIndex) &&
                y < baselineY
            );
        });

        expect(pressureDots.length).toBeGreaterThanOrEqual(2);
    });
});
