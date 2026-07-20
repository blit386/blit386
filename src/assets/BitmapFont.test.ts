/**
 * Unit tests for {@link BitmapFont}.
 *
 * Exercises the bitmap-font workflow end to end:
 * - loading `.btfont` JSON metadata and its backing texture
 * - ASCII and Unicode glyph lookup paths
 * - text measurement, cache reuse, and cache eviction
 * - metadata defaults and relative texture resolution
 * - failure modes for invalid font data and texture load errors
 *
 * The suite uses stubbed `fetch` and `Image` globals so glyph and measurement
 * behavior can be validated without real browser I/O.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerHotContext } from '../hot/HotRuntime';
import {
    AssetLimitError,
    MAX_ASSET_DIMENSION,
    MAX_BTFONT_EMBEDDED_TEXTURE_BYTES,
    MAX_BTFONT_JSON_BYTES,
    MAX_GLYPH_COUNT,
} from '../utils/AssetLimits';
import { Rect2i } from '../utils/Rect2i';
import { BitmapFont, getHotReloadFonts } from './BitmapFont';
import { SpriteSheet } from './SpriteSheet';

// registerFontForHotReload() normalizes the source url against `location.origin`
// whenever hot reload is active (see BitmapFont.ts). Real browsers always have
// `location`; this file's default Node test environment does not, so - like the
// GPU/AudioContext stubs in src/__test__/setup.ts - install it once, only if
// missing, so it survives every describe block's `vi.unstubAllGlobals()` call.
if (typeof globalThis.location === 'undefined') {
    (globalThis as unknown as { location?: URL }).location = new URL('http://localhost/');
}

type GlyphData = { x: number; y: number; w: number; h: number; ox: number; oy: number; adv: number };
type FontData = {
    name: string;
    size: number;
    lineHeight: number;
    baseline: number;
    texture: string;
    glyphs: Record<string, GlyphData>;
};

/**
 * Creates a stub Image class for use with `vi.stubGlobal('Image', ...)`.
 *
 * @param opts           - Configuration options.
 * @param opts.fireError - When true, fires `onerror` instead of `onload` on src assignment.
 * @param opts.onSrcSet  - Optional callback invoked with the assigned src value before the load/error event.
 * @param opts.width     - Reported image width (default 64).
 * @param opts.height    - Reported image height (default 16).
 */
function createStubImage({
    fireError = false,
    onSrcSet,
    width = 64,
    height = 16,
}: {
    fireError?: boolean;
    onSrcSet?: (src: string) => void;
    width?: number;
    height?: number;
} = {}) {
    return class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = width;
        height = height;

        private _src = '';

        get src(): string {
            return this._src;
        }

        set src(value: string) {
            this._src = value;
            onSrcSet?.(value);

            if (fireError) {
                this.onerror?.();
            } else {
                this.onload?.();
            }
        }
    };
}

/**
 * Canonical fixture returned by mocked font fetches.
 *
 * Includes ASCII glyphs plus one extended Unicode glyph so the tests can cover
 * both the fast ASCII lookup table and the fallback Unicode map path.
 */
/**
 * Builds a mocked fetch response that returns JSON text like {@link BitmapFont.load} expects.
 *
 * @param data - Font descriptor object to serialize.
 * @returns Resolved fetch response stub.
 */
function mockFontFetchResponse(data: unknown) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    };
}

const MOCK_FONT_DATA: FontData = {
    name: 'TestFont',
    size: 12,
    lineHeight: 14,
    baseline: 10,
    texture: 'data:image/png;base64,aGVsbG8=',
    glyphs: {
        A: { x: 0, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 },
        B: { x: 8, y: 0, w: 7, h: 12, ox: 0, oy: 0, adv: 8 },
        '\u00e9': { x: 16, y: 0, w: 6, h: 12, ox: 0, oy: 1, adv: 7 },
    },
};

