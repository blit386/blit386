/**
 * Unit tests for {@link WebGPURenderer}.
 *
 * Exercises the engine's WebGPU render coordinator:
 * - constructor behavior and pre-initialization safety
 * - camera state ownership and copy semantics
 * - successful renderer initialization and repeated frame lifecycles
 * - delegation of palette-indexed primitive drawing calls during active frames
 * - palette enforcement (beginFrame throws without active palette)
 * - palette dirty-flag auto-propagation (mutations visible without re-calling setPalette)
 * - frame capture flow and error handling during presentation
 *
 * The suite uses mocked WebGPU devices, contexts, and browser image APIs so
 * frame submission and capture paths can be validated without real GPU access.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createMockGPUCanvasContext,
    createMockGPUDevice,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import type { BitmapFont } from '../assets/BitmapFont';
import { Palette } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import type { PrimitivePipeline } from './PrimitivePipeline';
import type { SpritePipeline } from './SpritePipeline';
import { WebGPURenderer } from './WebGPURenderer';

/** Internal pipeline batches on {@link WebGPURenderer} (compile-time private, runtime-accessible). */
type PipelineAccess = {
    primitives: PrimitivePipeline;
    overlayPrimitives: PrimitivePipeline;
    overlayTopPrimitives: PrimitivePipeline;
    sprites: SpritePipeline;
    overlaySprites: SpritePipeline;
    overlayTopSprites: SpritePipeline;
};

/**
 * Returns the six scene-pass pipeline batches for encode-order and routing tests.
 *
 * @param renderer - Initialized {@link WebGPURenderer}.
 * @returns Primitive, sprite, overlay, and overlay-top pipeline instances.
 */
function getRendererPipelines(renderer: WebGPURenderer): PipelineAccess {
    return renderer as unknown as PipelineAccess;
}

/** Creates a small 16-color test palette with known color assignments. */
function createTestPalette(): Palette {
    const palette = new Palette(16);

    palette.set(1, Color32.black);
    palette.set(2, Color32.red);
    palette.set(3, Color32.green);
    palette.set(4, Color32.blue);
    palette.set(5, Color32.yellow);
    palette.set(6, Color32.cyan);
    palette.set(7, Color32.magenta);
    palette.set(8, Color32.white);

    return palette;
}

describe('WebGPURenderer constructor', () => {
    it('creates an instance with mock objects', () => {
        const device = createMockGPUDevice();
        const context = createMockGPUCanvasContext();
        const displaySize = new Vector2i(320, 240);
        const renderer = new WebGPURenderer(device, context, displaySize);

        expect(renderer).toBeDefined();
        expect(renderer).toBeInstanceOf(WebGPURenderer);
    });
});

describe('pre-initialization methods', () => {
    it('setClearColor does not throw', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        expect(() => {
            renderer.setClearColor(1);
        }).not.toThrow();
    });

    it('setCameraOffset does not throw', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        expect(() => {
            renderer.setCameraOffset(new Vector2i(10, 20));
        }).not.toThrow();
    });

    it('getCameraOffset returns a zero vector initially', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );
        const offset = renderer.getCameraOffset();

        expect(offset.x).toBe(0);
        expect(offset.y).toBe(0);
    });

    it('resetCamera sets camera back to zero', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        renderer.setCameraOffset(new Vector2i(50, 75));
        renderer.resetCamera();

        const offset = renderer.getCameraOffset();

        expect(offset.x).toBe(0);
        expect(offset.y).toBe(0);
    });

    it('beginFrame throws without active palette', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        expect(() => {
            renderer.beginFrame();
        }).toThrow('No palette set yet. Call BT.paletteSet');
    });

    it('beginFrame succeeds with active palette', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        renderer.setPalette(createTestPalette());

        expect(() => {
            renderer.beginFrame();
        }).not.toThrow();
    });
});

describe('camera operations', () => {
    it('getCameraOffset returns a copy, not the internal reference', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        renderer.setCameraOffset(new Vector2i(42, 84));

        const offset = renderer.getCameraOffset();

        expect(offset.x).toBe(42);
        expect(offset.y).toBe(84);

        // Modifying the returned copy should not change the internal state.
        offset.set(999, 999);

        const offsetAgain = renderer.getCameraOffset();

        expect(offsetAgain.x).toBe(42);
        expect(offsetAgain.y).toBe(84);
    });

    it('setCameraOffset stores the offset correctly', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        renderer.setCameraOffset(new Vector2i(100, 200));

        const offset = renderer.getCameraOffset();

        expect(offset.x).toBe(100);
        expect(offset.y).toBe(200);
    });

    it('setCameraOffset clones the input vector', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );
        const input = new Vector2i(30, 60);

        renderer.setCameraOffset(input);

        // Modifying the input vector should not affect the renderer.
        input.set(999, 999);

        const offset = renderer.getCameraOffset();

        expect(offset.x).toBe(30);
        expect(offset.y).toBe(60);
    });
});

