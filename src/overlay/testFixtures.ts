/**
 * Shared mocks and helpers for overlay unit tests.
 */

import { vi } from 'vitest';

import type { BitmapFont } from '../assets/BitmapFont';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { OVERLAY_BAR_HEIGHT } from './layout/constants';
import { customBarY } from './layout/layoutHelpers';
import type { OverlayRenderer } from './OverlayDrawTarget';

/** Parsed {@link OverlayDrawTarget.drawLabel} call from a mock renderer. */
export type BitmapTextCall = {
    pos: Vector2i;
    text: string;
    paletteOffset: number;
};

/**
 * Creates a `vi.fn` mock paired with an array of derived snapshots, one per call.
 *
 * Draw helpers reuse scratch `Rect2i`/`Vector2i` instances, so recording the raw call
 * arguments would capture their final mutated state instead of the value at call time.
 *
 * @param snapshot - Derives a defensive-copy snapshot from a call's arguments.
 * @returns The mock function and the array its snapshots are pushed onto, in call order.
 */
function createSnapshotMock<TArgs extends unknown[], TSnapshot>(
    snapshot: (...args: TArgs) => TSnapshot,
): { mock: ReturnType<typeof vi.fn>; snapshots: TSnapshot[] } {
    const snapshots: TSnapshot[] = [];
    const mock = vi.fn((...args: TArgs) => {
        snapshots.push(snapshot(...args));
    });

    return { mock, snapshots };
}

/**
 * Minimal renderer stub for {@link Overlay.updateAndRender}.
 *
 * @returns Renderer with spied camera, bar fills, and bitmap text draws.
 */
export function createMockRenderer(): OverlayRenderer & {
    drawBitmapText: ReturnType<typeof vi.fn>;
    drawLabel: ReturnType<typeof vi.fn> & { posSnapshots: Vector2i[] };
    drawLabelOnTop: ReturnType<typeof vi.fn> & { posSnapshots: Vector2i[] };
    drawPixel: ReturnType<typeof vi.fn>;
    drawRectFill: ReturnType<typeof vi.fn>;
    drawBarFill: ReturnType<typeof vi.fn> & { rectSnapshots: Rect2i[] };
    drawBarFillOnTop: ReturnType<typeof vi.fn> & { rectSnapshots: Rect2i[] };
} {
    const barFillMock = createSnapshotMock((rect: Rect2i) => new Rect2i(rect.x, rect.y, rect.width, rect.height));
    const drawBarFill = barFillMock.mock as ReturnType<typeof vi.fn> & { rectSnapshots: Rect2i[] };

    drawBarFill.rectSnapshots = barFillMock.snapshots;

    const barFillOnTopMock = createSnapshotMock((rect: Rect2i) => new Rect2i(rect.x, rect.y, rect.width, rect.height));
    const drawBarFillOnTop = barFillOnTopMock.mock as ReturnType<typeof vi.fn> & { rectSnapshots: Rect2i[] };

    drawBarFillOnTop.rectSnapshots = barFillOnTopMock.snapshots;

    // Positions are snapshotted because draw helpers reuse scratch Vector2i instances.
    const labelMock = createSnapshotMock((_font: unknown, pos: Vector2i) => new Vector2i(pos.x, pos.y));
    const drawLabel = labelMock.mock as ReturnType<typeof vi.fn> & { posSnapshots: Vector2i[] };

    drawLabel.posSnapshots = labelMock.snapshots;

    const labelOnTopMock = createSnapshotMock((_font: unknown, pos: Vector2i) => new Vector2i(pos.x, pos.y));
    const drawLabelOnTop = labelOnTopMock.mock as ReturnType<typeof vi.fn> & { posSnapshots: Vector2i[] };

    drawLabelOnTop.posSnapshots = labelOnTopMock.snapshots;

    const drawPixel = vi.fn();
    const drawRect = vi.fn();

    return {
        getCameraOffset: vi.fn(() => Vector2i.zero()),
        resetCamera: vi.fn(),
        setCameraOffset: vi.fn(),
        drawRectFill: vi.fn(),
        drawBarFill,
        drawBarFillOnTop,
        drawRect,
        drawBitmapText: vi.fn(),
        drawLabel,
        drawLabelOnTop,
        drawPixel,
    } as never;
}

/**
 * Collects {@link OverlayDrawTarget.drawLabel} calls from a mock renderer.
 *
 * @param renderer - Mock from {@link createMockRenderer}.
 * @returns Parsed draw calls in invocation order.
 */
export function getBitmapTextCalls(renderer: ReturnType<typeof createMockRenderer>): BitmapTextCall[] {
    return renderer.drawLabel.mock.calls.map((call, callIndex) => ({
        pos: renderer.drawLabel.posSnapshots.at(callIndex) as Vector2i,
        text: call[2] as string,
        paletteOffset: (call[3] as number | undefined) ?? 0,
    }));
}

/**
 * Collects {@link OverlayDrawTarget.drawLabelOnTop} calls from a mock renderer.
 *
 * @param renderer - Mock from {@link createMockRenderer}.
 * @returns Parsed draw calls in invocation order.
 */
export function getLabelOnTopCalls(renderer: ReturnType<typeof createMockRenderer>): BitmapTextCall[] {
    return renderer.drawLabelOnTop.mock.calls.map((call, callIndex) => ({
        pos: renderer.drawLabelOnTop.posSnapshots.at(callIndex) as Vector2i,
        text: call[2] as string,
        paletteOffset: (call[3] as number | undefined) ?? 0,
    }));
}

/**
 * Collects {@link OverlayDrawTarget.drawBarFill} rects from a mock renderer.
 *
 * @param renderer - Mock from {@link createMockRenderer}.
 * @returns Filled rectangles in invocation order.
 */
export function getRectFillCalls(renderer: ReturnType<typeof createMockRenderer>): Rect2i[] {
    return [...renderer.drawBarFill.rectSnapshots];
}

/**
 * Y of custom row bar top stacked above the footer.
 *
 * @param displayHeight - Logical display height.
 * @param rowIndex - Custom row index.
 * @param footerHeight - Reserved footer height from {@link resolveOverlayFooterHeight}.
 * @returns Bar top Y.
 */
export function customRowBarY(displayHeight: number, rowIndex: number, footerHeight = OVERLAY_BAR_HEIGHT): number {
    const footerStackTopY = displayHeight - footerHeight;

    return customBarY(footerStackTopY, rowIndex);
}

export const mockFont = { lineHeight: 14 } as BitmapFont;

export { OVERLAY_BAR_HEIGHT, OVERLAY_EDGE_MARGIN_PX, OVERLAY_ROW_GAP_PX, OVERLAY_TOP_TEXT_Y } from './layout/constants';