describe('BitmapFont', () => {
    let font: BitmapFont;

    beforeEach(async () => {
        // Stub Image to fire onload synchronously.
        vi.stubGlobal('Image', createStubImage());

        // Stub fetch to return the mock font data.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));

        font = await BitmapFont.load('test.btfont');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should load from .btfont URL', () => {
        expect(font).toBeDefined();
        expect(font.name).toBe('TestFont');
        expect(font.lineHeight).toBe(14);
        expect(font.baseline).toBe(10);
    });

    it('should look up ASCII glyphs via a fast path', () => {
        const glyph = font.getGlyph('A');

        expect(glyph).not.toBeNull();
        expect(glyph?.advance).toBe(9);
        expect(glyph?.rect.x).toBe(0);
    });

    it('should look up Unicode glyphs via Map', () => {
        const glyph = font.getGlyph('\u00e9');

        expect(glyph).not.toBeNull();
        expect(glyph?.advance).toBe(7);
    });

    it('should measure text width with caching', () => {
        const width = font.measureText('AB');

        expect(width).toBe(17); // 9 (A advance) + 8 (B advance)

        // Second call returns the cached result.
        const cached = font.measureText('AB');

        expect(cached).toBe(width);
    });

    it('should evict the oldest entry when the cache exceeds max size', () => {
        // Fill the cache with 256 unique strings.
        for (let i = 0; i < 256; i++) {
            font.measureText(`str-${i}`);
        }

        // The 257th entry triggers FIFO eviction of 'str-0' (oldest).
        font.measureText('overflow');

        // Verify the oldest entry was actually removed from the cache.
        const cache = (font as unknown as { measureCache: Map<string, number> }).measureCache;

        expect(cache.has('str-0')).toBe(false);
        expect(cache.has('overflow')).toBe(true);

        // Font still measures correctly after eviction (recomputed on cache miss).
        expect(font.measureText('A')).toBe(9);
    });

    it('should report hasGlyph correctly', () => {
        expect(font.hasGlyph('A')).toBe(true);
        expect(font.hasGlyph('B')).toBe(true);
        expect(font.hasGlyph('\u00e9')).toBe(true);
        expect(font.hasGlyph('Z')).toBe(false);
    });

    it('should clear the measure cache', () => {
        font.measureText('A'); // Populate cache.
        font.clearMeasureCache();

        // After clearing, measurement still works (recomputed from glyph data).
        expect(font.measureText('A')).toBe(9);
    });

    it('should return the correct glyphCount', () => {
        expect(font.glyphCount).toBe(3);
    });

    it('should return null for getGlyph of a missing character', () => {
        expect(font.getGlyph('Z')).toBeNull();
    });

    it('should use Unicode Map fallback for getGlyph with a high-char code', () => {
        // '\u00e9' has char code 233 which is >= ASCII_CACHE_SIZE (128).
        const glyph = font.getGlyph('\u00e9');

        expect(glyph).not.toBeNull();
        expect(glyph?.advance).toBe(7);
    });

    it('should look up glyph by ASCII code with getGlyphByCode', () => {
        const glyph = font.getGlyphByCode('A'.charCodeAt(0)); // 65

        expect(glyph).not.toBeNull();
        expect(glyph?.advance).toBe(9);
    });

    it('should return null for getGlyphByCode of an unknown ASCII code', () => {
        expect(font.getGlyphByCode('Z'.charCodeAt(0))).toBeNull();
    });

    it('should use Map fallback for getGlyphByCode with Unicode code >= 128', () => {
        const glyph = font.getGlyphByCode(0x00e9); // 233

        expect(glyph).not.toBeNull();
        expect(glyph?.advance).toBe(7);
    });

    it('should return the sprite sheet from getSpriteSheet', () => {
        const spriteSheet = font.getSpriteSheet();

        expect(spriteSheet).toBeDefined();
        expect(spriteSheet.size.x).toBe(64);
        expect(spriteSheet.size.y).toBe(16);
    });

    it('should return the correct measureTextSize width and height', () => {
        const size = font.measureTextSize('AB');

        expect(size.width).toBe(17); // 9 + 8
        expect(size.height).toBe(14); // lineHeight
    });

    it('should write width and height into the provided object for measureTextSizeInto', () => {
        const result = { width: 0, height: 0 };

        font.measureTextSizeInto('A', result);

        expect(result.width).toBe(9);
        expect(result.height).toBe(14);
    });

    it('should use Unicode Map fallback for hasGlyph with char code >= 128', () => {
        expect(font.hasGlyph('\u00e9')).toBe(true);
        expect(font.hasGlyph('\u0100')).toBe(false); // not in font
    });

    it('should return 0 width for a character not in the font (measureText)', () => {
        expect(font.measureText('\u0100')).toBe(0);
    });

    describe('load error cases', () => {
        it('should throw when fetch returns a non-ok response', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

            await expect(BitmapFont.load('missing.btfont')).rejects.toThrow(
                "Can't find the font file 'missing.btfont'",
            );
        });

        it('should use a server-side message for non-404 font load failures', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

            await expect(BitmapFont.load('missing.btfont')).rejects.toThrow(
                "The server had a problem loading the font file 'missing.btfont'. Try refreshing the page.",
            );
        });

        it('should throw when font JSON is missing the texture field', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        name: 'Test',
                        size: 12,
                        lineHeight: 14,
                        baseline: 10,
                        glyphs: {},
                    }),
                ),
            );

            await expect(BitmapFont.load('bad.btfont')).rejects.toThrow(
                "The font file 'bad.btfont' is broken or not a valid .btfont file. Check that it's the right file.",
            );
        });

        it('should throw when font JSON is missing the glyphs field', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        name: 'Test',
                        size: 12,
                        lineHeight: 14,
                        baseline: 10,
                        texture: 'data:image/png;base64,aGVsbG8=',
                    }),
                ),
            );

            await expect(BitmapFont.load('bad.btfont')).rejects.toThrow(
                "The font file 'bad.btfont' is broken or not a valid .btfont file. Check that it's the right file.",
            );
        });

        it('should throw when the font texture image fails to load', async () => {
            vi.stubGlobal('Image', createStubImage({ fireError: true }));
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));

            await expect(BitmapFont.load('test.btfont')).rejects.toThrow("Can't find the font texture image");
        });

        it('should suggest .btfont when the font URL extension is wrong', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

            await expect(BitmapFont.load('missing.json')).rejects.toThrow(
                "The extension '.json' looks wrong for this file. Did you mean '.btfont'?",
            );
        });

        it('should reject oversized .btfont JSON before parsing glyphs', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    text: vi.fn().mockResolvedValue(' '.repeat(MAX_BTFONT_JSON_BYTES + 1)),
                }),
            );

            await expect(BitmapFont.load('huge.btfont')).rejects.toBeInstanceOf(AssetLimitError);
        });

        it('should reject fonts with too many glyphs', async () => {
            const glyphs: Record<string, GlyphData> = {};

            for (let i = 0; i < MAX_GLYPH_COUNT + 1; i++) {
                glyphs[`g${i}`] = { x: 0, y: 0, w: 1, h: 1, ox: 0, oy: 0, adv: 1 };
            }

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse({ ...MOCK_FONT_DATA, glyphs })));

            await expect(BitmapFont.load('many-glyphs.btfont')).rejects.toBeInstanceOf(AssetLimitError);
        });

        it('should reject glyph rectangles outside the texture atlas', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        glyphs: {
                            A: { x: 60, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 },
                        },
                    }),
                ),
            );

            await expect(BitmapFont.load('bad-glyph.btfont')).rejects.toThrow('outside the 64x16 font texture');
        });

        it('should reject invalid glyph metrics', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        glyphs: {
                            A: { x: 0, y: 0, w: 8.5, h: 12, ox: 0, oy: 0, adv: 9 },
                        },
                    }),
                ),
            );

            await expect(BitmapFont.load('bad-metrics.btfont')).rejects.toThrow('invalid width (w)');
        });

        it('should reject oversized font textures before creating a sprite sheet', async () => {
            vi.stubGlobal('Image', createStubImage({ width: MAX_ASSET_DIMENSION + 1, height: 16 }));
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));

            await expect(BitmapFont.load('huge-texture.btfont')).rejects.toBeInstanceOf(AssetLimitError);
        });

        it('should reject non-PNG embedded textures before image decode', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        texture: 'data:image/jpeg;base64,aGVsbG8=',
                    }),
                ),
            );

            await expect(BitmapFont.load('jpeg-texture.btfont')).rejects.toBeInstanceOf(AssetLimitError);
            await expect(BitmapFont.load('jpeg-texture.btfont')).rejects.toThrow('PNG data URI');
        });

        it('should reject oversized embedded texture payloads before image decode', async () => {
            const oversizedTexture = `data:image/png;base64,${'A'.repeat(MAX_BTFONT_EMBEDDED_TEXTURE_BYTES + 1)}`;

            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        texture: oversizedTexture,
                    }),
                ),
            );

            await expect(BitmapFont.load('huge-embedded.btfont')).rejects.toBeInstanceOf(AssetLimitError);
            await expect(BitmapFont.load('huge-embedded.btfont')).rejects.toThrow(
                MAX_BTFONT_EMBEDDED_TEXTURE_BYTES.toLocaleString('en-US'),
            );
        });

        it('should reject invalid glyph entries before loading the texture', async () => {
            const loadImageSpy = vi.fn();

            vi.stubGlobal('Image', createStubImage({ onSrcSet: loadImageSpy }));
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        glyphs: {
                            A: null,
                        },
                    }),
                ),
            );

            await expect(BitmapFont.load('bad-entry.btfont')).rejects.toBeInstanceOf(AssetLimitError);
            expect(loadImageSpy).not.toHaveBeenCalled();
        });

        it('should reject negative glyph metrics before loading the texture', async () => {
            const loadImageSpy = vi.fn();

            vi.stubGlobal('Image', createStubImage({ onSrcSet: loadImageSpy }));
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        ...MOCK_FONT_DATA,
                        glyphs: {
                            A: { x: -1, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 },
                        },
                    }),
                ),
            );

            await expect(BitmapFont.load('negative-glyph.btfont')).rejects.toBeInstanceOf(AssetLimitError);
            expect(loadImageSpy).not.toHaveBeenCalled();
        });

        it('should suggest absolute and relative paths when font URL omits / or ./', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

            await expect(BitmapFont.load('pixel-font.btfont')).rejects.toThrow(
                "Did you mean '/fonts/pixel-font.btfont' or './fonts/pixel-font.btfont'?",
            );
        });

        it('should resolve a relative texture path relative to the font URL', async () => {
            let capturedSrc = '';

            vi.stubGlobal(
                'Image',
                createStubImage({
                    onSrcSet: (src) => {
                        capturedSrc = src;
                    },
                }),
            );

            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(mockFontFetchResponse({ ...MOCK_FONT_DATA, texture: 'font-atlas.png' })),
            );

            const loaded = await BitmapFont.load('fonts/test.btfont');

            expect(loaded).toBeDefined();
            expect(capturedSrc).toBe('fonts/font-atlas.png');
        });
    });

    describe('default metadata fallbacks', () => {
        it('should use defaults when name, size, lineHeight, baseline are missing', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        texture: 'data:image/png;base64,aGVsbG8=',
                        glyphs: { A: { x: 0, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 } },
                    }),
                ),
            );

            const f = await BitmapFont.load('minimal.btfont');

            expect(f.name).toBe('Unknown');
            expect(f.size).toBe(12);
            expect(f.lineHeight).toBe(12);
            expect(f.baseline).toBe(12);
        });

        it('should use Unknown when name is a non-string value', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        name: 42,
                        texture: 'data:image/png;base64,aGVsbG8=',
                        glyphs: { A: { x: 0, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 } },
                    }),
                ),
            );

            const f = await BitmapFont.load('bad-name.btfont');

            expect(f.name).toBe('Unknown');
        });

        it('should fall back when size, lineHeight, and baseline are invalid', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        name: 'BadMetricsFont',
                        size: -5,
                        lineHeight: 'not-a-number',
                        baseline: 0,
                        texture: 'data:image/png;base64,aGVsbG8=',
                        glyphs: { A: { x: 0, y: 0, w: 8, h: 12, ox: 0, oy: 0, adv: 9 } },
                    }),
                ),
            );

            const f = await BitmapFont.load('bad-meta.btfont');

            expect(f.size).toBe(12);
            expect(f.lineHeight).toBe(12);
            expect(f.baseline).toBe(12);
        });

        it('should use size as a fallback for lineHeight and baseline', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockFontFetchResponse({
                        name: 'CustomFont',
                        size: 16,
                        texture: 'data:image/png;base64,aGVsbG8=',
                        glyphs: { A: { x: 0, y: 0, w: 8, h: 16, ox: 0, oy: 0, adv: 9 } },
                    }),
                ),
            );

            const f = await BitmapFont.load('partial.btfont');

            expect(f.name).toBe('CustomFont');
            expect(f.size).toBe(16);
            expect(f.lineHeight).toBe(16); // Falls back to size
            expect(f.baseline).toBe(16); // Falls back to size
        });
    });

    describe('edge cases', () => {
        it('should return 0 for measureText with empty string', () => {
            expect(font.measureText('')).toBe(0);
        });

        it('should measure mixed ASCII and Unicode text', () => {
            // A(9) + e-acute(7) + B(8) = 24
            const width = font.measureText('A\u00e9B');

            expect(width).toBe(24);
        });

        it('should return a new object from measureTextSize on each call', () => {
            const size1 = font.measureTextSize('A');
            const size2 = font.measureTextSize('AB');

            // Different references -- no aliasing.
            expect(size1).not.toBe(size2);

            // size1 keeps its own values even after size2 is computed.
            expect(size1.width).toBe(9);
            expect(size1.height).toBe(14);

            // size2 reflects its own text, independently.
            expect(size2.width).toBe(17);
            expect(size2.height).toBe(14);
        });
    });

    describe('createFromGlyphs', () => {
        it('creates a font with correct metadata', () => {
            const pixels = new Uint8Array(16 * 16) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(16, 16, pixels);

            const glyphs = new Map();

            glyphs.set('A', { rect: new Rect2i(0, 0, 8, 8), offsetX: 0, offsetY: 0, advance: 8 });
            glyphs.set('B', { rect: new Rect2i(8, 0, 8, 8), offsetX: 0, offsetY: 0, advance: 8 });

            const font = BitmapFont.createFromGlyphs(sheet, glyphs, 'TestFont', 8, 10, 8);

            expect(font.name).toBe('TestFont');
            expect(font.size).toBe(8);
            expect(font.lineHeight).toBe(10);
            expect(font.baseline).toBe(8);
            expect(font.glyphCount).toBe(2);
        });

        it('populates ASCII fast-path for single-byte characters', () => {
            const pixels = new Uint8Array(16 * 16) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(16, 16, pixels);

            const glyphs = new Map();

            glyphs.set('A', { rect: new Rect2i(0, 0, 8, 8), offsetX: 0, offsetY: 0, advance: 8 });

            const font = BitmapFont.createFromGlyphs(sheet, glyphs, 'Test', 8, 8, 8);

            expect(font.getGlyph('A')).not.toBeNull();
            expect(font.getGlyphByCode(65)).not.toBeNull();
            expect(font.getGlyph('A')).toBe(font.getGlyphByCode(65));
        });

        it('measures text correctly', () => {
            const pixels = new Uint8Array(16 * 16) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(16, 16, pixels);

            const glyphs = new Map();

            glyphs.set('H', { rect: new Rect2i(0, 0, 8, 8), offsetX: 0, offsetY: 0, advance: 8 });
            glyphs.set('i', { rect: new Rect2i(8, 0, 8, 8), offsetX: 0, offsetY: 0, advance: 6 });

            const font = BitmapFont.createFromGlyphs(sheet, glyphs, 'Test', 8, 8, 8);

            expect(font.measureText('Hi')).toBe(14); // 8 + 6
        });
    });

    describe('hot reload', () => {
        function activateHotReload() {
            registerHotContext({
                data: {},
                on: vi.fn(),
                invalidate: vi.fn(),
                accept: vi.fn(),
            });
        }

        it('does not register a loaded font when hot reload is inactive', () => {
            expect(getHotReloadFonts('test.btfont')).toBeUndefined();
        });

        it('registers a loaded font under its normalized source URL once hot reload is active', async () => {
            activateHotReload();
            vi.stubGlobal('Image', createStubImage());
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));

            const active = await BitmapFont.load('fonts/active.btfont');

            expect(getHotReloadFonts('fonts/active.btfont')).toEqual(new Set([active]));
        });

        describe('hotReload', () => {
            it('rebuilds glyph tables from the re-fetched .btfont data', async () => {
                const updated = {
                    ...MOCK_FONT_DATA,
                    glyphs: { ...MOCK_FONT_DATA.glyphs, A: { x: 0, y: 0, w: 20, h: 12, ox: 0, oy: 0, adv: 21 } },
                };
                vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(updated)));

                await font.hotReload('test.btfont', null);

                expect(font.getGlyph('A')?.advance).toBe(21);
            });

            it('fetches the .btfont JSON with a cache-busting query parameter', async () => {
                const fetchSpy = vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA));
                vi.stubGlobal('fetch', fetchSpy);

                await font.hotReload('test.btfont', null);

                const [requestedUrl] = fetchSpy.mock.calls[0] as [string];
                expect(requestedUrl).toMatch(/^test\.btfont\?blit386-hmr=\d+$/);
            });

            it('clears the measurement cache', async () => {
                font.measureText('AB');
                vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));

                const clearSpy = vi.spyOn(font, 'clearMeasureCache');
                await font.hotReload('test.btfont', null);

                expect(clearSpy).toHaveBeenCalledOnce();
            });

            it('replaces the underlying sprite sheet image', async () => {
                vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(MOCK_FONT_DATA)));
                const replaceSpy = vi.spyOn(SpriteSheet.prototype, 'hotReplaceImage');

                await font.hotReload('test.btfont', null);

                expect(replaceSpy).toHaveBeenCalledOnce();
            });

            it('throws when the re-fetched .btfont file is missing', async () => {
                vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

                await expect(font.hotReload('test.btfont', null)).rejects.toThrow("Can't find the font file");
            });

            it('cache-busts a relative texture path but not an embedded data URI', async () => {
                const relativeData = { ...MOCK_FONT_DATA, texture: 'atlas.png' };
                vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(relativeData)));

                const imageSources: string[] = [];
                vi.stubGlobal('Image', createStubImage({ onSrcSet: (src) => imageSources.push(src) }));

                const relFont = await BitmapFont.load('fonts/rel.btfont');
                imageSources.length = 0;

                vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFontFetchResponse(relativeData)));
                await relFont.hotReload('fonts/rel.btfont', null);

                expect(imageSources[0]).toMatch(/^fonts\/atlas\.png\?blit386-hmr=\d+$/);
            });
        });
    });
});
