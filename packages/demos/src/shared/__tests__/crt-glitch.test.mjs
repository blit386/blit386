/**
 * Unit tests for the shared CRT glitch constants: both glitch-type lists are built from the one
 * GLITCH_TYPE map, and every key has an on-screen label.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GLITCH_LABELS, GLITCH_TYPE, GLITCH_TYPES_CHROMA, GLITCH_TYPES_VROLL } from '../crt-glitch.js';

describe('GLITCH_TYPE', () => {
    it('builds both type lists with the wire values demos already compare against', () => {
        assert.deepEqual(GLITCH_TYPES_CHROMA, ['hshift', 'chromasplit', 'noise', 'flicker', 'interference']);
        assert.deepEqual(GLITCH_TYPES_VROLL, ['hshift', 'noise', 'flicker', 'interference', 'vroll']);
    });

    it('gives every glitch type a label', () => {
        const missing = Object.values(GLITCH_TYPE).filter((type) => !Object.hasOwn(GLITCH_LABELS, type));

        assert.deepEqual(missing, []);
    });

    it('keeps the idle value out of both burst lists', () => {
        assert.equal(GLITCH_TYPES_CHROMA.includes(GLITCH_TYPE.NONE), false);
        assert.equal(GLITCH_TYPES_VROLL.includes(GLITCH_TYPE.NONE), false);
    });
});
