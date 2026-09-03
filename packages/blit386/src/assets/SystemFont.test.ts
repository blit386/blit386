/**
 * Unit tests for the built-in system font.
 *
 * Covers:
 * - `createSystemFont()` produces a valid BitmapFont
 * - Correct glyph count (the printable ASCII block plus SYSTEM_FONT_EXTRA_CHARS)
 * - Glyph lookup for representative characters, including the fallback-glyph substitution
 * - Text measurement via the system font
 * - Atlas texture dimensions
 */

import { describe, expect, it } from 'vitest';

import {
    SYSTEM_FONT_BITMAPS,
    SYSTEM_FONT_BYTES_PER_GLYPH,
    SYSTEM_FONT_EXTRA_CHARS,
    SYSTEM_FONT_FIRST_CHAR,
    SYSTEM_FONT_GLYPH_COUNT,
    SYSTEM_FONT_GLYPH_HEIGHT,
    SYSTEM_FONT_GLYPH_WIDTH,
    SYSTEM_FONT_LAST_CHAR,
} from './fonts/systemFontData';
import { Palette } from './Palette';
import { createSystemFont } from './SystemFont';

describe('createSystemFont', () => {
    it('returns a BitmapFont instance', () => {
        const font = createSystemFont();

        expect(font).toBeDefined();
        expect(font.name).toBe('System');
    });

    it('bitmap data has correct total length', () => {
        expect(SYSTEM_FONT_BITMAPS.length).toBe(SYSTEM_FONT_GLYPH_COUNT * SYSTEM_FONT_BYTES_PER_GLYPH);
    });

    it('has correct metadata', () => {
        const font = createSystemFont();

        expect(font.size).toBe(SYSTEM_FONT_GLYPH_HEIGHT);
        expect(font.lineHeight).toBe(SYSTEM_FONT_GLYPH_HEIGHT);
        expect(font.baseline).toBe(SYSTEM_FONT_GLYPH_HEIGHT);
    });

    it('contains a glyph for every code point the font declares', () => {
        const font = createSystemFont();

        expect(font.glyphCount).toBe(SYSTEM_FONT_GLYPH_COUNT);
    });

    it('has glyphs for all characters from space to tilde', () => {
        const font = createSystemFont();

        for (let code = SYSTEM_FONT_FIRST_CHAR; code <= SYSTEM_FONT_LAST_CHAR; code++) {
            const char = String.fromCharCode(code);

            expect(font.hasGlyph(char)).toBe(true);
        }
    });

    it('has glyphs for every SYSTEM_FONT_EXTRA_CHARS code point', () => {
        const font = createSystemFont();

        for (const codePoint of SYSTEM_FONT_EXTRA_CHARS) {
            expect(font.hasGlyph(String.fromCharCode(codePoint))).toBe(true);
        }
    });

    it('has glyphs for the en dash and the four cardinal arrows – the characters this pass exists for', () => {
        // U+2013 en dash: was rendering as a corrupting zero-width gap through the overlay's
        // top-left label before this font gained a glyph for it. U+2190–2193: 4-way arrows.
        const font = createSystemFont();

        expect(font.hasGlyph('–')).toBe(true);
        expect(font.hasGlyph('←')).toBe(true);
        expect(font.hasGlyph('↑')).toBe(true);
        expect(font.hasGlyph('→')).toBe(true);
        expect(font.hasGlyph('↓')).toBe(true);
    });

    it('exposes codePoints as an ascending, duplicate-free enumeration of every real glyph', () => {
        // Structural checks rather than a hardcoded count – a glyph browser built on codePoints
        // must never need updating when the font gains or loses a glyph.
        const font = createSystemFont();
        const codePoints = font.codePoints;

        expect(codePoints.length).toBe(SYSTEM_FONT_GLYPH_COUNT);
        expect(new Set(codePoints).size).toBe(codePoints.length);
        expect([...codePoints]).toEqual([...codePoints].sort((a, b) => a - b));

        for (const codePoint of codePoints) {
            expect(font.hasGlyph(String.fromCodePoint(codePoint))).toBe(true);
        }
    });
});

