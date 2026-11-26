import type { BitmapFont } from '../../assets/BitmapFont';
import type { OverlayRow } from '../../core/IBTDemo';
import { Vector2i } from '../../utils/Vector2i';
import { drawOverlayLabelWithDividers } from '../labels';
import { OVERLAY_EDGE_MARGIN_PX, OVERLAY_TOP_TEXT_Y } from '../layout/constants';
import { overlayBitmapTextPaletteOffset, overlayRightAlignedTextX } from '../layout/layoutHelpers';
import type { OverlayLayoutPlan } from '../layout/types';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';
import type { OverlayRowText } from '../types';

/** Default bar and text palette indices for overlay drawing. */
export interface OverlayBarStyle {
    /** Bar fill palette index, used where a row sets no `barPaletteIndex`. */
    readonly barIndex: number;

    /** Text palette index, used where a row sets no `textPaletteIndex`. */
    readonly textIndex: number;
}

/** What one custom row drew last frame; reused across frames so recording allocates nothing. */
interface DrawnRow {
    /** Left label as drawn. */
    leftText: string;

    /** Left label X, in display pixels. */
    leftX: number;

    /** Empty when the row drew no right label. */
    rightText: string;

    /** Right label X, in display pixels; stale when {@link rightText} is empty. */
    rightX: number;

    /** Top Y of both labels, in display pixels. */
    y: number;
}

/**
 * Draws fixed and custom overlay bars and labels from a layout plan.
 */
export class OverlayBars {
    /** Pooled left-label positions, one per custom row. */
    readonly #customLeftPos: Vector2i[] = [];

    /** Pooled right-label positions, one per custom row. */
    readonly #customRightPos: Vector2i[] = [];

    /** Pooled records of what each custom row drew; only the first draw counts are live. */
    readonly #drawnRows: DrawnRow[] = [];

    /** Live entries in {@link #drawnRows} for the last frame. */
    #drawnCount = 0;

    /**
     * Draws 1 px row gaps between stacked overlay bands.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan.
     * @param gapIndex - Palette index for gap fills.
     */
    drawRowGaps(target: OverlayDrawTarget, plan: OverlayLayoutPlan, gapIndex: number): void {
        for (const gapRect of plan.rowGapRects) {
            target.drawBarFill(gapRect, gapIndex);
        }
    }

    /**
     * Draws boundary separators between overlay clusters and demo content.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan.
     * @param gapIndex - Palette index for separator fills.
     */
    drawClusterSeparators(target: OverlayDrawTarget, plan: OverlayLayoutPlan, gapIndex: number): void {
        target.drawBarFill(plan.topClusterSeparator, gapIndex);
        target.drawBarFill(plan.bottomClusterSeparator, gapIndex);
    }

    /**
     * Draws title, timing chart, metrics, timing text, renderer diagnostics, and audio meter bar fills.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan.
     * @param barIndex - Palette index for bar fills.
     */
    drawTopBars(target: OverlayDrawTarget, plan: OverlayLayoutPlan, barIndex: number): void {
        target.drawBarFill(plan.titleBar, barIndex);

        if (plan.timingChart.height > 0) {
            target.drawBarFill(plan.timingChart, barIndex);
        }

        target.drawBarFill(plan.metricsBar, barIndex);
        target.drawBarFill(plan.timingTextBar, barIndex);

        if (plan.rendererDiagnosticsBar.height > 0) {
            target.drawBarFill(plan.rendererDiagnosticsBar, barIndex);
        }

        if (plan.audioMeterBar.height > 0) {
            target.drawBarFill(plan.audioMeterBar, barIndex);
        }
    }

    /**
     * Draws the palette band background fill when the plan reserves a palette band.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan.
     * @param barIndex - Palette index for bar fills.
     */
    drawPaletteBandFill(target: OverlayDrawTarget, plan: OverlayLayoutPlan, barIndex: number): void {
        if (plan.paletteBand.height > 0) {
            target.drawBarFill(plan.paletteBand, barIndex);
        }
    }

