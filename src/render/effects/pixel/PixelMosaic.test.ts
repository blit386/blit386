import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { PixelMosaic } from './PixelMosaic';

const FORMAT: GPUTextureFormat = 'r8uint';
const SIZE = new Vector2i(320, 240);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('PixelMosaic', () => {
    it("declares tier='pixel'", () => {
        expect(new PixelMosaic().tier).toBe('pixel');
    });

    it('does not create a sampler for r8uint pixel chain', () => {
        const device = createMockGPUDevice();
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new PixelMosaic();

        fx.init(device, FORMAT, SIZE);

        expect(createSampler).not.toHaveBeenCalled();
    });

    it('updateUniforms writes blockSize', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new PixelMosaic();
        fx.blockSize = 8;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, SIZE);

        expect(writeBuffer).toHaveBeenCalledTimes(1);
        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[2]).toBeCloseTo(8);
    });

    it('encodePass renders into destView with r8uint clear', () => {
        const device = createMockGPUDevice();
        const fx = new PixelMosaic();
        fx.init(device, FORMAT, SIZE);

        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        fx.encodePass(
            encoder,
            { label: 'src' } as unknown as GPUTextureView,
            { label: 'dst' } as unknown as GPUTextureView,
        );

        const passDescriptor = beginSpy.mock.calls[0]?.[0];
        const firstColorAttachment = passDescriptor?.colorAttachments
            ? [...passDescriptor.colorAttachments][0]
            : undefined;
        expect(firstColorAttachment?.view.label).toBe('dst');
        expect(firstColorAttachment?.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('dispose is safe to call multiple times', () => {
        const fx = new PixelMosaic();
        fx.init(createMockGPUDevice(), FORMAT, SIZE);
        fx.dispose();
        fx.dispose();
    });
});