describe('palette enforcement', () => {
    it('setPalette stores and returns palette', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );
        const palette = createTestPalette();

        renderer.setPalette(palette);

        const result = renderer.getPalette();

        expect(result).not.toBeNull();
        expect(result).not.toBe(palette);
        expect(result?.size).toBe(palette.size);
        expect(result?.get(1)).toEqual(palette.get(1));
        expect(result?.get(8)).toEqual(palette.get(8));
    });

    it('getPalette returns null when no palette is set', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        expect(renderer.getPalette()).toBeNull();
    });
});

describe('with initialized renderer', () => {
    const device = createMockGPUDevice();
    const context = createMockGPUCanvasContext();
    const displaySize = new Vector2i(320, 240);
    const renderer = new WebGPURenderer(device, context, displaySize);

    beforeAll(async () => {
        installMockNavigatorGPU();

        const result = await renderer.init();

        expect(result).toBe(true);

        renderer.setPalette(createTestPalette());
    });

    afterAll(() => {
        uninstallMockNavigatorGPU();
    });

    it('init returns true on success', async () => {
        const r = new WebGPURenderer(device, context, displaySize);
        const result = await r.init();

        expect(result).toBe(true);
    });

    it('endFrame completes without error', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.endFrame();
        }).not.toThrow();
    });

    it('beginFrame + endFrame cycle works', () => {
        expect(() => {
            renderer.beginFrame();
            renderer.endFrame();
        }).not.toThrow();
    });

    it('multiple frame cycles work without error', () => {
        expect(() => {
            for (let i = 0; i < 5; i++) {
                renderer.beginFrame();
                renderer.endFrame();
            }
        }).not.toThrow();
    });

    it('drawPixel delegates without throwing at (10,10)', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.drawPixel(new Vector2i(10, 10), 2);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawPixel delegates without throwing at (15,25)', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.drawPixel(new Vector2i(15, 25), 3);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawRectFill delegates without throwing', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.drawRectFill(new Rect2i(5, 5, 20, 20), 4);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawLine delegates without throwing', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.drawLine(new Vector2i(0, 0), new Vector2i(50, 50), 5);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawRect delegates without throwing', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.drawRect(new Rect2i(10, 10, 30, 30), 6);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('clearRect delegates without throwing', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.clearRect(new Rect2i(0, 0, 320, 240), 1);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('setClearColor works within a frame', () => {
        renderer.beginFrame();

        expect(() => {
            renderer.setClearColor(4);
        }).not.toThrow();

        renderer.endFrame();
    });

    it('camera operations work within a frame cycle', () => {
        renderer.beginFrame();
        renderer.setCameraOffset(new Vector2i(50, 50));
        renderer.drawRectFill(new Rect2i(0, 0, 10, 10), 2);
        renderer.resetCamera();

        expect(() => {
            renderer.endFrame();
        }).not.toThrow();
    });

    it('drawSprite delegates without throwing', () => {
        renderer.beginFrame();

        const mockTexture = {
            createView: () => ({}),
            width: 8,
            height: 8,
        } as unknown as GPUTexture;

        const mockSheet = {
            getTexture: () => mockTexture,
            getUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }),
        } as unknown as SpriteSheet;

        expect(() => {
            renderer.drawSprite(mockSheet, new Rect2i(0, 0, 8, 8), new Vector2i(10, 10));
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawBitmapText delegates without throwing', () => {
        renderer.beginFrame();

        // Empty text - loop does not execute so glyph methods are never called.
        const mockFont = {
            getSpriteSheet: () => ({}),
            getGlyphByCode: () => null,
        } as unknown as BitmapFont;

        expect(() => {
            renderer.drawBitmapText(mockFont, new Vector2i(0, 0), '');
        }).not.toThrow();

        renderer.endFrame();
    });

    it('drawBarFill routes fills to overlayPrimitives, not primitives', () => {
        const pipelines = getRendererPipelines(renderer);
        const sceneFill = vi.spyOn(pipelines.primitives, 'drawRectFill');
        const overlayFill = vi.spyOn(pipelines.overlayPrimitives, 'drawRectFill');
        const overlayTopFill = vi.spyOn(pipelines.overlayTopPrimitives, 'drawRectFill');
        const rect = new Rect2i(1, 2, 8, 8);

        renderer.beginFrame();
        renderer.drawRectFill(rect, 2);
        renderer.drawBarFill(rect, 5);
        renderer.drawBarFillOnTop(rect, 6);
        renderer.endFrame();

        expect(sceneFill).toHaveBeenCalledOnce();
        expect(sceneFill).toHaveBeenCalledWith(rect, 2);
        expect(overlayFill).toHaveBeenCalledOnce();
        expect(overlayFill).toHaveBeenCalledWith(rect, 5);
        expect(overlayTopFill).toHaveBeenCalledOnce();
        expect(overlayTopFill).toHaveBeenCalledWith(rect, 6);
    });

    it('drawLabel routes text to overlaySprites, not sprites', () => {
        const pipelines = getRendererPipelines(renderer);
        const sceneText = vi.spyOn(pipelines.sprites, 'drawBitmapText');
        const overlayText = vi.spyOn(pipelines.overlaySprites, 'drawBitmapText');
        const overlayTopText = vi.spyOn(pipelines.overlayTopSprites, 'drawBitmapText');
        const mockFont = {
            getSpriteSheet: () => ({}),
            getGlyphByCode: () => null,
        } as unknown as BitmapFont;

        renderer.beginFrame();
        renderer.drawBitmapText(mockFont, new Vector2i(0, 0), '');
        renderer.drawLabel(mockFont, new Vector2i(4, 4), '');
        renderer.drawLabelOnTop(mockFont, new Vector2i(8, 8), 'Tip');
        renderer.endFrame();

        expect(sceneText).toHaveBeenCalledOnce();
        expect(sceneText).toHaveBeenCalledWith(mockFont, new Vector2i(0, 0), '', 0);
        expect(overlayText).toHaveBeenCalledOnce();
        expect(overlayText).toHaveBeenCalledWith(mockFont, new Vector2i(4, 4), '', 0);
        expect(overlayTopText).toHaveBeenCalledOnce();
        expect(overlayTopText).toHaveBeenCalledWith(mockFont, new Vector2i(8, 8), 'Tip', 0);
    });

    it('encodes scene pass as primitives, sprites, then overlay batches', () => {
        const pipelines = getRendererPipelines(renderer);
        const encodeOrder: string[] = [];

        vi.spyOn(pipelines.primitives, 'encodePass').mockImplementation(() => {
            encodeOrder.push('primitives');
        });
        vi.spyOn(pipelines.sprites, 'encodePass').mockImplementation(() => {
            encodeOrder.push('sprites');
        });
        vi.spyOn(pipelines.overlayPrimitives, 'encodePass').mockImplementation(() => {
            encodeOrder.push('overlayPrimitives');
        });
        vi.spyOn(pipelines.overlaySprites, 'encodePass').mockImplementation(() => {
            encodeOrder.push('overlaySprites');
        });
        vi.spyOn(pipelines.overlayTopPrimitives, 'encodePass').mockImplementation(() => {
            encodeOrder.push('overlayTopPrimitives');
        });
        vi.spyOn(pipelines.overlayTopSprites, 'encodePass').mockImplementation(() => {
            encodeOrder.push('overlayTopSprites');
        });

        const mockFont = {
            getSpriteSheet: () => ({}),
            getGlyphByCode: () => null,
        } as unknown as BitmapFont;

        renderer.beginFrame();
        renderer.drawRectFill(new Rect2i(0, 0, 4, 4), 2);
        renderer.drawBitmapText(mockFont, new Vector2i(0, 0), '');
        renderer.drawBarFill(new Rect2i(0, 220, 320, 16), 1);
        renderer.drawLabel(mockFont, new Vector2i(5, 225), 'HUD');
        renderer.drawBarFillOnTop(new Rect2i(10, 200, 20, 13), 1);
        renderer.drawLabelOnTop(mockFont, new Vector2i(14, 200), '7');
        renderer.endFrame();

        expect(encodeOrder).toEqual([
            'primitives',
            'sprites',
            'overlayPrimitives',
            'overlaySprites',
            'overlayTopPrimitives',
            'overlayTopSprites',
        ]);
    });

    it('resets overlay batches on beginFrame', () => {
        const pipelines = getRendererPipelines(renderer);
        const overlayPrimitiveReset = vi.spyOn(pipelines.overlayPrimitives, 'reset');
        const overlayTopPrimitiveReset = vi.spyOn(pipelines.overlayTopPrimitives, 'reset');
        const overlaySpriteReset = vi.spyOn(pipelines.overlaySprites, 'reset');
        const overlayTopSpriteReset = vi.spyOn(pipelines.overlayTopSprites, 'reset');

        renderer.beginFrame();

        expect(overlayPrimitiveReset).toHaveBeenCalledOnce();
        expect(overlayTopPrimitiveReset).toHaveBeenCalledOnce();
        expect(overlaySpriteReset).toHaveBeenCalledOnce();
        expect(overlayTopSpriteReset).toHaveBeenCalledOnce();

        renderer.endFrame();
    });

    it('aggregates overflow and submitted vertices across scene pipelines', () => {
        renderer.beginFrame();
        renderer.drawRectFill(new Rect2i(0, 0, 10, 10), 1);
        renderer.drawBarFill(new Rect2i(0, 220, 320, 16), 2);

        const diagnostics = renderer.getFrameDiagnostics();

        expect(diagnostics.primitiveSubmittedVertices).toBe(12);
        expect(diagnostics.spriteSubmittedVertices).toBe(0);
        expect(diagnostics.primitiveOverflowCount).toBe(0);
        expect(diagnostics.spriteOverflowCount).toBe(0);

        renderer.endFrame();
    });

    it('returns zeros after beginFrame clears prior frame pipeline state', () => {
        renderer.beginFrame();
        renderer.drawRectFill(new Rect2i(0, 0, 10, 10), 1);
        renderer.endFrame();

        renderer.beginFrame();

        expect(renderer.getFrameDiagnostics()).toEqual({
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 0,
            spriteSubmittedVertices: 0,
        });

        renderer.endFrame();
    });
});

