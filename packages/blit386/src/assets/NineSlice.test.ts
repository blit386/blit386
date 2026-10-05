import { describe, expect, it } from 'vitest';

import { Rect2i } from '../utils/Rect2i';
import { NineSlice, splitNineSliceAxis } from './NineSlice';
import { SpriteSheet } from './SpriteSheet';

/** 32x32 indexed sheet; pixel values do not matter for layout. */
function makeSheet(): SpriteSheet {
    return SpriteSheet.fromIndexedPixels(32, 32, new Uint8Array(32 * 32) as Uint8Array<ArrayBuffer>);
}

// Panel source used across tests: L=2, R=3, T=3, B=2, center 5x4.
const OUTER = new Rect2i(4, 4, 10, 9);
const INNER = new Rect2i(6, 7, 5, 4);

describe('NineSlice.fromSheet', () => {
    it('keeps the sheet, copies both rects, and defaults both modes to stretch', () => {
        const sheet = makeSheet();
        const slice = NineSlice.fromSheet(sheet, OUTER, INNER);

        expect(slice.sheet).toBe(sheet);
        expect(slice.outer).toEqual(OUTER);
        expect(slice.inner).toEqual(INNER);
        expect(slice.outer).not.toBe(OUTER);
        expect(slice.inner).not.toBe(INNER);
        expect(slice.edges).toBe('stretch');
        expect(slice.center).toBe('stretch');
    });

    it('takes edges and center modes independently', () => {
        const slice = NineSlice.fromSheet(makeSheet(), OUTER, INNER, { edges: 'tile', center: 'stretch' });

        expect(slice.edges).toBe('tile');
        expect(slice.center).toBe('stretch');
    });

    it('is not affected when the caller mutates the rects it passed in', () => {
        const outer = OUTER.clone();
        const inner = INNER.clone();
        const slice = NineSlice.fromSheet(makeSheet(), outer, inner);

        outer.x = 0;
        inner.width = 1;

        expect(slice.outer.x).toBe(4);
        expect(slice.inner.width).toBe(5);
    });

    it('freezes itself and its rects', () => {
        const slice = NineSlice.fromSheet(makeSheet(), OUTER, INNER);

        expect(Object.isFrozen(slice)).toBe(true);
        expect(Object.isFrozen(slice.outer)).toBe(true);
        expect(Object.isFrozen(slice.inner)).toBe(true);
    });

    it('accepts an inner rect touching the outer edges (three-slice bar)', () => {
        const slice = NineSlice.fromSheet(makeSheet(), new Rect2i(0, 20, 12, 6), new Rect2i(4, 20, 4, 6));

        expect(slice.inner.height).toBe(6);
    });

    it('accepts a sheet built before indexize (indexing is checked at draw time)', () => {
        const rawSheet = new SpriteSheet(null, makeSheet().size);

        expect(() => NineSlice.fromSheet(rawSheet, OUTER, INNER)).not.toThrow();
    });

    it('treats null options as the defaults', () => {
        const slice = NineSlice.fromSheet(makeSheet(), OUTER, INNER, null);

        expect(slice.edges).toBe('stretch');
        expect(slice.center).toBe('stretch');
    });

    it.each([
        ['a non-SpriteSheet sheet', () => NineSlice.fromSheet({} as SpriteSheet, OUTER, INNER), 'SpriteSheet'],
        ['a non-Rect2i outer', () => NineSlice.fromSheet(makeSheet(), {} as Rect2i, INNER), 'outer'],
        ['a non-Rect2i inner', () => NineSlice.fromSheet(makeSheet(), OUTER, {} as Rect2i), 'inner'],
        [
            'a fractional outer field',
            () => {
                const outer = OUTER.clone();
                outer.width = 9.5;
                return NineSlice.fromSheet(makeSheet(), outer, INNER);
            },
            'integer',
        ],
        [
            'an outer rect past the sheet',
            () => NineSlice.fromSheet(makeSheet(), new Rect2i(28, 0, 8, 8), new Rect2i(30, 2, 2, 2)),
            'sheet',
        ],
        [
            'an outer rect at a negative position',
            () => NineSlice.fromSheet(makeSheet(), new Rect2i(-1, 0, 8, 8), new Rect2i(2, 2, 2, 2)),
            'sheet',
        ],
        [
            'an inner rect outside outer',
            () => NineSlice.fromSheet(makeSheet(), OUTER, new Rect2i(2, 7, 5, 4)),
            'inside',
        ],
        ['a zero-width inner rect', () => NineSlice.fromSheet(makeSheet(), OUTER, new Rect2i(6, 7, 0, 4)), '1x1'],
        ['a zero-height inner rect', () => NineSlice.fromSheet(makeSheet(), OUTER, new Rect2i(6, 7, 5, 0)), '1x1'],
        [
            'an unknown edges mode',
            () => NineSlice.fromSheet(makeSheet(), OUTER, INNER, { edges: 'repeat' as never }),
            "'stretch' or 'tile'",
        ],
        [
            'an unknown center mode',
            () => NineSlice.fromSheet(makeSheet(), OUTER, INNER, { center: 'tiled' as never }),
            "'stretch' or 'tile'",
        ],
    ])('rejects %s', (_label, call, fragment) => {
        expect(call).toThrow(fragment);
    });
});

describe('splitNineSliceAxis', () => {
    const out = new Int32Array(3);

    it.each([
        // [size, start, end, expected]
        [20, 2, 3, [2, 15, 3]],
        [5, 2, 3, [2, 0, 3]], // exactly the corners
        [4, 2, 3, [1, 0, 3]], // too small: floor(4 * 2 / 5) = 1 to the start
        [1, 2, 3, [0, 0, 1]],
        [0, 2, 3, [0, 0, 0]],
        [-4, 2, 3, [0, 0, 0]],
        [30, 0, 0, [0, 30, 0]], // three-slice axis with no caps
        [3, 0, 4, [0, 0, 3]],
    ])('splits size %i with caps %i/%i', (size, start, end, expected) => {
        splitNineSliceAxis(size, start, end, out);

        expect(Array.from(out)).toEqual(expected);
    });
});
