#!/usr/bin/env node

/**
 * System Font PNG to TypeScript Converter
 *
 * Reads a PNG atlas (16 columns of 6x14 glyphs: ASCII 32-126 followed by
 * SYSTEM_FONT_EXTRA_CHARS, see system-font-extra-chars.mjs) and regenerates
 * src/assets/fonts/systemFontData.ts with the corresponding bit-pattern data.
 *
 * Any pixel whose red channel is >= 128 is treated as "on" (foreground).
 * Everything else is "off" (transparent).
 *
 * Usage:
 *   node scripts/convert-system-font.mjs [input-path]
 *
 * Default input: assets/system-font.png
 * Output: src/assets/fonts/systemFontData.ts (always overwritten)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { SYSTEM_FONT_EXTRA_CHARS } from './system-font-extra-chars.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DEFAULT_INPUT = join(PROJECT_ROOT, 'assets/system-font.png');
const OUTPUT_PATH = join(PROJECT_ROOT, 'src/assets/fonts/systemFontData.ts');

const GLYPH_WIDTH = 6;
const GLYPH_HEIGHT = 14;
const ATLAS_COLS = 16;
const FIRST_CHAR = 32;
const LAST_CHAR = 126;
const ASCII_GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1; // 95
// Contiguous ASCII block (32-126) followed by SYSTEM_FONT_EXTRA_CHARS, in atlas order.
const GLYPH_COUNT = ASCII_GLYPH_COUNT + SYSTEM_FONT_EXTRA_CHARS.length;
const ATLAS_ROWS = Math.ceil(GLYPH_COUNT / ATLAS_COLS);
const ATLAS_WIDTH = ATLAS_COLS * GLYPH_WIDTH;
const ATLAS_HEIGHT = ATLAS_ROWS * GLYPH_HEIGHT;
const ON_THRESHOLD = 128; // Red channel >= this means "on".

/**
 * Reads the PNG and extracts bit patterns for every glyph (ASCII plus extras).
 *
 * @param {string} inputPath – Path to the PNG atlas.
 * @returns {number[]} Flat array of `GLYPH_COUNT * GLYPH_HEIGHT` bytes.
 */
function extractBitmaps(inputPath) {
    const pngData = readFileSync(inputPath);
    const png = PNG.sync.read(pngData);

    if (png.width !== ATLAS_WIDTH || png.height !== ATLAS_HEIGHT) {
        console.error(`Error: Expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT} PNG, got ${png.width}x${png.height}.`);
        process.exit(1);
    }

    const bitmaps = [];

    for (let glyphIndex = 0; glyphIndex < GLYPH_COUNT; glyphIndex++) {
        const col = glyphIndex % ATLAS_COLS;
        const row = Math.floor(glyphIndex / ATLAS_COLS);
        const baseX = col * GLYPH_WIDTH;
        const baseY = row * GLYPH_HEIGHT;

        for (let py = 0; py < GLYPH_HEIGHT; py++) {
            let byte = 0;

            for (let px = 0; px < GLYPH_WIDTH; px++) {
                const x = baseX + px;
                const y = baseY + py;
                const idx = (y * ATLAS_WIDTH + x) * 4;
                // eslint-disable-next-line security/detect-object-injection
                const red = png.data[idx];

                // Bit 7 = leftmost pixel, bit 0 = rightmost.
                if (red >= ON_THRESHOLD) {
                    byte |= 1 << (7 - px);
                }
            }

            bitmaps.push(byte);
        }
    }

    return bitmaps;
}

/**
 * Returns the printable label for an ASCII character code.
 *
 * @param {number} charCode – ASCII character code.
 * @returns {string} Human-readable label (e.g., "A (65)" or "Space (32)").
 */
function charLabel(charCode) {
    if (charCode === 32) {
        return 'Space (32)';
    }

    return `${String.fromCharCode(charCode)} (${charCode})`;
}

