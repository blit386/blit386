/**
 * Dynamic Y-band planner for the overlay.
 *
 * Computes bar rects and text anchors each frame from display size, custom row count,
 * and optional timing-chart / palette-grid feature flags (timing chart default off,
 * opt-in via {@link HardwareSettings.isOverlayTimingChartEnabled}).
 */

import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { DEFAULT_AUDIO_METER_HEIGHT } from '../audio-meter/constants';
import { DEFAULT_TIMING_CHART_HEIGHT } from '../timing-chart/constants';
import { OVERLAY_BAR_HEIGHT, OVERLAY_EDGE_MARGIN_PX, OVERLAY_ROW_GAP_PX, OVERLAY_TOP_TEXT_Y } from './constants';
import { overlayRightAlignedDividerLabelX } from './layoutHelpers';
import type { OverlayLayoutConfig, OverlayLayoutPlan } from './types';

/** Mutable scratch object reused by {@link buildOverlayLayoutPlan}. */
export interface OverlayLayoutPlanScratch {
    titleBar: Rect2i;
    timingChart: Rect2i;
    metricsBar: Rect2i;
    timingTextBar: Rect2i;
    rendererDiagnosticsBar: Rect2i;
    audioMeterBar: Rect2i;
    customBars: Rect2i[];
    paletteBand: Rect2i;
    hintBar: Rect2i;
    toggleRect: Rect2i;
    topLeftPos: Vector2i;
    topRightPos: Vector2i;
    topMetricsPos: Vector2i;
    topTimingPos: Vector2i;
    rendererDiagnosticsPos: Vector2i;
    audioMeterTextPos: Vector2i;
    rowGapRects: Rect2i[];
    topClusterSeparator: Rect2i;
    bottomClusterSeparator: Rect2i;
}

/**
 * Creates a reusable scratch object for layout planning.
 *
 * @returns Empty scratch plan with pre-allocated rects and positions.
 */
export function createOverlayLayoutPlanScratch(): OverlayLayoutPlanScratch {
    return {
        titleBar: new Rect2i(0, 0, 0, OVERLAY_BAR_HEIGHT),
        timingChart: new Rect2i(0, 0, 0, 0),
        metricsBar: new Rect2i(0, 0, 0, OVERLAY_BAR_HEIGHT),
        timingTextBar: new Rect2i(0, 0, 0, OVERLAY_BAR_HEIGHT),
        rendererDiagnosticsBar: new Rect2i(0, 0, 0, 0),
        audioMeterBar: new Rect2i(0, 0, 0, 0),
        customBars: [],
        paletteBand: new Rect2i(0, 0, 0, 0),
        hintBar: new Rect2i(0, 0, 0, OVERLAY_BAR_HEIGHT),
        toggleRect: new Rect2i(0, 0, 0, 0),
        topLeftPos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0),
        topRightPos: new Vector2i(0, 0),
        topMetricsPos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0),
        topTimingPos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0),
        rendererDiagnosticsPos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0),
        audioMeterTextPos: new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0),
        rowGapRects: [],
        topClusterSeparator: new Rect2i(0, 0, 0, OVERLAY_ROW_GAP_PX),
        bottomClusterSeparator: new Rect2i(0, 0, 0, OVERLAY_ROW_GAP_PX),
    };
}

/**
 * Top Y of the bottom hint bar (13 px strip at the display bottom edge).
 *
 * @param displayHeight - Logical display height in pixels.
 * @returns Hint bar top Y.
 */
export function hintBarY(displayHeight: number): number {
    return displayHeight - OVERLAY_BAR_HEIGHT;
}

/**
 * Top Y of the palette swatch grid band stacked above the hint bar row gap.
 *
 * @param displayHeight - Logical display height in pixels.
 * @param paletteGridHeight - Total palette grid height from {@link computeGrid}.
 * @returns Palette band top Y.
 */
export function paletteBandY(displayHeight: number, paletteGridHeight: number): number {
    return hintBarY(displayHeight) - OVERLAY_ROW_GAP_PX - paletteGridHeight;
}

/**
 * Resolves footer rects: optional palette band above a row gap, then the hint bar at the display bottom.
 *
 * @param config - Layout configuration.
 * @param displayHeight - Logical display height in pixels.
 * @returns Palette band height, footer stack anchor Y, and hint bar top Y.
 */
