/**
 * Overlay subsystem public exports for BTAPI and unit tests.
 */

export { AudioMeter } from './audio-meter/AudioMeter';
export type { AudioMeterDrawStyle, AudioMeterStyle } from './audio-meter/style';
export { computeAudioMeterBarHeight, resolveAudioMeterStyle } from './audio-meter/style';
export type { OverlayBarStyle } from './bars/Bars';
export { OverlayBars } from './bars/Bars';
export { DEFAULT_IDX_BG, DEFAULT_IDX_TEXT, SYSTEM_CHAR_ADVANCE } from './constants';
export { OVERLAY_TOGGLE_KEY_CODE } from './input/constants';
export { Toggle } from './input/Toggle';
export { resolveOverlayTopLeftLabel } from './labels';
export {
    createOverlayLayout,
    customBarY,
    isPointerInOverlayToggleCorner,
    overlayBitmapTextPaletteOffset,
    overlayRightAlignedTextX,
    overlayToggleHintIconX,
} from './layout/layoutHelpers';
export type { OverlayLayoutPlanScratch } from './layout/layoutPlan';
export {
    buildOverlayLayoutPlan,
    createDefaultLayoutConfig,
    createOverlayLayoutPlanScratch,
    hintBarY,
    paletteBandY,
    resolveOverlayFooterHeight,
} from './layout/layoutPlan';
export type { OverlayLayout, OverlayLayoutConfig, OverlayLayoutPlan } from './layout/types';
export { Overlay } from './Overlay';
export type { OverlayDrawTarget, OverlayRenderer } from './OverlayDrawTarget';
export {
    drawOverlayToggleIcon,
    hintIconExclusionRect,
    hintIconPos,
    hintIconY,
    overlayToggleHintIconExclusionRect,
    overlayToggleHintIconPos,
    overlayToggleHintIconY,
    toggleIcon,
} from './OverlayToggleIcon';
export { PaletteInteraction } from './palette/PaletteInteraction';
export { computeGrid, PaletteView } from './palette/PaletteView';
export { FpsSampler } from './sampling/FpsSampler';
export { TimingSampler } from './sampling/TimingSampler';
export type { TimingChartDrawStyle } from './timing-chart/style';
export {
    computeTimingChartBarHeight,
    computeTimingChartDotY,
    computeTimingChartGridLineY,
    isTimingChartGridLineAtY,
    resolveTimingChartStyle,
    shouldDrawTimingChartGridLineY,
    timingChartBaselineY,
    timingChartFrameBudgetMs,
    writeTimingChartGridMarkers,
} from './timing-chart/style';
export { TimingChart } from './timing-chart/TimingChart';
export type {
    OverlayAudioSnapshot,
    OverlayRendererDiagnostics,
    OverlayTimingSnapshot,
    PaletteGridLayout,
} from './types';
