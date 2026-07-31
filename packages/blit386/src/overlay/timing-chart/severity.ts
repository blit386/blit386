/**
 * Timing chart severity classification.
 */

/** No semantic tint for this chart column. */
export const TIMING_CHART_SEVERITY_NONE = 0;

/** Soft runtime risk (over-budget or single dropped frame). */
export const TIMING_CHART_SEVERITY_WARNING = 1;

/** Hard runtime risk (severe over-budget or multiple dropped frames). */
export const TIMING_CHART_SEVERITY_ERROR = 2;

/** Frame budget soft threshold: warning at or above this fraction of target frame time. */
export const TIMING_CHART_BUDGET_WARNING_RATIO = 1.1;

/** Frame budget hard threshold: error at or above this fraction of target frame time. */
export const TIMING_CHART_BUDGET_ERROR_RATIO = 1.5;

/**
 * Maps dropped-frame count from {@link GameLoop} to chart severity.
 *
 * @param droppedFrames - Estimated skipped refresh intervals (0 = none).
 * @returns Warning, error, or none.
 */
export function severityFromDroppedFrames(droppedFrames: number): number {
    if (droppedFrames >= 2) {
        return TIMING_CHART_SEVERITY_ERROR;
    }

    if (droppedFrames >= 1) {
        return TIMING_CHART_SEVERITY_WARNING;
    }

    return TIMING_CHART_SEVERITY_NONE;
}

/**
 * Maps frame wall time against the configured fixed-step budget.
 *
 * @param frameMs - Total frame CPU time in milliseconds.
 * @param targetFps - Configured simulation rate from {@link HardwareSettings.targetFPS}.
 * @returns Warning, error, or none.
 */
export function severityFromFrameBudget(frameMs: number, targetFps: number): number {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || !Number.isFinite(targetFps) || targetFps <= 0) {
        return TIMING_CHART_SEVERITY_NONE;
    }

    const budgetMs = 1000 / targetFps;

    if (budgetMs <= 0) {
        return TIMING_CHART_SEVERITY_NONE;
    }

    const ratio = frameMs / budgetMs;

    if (ratio >= TIMING_CHART_BUDGET_ERROR_RATIO) {
        return TIMING_CHART_SEVERITY_ERROR;
    }

    if (ratio >= TIMING_CHART_BUDGET_WARNING_RATIO) {
        return TIMING_CHART_SEVERITY_WARNING;
    }

    return TIMING_CHART_SEVERITY_NONE;
}

/**
 * Combines budget and dropped-frame signals; error wins over warning.
 *
 * @param frameMs - Total frame CPU time in milliseconds.
 * @param targetFps - Configured simulation rate.
 * @param droppedFrames - Dropped frames detected this present interval (0 when none).
 * @returns Highest severity for the chart column.
 */
export function classifyTimingChartSeverity(frameMs: number, targetFps: number, droppedFrames: number): number {
    const budgetSeverity = severityFromFrameBudget(frameMs, targetFps);
    const dropSeverity = severityFromDroppedFrames(droppedFrames);

    return Math.max(budgetSeverity, dropSeverity);
}
