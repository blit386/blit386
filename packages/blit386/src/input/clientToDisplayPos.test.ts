import { describe, expect, it } from 'vitest';

import { Vector2i } from '../utils/Vector2i';
import { clientToDisplayPos as convertInto, type ViewportRect } from './clientToDisplayPos';

const DISPLAY = new Vector2i(320, 240);

/** Canvas rect at (100, 50), 640x480 CSS pixels: exactly 2x the display. */
const RECT: ViewportRect = { left: 100, top: 50, width: 640, height: 480 };

/** Converts into a fresh vector so each case reads as input -> result. */
const clientToDisplayPos = (x: number, y: number, rect: ViewportRect, size: Vector2i): Vector2i | null =>
    convertInto(x, y, rect, size, new Vector2i(0, 0));

describe('clientToDisplayPos', () => {
    it('maps the canvas origin to (0, 0)', () => {
        expect(clientToDisplayPos(100, 50, RECT, DISPLAY)).toEqual(new Vector2i(0, 0));
    });

    it('scales client pixels to display pixels and floors', () => {
        expect(clientToDisplayPos(100 + 321, 50 + 201, RECT, DISPLAY)).toEqual(new Vector2i(160, 100));
    });

    it('clamps the far edge to displaySize - 1', () => {
        expect(clientToDisplayPos(100 + 640, 50 + 480, RECT, DISPLAY)).toEqual(new Vector2i(319, 239));
    });

    it('clamps points outside the canvas on every side', () => {
        expect(clientToDisplayPos(-500, -500, RECT, DISPLAY)).toEqual(new Vector2i(0, 0));
        expect(clientToDisplayPos(9999, 9999, RECT, DISPLAY)).toEqual(new Vector2i(319, 239));
    });

    it('returns null for a zero-width or zero-height rect', () => {
        expect(clientToDisplayPos(10, 10, { ...RECT, width: 0 }, DISPLAY)).toBeNull();
        expect(clientToDisplayPos(10, 10, { ...RECT, height: 0 }, DISPLAY)).toBeNull();
    });

    it('leaves out untouched when it returns null', () => {
        const out = new Vector2i(7, 9);

        expect(convertInto(10, 10, { ...RECT, width: 0 }, DISPLAY, out)).toBeNull();
        expect(out).toEqual(new Vector2i(7, 9));
    });

    it('returns null for non-finite client coordinates', () => {
        expect(clientToDisplayPos(Number.NaN, 10, RECT, DISPLAY)).toBeNull();
        expect(clientToDisplayPos(10, Number.POSITIVE_INFINITY, RECT, DISPLAY)).toBeNull();
    });
});
