import type { OverlayStyle, OverlayTimingChartStyle } from '../../core/IBTDemo';
import type { Rect2i } from '../../utils/Rect2i';
import { DEFAULT_IDX_BG, DEFAULT_IDX_TEXT } from '../constants';
import {
    TIMING_CHART_DEFAULT_ERROR_IDX,
    TIMING_CHART_DEFAULT_TAG_IDX,
    TIMING_CHART_DEFAULT_WARNING_IDX,
    TIMING_CHART_FULL_SCALE_MS,
    TIMING_CHART_GRID_MARKER_MS,
} from './constants';

/** Resolved palette indices used when drawing the overlay timing chart band. */
export interface TimingChartDrawStyle {
    readonly updateBarIndex: number;
    readonly renderBarIndex: number;
    readonly warningBarIndex: number;
    readonly errorBarIndex: number;
    readonly tagBarIndex: number;
    readonly gridBarIndex: number;
    readonly overflowBarIndex: number;
}

const pickPaletteIndex = (preferred: number | undefined, fallback: number): number => preferred ?? fallback;

const pickOverlayBarTextGap = (
    overlayStyle: OverlayStyle | undefined,
): { barIndex: number; textIndex: number; gapIndex: number } => {
    const barIndex = overlayStyle?.barPaletteIndex ?? DEFAULT_IDX_BG;
    const textIndex = overlayStyle?.textPaletteIndex ?? DEFAULT_IDX_TEXT;
    const gapIndex = overlayStyle?.gapPaletteIndex ?? barIndex;

    return { barIndex, textIndex, gapIndex };
};

/**
 * Resolves timing chart palette indices from overlay and chart-specific settings.
 *
 * @param overlayStyle – Global overlay bar/text indices from hardware settings.
 * @param chartStyle – Optional timing-chart palette overrides.
 * @returns Resolved indices for chart draw and semantic severity tints.
 */
export function resolveTimingChartStyle(
    overlayStyle: OverlayStyle | undefined,
    chartStyle: OverlayTimingChartStyle | undefined,
): TimingChartDrawStyle {
    const { barIndex, textIndex, gapIndex } = pickOverlayBarTextGap(overlayStyle);

    return {
        updateBarIndex: pickPaletteIndex(chartStyle?.updateBarPaletteIndex, barIndex),
        renderBarIndex: pickPaletteIndex(chartStyle?.renderBarPaletteIndex, textIndex),
        warningBarIndex: pickPaletteIndex(chartStyle?.warningPaletteIndex, TIMING_CHART_DEFAULT_WARNING_IDX),
        errorBarIndex: pickPaletteIndex(chartStyle?.errorPaletteIndex, TIMING_CHART_DEFAULT_ERROR_IDX),
        tagBarIndex: pickPaletteIndex(chartStyle?.tagPaletteIndex, TIMING_CHART_DEFAULT_TAG_IDX),
        gridBarIndex: pickPaletteIndex(chartStyle?.gridPaletteIndex, gapIndex),
        overflowBarIndex: pickPaletteIndex(
            chartStyle?.overflowPaletteIndex,
            pickPaletteIndex(chartStyle?.warningPaletteIndex, TIMING_CHART_DEFAULT_WARNING_IDX),
        ),
    };
}

/**
 * Maps a timing sample in milliseconds to a vertical dot offset in pixels above the baseline.
 *
 * Scales linearly so `fullScaleMs` fills the chart band. Any non-zero sample draws at
 * least one pixel so lightweight demos (sub-millisecond `update()` / `render()`) stay visible.
 *
 * @param ms – Sample value in milliseconds.
 * @param chartHeight – Chart band height in pixels.
 * @param fullScaleMs – Milliseconds that map to full band height.
 * @returns Clamped offset in pixels (0 when sample is zero).
 */
export function computeTimingChartBarHeight(ms: number, chartHeight: number, fullScaleMs: number): number {
    if (chartHeight <= 0 || ms <= 0 || fullScaleMs <= 0) {
        return 0;
    }

    const scaled = Math.floor((ms * chartHeight) / fullScaleMs);

    return Math.min(chartHeight, Math.max(1, scaled));
}

/**
 * Maps submitted vertex count to a vertical offset within a pressure sub-band (rich diagnostics mode).
 *
 * @param vertices – Submitted vertices for one pipeline this frame.
 * @param regionHeight – Height of the pressure sub-band in pixels.
 * @param maxVertices – Pipeline capacity (typically 50k).
 * @returns Clamped offset in pixels (0 when vertices is zero).
 */
export function computeTimingChartPressureHeight(vertices: number, regionHeight: number, maxVertices: number): number {
    if (regionHeight <= 0 || vertices <= 0 || maxVertices <= 0) {
        return 0;
    }

    const scaled = Math.floor((vertices * regionHeight) / maxVertices);

    return Math.min(regionHeight, Math.max(1, scaled));
}

