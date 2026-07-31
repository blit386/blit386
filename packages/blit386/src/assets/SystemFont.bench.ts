/**
 * Tier 1 CPU benchmarks for the built-in system font.
 *
 * Measures:
 * - `createSystemFont()` construction time (atlas expansion + BitmapFont creation)
 * - Glyph lookup throughput (ASCII fast-path)
 * - Text measurement throughput
 */

import { bench, describe } from 'vitest';

import { createSystemFont } from './SystemFont';

const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

const SHORT_TEXT = 'Hello, World!';
const LONG_TEXT = 'The quick brown fox jumps over the lazy dog. 0123456789 ~!@#$%^&*()';

describe('SystemFont creation', () => {
    bench(
        'createSystemFont()',
        () => {
            createSystemFont();
        },
        BENCH_OPTIONS,
    );
});

describe('SystemFont glyph lookup', () => {
    const font = createSystemFont();

    bench(
        'getGlyph (single char)',
        () => {
            font.getGlyph('A');
        },
        BENCH_OPTIONS,
    );

    bench(
        'getGlyphByCode (ASCII fast-path)',
        () => {
            font.getGlyphByCode(65);
        },
        BENCH_OPTIONS,
    );

    bench(
        'getGlyph for all printable ASCII',
        () => {
            for (let code = 32; code <= 126; code++) {
                font.getGlyphByCode(code);
            }
        },
        BENCH_OPTIONS,
    );
});

describe('SystemFont text measurement', () => {
    const font = createSystemFont();

    bench(
        'measureText (short string, cold cache)',
        () => {
            font.clearMeasureCache();
            font.measureText(SHORT_TEXT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'measureText (short string, warm cache)',
        () => {
            font.measureText(SHORT_TEXT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'measureText (long string, cold cache)',
        () => {
            font.clearMeasureCache();
            font.measureText(LONG_TEXT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'measureTextSize (short string)',
        () => {
            font.measureTextSize(SHORT_TEXT);
        },
        BENCH_OPTIONS,
    );
});
