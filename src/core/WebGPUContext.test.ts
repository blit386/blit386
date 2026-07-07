/**
 * Unit tests for {@link initWebGPU}.
 *
 * Covers the WebGPU bootstrap path used during engine initialization:
 * - graceful failure when WebGPU support, adapters, devices, or canvas context
 *   creation are unavailable
 * - successful device/context initialization with mocked GPU objects
 * - canvas pixel sizing and optional CSS display sizing
 *
 * Browser GPU capabilities are simulated with the local WebGPU mock helpers so
 * the suite can validate setup logic deterministically.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createMockGPUCanvasContext,
    createMockGPUDevice,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import { WEBGPU_ADAPTER_MESSAGE, WEBGPU_DEVICE_MESSAGE } from '../utils/errorMessages';
import { RenderDimensionLimitError } from '../utils/RenderLimits';
import { Vector2i } from '../utils/Vector2i';
import { initWebGPU } from './WebGPUContext';

function createMockCanvas(webgpuContext: unknown = createMockGPUCanvasContext()): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        style: { width: '', height: '' },
        getContext: (type: string) => (type === 'webgpu' ? webgpuContext : null),
    } as unknown as HTMLCanvasElement;
}

describe('initWebGPU', () => {
    const displaySize = new Vector2i(320, 240);

    afterEach(() => {
        uninstallMockNavigatorGPU();
    });

    it('should return null when navigator.gpu is absent', async () => {
        // Use Object.defineProperty to install a navigator without .gpu - direct
        // property deletion throws in Node.js when navigator is null/non-writable.
        Object.defineProperty(globalThis, 'navigator', {
            value: { userAgent: 'test' },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();
        const result = await initWebGPU(canvas, displaySize);

        expect(result).toBeNull();
    });

    it('should throw with WEBGPU_ADAPTER_MESSAGE when requestAdapter returns null', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                gpu: {
                    requestAdapter: async () => null,
                    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                },
                userAgent: 'test',
            },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();

        await expect(initWebGPU(canvas, displaySize)).rejects.toThrow(WEBGPU_ADAPTER_MESSAGE);
    });

    it('should throw with WEBGPU_DEVICE_MESSAGE when requestDevice throws', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                gpu: {
                    requestAdapter: async () => ({
                        requestDevice: async () => {
                            throw new Error('GPU device error');
                        },
                    }),
                    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                },
                userAgent: 'test',
            },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();

        await expect(initWebGPU(canvas, displaySize)).rejects.toThrow(WEBGPU_DEVICE_MESSAGE);
    });

    it('should return null when canvas.getContext returns null', async () => {
        installMockNavigatorGPU();

        const canvas = createMockCanvas(null);
        const result = await initWebGPU(canvas, displaySize);

        expect(result).toBeNull();
    });

    it('throws RenderDimensionLimitError when displaySize exceeds adapter texture limit', async () => {
        const requestDevice = vi.fn(async () => createMockGPUDevice());
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                gpu: {
                    requestAdapter: async () => ({
                        requestDevice,
                        features: new Set(),
                        limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                    }),
                    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                },
                userAgent: 'test',
            },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();

        await expect(initWebGPU(canvas, new Vector2i(2048, 1024))).rejects.toBeInstanceOf(RenderDimensionLimitError);
        expect(requestDevice).not.toHaveBeenCalled();
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it('throws RenderDimensionLimitError when drawingBufferSize exceeds device texture limit', async () => {
        const requestDevice = vi.fn(async () => ({
            ...createMockGPUDevice(),
            limits: { maxTextureDimension2D: 512 } as GPUSupportedLimits,
        }));
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                gpu: {
                    requestAdapter: async () => ({
                        requestDevice,
                        features: new Set(),
                        limits: { maxTextureDimension2D: 2048 } as GPUSupportedLimits,
                    }),
                    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                },
                userAgent: 'test',
            },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();
        const displaySize = new Vector2i(320, 240);
        const drawingBufferSize = new Vector2i(1024, 768);

        await expect(initWebGPU(canvas, displaySize, drawingBufferSize)).rejects.toBeInstanceOf(
            RenderDimensionLimitError,
        );
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it('succeeds when dimensions are exactly at the adapter texture limit', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                gpu: {
                    requestAdapter: async () => ({
                        requestDevice: async () => createMockGPUDevice(),
                        features: new Set(),
                        limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                    }),
                    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                },
                userAgent: 'test',
            },
            writable: true,
            configurable: true,
        });

        const canvas = createMockCanvas();
        const size = new Vector2i(1024, 1024);

        const result = await initWebGPU(canvas, size);

        expect(result).not.toBeNull();
        expect(canvas.width).toBe(1024);
        expect(canvas.height).toBe(1024);
    });

    it('should return device and context on success', async () => {
        installMockNavigatorGPU();

        const canvas = createMockCanvas();

        const result = await initWebGPU(canvas, displaySize);

        expect(result).not.toBeNull();
        expect(result?.device).toBeDefined();
        expect(result?.context).toBeDefined();
    });

    it('should set canvas resolution from displaySize', async () => {
        installMockNavigatorGPU();

        const canvas = createMockCanvas();

        await initWebGPU(canvas, displaySize);

        expect(canvas.width).toBe(320);
        expect(canvas.height).toBe(240);
    });

    it('should set drawing-buffer size from drawingBufferSize when provided', async () => {
        installMockNavigatorGPU();

        const canvas = createMockCanvas();
        const drawingBufferSize = new Vector2i(640, 480);

        await initWebGPU(canvas, displaySize, drawingBufferSize);

        expect(canvas.width).toBe(640);
        expect(canvas.height).toBe(480);
    });

    it('should configure the canvas context with COPY_SRC usage so captureFrame can read back the swap-chain texture', async () => {
        installMockNavigatorGPU();

        const configure = vi.fn();
        const gpuContext = { ...createMockGPUCanvasContext(), configure };
        const canvas = createMockCanvas(gpuContext);

        await initWebGPU(canvas, displaySize);

        expect(configure).toHaveBeenCalledWith(
            expect.objectContaining({
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            }),
        );
    });
});
