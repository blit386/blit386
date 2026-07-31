import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { RGBMask } from './RGBMask';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('RGBMask', () => {
    it("declares tier='display'", () => {
        expect(new RGBMask().tier).toBe('display');
    });

    it('init allocates a 32-byte uniform buffer', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new RGBMask();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(32);
    });

    it('updateUniforms writes resolution, intensity, size, border', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new RGBMask();
        fx.intensity = 0.2;
        fx.size = 8;
        fx.border = 0.4;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(800, 600));

        expect(writeBuffer).toHaveBeenCalledTimes(1);
        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[0]).toBe(800);
        expect(buf[1]).toBe(600);
        expect(buf[2]).toBeCloseTo(0.2);
        expect(buf[3]).toBeCloseTo(8);
        expect(buf[4]).toBeCloseTo(0.4);
    });

    it('encodePass renders into destView', () => {
        const device = createMockGPUDevice();
        const fx = new RGBMask();
        fx.init(device, FORMAT, SIZE);

        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        fx.encodePass(
            encoder,
            { label: 'src' } as unknown as GPUTextureView,
            { label: 'dst' } as unknown as GPUTextureView,
        );

        expect(beginSpy).toHaveBeenCalledTimes(1);
        const passDescriptor = beginSpy.mock.calls[0]?.[0];
        const firstColorAttachment = passDescriptor?.colorAttachments
            ? [...passDescriptor.colorAttachments][0]
            : undefined;
        expect(firstColorAttachment?.view.label).toBe('dst');
    });
});