/**
 * Returns the printable label for an extra (non-ASCII) glyph.
 *
 * @param {{ codePoint: number, label: string }} extra – Entry from SYSTEM_FONT_EXTRA_CHARS.
 * @returns {string} Human-readable label (e.g., "En Dash (U+2013)").
 */
function extraCharLabel({ codePoint, label }) {
    return `${label} (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`;
}

/**
 * Formats a byte as a two-digit hex string with 0x prefix.
 *
 * @param {number} value – Byte value (0-255).
 * @returns {string} Formatted hex string.
 */
function hex(value) {
    return `0x${value.toString(16).padStart(2, '0')}`;
}

/**
 * Formats a code point as a `0x` hex literal, matching SYSTEM_FONT_EXTRA_CHARS's own style.
 *
 * @param {number} codePoint – Unicode code point.
 * @returns {string} Formatted hex literal (e.g., "0xfffd").
 */
function codePointLiteral(codePoint) {
    return `0x${codePoint.toString(16).padStart(4, '0')}`;
}

/**
 * Generates the TypeScript source for systemFontData.ts.
 *
 * @param {number[]} bitmaps – Flat array of `GLYPH_COUNT * GLYPH_HEIGHT` bytes.
 * @returns {string} Complete TypeScript source file content.
 */
function generateTypeScript(bitmaps) {
    const lines = [];

    lines.push('/**');
    lines.push(' * Built-in system font bitmap data.');
    lines.push(' *');
    lines.push(` * Covers printable ASCII characters 32-126 (${ASCII_GLYPH_COUNT} glyphs), followed by`);
    lines.push(` * ${SYSTEM_FONT_EXTRA_CHARS.length} extra, non-contiguous glyphs (see SYSTEM_FONT_EXTRA_CHARS`);
    lines.push(' * below). Each glyph is 14 bytes, one byte per row (top to bottom). Bit 7 is');
    lines.push(' * the leftmost pixel; only the top 6 bits (bits 7-2) are used for the 6-pixel');
    lines.push(' * glyph width. A set bit means palette index 1 (opaque foreground); a clear');
    lines.push(' * bit means index 0 (transparent).');
    lines.push(' *');
    lines.push(` * The data is a flat array of ${GLYPH_COUNT} * 14 = ${GLYPH_COUNT * GLYPH_HEIGHT} bytes. ASCII`);
    lines.push(' * glyph for character code `c` sits at offset `(c - 32) * 14`; each extra');
    lines.push(' * glyph sits at offset `(ASCII_GLYPH_COUNT + i) * 14`, where `i` is its index');
    lines.push(' * in SYSTEM_FONT_EXTRA_CHARS.');
    lines.push(' *');
    lines.push(' * This file is auto-generated by `pnpm system-font:convert` from the PNG');
    lines.push(' * atlas at `assets/system-font.png`. To edit the font visually, modify the');
    lines.push(' * PNG in a pixel editor and re-run the conversion script. To export the');
    lines.push(' * current data back to PNG, use `pnpm system-font:export`.');
    lines.push(' *');
    lines.push(' * This font data is in the public domain.');
    lines.push(' */');
    lines.push('');
    lines.push('// prettier-ignore');
    lines.push('export const SYSTEM_FONT_BITMAPS: readonly number[] = [');

    for (let glyphIndex = 0; glyphIndex < GLYPH_COUNT; glyphIndex++) {
        const isExtra = glyphIndex >= ASCII_GLYPH_COUNT;
        const label = isExtra
            ? extraCharLabel(SYSTEM_FONT_EXTRA_CHARS[glyphIndex - ASCII_GLYPH_COUNT])
            : charLabel(FIRST_CHAR + glyphIndex);
        const offset = glyphIndex * GLYPH_HEIGHT;
        const bytes = bitmaps.slice(offset, offset + GLYPH_HEIGHT);
        const hexValues = bytes.map((b) => hex(b)).join(', ');

        lines.push(`    // ${label}`);
        lines.push(`    ${hexValues},`);
    }

    lines.push('];');
    lines.push('');
    lines.push('/** First character code of the contiguous ASCII block in the bitmap array. */');

    lines.push('export const SYSTEM_FONT_FIRST_CHAR = 32;');
    lines.push('');
    lines.push('/** Last character code of the contiguous ASCII block in the bitmap array (inclusive). */');
    lines.push('export const SYSTEM_FONT_LAST_CHAR = 126;');
    lines.push('');
    lines.push('/** Number of glyphs in the contiguous ASCII block. */');
    lines.push('export const SYSTEM_FONT_ASCII_GLYPH_COUNT = SYSTEM_FONT_LAST_CHAR - SYSTEM_FONT_FIRST_CHAR + 1;');
    lines.push('');
    lines.push(
        '/**\n' +
            ' * Code points of the non-contiguous glyphs appended after the ASCII block, in atlas order.\n' +
            ' * Index `i` here maps to bitmap offset `(SYSTEM_FONT_ASCII_GLYPH_COUNT + i) * SYSTEM_FONT_BYTES_PER_GLYPH`.\n' +
            ' * Regenerate with `pnpm system-font:convert` after editing scripts/system-font-extra-chars.mjs.\n' +
            ' */',
    );
    lines.push('export const SYSTEM_FONT_EXTRA_CHARS: readonly number[] = [');
    lines.push(
        `    ${SYSTEM_FONT_EXTRA_CHARS.map((extra) => `${codePointLiteral(extra.codePoint)}, // ${extraCharLabel(extra)}`).join('\n    ')}`,
    );
    lines.push('];');
    lines.push('');
    lines.push('/** Total number of glyphs in the system font (ASCII block plus extras). */');
    lines.push(
        'export const SYSTEM_FONT_GLYPH_COUNT = SYSTEM_FONT_ASCII_GLYPH_COUNT + SYSTEM_FONT_EXTRA_CHARS.length;',
    );
    lines.push('');
    lines.push('/** Width of each glyph in pixels. */');
    lines.push('export const SYSTEM_FONT_GLYPH_WIDTH = 6;');
    lines.push('');
    lines.push('/** Height of each glyph in pixels. */');
    lines.push('export const SYSTEM_FONT_GLYPH_HEIGHT = 14;');
    lines.push('');
    lines.push('/** Number of bytes per glyph (one byte per row). */');
    lines.push('export const SYSTEM_FONT_BYTES_PER_GLYPH = 14;');

    return lines.join('\n');
}

