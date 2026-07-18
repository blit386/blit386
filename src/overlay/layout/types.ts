import type { Rect2i } from '../../utils/Rect2i';
import type { Vector2i } from '../../utils/Vector2i';
import type { PaletteGridLayout } from '../types';

/** Cached screen-space layout for the overlay bars and toggle hit region. */
export interface OverlayLayout {
    /** Logical display width in pixels (fixed at init). */
    readonly displayWidth: number;

    /** Logical display height in pixels (fixed at init). */
    readonly displayHeight: number;

    /** System font line height in pixels. */
    readonly lineHeight: number;

    /** Y baseline for top-bar text. */
    readonly topTextY: number;

    /** Bottom-left 17x13 px region that toggles overlay body visibility on primary press. */
    readonly toggleRect: Rect2i;
}

/** Feature flags and dimensions consumed by the layout planner. */
export interface OverlayLayoutConfig {
    readonly displayWidth: number;

    readonly displayHeight: number;

    readonly lineHeight: number;

    readonly customRowCount: number;

    readonly isOverlayTimingChartEnabled: boolean;

    readonly timingChartHeight: number;

    /** Mirrors {@link HardwareSettings.isOverlayRendererDiagnosticsBarEnabled}. */
    readonly isOverlayRendererDiagnosticsBarEnabled: boolean;

    /** When true, reserves the audio meter band at the tail of the top overlay cluster. */
    readonly isOverlayAudioMetersEnabled: boolean;

    /** Audio meter band height in pixels when {@link isOverlayAudioMetersEnabled} is true. */
    readonly audioMeterHeight: number;

    /** Mirrors {@link HardwareSettings.isOverlayPaletteEnabled}. */
    readonly isOverlayPaletteEnabled: boolean;

    readonly paletteGrid?: PaletteGridLayout;
}

/** Computed screen-space bands and text anchors for one frame. */
export interface OverlayLayoutPlan {
    readonly titleBar: Rect2i;

    readonly timingChart: Rect2i;

    readonly metricsBar: Rect2i;

    readonly timingTextBar: Rect2i;

    readonly rendererDiagnosticsBar: Rect2i;

    readonly audioMeterBar: Rect2i;

    readonly paletteBand: Rect2i;

    /** Bottom hint bar (13 px); always at the display bottom edge. */
    readonly hintBar: Rect2i;

    readonly toggleRect: Rect2i;

    readonly topLeftPos: Vector2i;

    readonly topRightPos: Vector2i;

    readonly topMetricsPos: Vector2i;

    readonly topTimingPos: Vector2i;

    readonly rendererDiagnosticsPos: Vector2i;

    readonly audioMeterTextPos: Vector2i;

    readonly customBars: readonly Rect2i[];

    /** 1 px row gaps between stacked overlay bands (top stack, custom rows, palette/hint). */
    readonly rowGapRects: readonly Rect2i[];

    /** 1 px separator below the top overlay cluster (between overlay and demo content). */
    readonly topClusterSeparator: Rect2i;

    /** 1 px separator above the bottom hint bar (between demo content and overlay footer). */
    readonly bottomClusterSeparator: Rect2i;
}
