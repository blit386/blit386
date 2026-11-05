import { describe, expect, it } from 'vitest';

import { Vector2i } from '../utils/Vector2i';
import { clientToDisplayPos as convertInto, displayToClientPos, type ViewportRect } from './clientToDisplayPos';

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

describe('displayToClientPos', () => {
    const CASES: { name: string; rect: ViewportRect; size: Vector2i }[] = [
        { name: 'odd display, 1:1 canvas', rect: { left: 0, top: 0, width: 7, height: 5 }, size: new Vector2i(7, 5) },
        {
            name: 'odd display, odd CSS-scaled canvas',
            rect: { left: 13.5, top: 7.25, width: 1001, height: 537 },
            size: new Vector2i(321, 179),
        },
        {
            name: 'canvas smaller than the display',
            rect: { left: 40, top: 40, width: 100, height: 75 },
            size: new Vector2i(320, 240),
        },
        {
            name: 'scrolled page (rect above and left of the viewport)',
            rect: { left: -250.5, top: -1200, width: 640, height: 480 },
            size: new Vector2i(320, 240),
        },
    ];

    it.each(CASES)('round-trips every edge and center pixel: $name', ({ rect, size }) => {
        const xs = [0, 1, Math.floor(size.x / 2), size.x - 2, size.x - 1];
        const ys = [0, 1, Math.floor(size.y / 2), size.y - 2, size.y - 1];

        for (const y of ys) {
            for (const x of xs) {
                const point = displayToClientPos(x, y, rect, size);

                expect(clientToDisplayPos(point.x, point.y, rect, size)).toEqual(new Vector2i(x, y));
            }
        }
    });

    it('aims at the pixel center', () => {
        expect(displayToClientPos(0, 0, RECT, DISPLAY)).toEqual({ x: 101, y: 51 });
        expect(displayToClientPos(319, 239, RECT, DISPLAY)).toEqual({ x: 100 + 639, y: 50 + 479 });
    });
});
