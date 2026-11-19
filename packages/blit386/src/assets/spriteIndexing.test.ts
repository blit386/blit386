import { describe, expect, it } from 'vitest';

import { Rect2i } from '../utils/Rect2i';
import { markUniqueIndicesInRect } from './spriteIndexing';

const SIZE = 16;

/** 16x16 sheet of non-zero indices; pixel 255 wraps back to index 1. */
function makePixels(): Uint8Array {
    return Uint8Array.from({ length: SIZE * SIZE }, (_, i) => (i % 255) + 1);
}

function scan(rect: Rect2i): Uint8Array {
    const usedMask = new Uint8Array(512);

    markUniqueIndicesInRect(makePixels(), SIZE, SIZE, rect, 0, usedMask);

    return usedMask;
}

describe('markUniqueIndicesInRect empty rects', () => {
    it('marks nothing for a rect fully outside the sheet above-left', () => {
        expect(scan(new Rect2i(-30, -30, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing, without scanning the distance, for a far-away rect', () => {
        expect(scan(new Rect2i(-5000, -5000, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing for a rect fully outside the sheet below-right', () => {
        expect(scan(new Rect2i(20, 20, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing for a rect outside on one axis only', () => {
        expect(scan(new Rect2i(-30, 4, 8, 8)).some(Boolean)).toBe(false);
    });

    it('still marks the pixels of a rect inside the sheet', () => {
        expect(scan(new Rect2i(0, 0, 2, 1)).some(Boolean)).toBe(true);
    });
});
