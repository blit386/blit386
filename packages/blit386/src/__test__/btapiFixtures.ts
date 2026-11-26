/**
 * Shared fixtures for the `BTAPI` and `src/core/engine/` part specs: singleton reset, mock demos and canvases,
 * the real-PNG `OffscreenCanvas` stub, and PNG size decoding.
 *
 * Not exported from `BLIT386.ts`, so it never reaches the dist build; `src/__test__/**` is outside coverage.
 */

import { PNG } from 'pngjs';
import { vi } from 'vitest';

import { BTAPI } from '../core/BTAPI';
import type { IBTDemo } from '../core/IBTDemo';
import { Vector2i } from '../utils/Vector2i';
import { createMockGPUCanvasContext } from './webgpu-mock';

export function resetSingleton(): void {
    // BTAPI._instance is private; the cast is intentional - there is no public
    // reset API, and this is the least-invasive way to isolate singleton state
    // between tests without modifying production code.
    (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
}

/**
 * Reads the private palette effect manager's active count.
 *
 * @returns Number of palette effects currently registered.
 */
export function activeEffectCount(): number {
    return (BTAPI.instance as unknown as { paletteEffects: { activeCount: number } }).paletteEffects.activeCount;
}

export function makeMockDemo(targetFPS = 60, initResult = true, audioVoices?: number): IBTDemo {
    return {
        configure: vi.fn().mockReturnValue({
            // These tests stub requestAnimationFrame with a no-op, so the splash's own
            // frame driver would never reach 'done' and init() would never resolve.
            // Splash behavior has its own suite below.
            isSplashEnabled: false,
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(640, 480),
            targetFPS,
            ...(audioVoices === undefined ? {} : { audioVoices }),
        }),

        init: vi.fn().mockResolvedValue(initResult),
        update: vi.fn(),
        render: vi.fn(),
    };
}

export function makeMockCanvas(): HTMLCanvasElement {
    // `canvas` is referenced from its own `getContext` below (assigned once the whole object
    // exists) so the mock GPUCanvasContext's getCurrentTexture() can mirror WebGPUContext.ts's
    // real behavior: it sets canvas.width/height from drawingBufferSize BEFORE calling
    // getContext('webgpu'), and getCurrentTexture() always matches whatever that backing store is.
    const canvas = {
        width: 0,
        height: 0,
        style: {
            width: '',
            height: '',
            touchAction: '',
            setProperty: vi.fn(),
            getPropertyValue: vi.fn(() => ''),
        },

        getContext: (type: string) => (type === 'webgpu' ? createMockGPUCanvasContext(canvas) : null),

        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;

    return canvas;
}

export function makeMock2DCanvas(): HTMLCanvasElement {
    // `canvas` is referenced from its own `toBlob` below (assigned once the whole object exists)
    // so the mock can encode a real PNG sized to canvas.width/height - SoftwareRenderer.ts sets
    // those directly to outputSize before ever calling toBlob(), so by the time toBlob runs they
    // hold the real resolved size, not a stale default.
    const canvas = {
        ...makeMockCanvas(),
        getContext: (type: string) => {
            if (type === '2d') {
                return {
                    imageSmoothingEnabled: false,

                    createImageData: (w: number, h: number) =>
                        ({
                            data: new Uint8ClampedArray(w * h * 4),
                            width: w,
                            height: h,
                        }) as ImageData,

                    putImageData: vi.fn(),
                    clearRect: vi.fn(),
                    drawImage: vi.fn(),
                };
            }

            return null;
        },
        toBlob: (callback: (blob: Blob | null) => void) => {
            const png = new PNG({ width: canvas.width, height: canvas.height });

            png.data = Buffer.alloc(canvas.width * canvas.height * 4);

            callback(new Blob([new Uint8Array(PNG.sync.write(png))], { type: 'image/png' }));
        },
    } as unknown as HTMLCanvasElement;

    return canvas;
}

/** Minimal 2D context shape for {@link OffscreenCanvas#getContext} mocks; rejects non-`2d` types. */
export type OffscreenCanvas2DMock = {
    imageSmoothingEnabled: boolean;
    createImageData: (w: number, h: number) => ImageData;
    putImageData: ReturnType<typeof vi.fn>;
};

export function makeOffscreenCanvas2dContext(): OffscreenCanvas2DMock {
    return {
        imageSmoothingEnabled: false,

        createImageData: (w: number, h: number) =>
            ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
            }) as ImageData,

        putImageData: vi.fn(),
    };
}

/**
 * Stubs global `ImageData` and `OffscreenCanvas` so `FrameCapture.ts`'s `pixelBufferToPNG()`
 * (the WebGPU capture path) produces a real PNG-encoded Blob sized to whatever width/height it
 * was actually called with, instead of an opaque fake Blob. Lets a test decode the result and
 * verify the real encoded pixel dimensions - see BT-488, where a mocked fixed-content Blob could
 * never have caught a captured-size regression.
 */
export function installRealPNGOffscreenCanvasMock(): void {
    vi.stubGlobal(
        'ImageData',
        class MockImageData {
            data: Uint8ClampedArray;
            width: number;
            height: number;

            constructor(data: Uint8ClampedArray, width: number, height: number) {
                this.data = data;
                this.width = width;
                this.height = height;
            }
        },
    );

    vi.stubGlobal(
        'OffscreenCanvas',
        class MockOffscreenCanvas {
            private putData: { data: Uint8ClampedArray; width: number; height: number } | null = null;

            constructor(
                public width: number,
                public height: number,
            ) {}

            getContext(): { putImageData: (imageData: ImageData) => void } {
                return {
                    putImageData: (imageData: ImageData) => {
                        this.putData = { data: imageData.data, width: imageData.width, height: imageData.height };
                    },
                };
            }

            async convertToBlob(): Promise<Blob> {
                if (!this.putData) {
                    throw new Error('putImageData was not called before convertToBlob');
                }

                const png = new PNG({ width: this.putData.width, height: this.putData.height });

                png.data = Buffer.from(this.putData.data);

                return new Blob([new Uint8Array(PNG.sync.write(png))], { type: 'image/png' });
            }
        },
    );
}

/**
 * Decodes a captured PNG `Blob` with `pngjs` and returns its real encoded width/height - the
 * dimensions a design tool or `sips` would report, as opposed to whatever size a mocked Blob
 * merely claims to be.
 *
 * @param blob - PNG-encoded Blob to decode.
 * @returns Decoded pixel width and height.
 */
export async function decodedPngSize(blob: Blob): Promise<{ width: number; height: number }> {
    const decoded = PNG.sync.read(Buffer.from(await blob.arrayBuffer()));

    return { width: decoded.width, height: decoded.height };
}
