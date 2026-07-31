import { bench, describe } from 'vitest';

import { resetUsage } from '../core/RenderPaletteUsage';
import { Rect2i } from '../utils/Rect2i';
import { SpriteSheet } from './SpriteSheet';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** 8x8 glyph-sized rect (typical bitmap font glyph). */
const GLYPH_RECT = new Rect2i(0, 0, 8, 8);

/** 64x64 sprite rect. */
const SPRITE_RECT = new Rect2i(0, 0, 64, 64);

/**
 * Builds an indexized sheet filled with cycling non-zero palette indices.
 *
 * @param width - Sheet width in pixels.
 * @param height - Sheet height in pixels.
 * @returns Sprite sheet for benchmark fixtures.
 */
function makeBenchSheet(width: number, height: number): SpriteSheet {
    const pixels = new Uint8Array(width * height) as Uint8Array<ArrayBuffer>;

    for (let i = 0; i < pixels.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- loop index bounded by buffer length
        pixels[i] = (i % 7) + 1;
    }

    return SpriteSheet.fromIndexedPixels(width, height, pixels);
}

const glyphSheet = makeBenchSheet(8, 8);
const spriteSheet = makeBenchSheet(64, 64);
const usageMask = new Uint8Array(256);

describe('SpriteSheet.markPaletteIndicesInRect', () => {
    bench(
        'glyph rect (8x8)',
        () => {
            resetUsage(usageMask);
            glyphSheet.markPaletteIndicesInRect(GLYPH_RECT, 0, usageMask);
        },
        BENCH_OPTIONS,
    );

    bench(
        'sprite rect (64x64)',
        () => {
            resetUsage(usageMask);
            spriteSheet.markPaletteIndicesInRect(SPRITE_RECT, 0, usageMask);
        },
        BENCH_OPTIONS,
    );
});
