import { describe, expect, it } from 'vitest';

import { Vector2i } from '../../utils/Vector2i';
import { SYSTEM_CHAR_ADVANCE } from '../constants';
import { OVERLAY_TOGGLE_CORNER_HEIGHT, OVERLAY_TOGGLE_CORNER_WIDTH } from '../input/constants';
import { OVERLAY_EDGE_MARGIN_PX, OVERLAY_TOGGLE_HINT_ICON_NUDGE_X_PX, OVERLAY_TOP_TEXT_Y } from './constants';
import {
    createOverlayLayout,
    isPointerInOverlayToggleCorner,
    overlayRightAlignedTextX,
    overlayToggleHintIconX,
} from './layoutHelpers';

describe('createOverlayLayout', () => {
    it('sets display dimensions, topTextY and toggleRect properties', () => {
        const layout = createOverlayLayout(320, 240, 14);

        expect(layout.displayWidth).toBe(320);
        expect(layout.displayHeight).toBe(240);
        expect(layout.topTextY).toBe(OVERLAY_TOP_TEXT_Y);
        expect(layout.toggleRect.x).toBe(0);
        expect(layout.toggleRect.y).toBe(240 - OVERLAY_TOGGLE_CORNER_HEIGHT);
        expect(layout.toggleRect.width).toBe(OVERLAY_TOGGLE_CORNER_WIDTH);
        expect(layout.toggleRect.height).toBe(OVERLAY_TOGGLE_CORNER_HEIGHT);
    });
});

describe('overlayRightAlignedTextX', () => {
    it('places text flush right with edge margin (+1 px inset)', () => {
        const label = 'webgpu | 320x240';
        const width = label.length * SYSTEM_CHAR_ADVANCE;

        expect(overlayRightAlignedTextX(label, 320)).toBe(320 - width - OVERLAY_EDGE_MARGIN_PX + 1);
    });

    it('never places text left of the edge margin', () => {
        expect(overlayRightAlignedTextX('a very long label that exceeds the display', 32)).toBe(OVERLAY_EDGE_MARGIN_PX);
    });
});

describe('overlayToggleHintIconX', () => {
    it('anchors the toggle hint at the left edge margin plus the icon nudge', () => {
        expect(overlayToggleHintIconX()).toBe(OVERLAY_EDGE_MARGIN_PX + OVERLAY_TOGGLE_HINT_ICON_NUDGE_X_PX);
    });
});

describe('isPointerInOverlayToggleCorner', () => {
    it('returns true inside the bottom-left toggle region', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const top = 240 - OVERLAY_TOGGLE_CORNER_HEIGHT;

        expect(isPointerInOverlayToggleCorner(new Vector2i(12, top + 6), layout.toggleRect)).toBe(true);
        expect(isPointerInOverlayToggleCorner(new Vector2i(0, top), layout.toggleRect)).toBe(true);
    });

    it('returns false outside the toggle region', () => {
        const layout = createOverlayLayout(320, 240, 14);
        const top = 240 - OVERLAY_TOGGLE_CORNER_HEIGHT;

        expect(isPointerInOverlayToggleCorner(new Vector2i(300, 220), layout.toggleRect)).toBe(false);
        expect(
            isPointerInOverlayToggleCorner(new Vector2i(OVERLAY_TOGGLE_CORNER_WIDTH, top - 1), layout.toggleRect),
        ).toBe(false);
    });
});
