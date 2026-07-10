/**
 * Screen-space overlay HUD orchestrator.
 *
 * Delegates layout planning, bar drawing, toggle input, timing chart,
 * and palette grid to submodules under `overlay/`.
 */

import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import type {
    Backend,
    OverlayAudioMeterStyle,
    OverlayRow,
    OverlayStyle,
    OverlayTimingChartDiagnosticsMode,
    OverlayTimingChartStyle,
} from '../core/IBTDemo';
import type { KeyboardInput } from '../input/KeyboardInput';
import type { PointerInput } from '../input/PointerInput';
import { AudioMeter } from './audio-meter/AudioMeter';
import { DEFAULT_AUDIO_METER_HEIGHT } from './audio-meter/constants';
import type { AudioMeterDrawStyle } from './audio-meter/style';
import { resolveAudioMeterStyle } from './audio-meter/style';
import { OverlayBars } from './bars/Bars';
import {
    DEFAULT_IDX_BG,
    DEFAULT_IDX_TEXT,
    OVERLAY_FPS_FIELD_WIDTH,
    OVERLAY_MS_FIELD_WIDTH,
    OVERLAY_UPDATE_STEPS_FIELD_WIDTH,
} from './constants';
import { OVERLAY_TOGGLE_KEY_CODE } from './input/constants';
import { Toggle } from './input/Toggle';
import { padOverlayField } from './labels';
import { buildOverlayLayoutPlan, createDefaultLayoutConfig, createOverlayLayoutPlanScratch } from './layout/layoutPlan';
import type { OverlayLayout, OverlayLayoutConfig, OverlayLayoutPlan } from './layout/types';
import type { OverlayRenderer } from './OverlayDrawTarget';
import { toggleIcon } from './OverlayToggleIcon';
import { PaletteInteraction } from './palette/PaletteInteraction';
import { computeGrid, DEFAULT_PALETTE_GRID, PaletteView } from './palette/PaletteView';
import { FpsSampler } from './sampling/FpsSampler';
import { TimingSampler } from './sampling/TimingSampler';
import { DEFAULT_TIMING_CHART_HEIGHT } from './timing-chart/constants';
import type { TimingChartDrawStyle } from './timing-chart/style';
import { resolveTimingChartStyle } from './timing-chart/style';
import { TimingChart } from './timing-chart/TimingChart';
import type { OverlayAudioSnapshot, OverlayTimingSnapshot } from './types';

/** Empty usage mask for overlay draws when palette tracking is inactive. */
const EMPTY_PALETTE_USAGE_MASK = new Uint8Array(0);

/**
 * Resolves overlay bar/text/gap palette indices from optional {@link OverlayStyle}.
 *
 * @param style - Optional configure-time overlay style.
 * @returns Resolved palette indices for overlay chrome.
 */
function resolveStyleIndices(style?: OverlayStyle): { bg: number; gap: number; text: number } {
    const bg = style?.barPaletteIndex ?? DEFAULT_IDX_BG;
    const text = style?.textPaletteIndex ?? DEFAULT_IDX_TEXT;

    return { bg, text, gap: style?.gapPaletteIndex ?? bg };
}

/**
 * Creates a timing chart instance and resets its ring buffer when enabled.
 *
 * @param layout - Cached display layout.
 * @param isEnabled - Whether the timing chart band is active.
 * @param targetFps - Configured fixed-update rate.
 * @param diagnosticsMode - Renderer diagnostic visualization mode.
 * @returns Configured {@link TimingChart} for the overlay.
 */
function createTimingChart(
    layout: OverlayLayout,
    isEnabled: boolean,
    targetFps: number,
    diagnosticsMode: OverlayTimingChartDiagnosticsMode,
): TimingChart {
    const chart = new TimingChart(isEnabled, targetFps, isEnabled ? diagnosticsMode : false);

    if (isEnabled) {
        chart.reset(layout.displayWidth, 0);
    }

    return chart;
}

/**
 * Creates an audio meter instance with the given feature flag.
 *
 * @param isEnabled - Whether the audio meter band is active.
 * @returns Configured {@link AudioMeter} for the overlay.
 */
function createAudioMeter(isEnabled: boolean): AudioMeter {
    return new AudioMeter(isEnabled);
}