describe('system font glyph access', () => {
    it('returns glyph for space character', () => {
        const font = createSystemFont();
        const glyph = font.getGlyph(' ');

        expect(glyph).not.toBeNull();
        expect(glyph?.rect.width).toBe(SYSTEM_FONT_GLYPH_WIDTH);
        expect(glyph?.rect.height).toBe(SYSTEM_FONT_GLYPH_HEIGHT);
        expect(glyph?.advance).toBe(SYSTEM_FONT_GLYPH_WIDTH);
    });

    it('returns glyph for letter A', () => {
        const font = createSystemFont();
        const glyph = font.getGlyph('A');

        expect(glyph).not.toBeNull();
        expect(glyph?.offsetX).toBe(0);
        expect(glyph?.offsetY).toBe(0);
    });

    it('returns glyph by character code', () => {
        const font = createSystemFont();
        const glyphA = font.getGlyphByCode(65); // 'A'
        const glyphDirect = font.getGlyph('A');

        expect(glyphA).toBe(glyphDirect);
    });

    it('resolves inverted exclamation mark to its own glyph, not the fallback', () => {
        // Inverted exclamation mark (U+00A1) is one of SYSTEM_FONT_EXTRA_CHARS's punctuation entries.
        const font = createSystemFont();
        const glyph = font.getGlyph('\u00a1');
        const fallback = font.getGlyph('\ufffd');

        expect(glyph).not.toBeNull();
        expect(glyph).not.toBe(fallback);
    });

    it('resolves a reserved (unassigned) placeholder to its own glyph, not the fallback', () => {
        // U+E006 is one of the 14 reserved Private Use Area placeholders that took the accented
        // Latin letters' atlas cells after they were dropped – still a real (blank) glyph, not
        // a missing character routed through the fallback.
        const font = createSystemFont();
        const glyph = font.getGlyph('\ue006');
        const fallback = font.getGlyph('\ufffd');

        expect(glyph).not.toBeNull();
        expect(glyph).not.toBe(fallback);
    });

    it('reports hasGlyph as false for a character with no glyph of its own, even with a fallback defined', () => {
        // hasGlyph checks true presence, not fallback coverage – see BitmapFont's fallback-glyph
        // mechanism. Hiragana "a" is nowhere near this font's coverage.
        const font = createSystemFont();

        expect(font.hasGlyph('\u3042')).toBe(false);
    });

    it('substitutes the fallback glyph for control characters, not null', () => {
        // The system font now defines a U+FFFD fallback glyph (see systemFontData.ts's
        // SYSTEM_FONT_EXTRA_CHARS), so out-of-range codes render as that placeholder instead of
        // vanishing – see BitmapFont's fallback-glyph mechanism.
        const font = createSystemFont();
        const fallback = font.getGlyph('\uFFFD');

        expect(font.getGlyphByCode(0)).toBe(fallback);
        expect(font.getGlyphByCode(31)).toBe(fallback);
    });
});

describe('system font text measurement', () => {
    it('measures text width correctly', () => {
        const font = createSystemFont();
        const width = font.measureText('Hello');

        // 5 characters * 6 pixels each
        expect(width).toBe(5 * SYSTEM_FONT_GLYPH_WIDTH);
    });

    it('measures empty string as zero', () => {
        const font = createSystemFont();

        expect(font.measureText('')).toBe(0);
    });

    it('measureTextSize returns width and height', () => {
        const font = createSystemFont();
        const size = font.measureTextSize('Test');

        expect(size.width).toBe(4 * SYSTEM_FONT_GLYPH_WIDTH);
        expect(size.height).toBe(SYSTEM_FONT_GLYPH_HEIGHT);
    });
});

describe('system font sprite sheet', () => {
    it('produces an indexized sprite sheet', () => {
        const font = createSystemFont();
        const sheet = font.getSpriteSheet();

        expect(sheet.isIndexed()).toBe(true);
    });

    it('sprite sheet has correct atlas dimensions', () => {
        const font = createSystemFont();
        const sheet = font.getSpriteSheet();
        const atlasCols = 16;
        const expectedRows = Math.ceil(SYSTEM_FONT_GLYPH_COUNT / atlasCols);

        // 16 columns * 6px wide; row count grows with the glyph count (ASCII block plus extras).
        expect(sheet.size.x).toBe(atlasCols * SYSTEM_FONT_GLYPH_WIDTH);
        expect(sheet.size.y).toBe(expectedRows * SYSTEM_FONT_GLYPH_HEIGHT);
    });

    it('sprite sheet throws on indexize (no source image)', () => {
        const font = createSystemFont();
        const sheet = font.getSpriteSheet();
        const palette = new Palette(256);

        expect(() => sheet.indexize(palette)).toThrow('not available for sheets created from raw indexed data');
    });

    it('sprite sheet throws on reindexize (no source image)', () => {
        const font = createSystemFont();
        const sheet = font.getSpriteSheet();
        const palette = new Palette(256);

        expect(() => sheet.reindexize(palette)).toThrow('not available for sheets created from raw indexed data');
    });

    it('sprite sheet throws on getImage (no source image)', () => {
        const font = createSystemFont();
        const sheet = font.getSpriteSheet();

        expect(() => sheet.getImage()).toThrow('not available for sheets created from raw indexed data');
    });
});