describe('resolveClearColor fallbacks', () => {
    it('returns black (no throw) when no palette is set', async () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        installMockNavigatorGPU();

        await r.init();

        // No setPalette() call - endFrame() resolves clear color to black via fallback.
        expect(() => r.endFrame()).not.toThrow();

        uninstallMockNavigatorGPU();
    });

    it('returns black (no throw) when palette.get throws', async () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        installMockNavigatorGPU();

        await r.init();

        // Spy on the prototype so the reference stored by setPalette also throws.
        const getSpy = vi.spyOn(Palette.prototype, 'get').mockImplementation(() => {
            throw new Error('get error');
        });

        r.setPalette(createTestPalette());

        expect(() => r.endFrame()).not.toThrow();

        getSpy.mockRestore();
        uninstallMockNavigatorGPU();
    });
});

describe('frame capture', () => {
    it('captureFrame returns a promise', async () => {
        const device = createMockGPUDevice();

        // Add copyTextureToBuffer to mock command encoder.
        const originalCreate = device.createCommandEncoder.bind(device);

        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();
            (encoder as unknown as Record<string, unknown>).copyTextureToBuffer = vi.fn();

            return encoder;
        });

        const context = createMockGPUCanvasContext();
        const renderer = new WebGPURenderer(device, context, new Vector2i(4, 4));

        installMockNavigatorGPU();

        vi.stubGlobal(
            'ImageData',
            class MockImageData {
                constructor(
                    public data: Uint8ClampedArray,
                    public width: number,
                    public height: number,
                ) {}
            },
        );

        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                getContext(): { putImageData: ReturnType<typeof vi.fn> } {
                    return { putImageData: vi.fn() };
                }
                async convertToBlob(): Promise<Blob> {
                    return new Blob(['test'], { type: 'image/png' });
                }
            },
        );

        await renderer.init();
        renderer.setPalette(createTestPalette());

        const promise = renderer.captureFrame();

        expect(promise).toBeInstanceOf(Promise);

        renderer.endFrame();

        await promise;

        vi.unstubAllGlobals();

        uninstallMockNavigatorGPU();
    });

    it('endFrame triggers capture when pending', async () => {
        const copyTextureToBufferFn = vi.fn();
        const device = createMockGPUDevice();

        // Override createCommandEncoder to include copyTextureToBuffer.
        const originalCreate = device.createCommandEncoder.bind(device);

        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();

            (encoder as unknown as Record<string, unknown>).copyTextureToBuffer = copyTextureToBufferFn;

            return encoder;
        });

        const context = createMockGPUCanvasContext();
        const renderer = new WebGPURenderer(device, context, new Vector2i(4, 4));

        installMockNavigatorGPU();

        await renderer.init();
        renderer.setPalette(createTestPalette());

        // Stub browser APIs for PNG conversion.
        vi.stubGlobal(
            'ImageData',
            class MockImageData {
                constructor(
                    public data: Uint8ClampedArray,
                    public width: number,
                    public height: number,
                ) {}
            },
        );

        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                getContext(): { putImageData: ReturnType<typeof vi.fn> } {
                    return { putImageData: vi.fn() };
                }
                async convertToBlob(): Promise<Blob> {
                    return new Blob(['test'], { type: 'image/png' });
                }
            },
        );

        const capturePromise = renderer.captureFrame();

        renderer.beginFrame();
        renderer.endFrame();

        const blob = await capturePromise;

        expect(copyTextureToBufferFn).toHaveBeenCalledOnce();
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('image/png');

        vi.unstubAllGlobals();

        uninstallMockNavigatorGPU();
    });

    it('endFrame does not call copyTextureToBuffer without pending capture', async () => {
        const copyTextureToBufferFn = vi.fn();
        const device = createMockGPUDevice();

        const originalCreate = device.createCommandEncoder.bind(device);

        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();
            (encoder as unknown as Record<string, unknown>).copyTextureToBuffer = copyTextureToBufferFn;

            return encoder;
        });

        const context = createMockGPUCanvasContext();
        const renderer = new WebGPURenderer(device, context, new Vector2i(320, 240));

        installMockNavigatorGPU();

        await renderer.init();
        renderer.setPalette(createTestPalette());

        renderer.beginFrame();
        renderer.endFrame();

        expect(copyTextureToBufferFn).not.toHaveBeenCalled();

        uninstallMockNavigatorGPU();
    });
});

