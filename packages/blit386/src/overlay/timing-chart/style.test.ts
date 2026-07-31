import { describe, expect, it } from 'vitest';

import { Rect2i } from '../../utils/Rect2i';
import {
    TIMING_CHART_DEFAULT_ERROR_IDX,
    TIMING_CHART_DEFAULT_TAG_IDX,
    TIMING_CHART_DEFAULT_WARNING_IDX,
    TIMING_CHART_FULL_SCALE_MS,
} from './constants';
import {
    computeTimingChartBarHeight,
    computeTimingChartDotY,
    computeTimingChartGridLineY,
    isTimingChartGridLineAtY,
    resolveTimingChartStyle,
    timingChartBaselineY,
    timingChartFrameBudgetMs,
    writeTimingChartGridMarkers,
} from './style';

describe('computeTimingChartBarHeight', () => {
    const chartHeight = 22;

    it('returns 0 for non-positive samples and invalid scale inputs', () => {
        expect(computeTimingChartBarHeight(-5, chartHeight, TIMING_CHART_FULL_SCALE_MS)).toBe(0);
        expect(computeTimingChartBarHeight(0, chartHeight, TIMING_CHART_FULL_SCALE_MS)).toBe(0);
        expect(computeTimingChartBarHeight(5, 0, TIMING_CHART_FULL_SCALE_MS)).toBe(0);
        expect(computeTimingChartBarHeight(5, chartHeight, 0)).toBe(0);
    });

    it('draws at least 1 px for sub-millisecond samples and clamps at band height', () => {
        expect(computeTimingChartBarHeight(0.1, chartHeight, TIMING_CHART_FULL_SCALE_MS)).toBe(1);
        expect(computeTimingChartBarHeight(999, chartHeight, TIMING_CHART_FULL_SCALE_MS)).toBe(chartHeight);
    });
});

describe('resolveTimingChartStyle', () => {
    it('defaults update/render bars to overlay style indices', () => {
        const resolved = resolveTimingChartStyle({ barPaletteIndex: 10, textPaletteIndex: 11 }, undefined);

        expect(resolved.updateBarIndex).toBe(10);
        expect(resolved.renderBarIndex).toBe(11);
        expect(resolved.warningBarIndex).toBe(TIMING_CHART_DEFAULT_WARNING_IDX);
        expect(resolved.errorBarIndex).toBe(TIMING_CHART_DEFAULT_ERROR_IDX);
        expect(resolved.tagBarIndex).toBe(TIMING_CHART_DEFAULT_TAG_IDX);
        expect(resolved.gridBarIndex).toBe(10);
    });

    it('honors timing chart palette overrides', () => {
        const resolved = resolveTimingChartStyle(
            { barPaletteIndex: 1, textPaletteIndex: 2, gapPaletteIndex: 12 },
            {
                updateBarPaletteIndex: 20,
                renderBarPaletteIndex: 21,
                warningPaletteIndex: 22,
                errorPaletteIndex: 23,
                tagPaletteIndex: 24,
                gridPaletteIndex: 25,
            },
        );

        expect(resolved.updateBarIndex).toBe(20);
        expect(resolved.renderBarIndex).toBe(21);
        expect(resolved.warningBarIndex).toBe(22);
        expect(resolved.errorBarIndex).toBe(23);
        expect(resolved.tagBarIndex).toBe(24);
        expect(resolved.gridBarIndex).toBe(25);
    });

    it('defaults grid lines to gap palette index when grid override is omitted', () => {
        const resolved = resolveTimingChartStyle({ barPaletteIndex: 1, textPaletteIndex: 2, gapPaletteIndex: 7 }, {});

        expect(resolved.gridBarIndex).toBe(7);
    });

    it('falls back grid lines to bar index when gap palette is omitted', () => {
        const resolved = resolveTimingChartStyle({ barPaletteIndex: 9, textPaletteIndex: 2 }, undefined);

        expect(resolved.gridBarIndex).toBe(9);
    });
});