function resolveFooterLayout(
    config: OverlayLayoutConfig,
    displayHeight: number,
): { paletteBandHeight: number; footerStackTopY: number; hintBarTopY: number } {
    const hintBarTopY = hintBarY(displayHeight);
    const isPaletteLayoutEnabled = config.isOverlayPaletteEnabled && config.paletteGrid !== undefined;

    if (isPaletteLayoutEnabled) {
        const paletteBandHeight = config.paletteGrid.totalHeight;

        return {
            paletteBandHeight,
            footerStackTopY: paletteBandY(displayHeight, paletteBandHeight),
            hintBarTopY,
        };
    }

    return {
        paletteBandHeight: 0,
        footerStackTopY: hintBarTopY,
        hintBarTopY,
    };
}

/**
 * Total reserved footer height (palette grid + row gap + hint bar, or hint bar alone).
 *
 * @param config - Layout configuration.
 * @returns Footer band height in pixels.
 */
export function resolveOverlayFooterHeight(config: OverlayLayoutConfig): number {
    if (config.isOverlayPaletteEnabled && config.paletteGrid !== undefined) {
        return config.paletteGrid.totalHeight + OVERLAY_ROW_GAP_PX + OVERLAY_BAR_HEIGHT;
    }

    return OVERLAY_BAR_HEIGHT;
}

/**
 * Ensures the custom bar scratch pool has at least `count` entries.
 *
 * @param scratch - Layout scratch object.
 * @param count - Number of custom rows.
 * @param displayWidth - Logical display width.
 */
function ensureCustomBarPool(scratch: OverlayLayoutPlanScratch, count: number, displayWidth: number): void {
    while (scratch.customBars.length < count) {
        scratch.customBars.push(new Rect2i(0, 0, displayWidth, OVERLAY_BAR_HEIGHT));
    }
}

/**
 * Writes a 1 px row gap rect immediately below a bar band.
 *
 * @param scratch - Layout scratch object.
 * @param bar - Bar whose bottom edge precedes the gap.
 * @param displayWidth - Logical display width.
 * @param gapIndex - Index into {@link OverlayLayoutPlanScratch.rowGapRects}.
 * @returns Next gap index.
 */
function writeRowGapBelow(
    scratch: OverlayLayoutPlanScratch,
    bar: Rect2i,
    displayWidth: number,
    gapIndex: number,
): number {
    while (scratch.rowGapRects.length <= gapIndex) {
        scratch.rowGapRects.push(new Rect2i(0, 0, displayWidth, OVERLAY_ROW_GAP_PX));
    }

    const rect = scratch.rowGapRects.at(gapIndex);

    if (rect === undefined) {
        return gapIndex;
    }

    rect.x = 0;
    rect.y = bar.y + bar.height;
    rect.width = displayWidth;
    rect.height = OVERLAY_ROW_GAP_PX;

    return gapIndex + 1;
}

/**
 * Resolves the top Y of the footer overlay cluster (custom rows, palette band, or hint bar).
 *
 * @param scratch - Layout scratch with footer rects populated.
 * @param customRowCount - Demo custom row count for this frame.
 * @returns Top Y of the uppermost footer band.
 */
function resolveFooterClusterTopY(scratch: OverlayLayoutPlanScratch, customRowCount: number): number {
    if (customRowCount > 0) {
        const topCustomBar = scratch.customBars[customRowCount - 1];

        if (topCustomBar !== undefined) {
            return topCustomBar.y;
        }
    }

    if (scratch.paletteBand.height > 0) {
        return scratch.paletteBand.y;
    }

    return scratch.hintBar.y;
}

/**
 * Populates row gap rects and cluster boundary separators from bar geometry.
 *
 * @param scratch - Layout scratch with bar rects already assigned.
 * @param config - Layout configuration.
 * @param displayWidth - Logical display width.
 */