describe('endFrame error paths', () => {
    it('recovers gracefully when getCurrentTexture throws', async () => {
        const device = createMockGPUDevice();

        const throwingContext = {
            ...createMockGPUCanvasContext(),
            getCurrentTexture: () => {
                throw new Error('Context lost');
            },
        } as unknown as GPUCanvasContext;

        const renderer = new WebGPURenderer(device, throwingContext, new Vector2i(320, 240));

        installMockNavigatorGPU();

        await renderer.init();
        renderer.setPalette(createTestPalette());

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            renderer.beginFrame();
            renderer.drawRectFill(new Rect2i(0, 0, 10, 10), 2);

            expect(() => {
                renderer.endFrame();
            }).not.toThrow();

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to get current texture'),
                expect.any(Error),
            );

            // Should be able to start a new frame after error
            expect(() => {
                renderer.beginFrame();
            }).not.toThrow();
        } finally {
            errorSpy.mockRestore();

            uninstallMockNavigatorGPU();
        }
    });

    it('skips frame when texture has zero dimensions', async () => {
        const device = createMockGPUDevice();
        const zeroTextureContext = {
            ...createMockGPUCanvasContext(),
            getCurrentTexture: () => ({
                width: 0,
                height: 0,
                createView: () => ({ label: 'MockView' }),
            }),
        } as unknown as GPUCanvasContext;

        const renderer = new WebGPURenderer(device, zeroTextureContext, new Vector2i(320, 240));

        installMockNavigatorGPU();

        await renderer.init();
        renderer.setPalette(createTestPalette());

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            renderer.beginFrame();

            expect(() => {
                renderer.endFrame();
            }).not.toThrow();

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zero dimensions'));
        } finally {
            warnSpy.mockRestore();

            uninstallMockNavigatorGPU();
        }
    });
});

