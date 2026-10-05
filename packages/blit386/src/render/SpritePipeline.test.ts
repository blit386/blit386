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
    applyMaskToGrid,
    DOC_RESULTS,
    indexToLetter,
    orientRows,
    PADDED_SHEET_H,
    PADDED_SHEET_PIXELS,
    PADDED_SHEET_W,
    PADDED_SRC_RECT_ARGS,
    scaleRows,
    SOURCE_ROWS,
    stretchRows,
    WIDE_ROWS,
    WIDE_SHEET_H,
    WIDE_SHEET_PIXELS,
    WIDE_SHEET_W,
    WIDE_SRC_RECT_ARGS,
} from '../__test__/spriteOrientationFixture';
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
import { resolveSpriteOrientation } from './SpriteOrientation';
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

describe('oriented and stretched sprite quads', () => {
    const device = createMockGPUDevice();
    const pipeline = new SpritePipeline();

    // The padded sheet puts ABC / DEF at (1, 1), so UVs are not trivially 0 and 1.
    const SRC = new Rect2i(...PADDED_SRC_RECT_ARGS);
    const DEST = new Vector2i(7, 9);

    beforeAll(async () => {
        installMockNavigatorGPU();

        await pipeline.init(device, new Vector2i(320, 240), createMockPaletteBuffer(), 'r8uint');
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    type SheetSpec = { w: number; h: number; pixels: Uint8Array<ArrayBuffer> };
    const PADDED: SheetSpec = { w: PADDED_SHEET_W, h: PADDED_SHEET_H, pixels: PADDED_SHEET_PIXELS };
    const WIDE: SheetSpec = { w: WIDE_SHEET_W, h: WIDE_SHEET_H, pixels: WIDE_SHEET_PIXELS };

    /** Queues one draw, encodes, and returns the 6 uploaded vertices as [x, y, u, v, paletteOffset] rows. */
    function captureQuad(spec: SheetSpec, draw: (sheet: SpriteSheet) => void): number[][] {
        pipeline.reset();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        draw(SpriteSheet.fromIndexedPixels(spec.w, spec.h, spec.pixels));
        pipeline.encodePass(createMockRenderPassEncoder() as unknown as GPURenderPassEncoder);

        const call = writeBuffer.mock.calls.at(-1);
        writeBuffer.mockRestore();
        const buffer = call?.[2] as ArrayBuffer;
        const floats = new Float32Array(buffer, 0, 30);
        const uints = new Uint32Array(buffer, 0, 30);

        return Array.from({ length: 6 }, (_, i) => [
            floats[i * 5] ?? 0,
            floats[i * 5 + 1] ?? 0,
            floats[i * 5 + 2] ?? 0,
            floats[i * 5 + 3] ?? 0,
            uints[i * 5 + 4] ?? 0,
        ]);
    }

    /**
     * Rasterizes the quad like the GPU: at each covered pixel center, interpolate UV in float32 from the
     * corners (the corner layout is affine, so bilinear is exact) and load the texel at floor(uv * size).
     */
    function sampleQuad(spec: SheetSpec, vertices: number[][]): string {
        const [tl, tr, bl] = vertices as [number[], number[], number[]];
        const br = vertices[4] as number[];
        const [x0, y0] = tl as [number, number];
        const [x1, y1] = br as [number, number];
        const f = Math.fround;
        const rows: string[] = [];

        for (let py = y0; py < y1; py++) {
            let row = '';
            for (let px = x0; px < x1; px++) {
                const s = f((px + 0.5 - x0) / (x1 - x0));
                const t = f((py + 0.5 - y0) / (y1 - y0));
                const lerp = (a: number, b: number, c: number, d: number): number =>
                    f(f(f((1 - s) * (1 - t)) * a) + f(f(s * (1 - t)) * b) + f(f((1 - s) * t) * c) + f(f(s * t) * d));
                const u = lerp(tl[2] ?? 0, tr[2] ?? 0, bl[2] ?? 0, br[2] ?? 0);
                const v = lerp(tl[3] ?? 0, tr[3] ?? 0, bl[3] ?? 0, br[3] ?? 0);
                row += indexToLetter(spec.pixels[Math.floor(f(v * spec.h)) * spec.w + Math.floor(f(u * spec.w))] ?? 0);
            }
            rows.push(row);
        }

        return rows.join(' / ');
    }

    it('keeps the overload 1 vertex stream unchanged', () => {
        const u0 = 1 / PADDED_SHEET_W;
        const v0 = 1 / PADDED_SHEET_H;
        const u1 = 4 / PADDED_SHEET_W;
        const v1 = 3 / PADDED_SHEET_H;
        const vertices = captureQuad(PADDED, (sheet) => pipeline.drawSprite(sheet, SRC, DEST, 2));

        expect(vertices).toEqual(
            [
                [7, 9, u0, v0, 2],
                [10, 9, u1, v0, 2],
                [7, 11, u0, v1, 2],
                [10, 9, u1, v0, 2],
                [10, 11, u1, v1, 2],
                [7, 11, u0, v1, 2],
            ].map((row) => row.map((value, i) => (i < 4 ? Math.fround(value) : value))),
        );
    });

    it.each(Array.from({ length: 32 }, (_, mask) => mask))('mask %i samples the documented grid', (mask) => {
        const orientation = resolveSpriteOrientation(mask);
        const vertices =
            orientation === 0
                ? captureQuad(PADDED, (sheet) => pipeline.drawSprite(sheet, SRC, DEST, 3))
                : captureQuad(PADDED, (sheet) => pipeline.drawSpriteOriented(sheet, SRC, DEST, 3, orientation));

        expect(vertices[0]?.slice(0, 2)).toEqual([7, 9]);
        expect(vertices.every((vertex) => vertex[4] === 3)).toBe(true);
        expect(sampleQuad(PADDED, vertices)).toBe(applyMaskToGrid(mask));
        // eslint-disable-next-line security/detect-object-injection
        expect(sampleQuad(PADDED, vertices)).toBe(DOC_RESULTS[orientation]);
    });

    describe('drawSpriteStretched (scale and Rect2i destinations)', () => {
        const WIDE_SRC = new Rect2i(...WIDE_SRC_RECT_ARGS);

        it('places the quad at the box and shifts UV edges by a quarter destination pixel', () => {
            // Identity, 3x2 footprint into 2x1: shift is -1/8 texel on x and -1/4 on y.
            const vertices = captureQuad(PADDED, (sheet) => pipeline.drawSpriteStretched(sheet, SRC, 7, 9, 2, 1, 3, 0));
            const u0 = (1 - 1 / 8) / PADDED_SHEET_W;
            const u1 = (4 - 1 / 8) / PADDED_SHEET_W;
            const v0 = (1 - 1 / 4) / PADDED_SHEET_H;
            const v1 = (3 - 1 / 4) / PADDED_SHEET_H;

            expect(vertices).toEqual(
                [
                    [7, 9, u0, v0, 3],
                    [9, 9, u1, v0, 3],
                    [7, 10, u0, v1, 3],
                    [9, 9, u1, v0, 3],
                    [9, 10, u1, v1, 3],
                    [7, 10, u0, v1, 3],
                ].map((row) => row.map((value, i) => (i < 4 ? Math.fround(value) : value))),
            );
        });

        it('shifts the opposite source edge on a flipped axis', () => {
            // FLIP_H, 3x2 into 2x1: footprint x edges -1/8 and 3 - 1/8 map to source x 3 + 1/8 and 1/8.
            const vertices = captureQuad(PADDED, (sheet) =>
                pipeline.drawSpriteStretched(sheet, SRC, 0, 0, 2, 1, 0, resolveSpriteOrientation(1)),
            );

            expect(vertices[0]?.[2]).toBe(Math.fround((1 + 3 + 1 / 8) / PADDED_SHEET_W));
            expect(vertices[1]?.[2]).toBe(Math.fround((1 + 1 / 8) / PADDED_SHEET_W));
        });

        it.each(Array.from({ length: 32 }, (_, mask) => [1, 2, 3, 4].map((s) => [mask, s] as const)).flat())(
            'mask %i at integer scale %i samples a block copy',
            (mask, s) => {
                const oriented = orientRows(SOURCE_ROWS, mask);
                const fw = oriented[0]?.length ?? 0;
                const fh = oriented.length;
                const vertices = captureQuad(PADDED, (sheet) =>
                    pipeline.drawSpriteStretched(sheet, SRC, 4, 6, fw * s, fh * s, 0, resolveSpriteOrientation(mask)),
                );

                expect(sampleQuad(PADDED, vertices)).toBe(scaleRows(oriented, s, s).join(' / '));
            },
        );

        it.each([
            ['x 3->2, y 2->1', 0, 2, 1],
            ['y 2->3', 0, 3, 3],
            ['ROT_90_CW: x 2->1, y 3->2', 4, 1, 2],
            ['ROT_90_CW: x 2->3', 4, 3, 3],
            ['FLIP_H: x 3->2, y 2->3', 1, 2, 3],
        ])('uneven stretch %s samples the center rule', (_label, mask, dw, dh) => {
            const vertices = captureQuad(PADDED, (sheet) =>
                pipeline.drawSpriteStretched(sheet, SRC, 4, 6, dw, dh, 0, resolveSpriteOrientation(mask)),
            );

            expect(sampleQuad(PADDED, vertices)).toBe(stretchRows(orientRows(SOURCE_ROWS, mask), dw, dh).join(' / '));
        });

        it.each([
            ['x 5->7', 0, 7, 3],
            ['ROT_90_CW: y 5->7', 4, 3, 7],
        ])('uneven stretch %s on the 5x3 source', (_label, mask, dw, dh) => {
            const vertices = captureQuad(WIDE, (sheet) =>
                pipeline.drawSpriteStretched(sheet, WIDE_SRC, 4, 6, dw, dh, 0, resolveSpriteOrientation(mask)),
            );

            expect(sampleQuad(WIDE, vertices)).toBe(stretchRows(orientRows(WIDE_ROWS, mask), dw, dh).join(' / '));
        });

        it.each(Array.from({ length: 32 }, (_, mask) => mask))('mask %i stretches the 5x3 source into 7x7', (mask) => {
            const vertices = captureQuad(WIDE, (sheet) =>
                pipeline.drawSpriteStretched(sheet, WIDE_SRC, 4, 6, 7, 7, 0, resolveSpriteOrientation(mask)),
            );

            expect(sampleQuad(WIDE, vertices)).toBe(stretchRows(orientRows(WIDE_ROWS, mask), 7, 7).join(' / '));
        });
    });
});
