import { describe, expect, it } from 'vitest';

import { applyMaskToGrid, DOC_RESULTS } from '../__test__/spriteOrientationFixture';
import { Vector2i } from '../utils/Vector2i';
import {
    resolveSpriteOrientation,
    resolveSpriteScale,
    SPRITE_FLIP_H,
    SPRITE_FLIP_V,
    SPRITE_ROT_90_CW,
    SPRITE_ROT_180_CW,
    SPRITE_ROT_270_CW,
    stretchSampleIndex,
} from './SpriteOrientation';

const H = SPRITE_FLIP_H;
const V = SPRITE_FLIP_V;
const R90 = SPRITE_ROT_90_CW;
const R180 = SPRITE_ROT_180_CW;
const R270 = SPRITE_ROT_270_CW;

describe('SpriteOrientation', () => {
    it('keeps the public flag values unchanged since 0.1.0', () => {
        expect([H, V, R90, R180, R270]).toEqual([1, 2, 4, 8, 16]);
    });

    it.each(Array.from({ length: 32 }, (_, mask) => mask))(
        'mask %i resolves to the orientation the grid oracle gives',
        (mask) => {
            expect(DOC_RESULTS[resolveSpriteOrientation(mask)]).toBe(applyMaskToGrid(mask));
        },
    );

    it.each([
        [0, 0, R180 | H | V],
        [1, H, R180 | V],
        [2, V, R180 | H],
        [3, R180, H | V],
        [4, R90, R270 | H | V],
        [5, R90 | H, R270 | V],
        [6, R90 | V, R270 | H],
        [7, R270, R90 | H | V],
    ])('orientation %i is spelled %i and %i (doc table)', (orientation, shortest, alsoSpelled) => {
        expect(resolveSpriteOrientation(shortest)).toBe(orientation);
        expect(resolveSpriteOrientation(alsoSpelled)).toBe(orientation);
    });

    it('sums quarter turns modulo 4', () => {
        expect(resolveSpriteOrientation(R90 | R180)).toBe(resolveSpriteOrientation(R270));
        expect(resolveSpriteOrientation(R90 | R270)).toBe(0);
        expect(resolveSpriteOrientation(R90 | R180 | R270)).toBe(resolveSpriteOrientation(R180));
    });

    it.each([32, -1, 0.5, 2 ** 40, Number.NaN, true as unknown as number])(
        'rejects flags %s, naming the constants',
        (flags) => {
            expect(() => resolveSpriteOrientation(flags)).toThrow(/BT\.FLIP_H.*BT\.ROT_270_CW/);
        },
    );
});

describe('stretchSampleIndex', () => {
    it('samples pixel centers with exact ties rounding down (brute force)', () => {
        for (let f = 1; f <= 12; f++) {
            for (let size = 1; size <= 30; size++) {
                for (let d = 0; d < size; d++) {
                    const num = (2 * d + 1) * f;
                    const den = 2 * size;
                    const expected = num % den === 0 ? num / den - 1 : Math.floor(num / den);

                    expect(stretchSampleIndex(d, f, size)).toBe(expected);
                }
            }
        }
    });

    it('equals the plain block copy for 1:1 and every integer scale', () => {
        for (let f = 1; f <= 8; f++) {
            for (let s = 1; s <= 4; s++) {
                for (let d = 0; d < f * s; d++) {
                    expect(stretchSampleIndex(d, f, f * s)).toBe(Math.floor(d / s));
                }
            }
        }
    });

    it.each([
        [3, 2, [0, 2]],
        [2, 1, [0]],
        [2, 3, [0, 0, 1]],
        [5, 7, [0, 1, 1, 2, 3, 3, 4]],
    ])('maps %i -> %i as %j', (f, size, expected) => {
        expect(Array.from({ length: size }, (_, d) => stretchSampleIndex(d, f, size))).toEqual(expected);
    });
});

describe('resolveSpriteScale', () => {
    const out = new Vector2i(0, 0);

    it.each([
        [undefined, 1, 1],
        [1, 1, 1],
        [3, 3, 3],
        [new Vector2i(2, 4), 2, 4],
    ])('resolves %o to (%i, %i)', (scale, x, y) => {
        expect(resolveSpriteScale(scale, out)).toBe(out);
        expect([out.x, out.y]).toEqual([x, y]);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s, pointing at a Rect2i dest', (scale) => {
        expect(() => resolveSpriteScale(scale, out)).toThrow('Rect2i destination');
    });

    it('rejects a Vector2i whose public fields were set to a non-integer', () => {
        const scale = new Vector2i(2, 2);
        scale.x = 1.5;

        expect(() => resolveSpriteScale(scale, out)).toThrow('Rect2i destination');
    });

    it('rejects a zero Vector2i component', () => {
        expect(() => resolveSpriteScale(new Vector2i(0, 2), out)).toThrow('Rect2i destination');
    });

    it.each([
        ['a string', '2'],
        ['null', null],
        ['a plain object', { x: 2, y: 2 }],
    ])('rejects %s', (_label, scale) => {
        expect(() => resolveSpriteScale(scale as unknown as number, out)).toThrow('Invalid sprite scale');
    });
});
