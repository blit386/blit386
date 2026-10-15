/**
 * The pixel diff is what turns a before/after capture into a glance.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffPixels } from '../diff.js';

const image = (pixels) => ({ width: 2, height: 1, data: Uint8ClampedArray.from(pixels) });

describe('diffPixels', () => {
    it('marks changed pixels magenta and leaves the rest transparent', () => {
        const a = image([0, 0, 0, 255, 10, 10, 10, 255]);
        const b = image([0, 0, 0, 255, 10, 11, 10, 255]);
        const result = diffPixels(a, b);

        assert.equal(result.changed, 1);
        assert.deepEqual([...result.data], [0, 0, 0, 0, 255, 0, 255, 255]);
    });

    it('refuses images of different sizes', () => {
        const a = image([0, 0, 0, 255, 0, 0, 0, 255]);
        const b = { width: 1, height: 1, data: Uint8ClampedArray.from([0, 0, 0, 255]) };

        assert.throws(() => diffPixels(a, b), /diff: size mismatch 2x1 vs 1x1/);
    });
});
