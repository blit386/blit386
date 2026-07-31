/**
 * Palette swatch hover tooltips and clipboard copy for the overlay.
 */

import type { BitmapFont } from '../../assets/BitmapFont';
import type { PointerInput } from '../../input/PointerInput';
import { POINTER_SLOT_COUNT } from '../../input/PointerInput';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { SYSTEM_CHAR_ADVANCE } from '../constants';
import { POINTER_PRIMARY_BUTTON } from '../input/constants';
import { OVERLAY_EDGE_MARGIN_PX } from '../layout/constants';
import { overlayBitmapTextPaletteOffset } from '../layout/layoutHelpers';
import type { OverlayLayoutPlan } from '../layout/types';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';
import type { PaletteGridLayout } from '../types';
import {
    computeScrollbarThumbHeight,
    PALETTE_GRID_PADDING_PX,
    PALETTE_SCROLLBAR_EDGE_PADDING_PX,
    resolveHintExclusionRect,
    writeScrollbarRects,
    writeSwatchTopLeft,
} from './PaletteView';

/** Reserved width on the right edge of the palette band excluded from swatch hits (scrollbar). */
export const PALETTE_SCROLLBAR_TRACK_WIDTH_PX = 4;

/** Minimum wheel delta in pixels before advancing one palette row. */
const SCROLL_WHEEL_ROW_PX = 8;

/** Minimum pointer drag delta in pixels before advancing one palette row. */
const SCROLL_DRAG_ROW_PX = 4;

/** Duration for transient copy status tooltips in seconds. */
export const PALETTE_COPY_STATUS_SECONDS = 0.75;

/** Gap between the tooltip body bottom edge and the swatch top edge. */
const TOOLTIP_GAP_ABOVE_SWATCH_PX = 1;

/** Clipboard copy feedback state for palette swatch presses. */
type CopyStatus = 'idle' | 'copied' | 'failed';

/** Scratch rects and points reused by tooltip layout and draw (one overlay at a time). */
const tooltipScratch = {
    body: new Rect2i(),
    swatch: new Rect2i(),
    outlineEdge: new Rect2i(),
    textPos: new Vector2i(),
};

/**
 * Returns whether a palette slot at the given swatch origin overlaps the hint exclusion rect.
 *
 * @param swatchX - Swatch left edge in display pixels.
 * @param swatchY - Swatch top edge in display pixels.
 * @param swatchSize - Side length of the swatch.
 * @param hintExclusion - Region reserved for the toggle hint icon.
 * @returns `true` when the swatch should not receive hits or draws.
 */
function isSwatchOverlappingWithHintExclusion(
    swatchX: number,
    swatchY: number,
    swatchSize: number,
    hintExclusion: Rect2i,
): boolean {
    const ex = hintExclusion;

    return !(
        ex.x >= swatchX + swatchSize ||
        ex.x + ex.width <= swatchX ||
        ex.y >= swatchY + swatchSize ||
        ex.y + ex.height <= swatchY
    );
}

/**
 * Tests whether a pointer lies outside the palette band, including the scrollbar track.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param bandRight - Right edge of the hittable band (excludes scrollbar track).
 * @returns `true` when the pointer is outside the swatch hit region (including over the scrollbar track).
 */
function isPointerOutsideBand(pointerX: number, pointerY: number, paletteBand: Rect2i, bandRight: number): boolean {
    return (
        pointerX < paletteBand.x ||
        pointerX >= bandRight ||
        pointerY < paletteBand.y ||
        pointerY >= paletteBand.y + paletteBand.height
    );
}

/**
 * Maps band-local coordinates to a palette index, or `null` when not over a swatch cell.
 *
 * @param localX - X relative to the grid origin inside the palette band.
 * @param localY - Y relative to the grid origin inside the palette band.
 * @param cols - Grid column count.
 * @param swatchSize - Swatch side length in pixels.
 * @param gap - Gap between swatches.
 * @param scrollRowOffset - First visible grid row.
 * @param colorCount - Active palette slot count.
 * @returns Palette index, or `null` when the point is in padding or out of range.
 */