    /**
     * Draws the bottom hint bar background fill.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan.
     * @param barIndex - Palette index for bar fills.
     */
    drawHintBarFill(target: OverlayDrawTarget, plan: OverlayLayoutPlan, barIndex: number): void {
        target.drawBarFill(plan.hintBar, barIndex);
    }

    /**
     * Draws built-in top overlay text labels (excluding the footer hint).
     *
     * Engine-composed labels render their `|` separators as 1 px full-row-height
     * dividers in the gap palette index; the demo title is user content and keeps
     * literal pipes.
     *
     * @param target - Overlay draw target.
     * @param font - System bitmap font.
     * @param plan - Computed layout plan.
     * @param style - Default overlay palette indices.
     * @param gapIndex - Palette index for in-row separator dividers (same as row gaps).
     * @param topLeftLabel - Demo title (left).
     * @param topRightLabel - Backend and resolution (right).
     * @param topMetricsLabel - Present FPS / target / draw calls line.
     * @param topTimingLabel - Frame / update / render ms line.
     * @param rendererDiagnosticsLabel - Optional GPU diagnostics line; omitted when empty.
     */
    drawTopLabels(
        target: OverlayDrawTarget,
        font: BitmapFont,
        plan: OverlayLayoutPlan,
        style: OverlayBarStyle,
        gapIndex: number,
        topLeftLabel: string,
        topRightLabel: string,
        topMetricsLabel: string,
        topTimingLabel: string,
        rendererDiagnosticsLabel = '',
    ): void {
        const textPaletteOffset = overlayBitmapTextPaletteOffset(style.textIndex);

        target.drawLabel(font, plan.topLeftPos, topLeftLabel, textPaletteOffset);

        drawOverlayLabelWithDividers(
            target,
            font,
            plan.topRightPos,
            topRightLabel,
            plan.titleBar,
            textPaletteOffset,
            gapIndex,
        );

        drawOverlayLabelWithDividers(
            target,
            font,
            plan.topMetricsPos,
            topMetricsLabel,
            plan.metricsBar,
            textPaletteOffset,
            gapIndex,
        );

        drawOverlayLabelWithDividers(
            target,
            font,
            plan.topTimingPos,
            topTimingLabel,
            plan.timingTextBar,
            textPaletteOffset,
            gapIndex,
        );

        if (rendererDiagnosticsLabel.length > 0 && plan.rendererDiagnosticsBar.height > 0) {
            drawOverlayLabelWithDividers(
                target,
                font,
                plan.rendererDiagnosticsPos,
                rendererDiagnosticsLabel,
                plan.rendererDiagnosticsBar,
                textPaletteOffset,
                gapIndex,
            );
        }
    }

