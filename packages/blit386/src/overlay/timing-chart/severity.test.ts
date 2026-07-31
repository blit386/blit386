import { describe, expect, it } from 'vitest';

import {
    classifyTimingChartSeverity,
    severityFromDroppedFrames,
    severityFromFrameBudget,
    TIMING_CHART_BUDGET_ERROR_RATIO,
    TIMING_CHART_BUDGET_WARNING_RATIO,
    TIMING_CHART_SEVERITY_ERROR,
    TIMING_CHART_SEVERITY_NONE,
    TIMING_CHART_SEVERITY_WARNING,
} from './severity';

describe('severityFromFrameBudget', () => {
    const targetFps = 60;
    const budgetMs = 1000 / targetFps;

    it('returns none for non-positive or invalid inputs', () => {
        expect(severityFromFrameBudget(0, targetFps)).toBe(TIMING_CHART_SEVERITY_NONE);
        expect(severityFromFrameBudget(-1, targetFps)).toBe(TIMING_CHART_SEVERITY_NONE);
        expect(severityFromFrameBudget(20, 0)).toBe(TIMING_CHART_SEVERITY_NONE);
    });

    it('maps soft and hard budget thresholds at 60 FPS', () => {
        const softMs = budgetMs * TIMING_CHART_BUDGET_WARNING_RATIO - 0.01;
        const atSoftMs = budgetMs * TIMING_CHART_BUDGET_WARNING_RATIO;
        const hardMs = budgetMs * TIMING_CHART_BUDGET_ERROR_RATIO;

        expect(severityFromFrameBudget(softMs, targetFps)).toBe(TIMING_CHART_SEVERITY_NONE);
        expect(severityFromFrameBudget(atSoftMs, targetFps)).toBe(TIMING_CHART_SEVERITY_WARNING);
        expect(severityFromFrameBudget(hardMs, targetFps)).toBe(TIMING_CHART_SEVERITY_ERROR);
    });
});

describe('severityFromDroppedFrames', () => {
    it('maps dropped-frame counts to warning and error', () => {
        expect(severityFromDroppedFrames(0)).toBe(TIMING_CHART_SEVERITY_NONE);
        expect(severityFromDroppedFrames(1)).toBe(TIMING_CHART_SEVERITY_WARNING);
        expect(severityFromDroppedFrames(2)).toBe(TIMING_CHART_SEVERITY_ERROR);
        expect(severityFromDroppedFrames(5)).toBe(TIMING_CHART_SEVERITY_ERROR);
    });
});

describe('classifyTimingChartSeverity', () => {
    it('prefers error when budget and drop signals disagree', () => {
        const targetFps = 60;
        const budgetMs = 1000 / targetFps;
        const warningFrameMs = budgetMs * TIMING_CHART_BUDGET_WARNING_RATIO;

        expect(classifyTimingChartSeverity(warningFrameMs, targetFps, 2)).toBe(TIMING_CHART_SEVERITY_ERROR);
    });

    it('uses budget warning when no drop is reported', () => {
        const targetFps = 60;
        const budgetMs = 1000 / targetFps;
        const warningFrameMs = budgetMs * TIMING_CHART_BUDGET_WARNING_RATIO;

        expect(classifyTimingChartSeverity(warningFrameMs, targetFps, 0)).toBe(TIMING_CHART_SEVERITY_WARNING);
    });
});