function resolveIndexAtBandLocal(
    localX: number,
    localY: number,
    cols: number,
    swatchSize: number,
    gap: number,
    scrollRowOffset: number,
    colorCount: number,
): number | null {
    if (localX < 0 || localY < 0) {
        return null;
    }

    const pitch = swatchSize + gap;
    const col = Math.floor(localX / pitch);
    const row = Math.floor(localY / pitch);

    if (col >= cols) {
        return null;
    }

    const inSwatchX = localX - col * pitch;

    if (inSwatchX >= swatchSize) {
        return null;
    }

    const inSwatchY = localY - row * pitch;

    if (inSwatchY >= swatchSize) {
        return null;
    }

    const index = (scrollRowOffset + row) * cols + col;

    if (index < 0 || index >= colorCount) {
        return null;
    }

    return index;
}

/**
 * Maps a pointer position to a palette swatch index, or `null` when no swatch is under the point.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param colorCount - Active palette slot count.
 * @param hintExclusion - Region to skip for the toggle hint icon.
 * @param displayWidth - Logical display width for scrollbar track exclusion.
 * @param scrollRowOffset - First visible grid row (default `0`).
 * @param scrollbarTrackWidth - Right-edge track width excluded from hits (default {@link PALETTE_SCROLLBAR_TRACK_WIDTH_PX}).
 * @returns Palette index, or `null` when the pointer is not over a hittable swatch.
 */
export function hitTestSwatch(
    pointerX: number,
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    colorCount: number,
    hintExclusion: Rect2i,
    displayWidth: number,
    scrollRowOffset = 0,
    scrollbarTrackWidth = PALETTE_SCROLLBAR_TRACK_WIDTH_PX,
): number | null {
    const { cols, swatchSize, gap } = grid;

    if (cols <= 0 || swatchSize <= 0 || colorCount <= 0) {
        return null;
    }

    const bandRight =
        Math.min(paletteBand.x + paletteBand.width, displayWidth) -
        scrollbarTrackWidth -
        PALETTE_SCROLLBAR_EDGE_PADDING_PX;

    if (isPointerOutsideBand(pointerX, pointerY, paletteBand, bandRight)) {
        return null;
    }

    const localX = pointerX - (paletteBand.x + OVERLAY_EDGE_MARGIN_PX);
    const localY = pointerY - (paletteBand.y + PALETTE_GRID_PADDING_PX);
    const index = resolveIndexAtBandLocal(localX, localY, cols, swatchSize, gap, scrollRowOffset, colorCount);

    if (index === null) {
        return null;
    }

    const swatchScratch = tooltipScratch.swatch;

    writeSwatchTopLeft(swatchScratch, index, paletteBand, grid, scrollRowOffset);

    if (isSwatchOverlappingWithHintExclusion(swatchScratch.x, swatchScratch.y, swatchSize, hintExclusion)) {
        return null;
    }

    return index;
}

/**
 * Returns the maximum scroll row offset for a palette grid viewport.
 *
 * @param grid - Precomputed grid layout.
 * @returns Last valid `scrollRowOffset` (0 when all rows are visible).
 */
export function maxScrollRowOffset(grid: PaletteGridLayout): number {
    return Math.max(0, grid.rows - grid.visibleRows);
}

/**
 * Clamps a scroll row offset into the valid range for a palette grid viewport.
 *
 * @param offset - Requested first visible row.
 * @param grid - Precomputed grid layout.
 * @returns Clamped offset in `[0, maxScrollRowOffset]`.
 */
export function clampScrollRowOffset(offset: number, grid: PaletteGridLayout): number {
    const maxOffset = maxScrollRowOffset(grid);

    if (offset <= 0) {
        return 0;
    }

    if (offset >= maxOffset) {
        return maxOffset;
    }

    return offset;
}

/**
 * Returns whether a pointer lies inside the palette footer scroll region.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @returns `true` when wheel or drag scrolling may apply.
 */
function isPointerInScrollRegion(pointerX: number, pointerY: number, paletteBand: Rect2i): boolean {
    return (
        pointerX >= paletteBand.x &&
        pointerX < paletteBand.x + paletteBand.width &&
        pointerY >= paletteBand.y &&
        pointerY < paletteBand.y + paletteBand.height
    );
}

/**
 * Returns whether a pointer lies inside the palette scrollbar track.
 *
 * @param pointerX - Pointer X in display coordinates.
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param scrollRowOffset - First visible grid row.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns `true` when the pointer is over the track rect.
 */
