/**
 * Tier 1 CPU benchmarks for {@link SpritePipeline}'s vertex batch filling.
 *
 * Measures the CPU-side cost of queuing sprite and bitmap-text draws – `drawSprite()` and
 * `drawBitmapText()` both resolve a texture, compute UVs via `SpriteSheet.getUVs()` (a known
 * per-quad object allocation), and append vertices into the shared batch buffer:
 * - `drawSprite()` throughput for a run of same-texture quads
 * - `drawBitmapText()` throughput for a realistic string length
 * - `reset()` cost against a fully populated batch
 *
 * A single mock `GPUDevice` and one `SpritePipeline.init()` call are shared across every bench
 * case so init cost is excluded and the per-texture bind-group cache (a `WeakMap`, populated once
 * per texture) behaves as it does at runtime – it is created on the first `drawSprite()` call and
 * reused for every call after, even across bench iterations.
 */

import { bench, describe } from 'vitest';

import { createMockGPUDevice, createMockPaletteBuffer, installMockNavigatorGPU } from '../__test__/webgpu-mock';
import { SpriteSheet } from '../assets/SpriteSheet';
import { createSystemFont } from '../assets/SystemFont';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { SpritePipeline } from './SpritePipeline';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Number of same-texture quads drawn per `drawSprite` bench iteration. */
const SPRITE_DRAW_COUNT = 5000;

/** Number of `drawBitmapText` calls per bench iteration. */
const TEXT_DRAW_COUNT = 50;

/** Character length of the string drawn by each `drawBitmapText` call. */
const TEXT_LENGTH = 200;

/** 16x16 sprite rect – a typical tile size. */
const SPRITE_RECT = new Rect2i(0, 0, 16, 16);

/** Fixed destination position – position value does not affect UV or batching cost. */
const DEST_POS = new Vector2i(10, 10);

/** Fixed text position for `drawBitmapText` benches. */
const TEXT_POS = new Vector2i(0, 0);

/**
 * Builds an indexized sprite sheet filled with cycling non-zero palette indices.
 *
 * @param width – Sheet width in pixels.
 * @param height – Sheet height in pixels.
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

/**
 * Builds a fixed-length string cycling through the printable ASCII range so every character
 * resolves to a real glyph in the built-in system font.
 *
 * @param length – Desired string length.
 * @returns Printable-ASCII string of exactly `length` characters.
 */
function makePrintableAsciiText(length: number): string {
    const PRINTABLE_ASCII_START = 32;
    const PRINTABLE_ASCII_RANGE = 95; // 32-126 inclusive
    let text = '';

    for (let i = 0; i < length; i++) {
        text += String.fromCharCode(PRINTABLE_ASCII_START + (i % PRINTABLE_ASCII_RANGE));
    }

    return text;
}

/**
 * Fills a pipeline's batch with a fixed number of same-texture sprite quads.
 * Shared by the `drawSprite` throughput bench and the `reset()` setup below.
 *
 * @param pipeline – Pipeline instance to fill.
 * @param spriteSheet – Source sprite sheet drawn on every call.
 * @param count – Number of quads to draw.
 */
function fillWithSprites(pipeline: SpritePipeline, spriteSheet: SpriteSheet, count: number): void {
    for (let i = 0; i < count; i++) {
        pipeline.drawSprite(spriteSheet, SPRITE_RECT, DEST_POS);
    }
}

// Top-level await: one GPUDevice mock and one init() call shared by every bench case below, so
// init cost is excluded and the per-texture bind-group cache behaves as it does at runtime.
installMockNavigatorGPU();

const device = createMockGPUDevice();
const pipeline = new SpritePipeline();
const spriteSheet = makeBenchSheet(64, 64);

await pipeline.init(device, new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');

// Prime the per-texture bind-group cache once, matching real usage where the first
// drawSprite() call per texture creates the bind group and every later call reuses it.
pipeline.drawSprite(spriteSheet, SPRITE_RECT, DEST_POS);
pipeline.reset();

const font = createSystemFont();
const bitmapText = makePrintableAsciiText(TEXT_LENGTH);

// Prime the bitmap font's own sprite-sheet bind group the same way.
pipeline.drawBitmapText(font, TEXT_POS, bitmapText);
pipeline.reset();

describe('SpritePipeline vertex batch filling', () => {
    bench(
        'drawSprite x 5000 same-texture quads',
        () => {
            pipeline.reset();
            fillWithSprites(pipeline, spriteSheet, SPRITE_DRAW_COUNT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawBitmapText 200-char string x 50',
        () => {
            // Reset between calls – MAX_VERTICES (50,000) cannot hold TEXT_DRAW_COUNT full
            // strings at once, and this keeps every call measuring the same per-quad cost
            // instead of tripping the overflow path partway through.
            for (let i = 0; i < TEXT_DRAW_COUNT; i++) {
                pipeline.reset();
                pipeline.drawBitmapText(font, TEXT_POS, bitmapText);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'reset() after full batch',
        () => {
            // Populate a realistically full batch before measuring the reset cost itself –
            // reset() empties the batch, so each iteration needs fresh contents beforehand.
            fillWithSprites(pipeline, spriteSheet, SPRITE_DRAW_COUNT);
            pipeline.reset();
        },
        BENCH_OPTIONS,
    );
});
