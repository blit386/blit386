import type { BitmapFont } from '../../assets/BitmapFont';
import type { OverlayRow } from '../../core/IBTDemo';
import { Vector2i } from '../../utils/Vector2i';
import { drawOverlayLabelWithDividers } from '../labels';
import { OVERLAY_EDGE_MARGIN_PX, OVERLAY_TOP_TEXT_Y } from '../layout/constants';
import { overlayBitmapTextPaletteOffset, overlayRightAlignedTextX } from '../layout/layoutHelpers';
import type { OverlayLayoutPlan } from '../layout/types';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';

/** Default bar and text palette indices for overlay drawing. */
export interface OverlayBarStyle {
    readonly barIndex: number;
    readonly textIndex: number;
}

/**
 * Draws fixed and custom overlay bars and labels from a layout plan.
 */
export class OverlayBars {
    readonly #customLeftPos: Vector2i[] = [];

    readonly #customRightPos: Vector2i[] = [];

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
     * @param isDrawTop - When true, draws the separator below the top overlay cluster.
     * @param isDrawBottom - When true, draws the separator above the bottom overlay cluster.
     */
    drawClusterSeparators(
        target: OverlayDrawTarget,
        plan: OverlayLayoutPlan,
        gapIndex: number,
        isDrawTop: boolean,
        isDrawBottom: boolean,
    ): void {
        if (isDrawTop) {
            target.drawBarFill(plan.topClusterSeparator, gapIndex);
        }

        if (isDrawBottom) {
            target.drawBarFill(plan.bottomClusterSeparator, gapIndex);
        }
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
     * Draws the palette band background fill when the overlay body is visible.
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

            const rightText = row.rightText;

            if (rightText !== undefined && rightText.length > 0) {
                rightPos.y = barY + OVERLAY_TOP_TEXT_Y;
                rightPos.x = overlayRightAlignedTextX(rightText, displayWidth);

                target.drawLabel(font, rightPos, rightText, textPaletteOffset);
            }
        }
        /* eslint-enable security/detect-object-injection */
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
