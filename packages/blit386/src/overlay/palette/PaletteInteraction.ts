/**
 * Palette swatch hover, copy-on-press, and scroll state for the overlay; hit testing lives in
 * `hitTest.ts`, tooltip layout and draw in `tooltip.ts`.
 */

import type { BitmapFont } from '../../assets/BitmapFont';
import type { PointerInput } from '../../input/PointerInput';
import { POINTER_SLOT_COUNT } from '../../input/PointerInput';
import { CODE_A } from '../../input/pointerSlot';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import type { OverlayLayoutPlan } from '../layout/types';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';
import type { PaletteGridLayout } from '../types';
import {
    clampScrollRowOffset,
    hitTestSwatch,
    isPointerInScrollbarTrack,
    isPointerInScrollRegion,
    maxScrollRowOffset,
    PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
    resolveScrollRowOffsetFromTrackPointerY,
} from './hitTest';
import { writeSwatchTopLeft } from './PaletteView';
import {
    drawTooltipChrome,
    drawTooltipLabel,
    layoutTooltip,
    type PaletteTooltipLayout,
    writeIndexToClipboard,
} from './tooltip';

/** Minimum wheel delta in pixels before advancing one palette row. */
const SCROLL_WHEEL_ROW_PX = 8;

/** Minimum pointer drag delta in pixels before advancing one palette row. */
const SCROLL_DRAG_ROW_PX = 4;

/** Duration for transient copy status tooltips in seconds. */
export const PALETTE_COPY_STATUS_SECONDS = 0.75;

/** Clipboard copy feedback state for palette swatch presses. */
type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Handles palette swatch hover, copy-on-press, and tooltip rendering for the overlay.
 */
export class PaletteInteraction {
    readonly #targetFps: number;

    /** Reused tooltip layout written by {@link layoutTooltip}. */
    readonly #tooltip = { body: new Rect2i(), textPos: new Vector2i() };

    /** Reused bounds of the swatch the tooltip docks to. */
    readonly #tooltipSwatch = new Rect2i();

    #hoveredIndex: number | null = null;

    #copyStatus: CopyStatus = 'idle';

    #copyStatusIndex = -1;

    /** Fixed-update ticks left before the copy status clears; counts down so a tick reset cannot strand it. */
    #copyStatusTicksLeft = 0;

    #tooltipLabel = '';

    /** Hovered-index watermark backing the cached tooltip label; `undefined` forces the first resolve. */
    #tooltipLabelHoveredIndex: number | null | undefined = undefined;

    /** Copy-status watermark backing the cached tooltip label. */
    #tooltipLabelCopyStatus: CopyStatus | undefined = undefined;

    /** Copy-status-index watermark backing the cached tooltip label. */
    #tooltipLabelCopyStatusIndex = Number.NaN;

    #scrollRowOffset = 0;

    #scrollbarTrackWidth = PALETTE_SCROLLBAR_TRACK_WIDTH_PX;

    #scrollDragSlot: number | null = null;

    #scrollDragStartY = 0;

    #scrollDragStartOffset = 0;

    /** Latest fixed-update tick observed from {@link tickCopyStatus}. */
    #lastKnownTick = 0;

    /**
     * Creates palette interaction state.
     *
     * @param targetFps - Configured fixed-update rate for copy-status timing.
     */
    constructor(targetFps: number) {
        this.#targetFps = targetFps;
    }

    /**
     * Current first visible palette grid row.
     *
     * @returns Scroll row offset in `[0, maxScrollRowOffset]`.
     */
    get scrollRowOffset(): number {
        return this.#scrollRowOffset;
    }

    /**
     * Scrollbar track width reserved on the right edge of the palette band.
     *
     * @returns Track width in pixels.
     */
    get scrollbarTrackWidth(): number {
        return this.#scrollbarTrackWidth;
    }

    /**
     * Clamps scroll offset when grid dimensions change between frames.
     *
     * @param grid - Precomputed grid layout for this frame.
     */
    syncScrollBounds(grid: PaletteGridLayout): void {
        this.#scrollRowOffset = clampScrollRowOffset(this.#scrollRowOffset, grid);
    }

