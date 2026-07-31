/**
 * Unit tests for {@link PrimitivePipeline}.
 *
 * Covers the CPU-side primitive batching path:
 * - construction and pre-initialization safety of public drawing methods
 * - encode/reset behavior before and after buffered draws
 * - camera-offset handling across frame-style reset/encode cycles
 * - vertex-count expectations for filled rects, pixels, lines, outlines, text,
 *   and clear operations
 *
 * GPU-facing behavior is exercised with the local WebGPU mock device and render
 * pass encoder helpers so the tests can validate command emission deterministically.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
    createMockGPUDevice,
    createMockPaletteBuffer,
    createMockRenderPassEncoder,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { PrimitivePipeline } from './PrimitivePipeline';

describe('PrimitivePipeline constructor', () => {
    it('creates an instance without error', () => {
        const pipeline = new PrimitivePipeline();

        expect(pipeline).toBeDefined();
        expect(pipeline).toBeInstanceOf(PrimitivePipeline);
    });
});

describe('pre-initialization safety', () => {
    it('reset() can be called multiple times safely', () => {
        const pipeline = new PrimitivePipeline();

        expect(() => {
            pipeline.reset();
            pipeline.reset();
            pipeline.reset();
        }).not.toThrow();
    });

    it('setCameraOffset() accepts a Vector2i', () => {
        const pipeline = new PrimitivePipeline();

        expect(() => {
            pipeline.setCameraOffset(new Vector2i(10, 20));
        }).not.toThrow();
    });

    it('setCameraOffset() accepts zero vector', () => {
        const pipeline = new PrimitivePipeline();

        expect(() => {
            pipeline.setCameraOffset(Vector2i.zero());
        }).not.toThrow();
    });

    it('drawRectFill() does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const rect = new Rect2i(0, 0, 10, 10);

        expect(() => {
            pipeline.drawRectFill(rect, 1);
        }).not.toThrow();
    });

    it('drawPixel() does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const pos = new Vector2i(5, 5);

        expect(() => {
            pipeline.drawPixel(pos, 2);
        }).not.toThrow();
    });

    it('drawPixelXY() does not throw before init', () => {
        const pipeline = new PrimitivePipeline();

        expect(() => {
            pipeline.drawPixelXY(3, 7, 3);
        }).not.toThrow();
    });

    it('drawLine() with horizontal line does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const p0 = new Vector2i(0, 10);
        const p1 = new Vector2i(100, 10);

        expect(() => {
            pipeline.drawLine(p0, p1, 4);
        }).not.toThrow();
    });

    it('drawLine() with vertical line does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const p0 = new Vector2i(10, 0);
        const p1 = new Vector2i(10, 100);

        expect(() => {
            pipeline.drawLine(p0, p1, 5);
        }).not.toThrow();
    });

    it('drawLine() with diagonal line does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const p0 = new Vector2i(0, 0);
        const p1 = new Vector2i(50, 30);

        expect(() => {
            pipeline.drawLine(p0, p1, 6);
        }).not.toThrow();
    });

    it('drawRect() does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const rect = new Rect2i(5, 5, 20, 20);

        expect(() => {
            pipeline.drawRect(rect, 7);
        }).not.toThrow();
    });

    it('clearRect() does not throw before init', () => {
        const pipeline = new PrimitivePipeline();
        const rect = new Rect2i(0, 0, 100, 100);

        expect(() => {
            pipeline.clearRect(rect, 1);
        }).not.toThrow();
    });
});

describe('with initialized pipeline', () => {
    const device = createMockGPUDevice();
    const pipeline = new PrimitivePipeline();

    beforeAll(async () => {
        installMockNavigatorGPU();

        const paletteBuffer = createMockPaletteBuffer();

        await pipeline.init(device, new Vector2i(320, 240), paletteBuffer, 'r8uint');
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

    it('encodePass after drawing primitives completes without error', () => {
        pipeline.reset();

        const rect = new Rect2i(0, 0, 10, 10);

        pipeline.drawRectFill(rect, 1);
        pipeline.drawPixel(new Vector2i(5, 5), 2);
        pipeline.drawLine(new Vector2i(0, 0), new Vector2i(20, 0), 3);

        const renderPass = createMockRenderPassEncoder();

        expect(() => {
            pipeline.encodePass(renderPass);
        }).not.toThrow();
    });

    it('reset followed by encodePass produces no draw calls', () => {
        pipeline.reset();

        pipeline.drawRectFill(new Rect2i(0, 0, 5, 5), 1);

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

    it('encodePass calls draw on render pass when vertices exist', () => {
        pipeline.reset();

        pipeline.drawRectFill(new Rect2i(10, 10, 20, 20), 1);

        let drawCalled = false;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: () => {
                drawCalled = true;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(drawCalled).toBe(true);
    });

    it('multiple begin/end frame cycles work without error', () => {
        expect(() => {
            for (let i = 0; i < 5; i++) {
                pipeline.reset();

                pipeline.drawPixel(new Vector2i(i, i), 8);
                pipeline.encodePass(createMockRenderPassEncoder());

                pipeline.reset();
            }
        }).not.toThrow();
    });

    it('setCameraOffset affects subsequent draws without error', () => {
        pipeline.reset();

        pipeline.setCameraOffset(new Vector2i(100, 50));

        expect(() => {
            pipeline.drawRectFill(new Rect2i(0, 0, 10, 10), 1);
            pipeline.encodePass(createMockRenderPassEncoder());
        }).not.toThrow();

        pipeline.setCameraOffset(Vector2i.zero());
    });
});

describe('vertex count verification', () => {
    const device = createMockGPUDevice();
    const pipeline = new PrimitivePipeline();

    beforeAll(async () => {
        installMockNavigatorGPU();

        const paletteBuffer = createMockPaletteBuffer();

        await pipeline.init(device, new Vector2i(320, 240), paletteBuffer, 'r8uint');
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    it('drawRectFill produces six vertices (two triangles)', () => {
        pipeline.reset();

        pipeline.drawRectFill(new Rect2i(0, 0, 10, 10), 1);

        let totalVertices = 0;
        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(totalVertices).toBe(6);
    });

    it('drawPixel produces six vertices (1x1 filled rect)', () => {
        pipeline.reset();

        pipeline.drawPixel(new Vector2i(5, 5), 2);

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(totalVertices).toBe(6);
    });

    it('horizontal line uses a single quad (six vertices)', () => {
        pipeline.reset();

        pipeline.drawLine(new Vector2i(0, 10), new Vector2i(100, 10), 4);

        let totalVertices = 0;
        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);
        expect(totalVertices).toBe(6);
    });

    it('vertical line uses a single quad (six vertices)', () => {
        pipeline.reset();

        pipeline.drawLine(new Vector2i(10, 0), new Vector2i(10, 50), 4);

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(totalVertices).toBe(6);
    });

    it('diagonal line uses six vertices per a pixel (Bresenham)', () => {
        pipeline.reset();

        // A 45-degree diagonal from (0,0) to (4,4) = 5 pixels
        pipeline.drawLine(new Vector2i(0, 0), new Vector2i(4, 4), 8);

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        expect(totalVertices).toBe(5 * 6); // 5 pixels * 6 vertices each
    });

    it('drawRect with height <= two skips vertical side lines', () => {
        pipeline.reset();

        // height=2 means y1-y0 = 1, which is NOT > 1, so no vertical sides
        pipeline.drawRect(new Rect2i(0, 0, 10, 2), 1);

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        // Only top + bottom lines = 2 quads = 12 vertices (no left/right)
        expect(totalVertices).toBe(12);
    });

    it('drawRect with height > two includes all four sides', () => {
        pipeline.reset();

        pipeline.drawRect(new Rect2i(0, 0, 10, 10), 1);

        let totalVertices = 0;

        const renderPass = {
            ...createMockRenderPassEncoder(),
            draw: (vertexCount: number) => {
                totalVertices += vertexCount;
            },
        } as unknown as GPURenderPassEncoder;

        pipeline.encodePass(renderPass);

        // 4 sides = 4 quads = 24 vertices
        expect(totalVertices).toBe(24);
    });

    it('buffer overflow triggers console.warn and does not crash', () => {
        pipeline.reset();

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            // Fill buffer: 50,000 max vertices, each drawRectFill uses 6 vertices
            // ~8333 rects fill the buffer; drawing more should trigger a warning
            for (let i = 0; i < 8400; i++) {
                pipeline.drawRectFill(new Rect2i(0, 0, 1, 1), 1);
            }

            expect(warnSpy).toHaveBeenCalled();

            const msg = warnSpy.mock.calls.find((c) => String(c[0]).includes('capacity exceeded'));

            expect(msg).toBeDefined();

            // encodePass should still work without crashing
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

        try {
            for (let i = 0; i < 8400; i++) {
                pipeline.drawRectFill(new Rect2i(0, 0, 1, 1), 1);
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

    it('reports submitted vertex count for batched primitives', () => {
        pipeline.reset();
        pipeline.drawRectFill(new Rect2i(0, 0, 10, 10), 1);

        expect(pipeline.getFrameSubmittedVertices()).toBe(6);
    });
});
