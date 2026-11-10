/**
 * Unit tests for {@link SceneBatch}: primitive and sprite draws encode in call order (BT-756).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
    createMockGPUDevice,
    createMockPaletteBuffer,
    createMockRenderPassEncoder,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import { SpriteSheet } from '../assets/SpriteSheet';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { SceneBatch } from './SceneBatch';

/** Encodes one frame and returns each range it encoded, tagged with its pipeline, in encode order. */
function encodeDraws(scene: SceneBatch): string[] {
    const calls: string[] = [];
    const primitives = vi.spyOn(scene.primitives, 'encodeRange').mockImplementation((_pass, first, count) => {
        calls.push(`primitive vertices ${first}+${count}`);
    });
    const sprites = vi.spyOn(scene.sprites, 'encodeBatches').mockImplementation((_pass, from, to) => {
        calls.push(`sprite batches ${from}-${to}`);
    });

    scene.encode(createMockRenderPassEncoder());
    primitives.mockRestore();
    sprites.mockRestore();

    return calls;
}

describe('SceneBatch', () => {
    beforeAll(() => {
        installMockNavigatorGPU();
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    async function createScene(): Promise<SceneBatch> {
        const scene = new SceneBatch();

        await scene.init(createMockGPUDevice(), new Vector2i(64, 64), createMockPaletteBuffer(), 'r8uint');

        return scene;
    }

    const sheet = SpriteSheet.fromIndexedPixels(4, 4, new Uint8Array(16).fill(1));
    const src = new Rect2i(0, 0, 4, 4);

    it('encodes a sprite, a rect over it, then another sprite in call order', async () => {
        const scene = await createScene();

        scene.useSprites().drawSprite(sheet, src, new Vector2i(0, 0));
        scene.usePrimitives().drawRectFill(new Rect2i(0, 0, 8, 2), 2);
        scene.usePrimitives().drawPixelXY(1, 1, 3);
        scene.useSprites().drawSprite(sheet, src, new Vector2i(4, 4));

        expect(encodeDraws(scene)).toEqual(['sprite batches 0-1', 'primitive vertices 0+12', 'sprite batches 1-2']);
    });

    it('starts each frame with an empty segment list after reset', async () => {
        const scene = await createScene();

        scene.usePrimitives().drawRectFill(new Rect2i(0, 0, 2, 2), 2);
        encodeDraws(scene);
        scene.reset();
        scene.useSprites().drawSprite(sheet, src, new Vector2i(0, 0));

        expect(encodeDraws(scene)).toEqual(['sprite batches 0-1']);
    });

    it('encodes nothing for a frame with no draws', async () => {
        const scene = await createScene();

        expect(encodeDraws(scene)).toEqual([]);
    });
});
