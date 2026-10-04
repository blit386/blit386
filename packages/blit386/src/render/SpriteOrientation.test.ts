import { describe, expect, it } from 'vitest';

import { applyMaskToGrid, DOC_RESULTS } from '../__test__/spriteOrientationFixture';
import {
    resolveSpriteOrientation,
    SPRITE_FLIP_H,
    SPRITE_FLIP_V,
    SPRITE_ROT_90_CW,
    SPRITE_ROT_180_CW,
    SPRITE_ROT_270_CW,
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
