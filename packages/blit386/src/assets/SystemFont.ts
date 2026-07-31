/**
 * Built-in 6x14 system font for {@link BT.systemPrint}.
 *
 * Expands the embedded glyph bitmaps from system font data into a
 * palette-indexed texture atlas and wraps the result in a {@link BitmapFont}.
 * The font is fully synchronous to create - no `fetch()`, no image decode.
 *
 * The glyph data lives in `src/assets/fonts/systemFontData.ts`. To edit it
 * visually, export the current bitmaps to a PNG, redraw in a pixel editor,
 * then convert back:
 *
 * ```bash
 * pnpm system-font:export   # writes assets/system-font.png
 * # edit assets/system-font.png in a pixel editor
 * pnpm system-font:convert  # regenerates systemFontData.ts from the PNG
 * ```
 */

import { Rect2i } from '../utils/Rect2i';
import type { Glyph } from './BitmapFont';
import { BitmapFont } from './BitmapFont';
import {
    SYSTEM_FONT_BITMAPS,
    SYSTEM_FONT_BYTES_PER_GLYPH,
    SYSTEM_FONT_FIRST_CHAR,
    SYSTEM_FONT_GLYPH_COUNT,
    SYSTEM_FONT_GLYPH_HEIGHT,
    SYSTEM_FONT_GLYPH_WIDTH,
} from './fonts/systemFontData';
import { SpriteSheet } from './SpriteSheet';

/** Number of glyph columns in the texture atlas. */
const ATLAS_COLUMNS = 16;

/** Number of glyph rows in the texture atlas. */
const ATLAS_ROWS = Math.ceil(SYSTEM_FONT_GLYPH_COUNT / ATLAS_COLUMNS);

/** Atlas width in pixels. */
const ATLAS_WIDTH = ATLAS_COLUMNS * SYSTEM_FONT_GLYPH_WIDTH;

/** Atlas height in pixels. */
const ATLAS_HEIGHT = ATLAS_ROWS * SYSTEM_FONT_GLYPH_HEIGHT;

/**
 * Writes one glyph's pixel rows into the flat palette-indexed atlas array.
 * Bit 7 of each bitmap byte is the leftmost pixel.
 * A set bit maps to palette index 1 (foreground); a clear bit maps to 0 (transparent).
 *
 * @param bitmapOffset - Offset into the glyph bitmap data.
 * @param baseX - X-coordinate of the glyph's top-left corner in the atlas.
 * @param baseY - Y-coordinate of the glyph's top-left corner in the atlas.
 * @param pixels - Output pixel buffer to write into.
 */
function writeGlyphPixels(bitmapOffset: number, baseX: number, baseY: number, pixels: Uint8Array<ArrayBuffer>): void {
    const pixelCount = SYSTEM_FONT_GLYPH_HEIGHT * SYSTEM_FONT_GLYPH_WIDTH;

    for (let flat = 0; flat < pixelCount; flat++) {
        const y = Math.floor(flat / SYSTEM_FONT_GLYPH_WIDTH);
        const x = flat % SYSTEM_FONT_GLYPH_WIDTH;

        // Safe: length validated in buildAtlasPixels guarantees bitmapOffset + y is in bounds.
        const rowByte = SYSTEM_FONT_BITMAPS[bitmapOffset + y] as number;

        pixels[(baseY + y) * ATLAS_WIDTH + (baseX + x)] = (rowByte >> (7 - x)) & 1;
    }
}

/**
 * Expands bit-pattern glyph data into a flat palette-indexed pixel array.
 *
 * Each set bit becomes palette index `1` (foreground); each clear bit becomes
 * index `0` (transparent). The layout is a grid of {@link ATLAS_COLUMNS}
 * columns by {@link ATLAS_ROWS} rows.
 *
 * @returns Uint8Array of `ATLAS_WIDTH * ATLAS_HEIGHT` palette indices.
 */
function buildAtlasPixels(): Uint8Array<ArrayBuffer> {
    const expectedLength = SYSTEM_FONT_GLYPH_COUNT * SYSTEM_FONT_BYTES_PER_GLYPH;

    if (SYSTEM_FONT_BITMAPS.length < expectedLength) {
        throw new Error(
            `[SystemFont] SYSTEM_FONT_BITMAPS has ${SYSTEM_FONT_BITMAPS.length} entries, expected at least ${expectedLength}.`,
        );
    }

    const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT) as Uint8Array<ArrayBuffer>;

    for (let i = 0; i < SYSTEM_FONT_GLYPH_COUNT; i++) {
        const col = i % ATLAS_COLUMNS;
        const row = Math.floor(i / ATLAS_COLUMNS);

        writeGlyphPixels(
            i * SYSTEM_FONT_BYTES_PER_GLYPH,
            col * SYSTEM_FONT_GLYPH_WIDTH,
            row * SYSTEM_FONT_GLYPH_HEIGHT,
            pixels,
        );
    }

    return pixels;
}

/**
 * Builds the glyph map for all printable ASCII characters.
 *
 * @returns Map of single-character strings to their {@link Glyph} metadata.
 */
function buildGlyphMap(): Map<string, Glyph> {
    return new Map(
        Array.from({ length: SYSTEM_FONT_GLYPH_COUNT }, (_, i) => {
            const col = i % ATLAS_COLUMNS;
            const row = Math.floor(i / ATLAS_COLUMNS);

            const glyph: Glyph = {
                rect: new Rect2i(
                    col * SYSTEM_FONT_GLYPH_WIDTH,
                    row * SYSTEM_FONT_GLYPH_HEIGHT,
                    SYSTEM_FONT_GLYPH_WIDTH,
                    SYSTEM_FONT_GLYPH_HEIGHT,
                ),
                offsetX: 0,
                offsetY: 0,
                advance: SYSTEM_FONT_GLYPH_WIDTH,
            };

            return [String.fromCharCode(SYSTEM_FONT_FIRST_CHAR + i), glyph] as [string, Glyph];
        }),
    );
}

/**
 * Creates the built-in 6x14 system font.
 *
 * The returned {@link BitmapFont} is immediately ready for rendering through
 * the sprite pipeline. Its texture stores only palette indices `0`
 * (transparent) and `1` (foreground), so it works with any palette by using
 * `paletteOffset = desiredPaletteIndex - 1`.
 *
 * @returns A fully constructed BitmapFont with the built-in 6x14 glyphs.
 */
export function createSystemFont(): BitmapFont {
    const pixels = buildAtlasPixels();
    const spriteSheet = SpriteSheet.fromIndexedPixels(ATLAS_WIDTH, ATLAS_HEIGHT, pixels);
    const glyphs = buildGlyphMap();

    return BitmapFont.createFromGlyphs(
        spriteSheet,
        glyphs,
        'System',
        SYSTEM_FONT_GLYPH_HEIGHT,
        SYSTEM_FONT_GLYPH_HEIGHT,
        SYSTEM_FONT_GLYPH_HEIGHT,
    );
}
