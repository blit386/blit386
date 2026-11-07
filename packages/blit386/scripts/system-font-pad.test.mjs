import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { padBitmaps } from './system-font-pad.mjs';

const GLYPH_HEIGHT = 2;
const ASCII_GLYPH_COUNT = 1;

/** Builds the bytes for the ASCII block plus one non-blank glyph per data extra. */
function bitmapsFor(extraCount) {
    return new Array((ASCII_GLYPH_COUNT + extraCount) * GLYPH_HEIGHT).fill(1);
}

function pad(dataExtras, listCodePoints) {
    return padBitmaps({
        bitmaps: bitmapsFor(dataExtras.length),
        dataExtras,
        listCodePoints,
        asciiGlyphCount: ASCII_GLYPH_COUNT,
        glyphHeight: GLYPH_HEIGHT,
    });
}

describe('padBitmaps', () => {
    it('returns the data unchanged when the list matches', () => {
        const { bitmaps, paddedGlyphs } = pad([10, 20], [10, 20]);

        assert.equal(paddedGlyphs, 0);
        assert.deepEqual(bitmaps, bitmapsFor(2));
    });

    it('appends blank glyphs for entries added at the end of the list', () => {
        const { bitmaps, paddedGlyphs } = pad([10], [10, 20, 30, 40]);

        assert.equal(paddedGlyphs, 3);
        assert.equal(bitmaps.length, (ASCII_GLYPH_COUNT + 4) * GLYPH_HEIGHT);
        assert.deepEqual(bitmaps.slice(-3 * GLYPH_HEIGHT), new Array(3 * GLYPH_HEIGHT).fill(0));
        assert.deepEqual(bitmaps.slice(0, (ASCII_GLYPH_COUNT + 1) * GLYPH_HEIGHT), bitmapsFor(1));
    });

    it('throws when the data has more extras than the list', () => {
        assert.throws(() => pad([10, 20], [10]), /Delete the removed glyphs/);
    });

    it('throws when an entry was inserted mid-list instead of appended', () => {
        assert.throws(() => pad([10, 20], [10, 15, 20]), /Extra glyph 1 is U\+14 in the data but U\+F in the list/);
    });

    it('throws when the byte count does not match the data extras', () => {
        assert.throws(
            () =>
                padBitmaps({
                    bitmaps: new Array(5).fill(1),
                    dataExtras: [10],
                    listCodePoints: [10],
                    asciiGlyphCount: ASCII_GLYPH_COUNT,
                    glyphHeight: GLYPH_HEIGHT,
                }),
            /holds 5 bytes/,
        );
    });
});
