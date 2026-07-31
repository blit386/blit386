/**
 * Unit tests for the built-in system font.
 *
 * Covers:
 * - `createSystemFont()` produces a valid BitmapFont
 * - Correct glyph count (95 printable ASCII characters)
 * - Glyph lookup for representative characters
 * - Text measurement via the system font
 * - Atlas texture dimensions
 */

import { describe, expect, it } from 'vitest';

import {
    SYSTEM_FONT_BITMAPS,
    SYSTEM_FONT_BYTES_PER_GLYPH,
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

    it('contains all 95 printable ASCII glyphs', () => {
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

    it('returns null for non-ASCII character', () => {
        const font = createSystemFont();

        expect(font.getGlyph('\u00e9')).toBeNull(); // e-acute
    });

    it('returns null for control characters', () => {
        const font = createSystemFont();

        expect(font.getGlyphByCode(0)).toBeNull();
        expect(font.getGlyphByCode(31)).toBeNull();
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

        // 16 columns * 6px = 96 wide, 6 rows * 14px = 84 tall
        expect(sheet.size.x).toBe(96);
        expect(sheet.size.y).toBe(84);
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
