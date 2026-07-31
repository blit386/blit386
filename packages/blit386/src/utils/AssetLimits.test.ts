import { describe, expect, it } from 'vitest';

import {
    ASSET_DIMENSION_LIMITS,
    clipSpriteSourceRect,
    computeSafePixelArea,
    MAX_ASSET_DIMENSION,
    MAX_ASSET_PIXELS,
    MAX_BTFONT_EMBEDDED_TEXTURE_BYTES,
    MAX_BTFONT_JSON_BYTES,
    MAX_GLYPH_COUNT,
    validateBtfontEmbeddedTextureUri,
    validateBtfontGlyphData,
    validateBtfontGlyphDataPreAtlas,
    validateBtfontJsonByteSize,
    validateDimensions,
    validateGlyphCount,
    validateIndexedPixelInput,
} from './AssetLimits';
import { Rect2i } from './Rect2i';

describe('AssetLimits', () => {
    describe('validateDimensions', () => {
        const cases: Array<{ name: string; width: number; height: number }> = [
            { name: 'zero width', width: 0, height: 16 },
            { name: 'negative height', width: 16, height: -1 },
            { name: 'fractional width', width: 16.5, height: 16 },
            { name: 'NaN height', width: 16, height: Number.NaN },
            { name: 'huge width', width: MAX_ASSET_DIMENSION + 1, height: 16 },
            { name: 'huge height', width: 16, height: MAX_ASSET_DIMENSION + 1 },
            { name: 'huge area', width: 4096, height: 4097 },
        ];

        for (const testCase of cases) {
            it(`rejects ${testCase.name}`, () => {
                expect(validateDimensions('sprite sheet', testCase.width, testCase.height)).not.toBeNull();
            });
        }

        it('accepts valid dimensions', () => {
            expect(validateDimensions('sprite sheet', 256, 256)).toBeNull();
        });

        it('rejects total area separately from per-axis limits', () => {
            const error = validateDimensions('sprite sheet', 4096, 4097);

            expect(error).toContain(MAX_ASSET_PIXELS.toLocaleString('en-US'));
        });
    });

    describe('validateIndexedPixelInput', () => {
        it('rejects length mismatch before allocation', () => {
            const error = validateIndexedPixelInput(4, 4, 10);

            expect(error).toContain('10 values');
            expect(error).toContain('16');
        });

        it('rejects overflowed width*height products', () => {
            const error = validateIndexedPixelInput(MAX_ASSET_DIMENSION, MAX_ASSET_DIMENSION);

            expect(error).toContain('too many pixels');
        });
    });

    describe('computeSafePixelArea', () => {
        it('returns null for invalid dimensions', () => {
            expect(computeSafePixelArea(0, 16)).toBeNull();
            expect(computeSafePixelArea(16, Number.POSITIVE_INFINITY)).toBeNull();
        });

        it('returns the pixel count for valid dimensions', () => {
            expect(computeSafePixelArea(16, 16)).toBe(256);
        });
    });

    describe('validateBtfontJsonByteSize', () => {
        it('rejects oversized JSON payloads', () => {
            const error = validateBtfontJsonByteSize(MAX_BTFONT_JSON_BYTES + 1);

            expect(error).toContain(MAX_BTFONT_JSON_BYTES.toLocaleString('en-US'));
        });
    });

    describe('validateGlyphCount', () => {
        it('rejects oversized glyph maps', () => {
            const error = validateGlyphCount(MAX_GLYPH_COUNT + 1);

            expect(error).toContain(MAX_GLYPH_COUNT.toLocaleString('en-US'));
        });
    });

    describe('validateBtfontEmbeddedTextureUri', () => {
        it('accepts relative texture paths', () => {
            expect(validateBtfontEmbeddedTextureUri('MyFont.png')).toBeNull();
        });

        it('accepts PNG data URIs within the payload cap', () => {
            expect(validateBtfontEmbeddedTextureUri('data:image/png;base64,aGVsbG8=')).toBeNull();
        });

        it('rejects non-PNG data URIs', () => {
            expect(validateBtfontEmbeddedTextureUri('data:image/jpeg;base64,abc')).toContain('PNG data URI');
        });

        it('rejects case-variant non-PNG data URIs', () => {
            expect(validateBtfontEmbeddedTextureUri('DATA:image/jpeg;base64,abc')).toContain('PNG data URI');
        });

        it('accepts case-variant PNG data URIs within the payload cap', () => {
            expect(validateBtfontEmbeddedTextureUri('DATA:image/png;base64,aGVsbG8=')).toBeNull();
        });

        it('rejects oversized embedded texture payloads', () => {
            const oversized = `data:image/png;base64,${'A'.repeat(MAX_BTFONT_EMBEDDED_TEXTURE_BYTES + 1)}`;
            const error = validateBtfontEmbeddedTextureUri(oversized);

            expect(error).toContain(MAX_BTFONT_EMBEDDED_TEXTURE_BYTES.toLocaleString('en-US'));
        });
    });

    describe('validateBtfontGlyphDataPreAtlas', () => {
        it('rejects glyph areas that are too large to render safely', () => {
            const error = validateBtfontGlyphDataPreAtlas(
                { x: 0, y: 0, w: 4096, h: 4097, ox: 0, oy: 0, adv: 4096 },
                'A',
            );

            expect(error).toContain('covers too many pixels');
        });
    });

    describe('validateBtfontGlyphData', () => {
        it('rejects glyph rectangles outside the atlas', () => {
            const error = validateBtfontGlyphData({ x: 60, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 8 }, 64, 16, 'A');

            expect(error).toContain('outside');
        });

        it('rejects non-integer metrics', () => {
            const error = validateBtfontGlyphData({ x: 0, y: 0, w: 8.5, h: 12, ox: 0, oy: 0, adv: 8 }, 64, 16, 'A');

            expect(error).toContain('whole number');
        });

        it('accepts valid glyph metrics', () => {
            expect(validateBtfontGlyphData({ x: 0, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 8 }, 64, 16, 'A')).toBeNull();
        });
    });

    describe('clipSpriteSourceRect', () => {
        it('clips rectangles to the sheet bounds', () => {
            const clipped = clipSpriteSourceRect(new Rect2i(-2, -1, 5, 4), 4, 4);

            expect(clipped).toEqual({ x: 0, y: 0, width: 3, height: 3 });
        });

        it('returns null for oversized blits after clipping', () => {
            const clipped = clipSpriteSourceRect(
                new Rect2i(0, 0, ASSET_DIMENSION_LIMITS.maxWidth, ASSET_DIMENSION_LIMITS.maxHeight),
                ASSET_DIMENSION_LIMITS.maxWidth,
                ASSET_DIMENSION_LIMITS.maxHeight,
            );

            expect(clipped).toBeNull();
        });

        it('returns null for rectangles with non-positive size', () => {
            expect(clipSpriteSourceRect(new Rect2i(0, 0, 0, 2), 4, 4)).toBeNull();
        });

        it('returns null for non-integer source rectangles', () => {
            const srcRect = new Rect2i(0, 0, 2, 2);
            srcRect.x = 0.5;

            expect(clipSpriteSourceRect(srcRect, 4, 4)).toBeNull();
        });

        it('returns null for rectangles fully outside the sheet', () => {
            expect(clipSpriteSourceRect(new Rect2i(10, 10, 2, 2), 4, 4)).toBeNull();
        });
    });
});
