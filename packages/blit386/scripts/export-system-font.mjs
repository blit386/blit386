#!/usr/bin/env node

/**
 * System Font PNG Exporter
 *
 * Reads the bit-pattern data from systemFontData.ts and writes a 96x84 PNG
 * to assets/system-font.png. Each set bit becomes a white pixel; each clear
 * bit becomes a black pixel. The layout is 16 columns x 6 rows of 6x14 glyphs
 * covering ASCII 32-126.
 *
 * Usage:
 *   node scripts/export-system-font.mjs [output-path]
 *
 * Default output: assets/system-font.png
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const FONT_DATA_PATH = join(PROJECT_ROOT, 'src/assets/fonts/systemFontData.ts');
const DEFAULT_OUTPUT = join(PROJECT_ROOT, 'assets/system-font.png');

const GLYPH_WIDTH = 6;
const GLYPH_HEIGHT = 14;
const ATLAS_COLS = 16;
const ATLAS_ROWS = 6;
const ATLAS_WIDTH = ATLAS_COLS * GLYPH_WIDTH; // 96
const ATLAS_HEIGHT = ATLAS_ROWS * GLYPH_HEIGHT; // 84
const FIRST_CHAR = 32;
const LAST_CHAR = 126;
const GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1; // 95

/**
 * Parses the SYSTEM_FONT_BITMAPS array from the TypeScript source file.
 * Extracts all hex literals from the array initializer.
 *
 * @returns {number[]} The flat array of glyph bytes (1330 entries).
 */
function parseBitmapData() {
    const source = readFileSync(FONT_DATA_PATH, 'utf-8');

    // Anchor to the SYSTEM_FONT_BITMAPS identifier, then find its array initializer.
    const identIndex = source.indexOf('SYSTEM_FONT_BITMAPS');

    if (identIndex === -1) {
        console.error('Error: Could not find SYSTEM_FONT_BITMAPS identifier in the source file.');
        process.exit(1);
    }

    const startIndex = source.indexOf('[', identIndex);
    const endIndex = source.indexOf('];', startIndex);

    if (startIndex === -1 || endIndex === -1) {
        console.error('Error: Could not find SYSTEM_FONT_BITMAPS array initializer in the source file.');
        process.exit(1);
    }

    const arrayContent = source.slice(startIndex + 1, endIndex);

    // Extract all hex values (0x00 - 0xff).
    const hexPattern = /0x[\da-fA-F]{2}/g;
    const matches = arrayContent.match(hexPattern);

    if (!matches || matches.length !== GLYPH_COUNT * GLYPH_HEIGHT) {
        console.error(
            `Error: Expected ${GLYPH_COUNT * GLYPH_HEIGHT} hex values, found ${matches ? matches.length : 0}.`,
        );
        process.exit(1);
    }

    return matches.map((hex) => parseInt(hex, 16));
}

/**
 * Builds a 96x84 RGBA PNG from the bit-pattern data.
 * Set bits become white (255,255,255,255), clear bits become black (0,0,0,255).
 *
 * @param {number[]} bitmaps - The flat array of glyph bytes.
 * @returns {Buffer} The PNG file data.
 */
function buildPNG(bitmaps) {
    const png = new PNG({ width: ATLAS_WIDTH, height: ATLAS_HEIGHT });

    // Fill with black (fully opaque).
    for (let i = 0; i < png.data.length; i += 4) {
        // eslint-disable-next-line security/detect-object-injection
        png.data[i] = 0; // R
        png.data[i + 1] = 0; // G
        png.data[i + 2] = 0; // B
        png.data[i + 3] = 255; // A
    }

    // Draw each glyph into the atlas.
    for (let glyphIndex = 0; glyphIndex < GLYPH_COUNT; glyphIndex++) {
        const col = glyphIndex % ATLAS_COLS;
        const row = Math.floor(glyphIndex / ATLAS_COLS);
        const baseX = col * GLYPH_WIDTH;
        const baseY = row * GLYPH_HEIGHT;
        const dataOffset = glyphIndex * GLYPH_HEIGHT;

        for (let py = 0; py < GLYPH_HEIGHT; py++) {
            const byte = bitmaps[dataOffset + py];

            for (let px = 0; px < GLYPH_WIDTH; px++) {
                // Bit 7 = leftmost pixel, bit 0 = rightmost.
                const bit = (byte >> (7 - px)) & 1;

                if (bit) {
                    const x = baseX + px;
                    const y = baseY + py;
                    const idx = (y * ATLAS_WIDTH + x) * 4;

                    // eslint-disable-next-line security/detect-object-injection
                    png.data[idx] = 255; // R
                    png.data[idx + 1] = 255; // G
                    png.data[idx + 2] = 255; // B
                    // A is already 255.
                }
            }
        }
    }

    return PNG.sync.write(png);
}

function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
System Font PNG Exporter

Exports the embedded system font bit patterns to a 96x84 PNG atlas.
Layout: 16 columns x 6 rows of 6x14 glyphs (ASCII 32-126).
White pixels = foreground, black pixels = background.

Usage:
  node scripts/export-system-font.mjs [output-path]

Default output: assets/system-font.png

Options:
  -h, --help     Show this help message
`);
        process.exit(0);
    }

    const outputPath = args[0] || DEFAULT_OUTPUT;
    const bitmaps = parseBitmapData();
    const pngData = buildPNG(bitmaps);

    writeFileSync(outputPath, pngData);

    console.log(`Exported system font to: ${outputPath}`);
    console.log(`  Atlas size: ${ATLAS_WIDTH}x${ATLAS_HEIGHT} pixels`);
    console.log(`  Glyphs: ${GLYPH_COUNT} (ASCII ${FIRST_CHAR}-${LAST_CHAR})`);
    console.log(`  Layout: ${ATLAS_COLS} columns x ${ATLAS_ROWS} rows`);
    console.log(`  File size: ${pngData.length} bytes`);
}

main();
