/**
 * Unit tests for per-frame palette usage tracking helpers.
 */

import { describe, expect, it } from 'vitest';

import { collectUsedIndices, markIndexUsed, resetUsage } from './RenderPaletteUsage';

describe('RenderPaletteUsage', () => {
    it('collects sorted used indices and skips transparent slot 0', () => {
        const mask = new Uint8Array(256);
        const scratch: number[] = [];

        markIndexUsed(mask, 0);
        markIndexUsed(mask, 3);
        markIndexUsed(mask, 1);
        markIndexUsed(mask, 7);

        expect(collectUsedIndices(mask, 16, scratch)).toEqual([1, 3, 7]);
    });

    it('reset clears prior marks', () => {
        const mask = new Uint8Array(256);
        const scratch: number[] = [];

        markIndexUsed(mask, 2);
        resetUsage(mask);

        expect(collectUsedIndices(mask, 16, scratch)).toEqual([]);
    });
});