describe('init error paths', () => {
    it('returns false when pipeline creation throws', async () => {
        const throwingDevice = {
            ...createMockGPUDevice(),
            createShaderModule: () => {
                throw new Error('Shader compilation failed');
            },
        } as unknown as GPUDevice;

        const renderer = new WebGPURenderer(throwingDevice, createMockGPUCanvasContext(), new Vector2i(320, 240));

        installMockNavigatorGPU();

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const result = await renderer.init();

            expect(result).toBe(false);
            expect(errorSpy).toHaveBeenCalled();
        } finally {
            errorSpy.mockRestore();

            uninstallMockNavigatorGPU();
        }
    });
});

describe('palette dirty-flag auto-propagation', () => {
    it('setPalette stores a reference, not a clone', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );
        const palette = createTestPalette();

        renderer.setPalette(palette);

        // Mutate the original after setPalette - the renderer must see the change.
        palette.set(1, new Color32(99, 99, 99, 255));

        // getPalette() returns a clone, so compare by value rather than reference.
        expect(renderer.getPalette()?.get(1)).toEqual(new Color32(99, 99, 99, 255));
    });

    it('getPalette still returns a clone, not the internal reference', () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );
        const palette = createTestPalette();

        renderer.setPalette(palette);

        expect(renderer.getPalette()).not.toBe(palette);
    });

    it('palette.isDirty is cleared after endFrame uploads', async () => {
        const renderer = new WebGPURenderer(
            createMockGPUDevice(),
            createMockGPUCanvasContext(),
            new Vector2i(320, 240),
        );

        installMockNavigatorGPU();

        await renderer.init();

        const palette = new Palette(16);

        renderer.setPalette(palette);

        // Dirty the palette AFTER setPalette, simulating per-frame animation.
        palette.set(1, new Color32(200, 100, 50, 255));

        expect(palette.isDirty).toBe(true);

        renderer.beginFrame();
        renderer.endFrame();

        // Renderer must clear the dirty flag as part of the GPU upload.
        expect(palette.isDirty).toBe(false);

        uninstallMockNavigatorGPU();
    });

    it('palette.isDirty drives upload without requiring a new paletteSet call', async () => {
        const device = createMockGPUDevice();
        const writeBufferSpy = vi.spyOn(device.queue, 'writeBuffer');

        const renderer = new WebGPURenderer(device, createMockGPUCanvasContext(), new Vector2i(320, 240));

        installMockNavigatorGPU();

        await renderer.init();

        const palette = new Palette(16);

        renderer.setPalette(palette);

        // First frame - initial upload due to isPaletteDirty.
        renderer.beginFrame();
        renderer.endFrame();

        const callsAfterFirstFrame = writeBufferSpy.mock.calls.length;

        // Mutate palette without calling BT.paletteSet() again.
        palette.set(1, new Color32(255, 0, 128, 255));

        // Second frame - must re-upload because palette.isDirty is true.
        renderer.beginFrame();
        renderer.endFrame();

        expect(writeBufferSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstFrame);

        writeBufferSpy.mockRestore();

        uninstallMockNavigatorGPU();
    });

    it('no GPU upload happens when palette is clean and isPaletteDirty is false', async () => {
        const device = createMockGPUDevice();
        const writeBufferSpy = vi.spyOn(device.queue, 'writeBuffer');

        const renderer = new WebGPURenderer(device, createMockGPUCanvasContext(), new Vector2i(320, 240));

        installMockNavigatorGPU();

        await renderer.init();

        const palette = new Palette(16);

        renderer.setPalette(palette);

        // First frame - initial upload.
        renderer.beginFrame();
        renderer.endFrame();

        const callsAfterFirstFrame = writeBufferSpy.mock.calls.length;

        // No mutation - second frame should NOT upload.
        renderer.beginFrame();
        renderer.endFrame();

        expect(writeBufferSpy.mock.calls.length).toBe(callsAfterFirstFrame);

        writeBufferSpy.mockRestore();

        uninstallMockNavigatorGPU();
    });
});