export function isPointerInScrollbarTrack(
    pointerX: number,
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    scrollRowOffset: number,
    trackWidth: number,
): boolean {
    const trackScratch = tooltipScratch.swatch;
    const thumbScratch = tooltipScratch.outlineEdge;

    if (!writeScrollbarRects(trackScratch, thumbScratch, paletteBand, grid, scrollRowOffset, trackWidth)) {
        return false;
    }

    return (
        pointerX >= trackScratch.x &&
        pointerX < trackScratch.x + trackScratch.width &&
        pointerY >= trackScratch.y &&
        pointerY < trackScratch.y + trackScratch.height
    );
}

/**
 * Maps a pointer Y position within the scrollbar track to a scroll row offset.
 *
 * @param pointerY - Pointer Y in display coordinates.
 * @param paletteBand - Palette band rect from the layout plan.
 * @param grid - Precomputed grid layout.
 * @param trackWidth - Scrollbar track width in pixels.
 * @returns Clamped scroll row offset.
 */
export function resolveScrollRowOffsetFromTrackPointerY(
    pointerY: number,
    paletteBand: Rect2i,
    grid: PaletteGridLayout,
    trackWidth: number,
): number {
    const maxOffset = maxScrollRowOffset(grid);

    if (maxOffset <= 0) {
        return 0;
    }

    const trackScratch = tooltipScratch.swatch;
    const thumbScratch = tooltipScratch.outlineEdge;

    writeScrollbarRects(trackScratch, thumbScratch, paletteBand, grid, 0, trackWidth);

    const trackTop = trackScratch.y;
    const trackHeight = trackScratch.height;
    const thumbHeight = computeScrollbarThumbHeight(trackHeight, grid);
    const scrollRange = Math.max(1, trackHeight - thumbHeight);
    const localY = pointerY - trackTop - Math.floor(thumbHeight / 2);
    const ratio = localY / scrollRange;
    const offset = Math.round(ratio * maxOffset);

    return clampScrollRowOffset(offset, grid);
}

/** Layout output for a docked palette swatch tooltip. */
export interface PaletteTooltipLayout {
    /** Tooltip label body in display coordinates. */
    readonly body: Rect2i;

    /** Bitmap text draw position (top-left of glyphs). */
    readonly textPos: Vector2i;
}

/**
 * Lays out a docked tooltip above a swatch with clamping inside the display.
 *
 * @param target - Reusable layout object written in place.
 * @param swatchRect - Swatch bounds in display coordinates.
 * @param label - Tooltip label text.
 * @param displayWidth - Logical display width.
 * @param displayHeight - Logical display height.
 * @returns `target` for chaining.
 */
export function layoutTooltip(
    target: PaletteTooltipLayout,
    swatchRect: Rect2i,
    label: string,
    displayWidth: number,
    displayHeight: number,
): PaletteTooltipLayout {
    const textWidth = label.length * SYSTEM_CHAR_ADVANCE;
    const bodyWidth = textWidth + 7;
    const bodyHeight = 13;
    const swatchCenterX = swatchRect.x + Math.floor(swatchRect.width / 2);

    let bodyX = swatchCenterX - Math.floor(bodyWidth / 2);
    let bodyY = swatchRect.y - bodyHeight - TOOLTIP_GAP_ABOVE_SWATCH_PX;

    if (bodyX < 0) {
        bodyX = 0;
    }

    if (bodyX + bodyWidth > displayWidth) {
        bodyX = Math.max(0, displayWidth - bodyWidth);
    }

    if (bodyY < 0) {
        bodyY = 0;
    }

    if (bodyY + bodyHeight > displayHeight) {
        bodyY = Math.max(0, displayHeight - bodyHeight);
    }

    target.body.set(bodyX, bodyY, bodyWidth, bodyHeight);
    target.textPos.set(bodyX + 4, bodyY);

    return target;
}

/**
 * Draws a docked palette swatch tooltip body and 1px border.
 *
 * @param target - Overlay draw target.
 * @param layout - Tooltip layout from {@link layoutTooltip}.
 * @param barIndex - Palette index for tooltip body fill (overlay background).
 * @param textIndex - Palette index for the border stroke.
 */