/**
 * Formats a millisecond timing value to one decimal place, padded to the fixed overlay field width.
 *
 * @param valueMs - Timing value in milliseconds.
 * @returns Padded `X.X` text for the `Frame`/`update()`/`render()` metrics row.
 */
function formatOverlayMsField(valueMs: number): string {
    return padOverlayField(valueMs.toFixed(1), OVERLAY_MS_FIELD_WIDTH);
}

/**
 * Screen-space overlay HUD rendered after demo content each frame.
 *
 * Internal to the engine; demos do not instantiate this class. Use
 * {@link HardwareSettings.isOverlayEnabled} and {@link BT.activeBackend} instead.
 */
export class Overlay {
    readonly #layout: OverlayLayout;

    readonly #topLeftLabel: string;

    readonly #topRightLabel: string;

    readonly #targetFps: number;

    readonly #fps: FpsSampler;

    readonly #timing: TimingSampler = new TimingSampler();

    readonly #toggle: Toggle;

    readonly #isToggleHintVisible: boolean;

    readonly #bars: OverlayBars = new OverlayBars();

    readonly #timingChart: TimingChart;

    readonly #timingChartHeight: number;

    readonly #isOverlayRendererDiagnosticsBarEnabled: boolean;

    readonly #timingChartStyle: TimingChartDrawStyle;

    readonly #audioMeter: AudioMeter;

    readonly #audioMeterHeight: number;

    readonly #audioMeterStyle: AudioMeterDrawStyle;

    readonly #paletteView: PaletteView;

    readonly #paletteInteraction: PaletteInteraction;

    readonly #paletteColumns: number | undefined;

    readonly #paletteRowsVisible: number | undefined;

    readonly #layoutScratch = createOverlayLayoutPlanScratch();

    readonly #barStyle = { barIndex: DEFAULT_IDX_BG, textIndex: DEFAULT_IDX_TEXT };

    #idxBg = DEFAULT_IDX_BG;

    #idxText = DEFAULT_IDX_TEXT;

    #idxGap = DEFAULT_IDX_BG;