function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
System Font PNG to TypeScript Converter

Reads a PNG atlas and regenerates systemFontData.ts.
Layout: 16 columns of 6x14 glyphs – ASCII 32-126, then the extra glyphs
listed in system-font-extra-chars.mjs (fallback, dashes, arrows, etc.).
Any pixel with red channel >= 128 is treated as foreground.

Usage:
  node scripts/convert-system-font.mjs [input-path]

Default input: assets/system-font.png
Output: src/assets/fonts/systemFontData.ts (always overwritten)

Options:
  -h, --help     Show this help message
`);
        process.exit(0);
    }

    const inputPath = args[0] || DEFAULT_INPUT;
    const bitmaps = extractBitmaps(inputPath);
    const source = generateTypeScript(bitmaps);

    writeFileSync(OUTPUT_PATH, source);

    console.log(`Converted system font from: ${inputPath}`);
    console.log(`  Output: ${OUTPUT_PATH}`);
    console.log(
        `  Glyphs: ${GLYPH_COUNT} (ASCII ${FIRST_CHAR}-${LAST_CHAR}, plus ${SYSTEM_FONT_EXTRA_CHARS.length} extra)`,
    );
    console.log(`  Atlas: ${ATLAS_WIDTH}x${ATLAS_HEIGHT} pixels (${ATLAS_COLS}x${ATLAS_ROWS} grid)`);
}

main();
