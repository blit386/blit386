import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sampleInside } from '../sample-inside.js';

describe('sampleInside', () => {
    it('skips points outside the rectangle and returns the first one inside', () => {
        const points = [
            { x: -1, y: 5 },
            { x: 5, y: 11 },
            { x: 11, y: 5 },
            { x: 5, y: -1 },
            { x: 3, y: 4 },
            { x: 6, y: 6 },
        ];
        let calls = 0;

        const result = sampleInside(() => points[calls++], 0, 10, 0, 10);

        assert.deepEqual(result, { x: 3, y: 4 });
        assert.equal(calls, 5);
    });

    it('counts points exactly on the edge as inside', () => {
        assert.deepEqual(
            sampleInside(() => ({ x: 10, y: 0 }), 0, 10, 0, 10),
            { x: 10, y: 0 },
        );
    });
});
