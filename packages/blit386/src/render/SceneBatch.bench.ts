/**
 * Tier 1 CPU benchmarks for {@link SceneBatch}, the WebGPU demo tier that keeps primitives and sprites in
 * call order (BT-756).
 *
 * Every switch between a primitive and a sprite draw opens a new segment, and each segment encodes as its
 * own draw call with its own pipeline and bind-group setup. The two cases draw the same 500 entities (a
 * sprite plus a health-bar rect each) per frame:
 * - grouped: all sprites, then all rects - two segments
 * - interleaved: sprite, rect, sprite, rect - 1000 segments, the worst case
 *
 * Each iteration is a whole frame: reset, draws, encode into a no-op mock render pass. The gap between
 * the two is the CPU cost of call-order encoding; the mock pass cannot show the GPU-side cost.
 */

import { bench, describe } from 'vitest';

import {
    createMockGPUDevice,
    createMockPaletteBuffer,
    createMockRenderPassEncoder,
    installMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import { SpriteSheet } from '../assets/SpriteSheet';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { SceneBatch } from './SceneBatch';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Entities drawn per frame, each as one sprite and one rect. */
const ENTITY_COUNT = 500;

/** Palette index for the health bars - value is not itself relevant. */
const PALETTE_INDEX = 3;

/** 16x16 sprite source - a typical tile size. */
const SPRITE_RECT = new Rect2i(0, 0, 16, 16);

/** Fixed sprite position - position does not affect batching cost. */
const DEST_POS = new Vector2i(10, 10);

/** Fixed health-bar rect. */
const BAR_RECT = new Rect2i(10, 6, 16, 2);

installMockNavigatorGPU();

const scene = new SceneBatch();

await scene.init(createMockGPUDevice(), new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');

const sheet = SpriteSheet.fromIndexedPixels(16, 16, new Uint8Array(16 * 16).fill(1));
const renderPass = createMockRenderPassEncoder();

describe('SceneBatch call-order encoding', () => {
    bench(
        `grouped: ${ENTITY_COUNT} sprites then ${ENTITY_COUNT} rects, encoded`,
        () => {
            scene.reset();

            for (let i = 0; i < ENTITY_COUNT; i++) {
                scene.useSprites().drawSprite(sheet, SPRITE_RECT, DEST_POS);
            }

            for (let i = 0; i < ENTITY_COUNT; i++) {
                scene.usePrimitives().drawRectFill(BAR_RECT, PALETTE_INDEX);
            }

            scene.encode(renderPass);
        },
        BENCH_OPTIONS,
    );

    bench(
        `interleaved: sprite + rect x ${ENTITY_COUNT}, encoded`,
        () => {
            scene.reset();

            for (let i = 0; i < ENTITY_COUNT; i++) {
                scene.useSprites().drawSprite(sheet, SPRITE_RECT, DEST_POS);
                scene.usePrimitives().drawRectFill(BAR_RECT, PALETTE_INDEX);
            }

            scene.encode(renderPass);
        },
        BENCH_OPTIONS,
    );
});
