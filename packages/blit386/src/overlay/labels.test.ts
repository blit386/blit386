import { describe, expect, it } from 'vitest';

import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { OVERLAY_DIVIDER_GAP_PX, SYSTEM_CHAR_ADVANCE } from './constants';
import {
    drawOverlayLabelWithDividers,
    overlayDividerLabelWidth,
    padOverlayField,
    resolveOverlayTopLeftLabel,
} from './labels';
import { createMockRenderer, getBitmapTextCalls, mockFont } from './testFixtures';

describe('padOverlayField', () => {
    it('left-pads shorter text with spaces to reach the fixed width', () => {
        expect(padOverlayField('8.3', 4)).toBe(' 8.3');
        expect(padOverlayField('60', 3)).toBe(' 60');
    });

    it('reserves the fixed width even for an empty field', () => {
        expect(padOverlayField('', 2)).toBe('  ');
    });

    it('leaves text unchanged once it already meets or exceeds the fixed width', () => {
        expect(padOverlayField('123.4', 4)).toBe('123.4');
        expect(padOverlayField('x3', 2)).toBe('x3');
    });
});

describe('resolveOverlayTopLeftLabel', () => {
    it('formats registry-style page titles without a BLIT386 prefix', () => {
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo 006 - Patterns')).toBe('Patterns Demo');
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo 002 - Primitives')).toBe('Primitives Demo');
    });

    it('formats current number-free, en dash titles (the actual demo-registry.js output)', () => {
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo – Hypercube')).toBe('Hypercube Demo');
        expect(resolveOverlayTopLeftLabel('BLIT386 Demo – PipBoy CRT')).toBe('PipBoy CRT Demo');
    });

    it('falls back when title is empty', () => {
        expect(resolveOverlayTopLeftLabel('')).toBe('Demo');
        expect(resolveOverlayTopLeftLabel(undefined)).toBe('Demo');
    });

    it('passes through non-registry titles unchanged', () => {
        expect(resolveOverlayTopLeftLabel('Custom Page')).toBe('Custom Page');
    });
});

describe('drawOverlayLabelWithDividers', () => {
    const rowRect = new Rect2i(0, 20, 320, 13);
    const pos = new Vector2i(10, 23);

    /** Nominal advance from a segment's end to the next segment's start. */
    const separatorAdvance = 2 * OVERLAY_DIVIDER_GAP_PX;

    /** Divider line X for a segment ending at the given nominal advance end. */
    const dividerX = (segmentEnd: number): number => segmentEnd - 1 + OVERLAY_DIVIDER_GAP_PX;

    it('draws pipe-free labels unchanged with no divider fills', () => {
        const target = createMockRenderer();

        drawOverlayLabelWithDividers(target, mockFont, pos, 'Plain label', rowRect, 5, 7);

        expect(target.drawLabel).toHaveBeenCalledExactlyOnceWith(mockFont, pos, 'Plain label', 5);
        expect(target.drawBarFill).not.toHaveBeenCalled();
    });

    it('draws each pipe-separated segment at gap-spaced positions', () => {
        const target = createMockRenderer();

        drawOverlayLabelWithDividers(target, mockFont, pos, 'a|b|c', rowRect, 5, 7);

        const segmentA = pos.x;
        const segmentB = segmentA + SYSTEM_CHAR_ADVANCE + separatorAdvance;
        const segmentC = segmentB + SYSTEM_CHAR_ADVANCE + separatorAdvance;
        const calls = getBitmapTextCalls(target);

        expect(calls).toEqual([
            { pos: new Vector2i(segmentA, pos.y), text: 'a', paletteOffset: 5 },
            { pos: new Vector2i(segmentB, pos.y), text: 'b', paletteOffset: 5 },
            { pos: new Vector2i(segmentC, pos.y), text: 'c', paletteOffset: 5 },
        ]);
    });

    it('draws a 1 px full-row-height divider in the gap index between segments', () => {
        const target = createMockRenderer();

        drawOverlayLabelWithDividers(target, mockFont, pos, 'ab|c', rowRect, 5, 7);

        expect(target.drawBarFill).toHaveBeenCalledTimes(1);
        expect(target.drawBarFill.mock.calls[0]?.[1]).toBe(7);
        expect(target.drawBarFill.rectSnapshots[0]).toMatchObject({
            x: dividerX(pos.x + 2 * SYSTEM_CHAR_ADVANCE),
            y: rowRect.y,
            width: 1,
            height: rowRect.height,
        });
    });

    it('draws one divider per pipe', () => {
        const target = createMockRenderer();

        drawOverlayLabelWithDividers(target, mockFont, pos, 'a|b|c', rowRect, 5, 7);

        const firstSegmentEnd = pos.x + SYSTEM_CHAR_ADVANCE;
        const secondSegmentEnd = firstSegmentEnd + separatorAdvance + SYSTEM_CHAR_ADVANCE;

        expect(target.drawBarFill).toHaveBeenCalledTimes(2);

        expect(target.drawBarFill.rectSnapshots.map((rect) => rect.x)).toEqual([
            dividerX(firstSegmentEnd),
            dividerX(secondSegmentEnd),
        ]);
    });
});

describe('overlayDividerLabelWidth', () => {
    it('measures plain text like length times the glyph advance', () => {
        expect(overlayDividerLabelWidth('Plain label')).toBe(11 * SYSTEM_CHAR_ADVANCE);
    });

    it('replaces each pipe marker with the separator advance', () => {
        expect(overlayDividerLabelWidth('webgpu|320x240')).toBe(13 * SYSTEM_CHAR_ADVANCE + 2 * OVERLAY_DIVIDER_GAP_PX);
        expect(overlayDividerLabelWidth('a|b|c')).toBe(3 * SYSTEM_CHAR_ADVANCE + 4 * OVERLAY_DIVIDER_GAP_PX);
    });
});
