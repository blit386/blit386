/**
 * Pads the system font's bitmap data up to the extra-chars list, for `export-system-font.mjs`.
 *
 * Kept apart from the exporter so it can be tested without running the exporter's `main()`.
 */

/**
 * Appends blank (all-zero) glyphs for list entries the data does not hold yet.
 *
 * Only a pure append is accepted: the data's own extra code points must be a prefix of the list.
 * Anything else (an entry inserted mid-list, reordered or removed) would put glyph art on the wrong
 * cell or lose it, so it throws and the cells must be changed deliberately.
 *
 * @param {object} params - The inputs.
 * @param {readonly number[]} params.bitmaps - Flat glyph bytes from `SYSTEM_FONT_BITMAPS`.
 * @param {readonly number[]} params.dataExtras - The data's own `SYSTEM_FONT_EXTRA_CHARS` code points.
 * @param {readonly number[]} params.listCodePoints - Code points from `system-font-extra-chars.mjs`.
 * @param {number} params.asciiGlyphCount - Number of glyphs before the extras.
 * @param {number} params.glyphHeight - Bytes per glyph.
 * @returns {{ bitmaps: number[], paddedGlyphs: number }} The padded bytes and how many glyphs were added.
 */
export function padBitmaps({ bitmaps, dataExtras, listCodePoints, asciiGlyphCount, glyphHeight }) {
    const expectedLength = (asciiGlyphCount + dataExtras.length) * glyphHeight;

    if (bitmaps.length !== expectedLength) {
        throw new Error(
            `systemFontData.ts holds ${bitmaps.length} bytes but its own extra list implies ${expectedLength}.`,
        );
    }

    if (dataExtras.length > listCodePoints.length) {
        throw new Error(
            `systemFontData.ts holds ${dataExtras.length} extra glyphs but the list defines ${listCodePoints.length}. ` +
                'Delete the removed glyphs from the data deliberately before exporting.',
        );
    }

    const mismatch = dataExtras.findIndex((codePoint, index) => codePoint !== listCodePoints.at(index));

    if (mismatch !== -1) {
        throw new Error(
            `Extra glyph ${mismatch} is U+${dataExtras.at(mismatch).toString(16).toUpperCase()} in the data but ` +
                `U+${listCodePoints.at(mismatch).toString(16).toUpperCase()} in the list. ` +
                'Only append new entries at the end of the list.',
        );
    }

    const paddedGlyphs = listCodePoints.length - dataExtras.length;

    return { bitmaps: [...bitmaps, ...new Array(paddedGlyphs * glyphHeight).fill(0)], paddedGlyphs };
}