export function drawTooltipChrome(
    target: OverlayDrawTarget,
    layout: PaletteTooltipLayout,
    barIndex: number,
    textIndex: number,
): void {
    target.drawBarFillOnTop(layout.body, barIndex);

    const edge = tooltipScratch.outlineEdge;
    const x0 = layout.body.x;
    const y0 = layout.body.y;
    const x1 = layout.body.x + layout.body.width - 1;
    const y1 = layout.body.y + layout.body.height - 1;

    target.drawBarFillOnTop(edge.set(x0, y0, x1 - x0 + 1, 1), textIndex);
    target.drawBarFillOnTop(edge.set(x0, y1, x1 - x0 + 1, 1), textIndex);

    if (y1 - y0 > 1) {
        target.drawBarFillOnTop(edge.set(x0, y0 + 1, 1, y1 - y0 - 1), textIndex);
        target.drawBarFillOnTop(edge.set(x1, y0 + 1, 1, y1 - y0 - 1), textIndex);
    }
}

/**
 * Draws a docked palette swatch tooltip label.
 *
 * @param target - Overlay draw target.
 * @param font - System bitmap font.
 * @param layout - Tooltip layout from {@link layoutTooltip}.
 * @param label - Tooltip label text.
 * @param textIndex - Palette index for label text.
 */
export function drawTooltipLabel(
    target: OverlayDrawTarget,
    font: BitmapFont,
    layout: PaletteTooltipLayout,
    label: string,
    textIndex: number,
): void {
    if (label.length === 0) {
        return;
    }

    const textPaletteOffset = overlayBitmapTextPaletteOffset(textIndex);

    target.drawLabelOnTop(font, layout.textPos, label, textPaletteOffset);
}

/**
 * Writes palette index text to the clipboard when the API is available.
 *
 * @param index - Palette slot to copy.
 * @returns Resolves on success; rejects when clipboard is unavailable or denied.
 */
export async function writeIndexToClipboard(index: number): Promise<void> {
    const clipboard = globalThis.navigator?.clipboard;

    if (!clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
    }

    await clipboard.writeText(String(index));
}

/**
 * Handles palette swatch hover, copy-on-press, and tooltip rendering for the overlay.
 */
export class PaletteInteraction {
    readonly #targetFps: number;

    #hoveredIndex: number | null = null;

    #copyStatus: CopyStatus = 'idle';

    #copyStatusIndex = -1;

    #copyStatusExpiryTick = -1;

    #tooltipLabel = '';

    #tooltipLabelKey = '';

    #scrollRowOffset = 0;

    #scrollbarTrackWidth = PALETTE_SCROLLBAR_TRACK_WIDTH_PX;

    #scrollDragSlot: number | null = null;

    #scrollDragStartY = 0;

    #scrollDragStartOffset = 0;

    /** Latest fixed-update tick observed from {@link tickCopyStatus} or {@link handlePress}. */
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