    /**
     * Creates an overlay with fixed layout and text strings.
     *
     * @param layout - Cached display layout from {@link createOverlayLayout}.
     * @param topLeftLabel - Short title shown on the top-left.
     * @param targetFps - Configured fixed-update rate for the target FPS line.
     * @param activeBackend - Backend started by BTAPI (`webgpu` or `software`).
     * @param style - Optional palette indices from {@link HardwareSettings.overlayStyle}.
     * @param isOverlayPaletteEnabled - When true, draws the live palette swatch grid.
     * @param paletteColumns - Optional max swatches per row from {@link HardwareSettings.overlayPaletteColumns}.
     * @param paletteRowsVisible - Optional max visible palette grid rows from {@link HardwareSettings.overlayPaletteRowsVisible}.
     * @param isOverlayTimingChartEnabled - When true, draws the update/render timing chart band.
     * @param timingChartStyle - Optional timing chart palette overrides.
     * @param timingChartHeight - Chart band height in pixels (default 22).
     * @param timingChartDiagnostics - Chart renderer diagnostic mode (`minimal`, `rich`, or `false`).
     * @param isOverlayRendererDiagnosticsBarEnabled - When true, draws the GPU diagnostics text row.
     * @param isOverlayVisibleAtStart - Initial overlay body visibility (default false).
     * @param isOverlayToggleHintVisible - Draw toggle hint while body hidden (default true).
     * @param isOverlayToggleEnabled - Enable Backquote and corner toggle input (default true).
     * @param isOverlayAudioMetersEnabled - When true, draws the per-bus level and voice/steal/drop band.
     * @param audioMeterStyle - Optional audio meter palette overrides.
     * @param audioMeterHeight - Audio meter band height in pixels (default 13).
     */
    constructor(
        layout: OverlayLayout,
        topLeftLabel: string,
        targetFps: number,
        activeBackend: Backend,
        style?: OverlayStyle,
        isOverlayPaletteEnabled = false,
        paletteColumns?: number,
        paletteRowsVisible?: number,
        isOverlayTimingChartEnabled = false,
        timingChartStyle?: OverlayTimingChartStyle,
        timingChartHeight?: number,
        timingChartDiagnostics: OverlayTimingChartDiagnosticsMode = false,
        isOverlayRendererDiagnosticsBarEnabled = false,
        isOverlayVisibleAtStart = false,
        isOverlayToggleHintVisible = true,
        isOverlayToggleEnabled = true,
        isOverlayAudioMetersEnabled = false,
        audioMeterStyle?: OverlayAudioMeterStyle,
        audioMeterHeight?: number,
    ) {
        this.#layout = layout;
        this.#topLeftLabel = topLeftLabel;
        this.#targetFps = targetFps;
        this.#fps = new FpsSampler(this.#targetFps);

        const indices = resolveStyleIndices(style);

        this.#idxBg = indices.bg;
        this.#idxText = indices.text;
        this.#idxGap = indices.gap;
        this.#topRightLabel = `${activeBackend}|${layout.displayWidth}x${layout.displayHeight}`;
        this.#timingChartStyle = resolveTimingChartStyle(style, timingChartStyle);
        this.#timingChartHeight = timingChartHeight ?? DEFAULT_TIMING_CHART_HEIGHT;
        this.#timingChart = createTimingChart(layout, isOverlayTimingChartEnabled, targetFps, timingChartDiagnostics);
        this.#isOverlayRendererDiagnosticsBarEnabled = isOverlayRendererDiagnosticsBarEnabled;
        this.#audioMeterStyle = resolveAudioMeterStyle(style, audioMeterStyle);
        this.#audioMeterHeight = audioMeterHeight ?? DEFAULT_AUDIO_METER_HEIGHT;
        this.#audioMeter = createAudioMeter(isOverlayAudioMetersEnabled);
        this.#paletteView = new PaletteView(isOverlayPaletteEnabled);
        this.#paletteInteraction = new PaletteInteraction(targetFps);
        this.#paletteColumns = paletteColumns;
        this.#paletteRowsVisible = paletteRowsVisible;
        this.#toggle = new Toggle(isOverlayVisibleAtStart, isOverlayToggleEnabled);
        this.#isToggleHintVisible = isOverlayToggleHintVisible;
    }

    /**
     * Whether the overlay body is currently drawn (runtime toggle).
     *
     * @returns `true` while metrics bars and palette grid are rendered.
     */
    get isBodyVisible(): boolean {
        return this.#toggle.isBodyVisible;
    }

    /**
     * Whether demo draw calls should populate the per-frame palette usage mask.
     *
     * True when the palette swatch grid is configured and the overlay body is visible.
     * BTAPI gates per-frame palette usage tracking on this flag.
     *
     * @returns `true` when sprite/text palette usage scanning is needed.
     */
    get isTrackingPaletteUsage(): boolean {
        return this.#paletteView.isEnabled && this.#toggle.isBodyVisible;
    }

    /**
     * Records a timing-chart event tag at the current tick.
     *
     * No-op when the timing chart is disabled.
     *
     * @param label - Tag text; empty becomes `"Untitled"`.
     * @param currentTick - Current fixed-update tick (`BT.ticks`).
     */
    assignTag(label: string | undefined, currentTick: number): void {
        if (!this.#timingChart.isEnabled) {
            return;
        }

        this.#timingChart.assignTag(label, currentTick);
    }

    /**
     * Handles overlay frame input: palette swatch copy first, then body toggle.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param isTogglePressed - Whether the Backquote toggle key edge fired this frame. The caller must
     * sample this before the keyboard subsystem's end-of-tick edge reset runs; see {@link Toggle.handleInput}.
     * @param currentTick - Current fixed-update tick for keyboard edge detection.
     * @param getCustomRows - Optional supplier for demo rows (layout plan for palette hits).
     * @param palette - Active demo palette for slot count, if any.
     */
    handleFrameInput(
        pointer: PointerInput | null,
        isTogglePressed: boolean,
        currentTick: number,
        getCustomRows?: () => readonly OverlayRow[] | undefined,
        palette?: Palette | null,
    ): void {
        let isPointerPressConsumed = false;

        if (this.#paletteView.isEnabled && this.#toggle.isBodyVisible) {
            const customRows = getCustomRows?.();
            const { layoutConfig, plan } = this.#buildFramePlan(customRows?.length ?? 0, palette);
            const grid = layoutConfig.paletteGrid;
            const colorCount = palette?.size ?? 256;

            if (grid !== undefined && plan.paletteBand.height > 0) {
                this.#paletteInteraction.syncScrollBounds(grid);

                isPointerPressConsumed = this.#paletteInteraction.handlePress(
                    pointer,
                    currentTick,
                    plan,
                    grid,
                    colorCount,
                    plan.hintBar.y,
                    this.#layout.displayWidth,
                );

                isPointerPressConsumed =
                    this.#paletteInteraction.handleScroll(pointer, plan, grid, isPointerPressConsumed) ||
                    isPointerPressConsumed;
            }
        }