/**
 * Maps a timing threshold in milliseconds to the screen Y row for a horizontal grid line.
 *
 * Uses the same baseline and bar-height scale as timing chart dots.
 *
 * @param ms – Threshold in milliseconds.
 * @param chartRect – Chart band bounds.
 * @param fullScaleMs – Milliseconds mapped to full band height.
 * @returns Screen Y for a 1 px row, or `null` when the line would not be visible.
 */
export function computeTimingChartGridLineY(
    ms: number,
    chartRect: Rect2i,
    fullScaleMs: number = TIMING_CHART_FULL_SCALE_MS,
): number | null {
    if (chartRect.height <= 0 || ms <= 0 || fullScaleMs <= 0) {
        return null;
    }

    const baselineY = timingChartBaselineY(chartRect);
    const offset = computeTimingChartBarHeight(ms, chartRect.height, fullScaleMs);

    if (offset <= 0) {
        return null;
    }

    return Math.max(chartRect.y, baselineY - offset + 1);
}

/**
 * Maps a timing sample in milliseconds to the screen Y row for a one-pixel chart dot.
 *
 * Dots anchor to the bottom band row for light samples (see {@link timingChartBaselineY}).
 *
 * @param ms – Sample value in milliseconds.
 * @param chartRect – Chart band bounds.
 * @param fullScaleMs – Milliseconds mapped to full band height.
 * @returns Screen Y for the dot, or `null` when the sample is zero.
 */
export function computeTimingChartDotY(
    ms: number,
    chartRect: Rect2i,
    fullScaleMs: number = TIMING_CHART_FULL_SCALE_MS,
): number | null {
    if (chartRect.height <= 0 || ms <= 0 || fullScaleMs <= 0) {
        return null;
    }

    const baselineY = timingChartBaselineY(chartRect);
    const offset = computeTimingChartBarHeight(ms, chartRect.height, fullScaleMs);

    if (offset <= 0) {
        return null;
    }

    let y = Math.max(chartRect.y, baselineY - offset + 1);

    if (y === baselineY - 1) {
        y = baselineY;
    }

    return y;
}

/**
 * Bottom row of the timing chart band (zero / sub-ms samples sit here).
 *
 * @param chartRect – Chart band bounds from layout plan.
 * @returns Screen Y of the last inclusive row in the band.
 */
export function timingChartBaselineY(chartRect: Rect2i): number {
    return chartRect.y + chartRect.height - 1;
}

/**
 * Whether a mapped grid line should be drawn (skips top and bottom band edges).
 *
 * @param y – Screen Y from {@link computeTimingChartGridLineY}.
 * @param chartRect – Chart band bounds.
 * @returns `true` when the row is strictly inside the band and not the baseline.
 */
export function isTimingChartGridLineAtY(y: number, chartRect: Rect2i): boolean {
    return y > chartRect.y && y < chartRect.y + chartRect.height && y !== timingChartBaselineY(chartRect);
}

/**
 * Backward-compatible alias for {@link isTimingChartGridLineAtY}.
 *
 * @deprecated Deprecated since 1.1.0 (2026-05-31). Use {@link isTimingChartGridLineAtY} instead.
 * @param y – Screen Y from {@link computeTimingChartGridLineY}.
 * @param chartRect – Chart band bounds.
 * @returns `true` when the row is strictly inside the band and not the baseline.
 */
export const shouldDrawTimingChartGridLineY = isTimingChartGridLineAtY;

/**
 * Frame-budget grid marker in milliseconds from configured fixed-step rate.
 *
 * @param targetFps – Configured `targetFPS` (clamped to at least 1).
 * @returns `1000 / targetFps`.
 */
export function timingChartFrameBudgetMs(targetFps: number): number {
    return 1000 / Math.max(1, targetFps);
}

/**
 * Writes timing-chart grid marker values (fixed thresholds plus frame budget) into `out`.
 *
 * @param targetFps – Configured fixed-step rate for the dynamic budget line.
 * @param out – Reusable buffer; must hold at least `TIMING_CHART_GRID_MARKER_MS.length + 1` elements.
 * @returns Number of marker values written.
 */
export function writeTimingChartGridMarkers(targetFps: number, out: Float32Array): number {
    const fixedCount = TIMING_CHART_GRID_MARKER_MS.length;

    for (let index = 0; index < fixedCount; index++) {
        /* eslint-disable-next-line security/detect-object-injection -- index bounded by fixedCount */
        out[index] = TIMING_CHART_GRID_MARKER_MS[index] ?? 0;
    }

    /* eslint-disable-next-line security/detect-object-injection -- slot after fixed markers */
    out[fixedCount] = timingChartFrameBudgetMs(targetFps);

    return fixedCount + 1;
}