function populateGapLayout(scratch: OverlayLayoutPlanScratch, config: OverlayLayoutConfig, displayWidth: number): void {
    let gapIndex = 0;

    gapIndex = writeRowGapBelow(scratch, scratch.titleBar, displayWidth, gapIndex);

    if (scratch.timingChart.height > 0) {
        gapIndex = writeRowGapBelow(scratch, scratch.timingChart, displayWidth, gapIndex);
    }

    gapIndex = writeRowGapBelow(scratch, scratch.metricsBar, displayWidth, gapIndex);

    let lastTopClusterBar = scratch.timingTextBar;
    let hasOptionalTailBand = false;

    if (scratch.rendererDiagnosticsBar.height > 0) {
        gapIndex = writeRowGapBelow(scratch, lastTopClusterBar, displayWidth, gapIndex);

        lastTopClusterBar = scratch.rendererDiagnosticsBar;

        hasOptionalTailBand = true;
    }

    if (scratch.audioMeterBar.height > 0) {
        gapIndex = writeRowGapBelow(scratch, lastTopClusterBar, displayWidth, gapIndex);

        lastTopClusterBar = scratch.audioMeterBar;

        hasOptionalTailBand = true;
    }

    if (hasOptionalTailBand) {
        gapIndex = writeRowGapBelow(scratch, lastTopClusterBar, displayWidth, gapIndex);
    }

    /* eslint-disable security/detect-object-injection -- rowIndex bounded by customRowCount */
    for (let rowIndex = 0; rowIndex < config.customRowCount; rowIndex++) {
        const bar = scratch.customBars[rowIndex];

        if (bar !== undefined) {
            gapIndex = writeRowGapBelow(scratch, bar, displayWidth, gapIndex);
        }
    }
    /* eslint-enable security/detect-object-injection */

    if (scratch.paletteBand.height > 0) {
        gapIndex = writeRowGapBelow(scratch, scratch.paletteBand, displayWidth, gapIndex);
    }

    scratch.rowGapRects.length = gapIndex;

    scratch.topClusterSeparator.x = 0;
    scratch.topClusterSeparator.y = lastTopClusterBar.y + lastTopClusterBar.height;
    scratch.topClusterSeparator.width = displayWidth;
    scratch.topClusterSeparator.height = OVERLAY_ROW_GAP_PX;

    const footerTopY = resolveFooterClusterTopY(scratch, config.customRowCount);

    scratch.bottomClusterSeparator.x = 0;
    scratch.bottomClusterSeparator.y = footerTopY - OVERLAY_ROW_GAP_PX;
    scratch.bottomClusterSeparator.width = displayWidth;
    scratch.bottomClusterSeparator.height = OVERLAY_ROW_GAP_PX;
}

/**
 * Builds or updates a layout plan from configuration (top-down stack).
 *
 * @param config - Feature flags and display dimensions.
 * @param scratch - Reusable scratch object mutated in place.
 * @param topRightLabel - Text for top-right backend/resolution label.
 * @param toggleRect - Bottom-left toggle hit region from init layout.
 * @returns The same scratch object as {@link OverlayLayoutPlan}.
 */