            if (pointer.isButtonPressed(POINTER_PRIMARY_BUTTON, slot)) {
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
     * Clears transient copy status when the expiry tick is reached.
     *
     * @param currentTick - Current fixed-update tick.
     */
    tickCopyStatus(currentTick: number): void {
        this.#lastKnownTick = currentTick;

        if (this.#copyStatusExpiryTick >= 0 && currentTick >= this.#copyStatusExpiryTick) {
            this.#copyStatus = 'idle';
            this.#copyStatusIndex = -1;
            this.#copyStatusExpiryTick = -1;
            this.#tooltipLabelKey = '';
        }
    }

    /**
     * Updates hovered swatch index from the current pointer position.
     *
     * @param pointer - Pointer subsystem, or `null` when unavailable.
     * @param plan - Layout plan for this frame.
     * @param grid - Palette grid layout.
     * @param colorCount - Active palette slot count.
     * @param hintBarTopY - Top Y of the bottom hint bar for icon exclusion.
     * @param displayWidth - Logical display width.
     */
    updateHover(
        pointer: PointerInput | null,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        colorCount: number,
        hintBarTopY: number,
        displayWidth: number,
    ): void {
        if (plan.paletteBand.height <= 0 || grid.cols <= 0) {
            this.#hoveredIndex = null;

            return;
        }

        if (!pointer) {
            this.#hoveredIndex = null;

            return;
        }

        const hintExclusion = resolveHintExclusionRect(hintBarTopY, displayWidth);
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
                hintExclusion,
                displayWidth,
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
     * @param hintBarTopY - Top Y of the bottom hint bar for icon exclusion.
     * @param displayWidth - Logical display width.
     * @returns `true` when a swatch press was handled (toggle should be skipped).
     */
    handlePress(
        pointer: PointerInput | null,
        currentTick: number,
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        colorCount: number,
        hintBarTopY: number,
        displayWidth: number,
    ): boolean {
        if (plan.paletteBand.height <= 0 || grid.cols <= 0 || !pointer) {
            return false;
        }

        this.#lastKnownTick = currentTick;

        const hintExclusion = resolveHintExclusionRect(hintBarTopY, displayWidth);

        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!pointer.isButtonPressed(POINTER_PRIMARY_BUTTON, slot)) {
                continue;
            }

            const pos = pointer.getPos(slot);
            const index = hitTestSwatch(
                pos.x,
                pos.y,
                plan.paletteBand,
                grid,
                colorCount,
                hintExclusion,
                displayWidth,
                this.#scrollRowOffset,
                this.#scrollbarTrackWidth,
            );

            if (index === null) {
                continue;
            }

            void (async () => {
                try {
                    await writeIndexToClipboard(index);
                    this.#setCopyStatus('copied', index, this.#lastKnownTick);
                } catch {
                    this.#setCopyStatus('failed', index, this.#lastKnownTick);
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
        const active = this.#layoutActiveTooltip(plan, grid, displayWidth, displayHeight);

        if (active === null) {
            return;
        }

        drawTooltipChrome(target, active.layout, barIndex, textIndex);
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
        const active = this.#layoutActiveTooltip(plan, grid, displayWidth, displayHeight);

        if (active === null) {
            return;
        }

        drawTooltipLabel(target, font, active.layout, active.label, textIndex);
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
            if (!pointer.isButtonDown(POINTER_PRIMARY_BUTTON, slot) || !pointer.isActive(slot)) {
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

            const deltaY = pos.y - this.#scrollDragStartY;
            const rowStep = Math.trunc(deltaY / SCROLL_DRAG_ROW_PX);

            if (rowStep !== 0) {
                this.#scrollRowOffset = clampScrollRowOffset(this.#scrollDragStartOffset - rowStep, grid);
            }
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
     * @returns Tooltip layout and label, or `null`.
     */
    #layoutActiveTooltip(
        plan: OverlayLayoutPlan,
        grid: PaletteGridLayout,
        displayWidth: number,
        displayHeight: number,
    ): { layout: PaletteTooltipLayout; label: string } | null {
        const label = this.#resolveTooltipLabel();

        if (label.length === 0) {
            return null;
        }

        const index = this.#copyStatus === 'idle' ? this.#hoveredIndex : this.#copyStatusIndex;

        if (index === null || index < 0) {
            return null;
        }

        writeSwatchTopLeft(tooltipScratch.swatch, index, plan.paletteBand, grid, this.#scrollRowOffset);

        const layout = layoutTooltip(tooltipScratch, tooltipScratch.swatch, label, displayWidth, displayHeight);

        return { layout, label };
    }

    /**
     * Updates transient copy feedback after a clipboard write attempt.
     *
     * @param status - New copy status.
     * @param index - Palette index that was copied.
     * @param completionTick - Fixed-update tick when the clipboard write finished.
     */
    #setCopyStatus(status: Exclude<CopyStatus, 'idle'>, index: number, completionTick: number): void {
        this.#copyStatus = status;
        this.#copyStatusIndex = index;
        this.#copyStatusExpiryTick = completionTick + Math.ceil(PALETTE_COPY_STATUS_SECONDS * this.#targetFps);
        this.#tooltipLabelKey = '';
    }

    /**
     * Returns the tooltip label for hover or copy status, caching the last resolved string.
     *
     * @returns Tooltip label for the current hover or copy status.
     */
    #resolveTooltipLabel(): string {
        let label: string;

        if (this.#copyStatus === 'copied') {
            label = `Copied ${this.#copyStatusIndex}`;
        } else if (this.#copyStatus === 'failed') {
            label = 'Copy failed';
        } else if (this.#hoveredIndex !== null) {
            label = String(this.#hoveredIndex);
        } else {
            label = '';
        }

        const key = `${this.#hoveredIndex}:${this.#copyStatus}:${this.#copyStatusIndex}`;

        if (key !== this.#tooltipLabelKey) {
            this.#tooltipLabelKey = key;
            this.#tooltipLabel = label;
        }

        return this.#tooltipLabel;
    }
}
