import { bench, describe } from 'vitest';

import { resetUsage } from '../core/RenderPaletteUsage';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Palette } from './Palette';
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
/** 64x64 sheet cut into 8x8 tiles: 64 tiles. */
const tileSheet = makeBenchSheet(64, 64);
tileSheet.tileSize = 8;

/** Keeps each `tileRect` result live so V8 cannot scalar-replace the allocation being measured. */
const tileRectSink = { value: 0 };

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

describe('SpriteSheet.tileRect', () => {
    bench(
        'tileRect(index) x 64 (allocates one Rect2i each)',
        () => {
            for (let i = 0; i < 64; i++) {
                tileRectSink.value += tileSheet.tileRect(i).x;
            }
        },
        BENCH_OPTIONS,
    );
});

/** 256x256 opaque image cycling through palette slots 1-255. */
const INDEXIZE_SIZE = 256;
const indexizePalette = new Palette(256);
const indexizeRgba = new Uint8ClampedArray(INDEXIZE_SIZE * INDEXIZE_SIZE * 4);

for (let slot = 1; slot < 256; slot++) {
    indexizePalette.set(slot, new Color32(slot, 255 - slot, (slot * 7) & 255, 255));
}

for (let i = 0; i < INDEXIZE_SIZE * INDEXIZE_SIZE; i++) {
    const c = indexizePalette.getRef((i % 255) + 1);

    indexizeRgba.set([c.r, c.g, c.b, 255], i * 4);
}

/** Stand-in for the browser canvas so `indexize` decodes `indexizeRgba` in Node. */
class IndexizeCanvas {
    public readonly width = INDEXIZE_SIZE;
    public readonly height = INDEXIZE_SIZE;

    /**
     * Builds the fake 2D context.
     *
     * @returns Minimal 2D context whose `getImageData` yields the fixture pixels.
     */
    getContext() {
        return { drawImage: () => {}, imageSmoothingEnabled: false, getImageData: () => ({ data: indexizeRgba }) };
    }
}

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = IndexizeCanvas;

describe('SpriteSheet.indexize', () => {
    bench(
        'indexize 256x256, palette 256',
        () => {
            const sheet = new SpriteSheet({ width: INDEXIZE_SIZE, height: INDEXIZE_SIZE } as HTMLImageElement);

            sheet.indexize(indexizePalette);
        },
        BENCH_OPTIONS,
    );
});