        this.#toggle.handleInput(pointer, isTogglePressed, this.#layout.toggleRect, isPointerPressConsumed);
    }

    /**
     * Handles toggle input (Backquote and bottom-left corner press).
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link handleFrameInput} instead. Unlike
     * `handleFrameInput`, this reads the keyboard directly at call time, so it remains susceptible to
     * missing a Backquote press that a fixed-update tick already consumed this frame.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param keyboard - Keyboard subsystem, or `null` when unavailable.
     * @param currentTick - Current fixed-update tick for keyboard edge detection.
     */
    handleToggle(pointer: PointerInput | null, keyboard: KeyboardInput | null, currentTick: number): void {
        const isTogglePressed = keyboard?.isKeyPressed(OVERLAY_TOGGLE_KEY_CODE, undefined, currentTick) ?? false;

        this.handleFrameInput(pointer, isTogglePressed, currentTick);
    }

    /**
     * Draws the overlay. Toggle input is handled earlier in the frame by BTAPI
     * ({@link BTAPI.beginRenderFrame}) so palette usage tracking matches visibility.
     *
     * @param renderer - Active {@link OverlayRenderer} instance.
     * @param font - System bitmap font.
     * @param pointer - Pointer subsystem for palette swatch hover tooltips.
     * @param _keyboard - Reserved; toggle input is handled in BTAPI before render.
     * @param currentTick - Current fixed-update tick for copy-status expiry.
     * @param getCustomRows - Optional supplier for demo rows; not invoked while the overlay body is hidden.
     * @param timing - Optional timing snapshot from the previous rendered frame.
     * @param palette - Active demo palette for optional palette grid.
     * @param usedPaletteMask - Per-frame palette usage mask populated during demo render.
     * @param audioSnapshot - Optional audio snapshot (bus levels and voice counters) from the previous rendered frame.
     */
    updateAndRender(
        renderer: OverlayRenderer,
        font: BitmapFont,
        pointer: PointerInput | null,
        _keyboard: KeyboardInput | null,
        currentTick: number,
        getCustomRows?: () => readonly OverlayRow[] | undefined,
        timing?: OverlayTimingSnapshot,
        palette?: Palette | null,
        usedPaletteMask: Uint8Array = EMPTY_PALETTE_USAGE_MASK,
        audioSnapshot?: OverlayAudioSnapshot,
    ): void {
        // Chart history keeps advancing while hidden so re-show reflects demo-only timing.
        this.#sampleTiming(timing);
        this.#sampleAudio(audioSnapshot);

        const isBodyVisible = this.#toggle.isBodyVisible;

        if (!isBodyVisible && !this.#isToggleHintVisible) {
            return;
        }

        if (isBodyVisible) {
            this.#fps.sample();
        }

        const customRows = isBodyVisible ? getCustomRows?.() : undefined;
        const { layoutConfig, plan } = this.#buildFramePlan(customRows?.length ?? 0, palette);

        this.#withCamera(renderer, () => {
            this.#drawFrame(
                renderer,
                font,
                plan,
                layoutConfig,
                isBodyVisible,
                customRows,
                palette,
                usedPaletteMask,
                pointer,
                currentTick,
            );
        });
    }

    /**
     * Records timing samples when a snapshot is provided.
     *
     * @param timing - Optional timing snapshot from the previous rendered frame.
     */
    #sampleTiming(timing?: OverlayTimingSnapshot): void {
        if (!timing) {
            return;
        }

        this.#timing.sample(timing);
        this.#timingChart.sample(timing);
    }

    /**
     * Records an audio sample when a snapshot is provided.
     *
     * @param audioSnapshot - Optional audio snapshot from the previous rendered frame.
     */
    #sampleAudio(audioSnapshot?: OverlayAudioSnapshot): void {
        if (!audioSnapshot) {
            return;
        }

        this.#audioMeter.sample(audioSnapshot);
    }

    /**
     * Builds per-frame layout config including optional palette grid dimensions.
     *
     * @param customRowCount - Demo custom row count for this frame.
     * @param palette - Active demo palette, if any.
     * @returns Layout config for {@link buildOverlayLayoutPlan}.
     */
    #createLayoutConfig(customRowCount: number, palette: Palette | null | undefined): OverlayLayoutConfig {
        const isOverlayPaletteEnabled = this.#paletteView.isEnabled;
        const colorCount = palette?.size ?? 256;

        const paletteGrid = isOverlayPaletteEnabled
            ? computeGrid(
                  this.#layout.displayWidth,
                  undefined,
                  colorCount,
                  undefined,
                  this.#paletteColumns,
                  this.#paletteRowsVisible,
              )
            : undefined;

        return {
            ...createDefaultLayoutConfig(
                this.#layout.displayWidth,
                this.#layout.displayHeight,
                this.#layout.lineHeight,
                customRowCount,
            ),
            isOverlayPaletteEnabled,
            isOverlayTimingChartEnabled: this.#timingChart.isEnabled,
            timingChartHeight: this.#timingChartHeight,
            isOverlayRendererDiagnosticsBarEnabled: this.#isOverlayRendererDiagnosticsBarEnabled,
            isOverlayAudioMetersEnabled: this.#audioMeter.isEnabled,
            audioMeterHeight: this.#audioMeterHeight,
            ...(paletteGrid === undefined ? {} : { paletteGrid }),
        };
    }

    /**
     * Builds the per-frame layout plan shared by body and hint-only draws.
     *
     * @param customRowCount - Demo custom row count for this frame.
     * @param palette - Active demo palette, if any.
     * @returns Layout config and computed plan.
     */
    #buildFramePlan(
        customRowCount: number,
        palette: Palette | null | undefined,
    ): { layoutConfig: OverlayLayoutConfig; plan: OverlayLayoutPlan } {
        const layoutConfig = this.#createLayoutConfig(customRowCount, palette);

        const plan = buildOverlayLayoutPlan(
            layoutConfig,
            this.#layoutScratch,
            this.#topRightLabel,
            this.#layout.toggleRect,
        );

        return { layoutConfig, plan };
    }

    /**
     * Resets camera for screen-space overlay drawing.
     *
     * @param renderer - Active renderer.
     * @param draw - Callback that issues overlay draws.
     */
    #withCamera(renderer: OverlayRenderer, draw: () => void): void {
        const savedCamera = renderer.getCameraOffset();

        renderer.resetCamera();

        try {
            draw();
        } finally {
            renderer.setCameraOffset(savedCamera);
        }
    }

    /**
     * Draws overlay content for one frame.
     *
     * Body panels and the footer hint bar draw only when the `isBodyVisible`
     * parameter is true. The toggle hint icon draws whenever this method runs;
     * when the body is visible it renders inverted (cutout) against the hint bar,
     * otherwise as a solid glyph.
     *
     * @param renderer - Active renderer.
     * @param font - System bitmap font.
     * @param plan - Computed layout plan for this frame.
     * @param layoutConfig - Layout config used to build the plan.
     * @param isBodyVisible - Whether metrics bars and palette grid should draw.
     * @param customRows - Optional demo rows, if any.
     * @param palette - Active demo palette.
     * @param usedPaletteMask - Per-frame palette usage mask from BTAPI.
     * @param pointer - Pointer subsystem for palette swatch hover, or `null` when unavailable.
     * @param currentTick - Current fixed-update tick for copy-status expiry.
     */
    #drawFrame(
        renderer: OverlayRenderer,
        font: BitmapFont,
        plan: OverlayLayoutPlan,
        layoutConfig: OverlayLayoutConfig,
        isBodyVisible: boolean,
        customRows: readonly OverlayRow[] | undefined,
        palette: Palette | null | undefined,
        usedPaletteMask: Uint8Array,
        pointer: PointerInput | null,
        currentTick: number,
    ): void {
        this.#barStyle.barIndex = this.#idxBg;
        this.#barStyle.textIndex = this.#idxText;

        let topMetricsLabel = '';
        let topTimingLabel = '';
        let rendererDiagnosticsLabel = '';
        const paletteGrid = layoutConfig.paletteGrid ?? DEFAULT_PALETTE_GRID;

        if (isBodyVisible) {
            const presentFps = padOverlayField(String(this.#fps.measuredFps), OVERLAY_FPS_FIELD_WIDTH);
            const frameMs = formatOverlayMsField(this.#timing.frameMs);
            const updateMs = formatOverlayMsField(this.#timing.updateMs);
            const renderMs = formatOverlayMsField(this.#timing.renderMs);
            const updateStepSuffix = padOverlayField(
                this.#timing.updateSteps > 1 ? `x${this.#timing.updateSteps}` : '',
                OVERLAY_UPDATE_STEPS_FIELD_WIDTH,
            );

            topMetricsLabel = `Present ${presentFps} FPS|Target ${this.#targetFps} FPS|Draw Calls ${this.#timing.drawCalls}`;

            topTimingLabel = `Frame ${frameMs}ms|update() ${updateMs}ms${updateStepSuffix}|` + `render() ${renderMs}ms`;

            if (this.#isOverlayRendererDiagnosticsBarEnabled) {
                rendererDiagnosticsLabel = this.#timing.formatRendererDiagnosticsLabel();
            }

            this.#bars.drawTopBars(renderer, plan, this.#idxBg);
            this.#timingChart.draw(renderer, plan.timingChart, this.#timingChartStyle, font, currentTick);
            this.#audioMeter.draw(renderer, plan.audioMeterBar, this.#audioMeterStyle, font);

            if (customRows !== undefined && customRows.length > 0) {
                this.#bars.drawCustomRowFills(renderer, plan, customRows, this.#barStyle);
            }

            this.#bars.drawPaletteBandFill(renderer, plan, this.#idxBg);

            this.#paletteView.draw(
                renderer,
                plan.paletteBand,
                palette ?? null,
                paletteGrid,
                plan.hintBar.y,
                this.#layout.displayWidth,
                usedPaletteMask,
                this.#idxText,
                this.#paletteInteraction.scrollRowOffset,
                this.#paletteInteraction.scrollbarTrackWidth,
                this.#idxText,
            );

            const colorCount = palette?.size ?? 256;

            this.#paletteInteraction.tickCopyStatus(currentTick);

            this.#paletteInteraction.updateHover(
                pointer,
                plan,
                paletteGrid,
                colorCount,
                plan.hintBar.y,
                this.#layout.displayWidth,
            );

            this.#bars.drawRowGaps(renderer, plan, this.#idxGap);
            this.#bars.drawClusterSeparators(renderer, plan, this.#idxGap, true, true);
        }

        if (isBodyVisible) {
            this.#bars.drawHintBarFill(renderer, plan, this.#idxBg);
        }

        if (isBodyVisible) {
            if (customRows !== undefined && customRows.length > 0) {
                this.#bars.drawCustomRowLabels(renderer, font, plan, customRows, this.#barStyle);
            }

            this.#bars.drawTopLabels(
                renderer,
                font,
                plan,
                this.#barStyle,
                this.#idxGap,
                this.#topLeftLabel,
                this.#topRightLabel,
                topMetricsLabel,
                topTimingLabel,
                rendererDiagnosticsLabel,
            );
        }

        toggleIcon(renderer, plan.hintBar.y, this.#idxText, isBodyVisible);

        if (isBodyVisible) {
            this.#paletteInteraction.drawTooltipChrome(
                renderer,
                plan,
                paletteGrid,
                this.#layout.displayWidth,
                this.#layout.displayHeight,
                this.#idxBg,
                this.#idxText,
            );

            this.#paletteInteraction.drawTooltipLabel(
                renderer,
                font,
                plan,
                paletteGrid,
                this.#layout.displayWidth,
                this.#layout.displayHeight,
                this.#idxText,
            );
        }
    }
}