    /**
     * Handles wheel and primary-drag scrolling for the palette footer region.
     *
     * Wheel delta is consumed only while the pointer is over the palette band so
     * demo code reading {@link BT.pointerScrollDelta} elsewhere is unaffected.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param isSwatchPressConsumed - When true, drag scrolling is skipped this frame.
     * @returns `true` when a scrollbar-track press should block the toggle corner.
     */
    handleScroll(
        pointer: PointerInput | null,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        isSwatchPressConsumed: boolean,
    ): boolean {
        if (plan.paletteBand.height <= 0 || grid.cols <= 0 || maxScrollRowOffset(grid) <= 0 || !pointer) {
            this.#scrollDragSlot = null;

            return false;
        }

        this.syncScrollBounds(grid);

        let isTogglePressConsumed = false;

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isActive(slot)) {
                if (this.#scrollDragSlot === slot) {
                    this.#scrollDragSlot = null;
                }

                continue;
            }

            const pos = pointer.getPos(slot);

            if (pointer.isButtonPressed(CODE_A, slot)) {
                if (
                    isPointerInScrollbarTrack(
                        pos.x,
                        pos.y,
                        plan.paletteBand,
                        grid,
                        this.#scrollRowOffset,
                        this.#scrollbarTrackWidth,
                    )
                ) {
                    this.#scrollDragSlot = slot;
                    this.#scrollDragStartY = pos.y;
                    this.#scrollDragStartOffset = this.#scrollRowOffset;
                    isTogglePressConsumed = true;
                }
            }
        }

        if (isSwatchPressConsumed) {
            this.#scrollDragSlot = null;
        } else {
            isTogglePressConsumed = this.#applyScrollDrag(pointer, plan, grid) || isTogglePressConsumed;
        }

        isTogglePressConsumed = this.#applyScrollWheel(pointer, plan, grid) || isTogglePressConsumed;

        return isTogglePressConsumed;
    }

    /**
     * Counts the copy status down by the ticks elapsed since the last call and clears it at zero.
     *
     * A tick counter that went backwards (`BT.ticksReset`, a `BT.renderAt` replay) restarted at `0`,
     * so the elapsed count is then `currentTick` itself.
     *
     * @param currentTick - Current fixed-update tick.
     */
    tickCopyStatus(currentTick: number): void {
        const elapsed = currentTick >= this.#lastKnownTick ? currentTick - this.#lastKnownTick : currentTick;

        this.#lastKnownTick = currentTick;

        if (this.#copyStatus === 'idle') {
            return;
        }

        this.#copyStatusTicksLeft -= elapsed;

        if (this.#copyStatusTicksLeft <= 0) {
            this.#copyStatus = 'idle';
            this.#copyStatusIndex = -1;
        }
    }

    /**
     * Updates hovered swatch index from the current pointer position.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param colorCount - Active palette slot count.
     */
    updateHover(
        pointer: PointerInput | null,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        colorCount: number,
    ): void {
        if (plan.paletteBand.height <= 0 || grid.cols <= 0) {
            this.#hoveredIndex = null;

            return;
        }

        if (!pointer) {
            this.#hoveredIndex = null;

            return;
        }

        let hovered: number | null = null;

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isActive(slot)) {
                continue;
            }

            const pos = pointer.getPos(slot);
            const hit = hitTestSwatch(
                pos.x,
                pos.y,
                plan.paletteBand,
                grid,
                colorCount,
                this.#scrollRowOffset,
                this.#scrollbarTrackWidth,
            );

            if (hit !== null) {
                hovered = hit;

                break;
            }
        }

        this.#hoveredIndex = hovered;
    }

    /**
     * Handles primary press over a swatch and attempts clipboard copy.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param currentTick - Current fixed-update tick.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param colorCount - Active palette slot count.
     * @returns `true` when a swatch press was handled (toggle should be skipped).
     */
    handlePress(
        pointer: PointerInput | null,
        currentTick: number,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        colorCount: number,
    ): boolean {
        if (plan.paletteBand.height <= 0 || grid.cols <= 0 || !pointer) {
            return false;
        }

        this.tickCopyStatus(currentTick);

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isButtonPressed(CODE_A, slot)) {
                continue;
            }

            const pos = pointer.getPos(slot);
            const index = hitTestSwatch(
                pos.x,
                pos.y,
                plan.paletteBand,
                grid,
                colorCount,
                this.#scrollRowOffset,
                this.#scrollbarTrackWidth,
            );

            if (index === null) {
                continue;
            }

            void (async () => {
                try {
                    await writeIndexToClipboard(index);
                    this.#setCopyStatus('copied', index);
                } catch {
                    this.#setCopyStatus('failed', index);
                }
            })();

            return true;
        }

        return false;
    }

    /**
     * Draws tooltip body and border during the overlay fill phase.
     *
     * @param target - Overlay draw target.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param displayWidth - Logical display width.
     * @param displayHeight - Logical display height.
     * @param barIndex - Tooltip body fill palette index.
     * @param textIndex - Tooltip border palette index.
     */
    drawTooltipChrome(
        target: OverlayDrawTarget,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        displayWidth: number,
        displayHeight: number,
        barIndex: number,
        textIndex: number,
    ): void {
        const layout = this.#layoutActiveTooltip(plan, grid, displayWidth, displayHeight);

        if (layout !== null) {
            drawTooltipChrome(target, layout, barIndex, textIndex);
        }
    }

    /**
     * Draws tooltip label text during the overlay label phase.
     *
     * @param target - Overlay draw target.
     * @param font - System bitmap font.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param displayWidth - Logical display width.
     * @param displayHeight - Logical display height.
     * @param textIndex - Tooltip label palette index.
     */
    drawTooltipLabel(
        target: OverlayDrawTarget,
        font: BitmapFont,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        displayWidth: number,
        displayHeight: number,
        textIndex: number,
    ): void {
        const layout = this.#layoutActiveTooltip(plan, grid, displayWidth, displayHeight);

        if (layout !== null) {
            drawTooltipLabel(target, font, layout, this.#tooltipLabel, textIndex);
        }
    }

    /**
     * Applies wheel scrolling when the pointer is over the palette footer region.
     *
     * @param pointer - Pointer subsystem.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @returns `true` when wheel delta was consumed.
     */
    #applyScrollWheel(pointer: PointerInput, plan: OverlayLayoutPlan, grid: PaletteGridLayout): boolean {
        const scrollDelta = pointer.getScrollDelta();

        if (scrollDelta === 0) {
            return false;
        }

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isActive(slot)) {
                continue;
            }

            const pos = pointer.getPos(slot);

            if (!isPointerInScrollRegion(pos.x, pos.y, plan.paletteBand)) {
                continue;
            }

            const rowStep = Math.max(1, Math.trunc(Math.abs(scrollDelta) / SCROLL_WHEEL_ROW_PX));
            const nextOffset = this.#scrollRowOffset + (scrollDelta > 0 ? rowStep : -rowStep);

            this.#scrollRowOffset = clampScrollRowOffset(nextOffset, grid);
            pointer.consumeScrollDelta();

            return true;
        }

        return false;
    }

    /**
     * Applies primary-button drag scrolling over the palette grid or scrollbar track.
     *
     * @param pointer - Pointer subsystem.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @returns `true` when drag scrolling consumed a toggle-corner press.
     */
    #applyScrollDrag(pointer: PointerInput, plan: OverlayLayoutPlan, grid: PaletteGridLayout): boolean {
        let isTogglePressConsumed = false;

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isButtonDown(CODE_A, slot) || !pointer.isActive(slot)) {
                if (this.#scrollDragSlot === slot) {
                    this.#scrollDragSlot = null;
                }

                continue;
            }

            const pos = pointer.getPos(slot);
            const isInScrollRegion = isPointerInScrollRegion(pos.x, pos.y, plan.paletteBand);

            if (!isInScrollRegion && this.#scrollDragSlot !== slot) {
                continue;
            }

            if (
                isPointerInScrollbarTrack(
                    pos.x,
                    pos.y,
                    plan.paletteBand,
                    grid,
                    this.#scrollRowOffset,
                    this.#scrollbarTrackWidth,
                )
            ) {
                isTogglePressConsumed = true;
            }

            if (this.#scrollDragSlot === slot) {
                if (
                    isPointerInScrollbarTrack(
                        pos.x,
                        pos.y,
                        plan.paletteBand,
                        grid,
                        this.#scrollRowOffset,
                        this.#scrollbarTrackWidth,
                    )
                ) {
                    this.#scrollRowOffset = resolveScrollRowOffsetFromTrackPointerY(
                        pos.y,
                        plan.paletteBand,
                        grid,
                        this.#scrollbarTrackWidth,
                    );
                } else {
                    const deltaY = pos.y - this.#scrollDragStartY;
                    const rowStep = Math.trunc(deltaY / SCROLL_DRAG_ROW_PX);

                    this.#scrollRowOffset = clampScrollRowOffset(this.#scrollDragStartOffset - rowStep, grid);
                }

                continue;
            }

            if (!isInScrollRegion) {
                continue;
            }

            this.#scrollDragSlot = slot;
            this.#scrollDragStartY = pos.y;
            this.#scrollDragStartOffset = this.#scrollRowOffset;
        }

        return isTogglePressConsumed;
    }

    /**
     * Lays out the active hover or copy-status tooltip, or returns `null` when none applies.
     *
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param displayWidth - Logical display width.
     * @param displayHeight - Logical display height.
     * @returns Tooltip layout (label in {@link #tooltipLabel}), or `null`.
     */
    #layoutActiveTooltip(
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        displayWidth: number,
        displayHeight: number,
    ): PaletteTooltipLayout | null {
        const label = this.#resolveTooltipLabel();

        if (label.length === 0) {
            return null;
        }

        const index = this.#copyStatus === 'idle' ? this.#hoveredIndex : this.#copyStatusIndex;

        if (index === null || index < 0) {
            return null;
        }

        writeSwatchTopLeft(this.#tooltipSwatch, index, plan.paletteBand, grid, this.#scrollRowOffset);

        return layoutTooltip(this.#tooltip, this.#tooltipSwatch, label, displayWidth, displayHeight);
    }

    /**
     * Updates transient copy feedback after a clipboard write attempt.
     *
     * @param status - New copy status.
     * @param index - Palette index that was copied.
     */
    #setCopyStatus(status: Exclude<CopyStatus, 'idle'>, index: number): void {
        this.#copyStatus = status;
        this.#copyStatusIndex = index;
        this.#copyStatusTicksLeft = Math.ceil(PALETTE_COPY_STATUS_SECONDS * this.#targetFps);
    }

    /**
     * Returns the tooltip label for hover or copy status, caching the last resolved string.
     *
     * Compares the three scalar fields the label is derived from directly, instead of building
     * a template-string cache key every call.
     *
     * @returns Tooltip label for the current hover or copy status.
     */
    #resolveTooltipLabel(): string {
        if (
            this.#hoveredIndex === this.#tooltipLabelHoveredIndex &&
            this.#copyStatus === this.#tooltipLabelCopyStatus &&
            this.#copyStatusIndex === this.#tooltipLabelCopyStatusIndex
        ) {
            return this.#tooltipLabel;
        }

        this.#tooltipLabelHoveredIndex = this.#hoveredIndex;
        this.#tooltipLabelCopyStatus = this.#copyStatus;
        this.#tooltipLabelCopyStatusIndex = this.#copyStatusIndex;

        if (this.#copyStatus === 'copied') {
            this.#tooltipLabel = `Copied ${this.#copyStatusIndex}`;
        } else if (this.#copyStatus === 'failed') {
            this.#tooltipLabel = 'Copy failed';
        } else if (this.#hoveredIndex !== null) {
            this.#tooltipLabel = String(this.#hoveredIndex);
        } else {
            this.#tooltipLabel = '';
        }

        return this.#tooltipLabel;
    }
}
