/**
 * Unit tests for {@link FrameCapture} and its supporting pixel helpers.
 *
 * Covers row-alignment math, BGRA-to-RGBA swizzling, pending-capture state
 * management, texture-to-buffer copy encoding, and PNG conversion using stubbed
 * browser-only APIs such as `ImageData` and `OffscreenCanvas`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, createMockGPUTexture } from '../__test__/webgpu-mock';
import { alignedBytesPerRow, FrameCapture, swizzleBGRAtoRGBA } from './FrameCapture';

/**
 * Installs browser-only globals (ImageData, OffscreenCanvas) that don't exist in Node.js.
 * Call in beforeEach for tests that exercise the full capture-to-PNG flow.
 */
function installBrowserMocks(): void {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });

    // Use classes so they work with `new`.
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
            getContext(): { putImageData: ReturnType<typeof vi.fn> } {
                return { putImageData: vi.fn() };
            }

            async convertToBlob(): Promise<Blob> {
                return mockBlob;
            }
        },
    );
}

describe('alignedBytesPerRow', () => {
    it('should return 256 for widths up to 64 pixels', () => {
        // 64 * 4 = 256, which is already aligned.
        expect(alignedBytesPerRow(1)).toBe(256);
        expect(alignedBytesPerRow(32)).toBe(256);
        expect(alignedBytesPerRow(64)).toBe(256);
    });

    it('should round up to next 256 boundary', () => {
        // 65 * 4 = 260 -> next 256 multiple = 512
        expect(alignedBytesPerRow(65)).toBe(512);
        // 128 * 4 = 512 -> already aligned
        expect(alignedBytesPerRow(128)).toBe(512);
        // 320 * 4 = 1280 -> next 256 multiple = 1280 (already aligned)
        expect(alignedBytesPerRow(320)).toBe(1280);
    });

    it('should handle typical retro resolutions', () => {
        // 160 * 4 = 640 -> next 256 = 768
        expect(alignedBytesPerRow(160)).toBe(768);
        // 240 * 4 = 960 -> next 256 = 1024
        expect(alignedBytesPerRow(240)).toBe(1024);
        // 256 * 4 = 1024 -> already aligned
        expect(alignedBytesPerRow(256)).toBe(1024);
    });
});

describe('swizzleBGRAtoRGBA', () => {
    it('should swap B and R channels', () => {
        // BGRA: B=10, G=20, R=30, A=40
        const data = new Uint8ClampedArray([10, 20, 30, 40]);

        swizzleBGRAtoRGBA(data);

        // RGBA: R=30, G=20, B=10, A=40
        expect(data[0]).toBe(30);
        expect(data[1]).toBe(20);
        expect(data[2]).toBe(10);
        expect(data[3]).toBe(40);
    });

    it('should handle multiple pixels', () => {
        const data = new Uint8ClampedArray([
            255,
            0,
            0,
            255, // Pixel 1: BGRA (blue)
            0,
            255,
            0,
            255, // Pixel 2: BGRA (green)
        ]);

        swizzleBGRAtoRGBA(data);

        // Pixel 1: RGBA (blue channel stays, red channel swapped)
        expect(data[0]).toBe(0); // R (was B=255, now R from position 2)
        expect(data[2]).toBe(255); // B (was R=0, now B from position 0)

        // Pixel 2: green channel unchanged
        expect(data[4]).toBe(0);
        expect(data[5]).toBe(255);
        expect(data[6]).toBe(0);
    });

    it('should handle an empty array', () => {
        const data = new Uint8ClampedArray([]);

        swizzleBGRAtoRGBA(data);

        expect(data.length).toBe(0);
    });
});