describe('post-process effects', () => {
    // Install/uninstall via beforeEach/afterEach so an assertion failure in any
    // single test cannot leak the global navigator.gpu mock into the next one.
    beforeEach(() => {
        installMockNavigatorGPU();
    });

    afterEach(() => {
        uninstallMockNavigatorGPU();
    });

    /** Minimal stub effect that records lifecycle calls. */
    function createStubEffect(tier: Effect['tier'] = 'pixel'): Effect & {
        initSpy: ReturnType<typeof vi.fn>;
        updateSpy: ReturnType<typeof vi.fn>;
        encodeSpy: ReturnType<typeof vi.fn>;
        disposeSpy: ReturnType<typeof vi.fn>;
    } {
        const initSpy = vi.fn();
        const updateSpy = vi.fn();
        const encodeSpy = vi.fn();
        const disposeSpy = vi.fn();

        return {
            initSpy,
            updateSpy,
            encodeSpy,
            disposeSpy,
            tier,
            init: (device, format, displaySize) => initSpy(device, format, displaySize),
            updateUniforms: (deltaMs, sourceSize) => updateSpy(deltaMs, sourceSize),
            encodePass: (encoder, sourceView, destView) => encodeSpy(encoder, sourceView, destView),
            dispose: () => disposeSpy(),
        };
    }

    it('addEffect throws before init', () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        expect(() => r.addEffect(createStubEffect())).toThrow(/not initialized/);
    });

    it('removeEffect throws before init', () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        expect(() => r.removeEffect(createStubEffect())).toThrow(/not initialized/);
    });

    it('clearEffects throws before init', () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        expect(() => r.clearEffects()).toThrow(/not initialized/);
    });

    it('addEffect / clearEffects work after init', async () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));

        await r.init();

        const effect = createStubEffect();

        expect(() => r.addEffect(effect)).not.toThrow();
        expect(effect.initSpy).toHaveBeenCalledOnce();
        expect(() => r.clearEffects()).not.toThrow();
        expect(effect.disposeSpy).toHaveBeenCalledOnce();
    });

    it('endFrame uses scene + palette-resolve passes when no effects are registered', async () => {
        const device = createMockGPUDevice();
        const beginRenderPassCalls: unknown[] = [];

        const originalCreate = device.createCommandEncoder.bind(device);
        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();
            const original = encoder.beginRenderPass.bind(encoder);
            encoder.beginRenderPass = (descriptor) => {
                beginRenderPassCalls.push(descriptor);
                return original(descriptor);
            };
            return encoder;
        });

        const r = new WebGPURenderer(device, createMockGPUCanvasContext(), new Vector2i(320, 240));

        await r.init();
        r.setPalette(createTestPalette());

        r.beginFrame();
        r.endFrame();

        // Logical scene (`r8uint`) then palette resolve/upscale to the swap chain.
        expect(beginRenderPassCalls).toHaveLength(2);
    });

    it('endFrame drives chain.encode for each registered effect', async () => {
        const device = createMockGPUDevice();
        const r = new WebGPURenderer(device, createMockGPUCanvasContext(), new Vector2i(320, 240));

        await r.init();
        r.setPalette(createTestPalette());

        const effect = createStubEffect();
        r.addEffect(effect);

        r.beginFrame();
        r.endFrame();

        expect(effect.encodeSpy).toHaveBeenCalledTimes(1);
        expect(effect.updateSpy).toHaveBeenCalledTimes(1);

        // Second frame: another encode call.
        r.beginFrame();
        r.endFrame();

        expect(effect.encodeSpy).toHaveBeenCalledTimes(2);
    });

    it('endFrame drives every effect when multiple are stacked', async () => {
        const device = createMockGPUDevice();
        const r = new WebGPURenderer(device, createMockGPUCanvasContext(), new Vector2i(320, 240));

        await r.init();
        r.setPalette(createTestPalette());

        const effectA = createStubEffect();
        const effectB = createStubEffect();
        r.addEffect(effectA);
        r.addEffect(effectB);

        r.beginFrame();
        r.endFrame();

        expect(effectA.encodeSpy).toHaveBeenCalledTimes(1);
        expect(effectB.encodeSpy).toHaveBeenCalledTimes(1);
    });

    it('endFrame routes the scene pass into the chain offscreen target while active', async () => {
        const device = createMockGPUDevice();
        const beginRenderPassCalls: GPURenderPassDescriptor[] = [];

        const originalCreate = device.createCommandEncoder.bind(device);
        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();
            const original = encoder.beginRenderPass.bind(encoder);
            encoder.beginRenderPass = (descriptor) => {
                beginRenderPassCalls.push(descriptor);
                return original(descriptor);
            };
            return encoder;
        });

        const swapView = { label: 'swap-chain-view' } as unknown as GPUTextureView;
        const swapTexture = {
            width: 320,
            height: 240,
            createView: () => swapView,
        } as unknown as GPUTexture;
        const context = {
            ...createMockGPUCanvasContext(),
            getCurrentTexture: () => swapTexture,
        } as unknown as GPUCanvasContext;

        const r = new WebGPURenderer(device, context, new Vector2i(320, 240));

        await r.init();
        r.setPalette(createTestPalette());

        const effect = createStubEffect();
        r.addEffect(effect);

        r.beginFrame();
        r.endFrame();

        // The scene render pass must target the chain's offscreen view, NOT
        // the swap-chain view. The pixel effect reads that view and writes the
        // logical scene texture; palette resolve then targets the swap chain.
        const scenePass = beginRenderPassCalls[0];
        expect(scenePass).toBeDefined();
        const sceneAttachment = (scenePass?.colorAttachments as GPURenderPassColorAttachment[])[0];
        expect(sceneAttachment?.view).not.toBe(swapView);

        const encodeArgs = effect.encodeSpy.mock.calls[0];
        expect(encodeArgs?.[1]).toBe(sceneAttachment?.view);
        expect(encodeArgs?.[2]).not.toBe(swapView);

        const resolvePass = beginRenderPassCalls[beginRenderPassCalls.length - 1];
        const resolveAttachment = (resolvePass?.colorAttachments as GPURenderPassColorAttachment[])[0];
        expect(resolveAttachment?.view).toBe(swapView);
    });

    it('endFrame routes palette resolve to the swap chain when no effects are registered', async () => {
        const device = createMockGPUDevice();
        const beginRenderPassCalls: GPURenderPassDescriptor[] = [];

        const originalCreate = device.createCommandEncoder.bind(device);
        vi.spyOn(device, 'createCommandEncoder').mockImplementation(() => {
            const encoder = originalCreate();
            const original = encoder.beginRenderPass.bind(encoder);
            encoder.beginRenderPass = (descriptor) => {
                beginRenderPassCalls.push(descriptor);
                return original(descriptor);
            };
            return encoder;
        });

        const swapView = { label: 'swap-chain-view' } as unknown as GPUTextureView;
        const swapTexture = {
            width: 320,
            height: 240,
            createView: () => swapView,
        } as unknown as GPUTexture;
        const context = {
            ...createMockGPUCanvasContext(),
            getCurrentTexture: () => swapTexture,
        } as unknown as GPUCanvasContext;

        const r = new WebGPURenderer(device, context, new Vector2i(320, 240));

        await r.init();
        r.setPalette(createTestPalette());

        r.beginFrame();
        r.endFrame();

        const scenePass = beginRenderPassCalls[0];
        const sceneAttachment = (scenePass?.colorAttachments as GPURenderPassColorAttachment[])[0];

        expect(sceneAttachment?.view).not.toBe(swapView);

        const resolvePass = beginRenderPassCalls[1];
        const resolveAttachment = (resolvePass?.colorAttachments as GPURenderPassColorAttachment[])[0];
        expect(resolveAttachment?.view).toBe(swapView);
        expect(beginRenderPassCalls).toHaveLength(2);
    });

    it('addEffect throws for display-tier effects when drawingBufferSize is unset', async () => {
        const r = new WebGPURenderer(createMockGPUDevice(), createMockGPUCanvasContext(), new Vector2i(320, 240));
        await r.init();

        expect(() => r.addEffect(createStubEffect('display'))).toThrow(
            /display-tier effects require drawingBufferSize/,
        );
    });

    it('routes pixel and display effects into their respective chains when drawingBufferSize is set', async () => {
        const device = createMockGPUDevice();
        const displaySize = new Vector2i(320, 240);
        const drawingBufferSize = new Vector2i(640, 480);
        const r = new WebGPURenderer(device, createMockGPUCanvasContext(), displaySize, drawingBufferSize);

        await r.init();
        r.setPalette(createTestPalette());

        const pixelEffect = createStubEffect('pixel');
        const displayEffect = createStubEffect('display');

        r.addEffect(pixelEffect);
        r.addEffect(displayEffect);

        expect(pixelEffect.initSpy).toHaveBeenCalledOnce();
        expect(displayEffect.initSpy).toHaveBeenCalledOnce();
        expect(pixelEffect.initSpy.mock.calls[0]?.[1]).toBe('r8uint');
        expect(displayEffect.initSpy.mock.calls[0]?.[1]).not.toBe('r8uint');

        r.beginFrame();
        r.endFrame();

        expect(pixelEffect.encodeSpy).toHaveBeenCalledTimes(1);
        expect(displayEffect.encodeSpy).toHaveBeenCalledTimes(1);
        expect(pixelEffect.updateSpy).toHaveBeenCalledTimes(1);
        expect(displayEffect.updateSpy).toHaveBeenCalledTimes(1);
    });
});
