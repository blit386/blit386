/**
 * Unit tests for {@link SpritePipeline}.
 *
 * Covers sprite and bitmap-text batching behavior:
 * - construction and pre-initialization safety
 * - encode/reset behavior with and without queued sprite data
 * - sprite draw batching for shared textures and texture switches
 * - camera-offset handling, paletteOffset, and overflow safety
 * - bitmap-font rendering paths, including skipped missing glyphs
 *
 * The tests rely on WebGPU mock helpers plus lightweight sprite-sheet/font
 * fixtures to verify draw-call grouping without requiring real GPU resources.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
    createMockGPUDevice,
    createMockPaletteBuffer,
    createMockRenderPassEncoder,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import type { BitmapFont, Glyph } from '../assets/BitmapFont';
import { SpriteSheet } from '../assets/SpriteSheet';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { SpritePipeline } from './SpritePipeline';

describe('SpritePipeline constructor', () => {
    it('creates an instance without error', () => {
        const pipeline = new SpritePipeline();

        expect(pipeline).toBeDefined();
        expect(pipeline).toBeInstanceOf(SpritePipeline);
    });
});

describe('pre-initialization safety', () => {
    it('reset() can be called multiple times safely', () => {
        const pipeline = new SpritePipeline();

        expect(() => {
            pipeline.reset();
            pipeline.reset();
            pipeline.reset();
        }).not.toThrow();
    });

    it('setCameraOffset() accepts a Vector2i', () => {
        const pipeline = new SpritePipeline();

        expect(() => {
            pipeline.setCameraOffset(new Vector2i(10, 20));
        }).not.toThrow();
    });

    it('setCameraOffset() accepts zero vector', () => {
        const pipeline = new SpritePipeline();

        expect(() => {
            pipeline.setCameraOffset(Vector2i.zero());
        }).not.toThrow();
    });
});

describe('with initialized pipeline', () => {
    const device = createMockGPUDevice();
    const pipeline = new SpritePipeline();

    beforeAll(async () => {
        installMockNavigatorGPU();

        await pipeline.init(device, new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    it('encodePass with an empty buffer is a no-op', () => {
        pipeline.reset();

        const renderPass = createMockRenderPassEncoder();

        expect(() => {
            pipeline.encodePass(renderPass);
        }).not.toThrow();
    });

    it('reset followed by encodePass produces no draw calls', () => {
        pipeline.reset();

        let drawCalled = false;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCalled = true;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCalled).toBe(false);
    });

    it('multiple reset cycles work without error', () => {
        expect(() => {
            for (let i = 0; i < 5; i++) {
                pipeline.reset();
                pipeline.encodePass(createMockRenderPassEncoder());
                pipeline.reset();
            }
        }).not.toThrow();
    });

    it('setCameraOffset affects subsequent state without error', () => {
        pipeline.reset();
        pipeline.setCameraOffset(new Vector2i(100, 50));

        expect(() => {
            pipeline.encodePass(createMockRenderPassEncoder());
        }).not.toThrow();

        pipeline.setCameraOffset(Vector2i.zero());
    });
});

describe('drawSprite', () => {
    const device = createMockGPUDevice();
    const pipeline = new SpritePipeline();
    const mockImage = { width: 64, height: 64 } as HTMLImageElement;

    beforeAll(async () => {
        installMockNavigatorGPU();

        await pipeline.init(device, new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    it('does not throw with valid arguments', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 20));
        }).not.toThrow();
    });

    it('with explicit paletteOffset does not throw', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0), 1);
        }).not.toThrow();
    });

    it('with zero paletteOffset does not throw', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0), 0);
        }).not.toThrow();
    });

    it('causes a draw call in encodePass', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(1);
    });

    it('multiple calls from the same sheet produce one draw call', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
        pipeline.drawSprite(sheet, new Rect2i(16, 0, 16, 16), new Vector2i(20, 0));
        pipeline.drawSprite(sheet, new Rect2i(32, 0, 16, 16), new Vector2i(40, 0));

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(1);
    });

    it('calls from different sheets produce separate draw calls', () => {
        pipeline.reset();

        const sheetA = new SpriteSheet({ width: 64, height: 64 } as HTMLImageElement);
        const sheetB = new SpriteSheet({ width: 128, height: 128 } as HTMLImageElement);

        pipeline.drawSprite(sheetA, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
        pipeline.drawSprite(sheetB, new Rect2i(0, 0, 16, 16), new Vector2i(20, 0));

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(2);
    });

    it('interleaved sheets produce one draw call per texture switch', () => {
        pipeline.reset();

        const sheetA = new SpriteSheet({ width: 64, height: 64 } as HTMLImageElement);
        const sheetB = new SpriteSheet({ width: 128, height: 128 } as HTMLImageElement);

        pipeline.drawSprite(sheetA, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
        pipeline.drawSprite(sheetB, new Rect2i(0, 0, 16, 16), new Vector2i(20, 0));
        pipeline.drawSprite(sheetA, new Rect2i(0, 0, 16, 16), new Vector2i(40, 0));

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(3);
    });

    it('after reset produces no draw calls', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
        pipeline.reset();

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(0);
    });

    it('with camera offset does not throw', () => {
        pipeline.reset();

        pipeline.setCameraOffset(new Vector2i(50, 50));

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10));
            pipeline.encodePass(createMockRenderPassEncoder());
        }).not.toThrow();

        pipeline.setCameraOffset(Vector2i.zero());
    });

    it('a single-pixel srcRect does not throw', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            pipeline.drawSprite(sheet, new Rect2i(0, 0, 1, 1), new Vector2i(5, 5));
            pipeline.encodePass(createMockRenderPassEncoder());
        }).not.toThrow();
    });

    it('multiple frame cycles work without error', () => {
        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            for (let i = 0; i < 5; i++) {
                pipeline.reset();
                pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(i * 16, 0));
                pipeline.encodePass(createMockRenderPassEncoder());
            }
        }).not.toThrow();
    });

    it('buffer overflow triggers console.warn and does not crash', () => {
        pipeline.reset();

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sheet = new SpriteSheet(mockImage);

        try {
            // MAX_VERTICES = 50,000, each sprite = 6 vertices * 5 values (20 bytes)
            // 50,000 / 6 = ~8333 sprites max; draw more to trigger overflow
            for (let i = 0; i < 8400; i++) {
                pipeline.drawSprite(sheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0));
            }

            expect(warnSpy).toHaveBeenCalled();

            const msg = warnSpy.mock.calls.find((c) => String(c[0]).includes('capacity exceeded'));

            expect(msg).toBeDefined();

            expect(() => {
                pipeline.encodePass(createMockRenderPassEncoder());
            }).not.toThrow();
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('increments overflow count when capacity is exceeded and resets on reset()', () => {
        pipeline.reset();

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sheet = new SpriteSheet(mockImage);

        try {
            for (let i = 0; i < 8400; i++) {
                pipeline.drawSprite(sheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0));
            }

            expect(pipeline.getFrameOverflowCount()).toBeGreaterThan(0);
            expect(pipeline.getFrameSubmittedVertices()).toBeLessThanOrEqual(50000);

            pipeline.reset();

            expect(pipeline.getFrameOverflowCount()).toBe(0);
            expect(pipeline.getFrameSubmittedVertices()).toBe(0);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('reports submitted vertex count for batched sprites', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        pipeline.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

        expect(pipeline.getFrameSubmittedVertices()).toBe(6);
    });
});

describe('drawBitmapText', () => {
    const device = createMockGPUDevice();
    const pipeline = new SpritePipeline();
    const mockImage = { width: 64, height: 16 } as HTMLImageElement;

    /** Creates a mock glyph. */
    function makeGlyph(x: number, w: number, offsetX: number, offsetY: number, advance: number): Glyph {
        return {
            rect: new Rect2i(x, 0, w, 12),
            offsetX,
            offsetY,
            advance,
        };
    }

    /** Creates a mock BitmapFont. */
    function makeMockFont(glyphMap: Record<string, Glyph>, sheet: SpriteSheet): BitmapFont {
        return {
            getSpriteSheet: () => sheet,
            getGlyphByCode: (code: number) => glyphMap[String.fromCharCode(code)] ?? null,
        } as unknown as BitmapFont;
    }

    beforeAll(async () => {
        installMockNavigatorGPU();

        await pipeline.init(device, new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    it('renders characters that have glyphs', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        const font = makeMockFont(
            {
                A: makeGlyph(0, 8, 0, 0, 9),
                B: makeGlyph(8, 7, 0, 0, 8),
            },
            sheet,
        );

        pipeline.drawBitmapText(font, new Vector2i(10, 20), 'AB');

        let drawCallCount = 0;
        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                drawCallCount++;
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(1); // Same texture = 1 batch
        expect(totalVertices).toBe(12); // 2 characters * 6 vertices
    });

    it('silently skips characters without glyphs', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);
        const font = makeMockFont(
            {
                A: makeGlyph(0, 8, 0, 0, 9),
            },
            sheet,
        );

        // 'Z' has no glyph - should be silently skipped
        pipeline.drawBitmapText(font, new Vector2i(0, 0), 'AZA');

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(totalVertices).toBe(12); // Only 2 'A' glyphs rendered
    });

    it('empty string produces no draw calls', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);
        const font = makeMockFont({}, sheet);

        pipeline.drawBitmapText(font, new Vector2i(0, 0), '');

        let drawCallCount = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCallCount++;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCallCount).toBe(0);
    });

    it('applies paletteOffset without error', () => {
        pipeline.reset();

        const sheet = new SpriteSheet(mockImage);

        const font = makeMockFont(
            {
                X: makeGlyph(0, 8, 0, 0, 9),
            },
            sheet,
        );

        expect(() => {
            pipeline.drawBitmapText(font, new Vector2i(0, 0), 'X', 2);
            pipeline.encodePass(createMockRenderPassEncoder());
        }).not.toThrow();
    });
});