export function buildOverlayLayoutPlan(
    config: OverlayLayoutConfig,
    scratch: OverlayLayoutPlanScratch,
    topRightLabel: string,
    toggleRect: Rect2i,
): OverlayLayoutPlan {
    const { displayWidth, displayHeight } = config;
    const { paletteBandHeight, footerStackTopY, hintBarTopY } = resolveFooterLayout(config, displayHeight);

    scratch.hintBar.x = 0;
    scratch.hintBar.y = hintBarTopY;
    scratch.hintBar.width = displayWidth;
    scratch.hintBar.height = OVERLAY_BAR_HEIGHT;

    scratch.paletteBand.x = 0;
    scratch.paletteBand.y = footerStackTopY;
    scratch.paletteBand.width = displayWidth;
    scratch.paletteBand.height = paletteBandHeight;

    ensureCustomBarPool(scratch, config.customRowCount, displayWidth);

    /* eslint-disable security/detect-object-injection -- rowIndex bounded by customRowCount */
    for (let rowIndex = 0; rowIndex < config.customRowCount; rowIndex++) {
        const bar = scratch.customBars[rowIndex];

        if (bar === undefined) {
            continue;
        }

        const barY = footerStackTopY - (rowIndex + 1) * (OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX);

        bar.x = 0;
        bar.y = barY;
        bar.width = displayWidth;
        bar.height = OVERLAY_BAR_HEIGHT;
    }
    /* eslint-enable security/detect-object-injection */

    let y = 0;

    scratch.titleBar.x = 0;
    scratch.titleBar.y = y;
    scratch.titleBar.width = displayWidth;
    scratch.titleBar.height = OVERLAY_BAR_HEIGHT;

    y += OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX;

    if (config.isOverlayTimingChartEnabled) {
        const chartHeight = config.timingChartHeight > 0 ? config.timingChartHeight : DEFAULT_TIMING_CHART_HEIGHT;

        scratch.timingChart.x = 0;
        scratch.timingChart.y = y;
        scratch.timingChart.width = displayWidth;
        scratch.timingChart.height = chartHeight;

        y += chartHeight + OVERLAY_ROW_GAP_PX;
    } else {
        scratch.timingChart.x = 0;
        scratch.timingChart.y = y;
        scratch.timingChart.width = displayWidth;
        scratch.timingChart.height = 0;
    }

    scratch.metricsBar.x = 0;
    scratch.metricsBar.y = y;
    scratch.metricsBar.width = displayWidth;
    scratch.metricsBar.height = OVERLAY_BAR_HEIGHT;

    y += OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX;

    scratch.timingTextBar.x = 0;
    scratch.timingTextBar.y = y;
    scratch.timingTextBar.width = displayWidth;
    scratch.timingTextBar.height = OVERLAY_BAR_HEIGHT;

    if (config.isOverlayRendererDiagnosticsBarEnabled) {
        const diagnosticsY = y + OVERLAY_BAR_HEIGHT + OVERLAY_ROW_GAP_PX;

        scratch.rendererDiagnosticsBar.x = 0;
        scratch.rendererDiagnosticsBar.y = diagnosticsY;
        scratch.rendererDiagnosticsBar.width = displayWidth;
        scratch.rendererDiagnosticsBar.height = OVERLAY_BAR_HEIGHT;
        scratch.rendererDiagnosticsPos.x = OVERLAY_EDGE_MARGIN_PX;
        scratch.rendererDiagnosticsPos.y = diagnosticsY + OVERLAY_TOP_TEXT_Y;
    } else {
        scratch.rendererDiagnosticsBar.x = 0;
        scratch.rendererDiagnosticsBar.y = y;
        scratch.rendererDiagnosticsBar.width = displayWidth;
        scratch.rendererDiagnosticsBar.height = 0;
        scratch.rendererDiagnosticsPos.x = OVERLAY_EDGE_MARGIN_PX;
        scratch.rendererDiagnosticsPos.y = y + OVERLAY_TOP_TEXT_Y;
    }

    const preAudioMeterBottom = config.isOverlayRendererDiagnosticsBarEnabled
        ? scratch.rendererDiagnosticsBar.y + scratch.rendererDiagnosticsBar.height
        : scratch.timingTextBar.y + scratch.timingTextBar.height;

    if (config.isOverlayAudioMetersEnabled) {
        const meterHeight = config.audioMeterHeight > 0 ? config.audioMeterHeight : DEFAULT_AUDIO_METER_HEIGHT;
        const meterY = preAudioMeterBottom + OVERLAY_ROW_GAP_PX;

        scratch.audioMeterBar.x = 0;
        scratch.audioMeterBar.y = meterY;
        scratch.audioMeterBar.width = displayWidth;
        scratch.audioMeterBar.height = meterHeight;
        scratch.audioMeterTextPos.x = OVERLAY_EDGE_MARGIN_PX;
        scratch.audioMeterTextPos.y = meterY + OVERLAY_TOP_TEXT_Y;
    } else {
        scratch.audioMeterBar.x = 0;
        scratch.audioMeterBar.y = preAudioMeterBottom;
        scratch.audioMeterBar.width = displayWidth;
        scratch.audioMeterBar.height = 0;
        scratch.audioMeterTextPos.x = OVERLAY_EDGE_MARGIN_PX;
        scratch.audioMeterTextPos.y = preAudioMeterBottom + OVERLAY_TOP_TEXT_Y;
    }

    scratch.toggleRect.x = toggleRect.x;
    scratch.toggleRect.y = toggleRect.y;
    scratch.toggleRect.width = toggleRect.width;
    scratch.toggleRect.height = toggleRect.height;

    scratch.topLeftPos.x = OVERLAY_EDGE_MARGIN_PX;
    scratch.topLeftPos.y = OVERLAY_TOP_TEXT_Y;

    scratch.topRightPos.x = overlayRightAlignedDividerLabelX(topRightLabel, displayWidth);
    scratch.topRightPos.y = OVERLAY_TOP_TEXT_Y;

    scratch.topMetricsPos.x = OVERLAY_EDGE_MARGIN_PX;
    scratch.topMetricsPos.y = scratch.metricsBar.y + OVERLAY_TOP_TEXT_Y;

    scratch.topTimingPos.x = OVERLAY_EDGE_MARGIN_PX;
    scratch.topTimingPos.y = scratch.timingTextBar.y + OVERLAY_TOP_TEXT_Y;

    populateGapLayout(scratch, config, displayWidth);

    return scratch;
}

/**
 * Default layout config with chart and palette features disabled.
 *
 * @param displayWidth - Logical display width.
 * @param displayHeight - Logical display height.
 * @param lineHeight - System font line height.
 * @param customRowCount - Demo custom row count for this frame.
 * @returns Config suitable for {@link buildOverlayLayoutPlan}.
 */
export function createDefaultLayoutConfig(
    displayWidth: number,
    displayHeight: number,
    lineHeight: number,
    customRowCount: number,
): OverlayLayoutConfig {
    return {
        displayWidth,
        displayHeight,
        lineHeight,
        customRowCount,
        isOverlayTimingChartEnabled: false,
        timingChartHeight: DEFAULT_TIMING_CHART_HEIGHT,
        isOverlayRendererDiagnosticsBarEnabled: false,
        isOverlayAudioMetersEnabled: false,
        audioMeterHeight: DEFAULT_AUDIO_METER_HEIGHT,
        isOverlayPaletteEnabled: false,
    };
}