    /**
     * Draws demo-supplied custom row bar fills from the layout plan.
     *
     * @param target - Overlay draw target.
     * @param plan - Computed layout plan with custom bar rects.
     * @param rows - Custom overlay rows.
     * @param style - Default overlay palette indices.
     */
    drawCustomRowFills(
        target: OverlayDrawTarget,
        plan: OverlayLayoutPlan,
        rows: readonly OverlayRow[],
        style: OverlayBarStyle,
    ): void {
        const rowCount = rows.length;

        /* eslint-disable security/detect-object-injection -- rowIndex bounded by rows.length */
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const row = rows[rowIndex];
            const barRect = plan.customBars[rowIndex];

            if (row === undefined || barRect === undefined) {
                continue;
            }

            const barIndex = row.barPaletteIndex ?? style.barIndex;

            target.drawBarFill(barRect, barIndex);
        }
        /* eslint-enable security/detect-object-injection */
    }

    /**
     * Draws demo-supplied custom row labels from the layout plan.
     *
     * @param target - Overlay draw target.
     * @param font - System bitmap font.
     * @param plan - Computed layout plan with custom bar rects.
     * @param rows - Custom overlay rows.
     * @param style - Default overlay palette indices.
     */
    drawCustomRowLabels(
        target: OverlayDrawTarget,
        font: BitmapFont,
        plan: OverlayLayoutPlan,
        rows: readonly OverlayRow[],
        style: OverlayBarStyle,
    ): void {
        const rowCount = rows.length;

        if (rowCount === 0) {
            return;
        }

        this.#ensureCustomRowPool(rowCount);
        this.#drawnCount = 0;

        const displayWidth = plan.titleBar.width;

        /* eslint-disable security/detect-object-injection -- rowIndex bounded by rows.length */
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const row = rows[rowIndex];
            const barRect = plan.customBars[rowIndex];
            const leftPos = this.#customLeftPos[rowIndex];
            const rightPos = this.#customRightPos[rowIndex];

            if (row === undefined || barRect === undefined || leftPos === undefined || rightPos === undefined) {
                continue;
            }

            const textIndex = row.textPaletteIndex ?? style.textIndex;
            const textPaletteOffset = overlayBitmapTextPaletteOffset(textIndex);
            const barY = barRect.y;

            leftPos.y = barY + OVERLAY_TOP_TEXT_Y;

            target.drawLabel(font, leftPos, row.leftText, textPaletteOffset);

            const drawn = this.#nextDrawnRow();

            drawn.leftText = row.leftText;
            drawn.leftX = leftPos.x;
            drawn.y = leftPos.y;
            drawn.rightText = '';

            const rightText = row.rightText;

            if (rightText !== undefined && rightText.length > 0) {
                rightPos.y = barY + OVERLAY_TOP_TEXT_Y;
                rightPos.x = overlayRightAlignedTextX(rightText, displayWidth);

                target.drawLabel(font, rightPos, rightText, textPaletteOffset);

                drawn.rightText = rightText;
                drawn.rightX = rightPos.x;
            }
        }
        /* eslint-enable security/detect-object-injection */
    }

    /** Forgets the rows drawn so far, so a frame that draws none reads as empty. */
    resetDrawnRows(): void {
        this.#drawnCount = 0;
    }

    /**
     * The custom-row labels the last frame drew, in the order `overlayRows()` returned the rows (the first row sits lowest,
     * just above the footer), left label before right. Builds a fresh array, so call
     * it on demand (a dev-build readout), never per frame.
     *
     * @returns One entry per non-empty label, in display pixels.
     */
    drawnRows(): OverlayRowText[] {
        const texts: OverlayRowText[] = [];

        for (let rowIndex = 0; rowIndex < this.#drawnCount; rowIndex++) {
            // eslint-disable-next-line security/detect-object-injection -- rowIndex bounded by #drawnCount
            const drawn = this.#drawnRows[rowIndex];

            if (drawn === undefined) {
                continue;
            }

            if (drawn.leftText.length > 0) {
                texts.push({ side: 'left', text: drawn.leftText, x: drawn.leftX, y: drawn.y });
            }

            if (drawn.rightText.length > 0) {
                texts.push({ side: 'right', text: drawn.rightText, x: drawn.rightX, y: drawn.y });
            }
        }

        return texts;
    }

    /**
     * Claims the next pooled record for the row being drawn, growing the pool only the first time a count is reached.
     *
     * @returns The record to fill.
     */
    #nextDrawnRow(): DrawnRow {
        let drawn = this.#drawnRows[this.#drawnCount];

        if (drawn === undefined) {
            drawn = { leftText: '', leftX: 0, rightText: '', rightX: 0, y: 0 };

            this.#drawnRows.push(drawn);
        }

        this.#drawnCount++;

        return drawn;
    }

    /**
     * Ensures the custom-row scratch pool has at least `count` entries.
     *
     * @param count - Number of demo rows to draw this frame.
     */
    #ensureCustomRowPool(count: number): void {
        while (this.#customLeftPos.length < count) {
            this.#customLeftPos.push(new Vector2i(OVERLAY_EDGE_MARGIN_PX, 0));
            this.#customRightPos.push(new Vector2i(0, 0));
        }
    }
}