describe('FrameCapture', () => {
    beforeEach(() => {
        installBrowserMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should start with no pending capture', () => {
        const capture = new FrameCapture();

        expect(capture.hasPending()).toBe(false);
    });

    it('should set a pending flag after request', () => {
        const capture = new FrameCapture();

        // Don't await - just queue the request.
        void capture.request();

        expect(capture.hasPending()).toBe(true);
    });

    it('should reject the previous capture when a new one is requested', async () => {
        const capture = new FrameCapture();

        const firstCapture = capture.request();

        void capture.request();

        await expect(firstCapture).rejects.toThrow('superseded');
    });

    it('should clear the pending flag after resolve', async () => {
        const capture = new FrameCapture();

        void capture.request();

        expect(capture.hasPending()).toBe(true);

        const device = createMockGPUDevice();
        const texture = createMockGPUTexture(4, 4);
        const encoder = device.createCommandEncoder();

        // Add copyTextureToBuffer to mock encoder.
        (encoder as unknown as Record<string, unknown>).copyTextureToBuffer = vi.fn();

        capture.executeInEncoder(device, texture, encoder as unknown as GPUCommandEncoder);

        await capture.resolve(device);

        expect(capture.hasPending()).toBe(false);
    });

    it('should call copyTextureToBuffer in executeInEncoder', () => {
        const capture = new FrameCapture();

        void capture.request();

        const device = createMockGPUDevice();
        const texture = createMockGPUTexture(320, 240);
        const copyFn = vi.fn();
        const encoder = {
            ...device.createCommandEncoder(),
            copyTextureToBuffer: copyFn,
        } as unknown as GPUCommandEncoder;

        capture.executeInEncoder(device, texture, encoder);

        expect(copyFn).toHaveBeenCalledOnce();

        // Verify the buffer destination has aligned bytesPerRow.
        const destArg = copyFn.mock.calls[0]?.[1] as { bytesPerRow: number };

        expect(destArg.bytesPerRow).toBe(alignedBytesPerRow(320));
    });

    it('should resolve with a Blob on successful capture', async () => {
        const capture = new FrameCapture();
        const capturePromise = capture.request();

        const device = createMockGPUDevice();
        const texture = createMockGPUTexture(4, 4);
        const encoder = {
            ...device.createCommandEncoder(),
            copyTextureToBuffer: vi.fn(),
        } as unknown as GPUCommandEncoder;

        capture.executeInEncoder(device, texture, encoder);

        await capture.resolve(device);

        const result = await capturePromise;

        expect(result).toBeInstanceOf(Blob);
        expect(result.type).toBe('image/png');
    });

    it('should swizzle BGRA pixels to RGBA during resolve', async () => {
        const capture = new FrameCapture();
        const capturePromise = capture.request();

        const device = createMockGPUDevice();
        const bgraTexture = { ...createMockGPUTexture(4, 4), format: 'bgra8unorm' } as unknown as GPUTexture;

        // Prepare a buffer with known BGRA pixel data.
        const paddedBytesPerRow = alignedBytesPerRow(4);
        const bufferSize = paddedBytesPerRow * 4;
        const pixelBuffer = new ArrayBuffer(bufferSize);
        const view = new Uint8Array(pixelBuffer);

        // Fill first pixel of each row with BGRA = [10, 20, 30, 255].
        for (let y = 0; y < 4; y++) {
            const offset = y * paddedBytesPerRow;
            // eslint-disable-next-line security/detect-object-injection -- typed array indexed by loop counter
            view[offset] = 10; // B
            view[offset + 1] = 20; // G
            view[offset + 2] = 30; // R
            view[offset + 3] = 255; // A
        }

        // Override createBuffer to return a buffer with our pixel data.
        const originalCreateBuffer = device.createBuffer.bind(device);

        vi.spyOn(device, 'createBuffer').mockImplementation((desc: GPUBufferDescriptor) => {
            const buf = originalCreateBuffer(desc);

            (buf as unknown as Record<string, unknown>).getMappedRange = () => pixelBuffer;

            return buf;
        });

        const encoder = {
            ...device.createCommandEncoder(),
            copyTextureToBuffer: vi.fn(),
        } as unknown as GPUCommandEncoder;

        capture.executeInEncoder(device, bgraTexture, encoder);

        // Capture the pixel data passed to ImageData to verify swizzle.
        let capturedPixels: Uint8ClampedArray | null = null;

        vi.stubGlobal(
            'ImageData',
            class MockImageData {
                constructor(
                    public data: Uint8ClampedArray,
                    public width: number,
                    public height: number,
                ) {
                    capturedPixels = data;
                }
            },
        );

        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                getContext(): { putImageData: ReturnType<typeof vi.fn> } {
                    return { putImageData: vi.fn() };
                }

                async convertToBlob(): Promise<Blob> {
                    return new Blob(['png'], { type: 'image/png' });
                }
            },
        );

        await capture.resolve(device);
        await capturePromise;

        expect(capture.hasPending()).toBe(false);
        expect(capturedPixels).not.toBeNull();

        // After swizzle, first pixel of each row should be RGBA = [30, 20, 10, 255].
        if (capturedPixels === null) {
            throw new Error('capturedPixels should not be null');
        }

        const pixels = capturedPixels;

        for (let y = 0; y < 4; y++) {
            const offset = y * 4 * 4; // 4 pixels per row, 4 bytes per pixel (no padding in output)

            // eslint-disable-next-line security/detect-object-injection -- typed array indexed by loop counter
            expect(pixels[offset]).toBe(30); // R (was B=10, swapped with R=30)
            expect(pixels[offset + 1]).toBe(20); // G (unchanged)
            expect(pixels[offset + 2]).toBe(10); // B (was R=30, swapped with B=10)
            expect(pixels[offset + 3]).toBe(255); // A (unchanged)
        }

        vi.unstubAllGlobals();
    });

    it('should not throw when resolve is called without pending capture', async () => {
        const capture = new FrameCapture();
        const device = createMockGPUDevice();

        await expect(capture.resolve(device)).resolves.toBeUndefined();
    });
});