describe('computeTimingChartGridLineY', () => {
    const chartRect22 = new Rect2i(0, 14, 320, 22);
    const baselineY = timingChartBaselineY(chartRect22);

    const gridY = (ms: number, rect = chartRect22) => computeTimingChartGridLineY(ms, rect, TIMING_CHART_FULL_SCALE_MS);

    it('returns null for non-positive inputs', () => {
        expect(gridY(0)).toBeNull();
        expect(gridY(-1)).toBeNull();
        expect(computeTimingChartGridLineY(5, new Rect2i(0, 0, 10, 0), TIMING_CHART_FULL_SCALE_MS)).toBeNull();
    });

    it('maps fixed thresholds at default 22 px band height', () => {
        expect(gridY(5)).toBe(baselineY - computeTimingChartBarHeight(5, 22, TIMING_CHART_FULL_SCALE_MS) + 1);
        expect(gridY(10)).toBe(baselineY - computeTimingChartBarHeight(10, 22, TIMING_CHART_FULL_SCALE_MS) + 1);
        expect(gridY(33.33)).toBe(chartRect22.y);
    });

    it('skips top and bottom band edges for grid draw', () => {
        expect(isTimingChartGridLineAtY(chartRect22.y, chartRect22)).toBe(false);
        expect(isTimingChartGridLineAtY(baselineY, chartRect22)).toBe(false);
        expect(isTimingChartGridLineAtY(chartRect22.y - 1, chartRect22)).toBe(false);
        expect(isTimingChartGridLineAtY(chartRect22.y + chartRect22.height, chartRect22)).toBe(false);
        const gridLineY5 = gridY(5);

        expect(gridLineY5).not.toBeNull();
        if (gridLineY5 === null) {
            return;
        }

        expect(isTimingChartGridLineAtY(gridLineY5, chartRect22)).toBe(true);
    });

    it('maps frame-budget marker from targetFPS at 60 Hz', () => {
        const budgetMs = timingChartFrameBudgetMs(60);

        expect(gridY(budgetMs)).toBe(
            baselineY - computeTimingChartBarHeight(budgetMs, 22, TIMING_CHART_FULL_SCALE_MS) + 1,
        );
    });

    it('maps thresholds at non-default chart height', () => {
        const chartRect32 = new Rect2i(0, 14, 320, 32);
        const baseline32 = chartRect32.y + chartRect32.height - 1;

        expect(gridY(8, chartRect32)).toBe(
            baseline32 - computeTimingChartBarHeight(8, 32, TIMING_CHART_FULL_SCALE_MS) + 1,
        );
        expect(gridY(33.33, chartRect32)).toBe(chartRect32.y);
    });
});

describe('computeTimingChartDotY', () => {
    const chartRect22 = new Rect2i(0, 14, 320, 22);
    const baselineY = timingChartBaselineY(chartRect22);

    it('anchors light samples on the bottom band row', () => {
        expect(computeTimingChartDotY(0.1, chartRect22)).toBe(baselineY);
        expect(computeTimingChartDotY(1, chartRect22)).toBe(baselineY);
    });

    it('keeps full-scale samples on the top band row', () => {
        expect(computeTimingChartDotY(33.33, chartRect22)).toBe(chartRect22.y);
    });
});

describe('writeTimingChartGridMarkers', () => {
    it('writes fixed markers plus dynamic frame budget', () => {
        const buffer = new Float32Array(8);
        const count = writeTimingChartGridMarkers(60, buffer);

        expect(count).toBe(4);
        expect(buffer[0]).toBe(5);
        expect(buffer[1]).toBe(10);
        expect(buffer[2]).toBeCloseTo(33.33, 5);
        expect(buffer[3]).toBeCloseTo(1000 / 60, 5);
    });

    it('uses targetFPS for budget marker at 30 Hz', () => {
        const buffer = new Float32Array(8);

        writeTimingChartGridMarkers(30, buffer);

        expect(buffer[3]).toBeCloseTo(1000 / 30, 5);
    });
});
