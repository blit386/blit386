import { describe, expect, it } from 'vitest';

import {
    computeTimingChartTagColumn,
    computeTimingChartTagLabelY,
    computeTimingChartTagMarkerX,
    computeTimingChartTagTextX,
    computeTimingChartTagTickY,
    formatTimingChartTagRelTick,
    groupTimingChartTagsByColumn,
    normalizeTimingChartTagLabel,
    pruneTimingChartTagsInPlace,
    shouldPruneTimingChartTag,
    TIMING_CHART_TAG_LABEL_STACK_SPACING,
    TIMING_CHART_TAG_LABEL_Y_GAP,
    TIMING_CHART_TAG_REL_TICK_MAX,
    TIMING_CHART_TAG_TEXT_X_OFFSET,
    TIMING_CHART_TAG_TICK_Y_OFFSET,
    type TimingChartTag,
} from './tags';

describe('normalizeTimingChartTagLabel', () => {
    it('defaults empty labels to Untitled', () => {
        expect(normalizeTimingChartTagLabel(undefined)).toBe('Untitled');
        expect(normalizeTimingChartTagLabel('')).toBe('Untitled');
    });

    it('preserves non-empty labels', () => {
        expect(normalizeTimingChartTagLabel('Start')).toBe('Start');
    });
});

describe('shouldPruneTimingChartTag', () => {
    const width = 320;

    it('keeps tags while they are sliding off the left but still within one chart width', () => {
        expect(shouldPruneTimingChartTag(600, 0, width)).toBe(false);
    });

    it('prunes tags one full chart width past the left edge', () => {
        expect(shouldPruneTimingChartTag(640, 0, width)).toBe(true);
    });

    it('prunes tags past the right edge', () => {
        expect(shouldPruneTimingChartTag(100, 500, width)).toBe(true);
    });
});

describe('computeTimingChartTagColumn', () => {
    const width = 100;

    it('fills from the left while the buffer is not full', () => {
        expect(computeTimingChartTagColumn(0, 5, width)).toBe(0);
        expect(computeTimingChartTagColumn(4, 5, width)).toBe(4);
        expect(computeTimingChartTagColumn(50, 55, width)).toBe(50);
    });

    it('allows negative columns while sliding off the left', () => {
        expect(computeTimingChartTagColumn(0, 150, width)).toBe(-50);
        expect(computeTimingChartTagColumn(40, 150, width)).toBe(-10);
    });

    it('keeps column fixed when the buffer becomes full', () => {
        expect(computeTimingChartTagColumn(40, 100, width)).toBe(40);
    });

    it('scrolls left one column per sample once the buffer is full', () => {
        expect(computeTimingChartTagColumn(40, 101, width)).toBe(39);
        expect(computeTimingChartTagColumn(0, 100, width)).toBe(0);
        expect(computeTimingChartTagColumn(99, 100, width)).toBe(99);
        expect(computeTimingChartTagColumn(99, 101, width)).toBe(98);
    });

    it('returns null when the tag scrolled past the right edge', () => {
        expect(computeTimingChartTagColumn(100, 100, width)).toBeNull();
        expect(computeTimingChartTagColumn(501, 500, width)).toBeNull();
    });
});

describe('computeTimingChartTagMarkerX and computeTimingChartTagTextX', () => {
    it('aligns markers with dot columns and text with the text offset', () => {
        expect(computeTimingChartTagMarkerX(10, 100, 40, 101)).toBe(49);
        expect(computeTimingChartTagTextX(10, 100, 40, 101)).toBe(49 + TIMING_CHART_TAG_TEXT_X_OFFSET);
    });

    it('places Start at the left text offset during fill', () => {
        expect(computeTimingChartTagTextX(10, 100, 0, 3)).toBe(10 + TIMING_CHART_TAG_TEXT_X_OFFSET);
    });

    it('returns null when the tag column is past the right edge', () => {
        expect(computeTimingChartTagTextX(0, 100, 100, 100)).toBeNull();
    });
});

describe('computeTimingChartTagTickY and computeTimingChartTagLabelY', () => {
    const chartTopY = 30;

    it('places the tick row above stacked labels with a fixed gap and stack spacing', () => {
        const tickY = chartTopY - TIMING_CHART_TAG_TICK_Y_OFFSET;

        expect(computeTimingChartTagTickY(chartTopY)).toBe(tickY);
        expect(computeTimingChartTagLabelY(chartTopY, 0)).toBe(tickY + TIMING_CHART_TAG_LABEL_Y_GAP);
        expect(computeTimingChartTagLabelY(chartTopY, 1)).toBe(
            tickY + TIMING_CHART_TAG_LABEL_Y_GAP + TIMING_CHART_TAG_LABEL_STACK_SPACING,
        );
    });
});

describe('groupTimingChartTagsByColumn', () => {
    it('groups tags that share a column and preserves assignment order', () => {
        const tags: TimingChartTag[] = [
            { label: 'A', tick: 1, sampleIndex: 5 },
            { label: 'B', tick: 1, sampleIndex: 5 },
            { label: 'C', tick: 2, sampleIndex: 9 },
        ];

        expect(groupTimingChartTagsByColumn(tags, 10, 100)).toEqual([
            { sampleIndex: 5, tags: [tags[0], tags[1]] },
            { sampleIndex: 9, tags: [tags[2]] },
        ]);
    });
});

describe('formatTimingChartTagRelTick', () => {
    it('returns relative tick text within the display cap', () => {
        expect(formatTimingChartTagRelTick(150, 100)).toBe('50');
    });

    it('caps display at the maximum relative tick', () => {
        expect(formatTimingChartTagRelTick(200_001, 0)).toBe(String(TIMING_CHART_TAG_REL_TICK_MAX));
    });
});

describe('pruneTimingChartTagsInPlace', () => {
    it('removes only off-screen tags without allocating', () => {
        const tags: TimingChartTag[] = [
            { label: 'old', tick: 0, sampleIndex: 0 },
            { label: 'keep', tick: 500, sampleIndex: 300 },
        ];

        pruneTimingChartTagsInPlace(tags, 700, 320);

        expect(tags).toEqual([{ label: 'keep', tick: 500, sampleIndex: 300 }]);
    });
});
