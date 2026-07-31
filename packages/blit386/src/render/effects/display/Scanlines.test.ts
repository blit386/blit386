import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { Scanlines } from './Scanlines';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('Scanlines', () => {
    it("declares tier='display'", () => {
        expect(new Scanlines().tier).toBe('display');
    });

    it('init creates a pipeline, uniform buffer, and sampler', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new Scanlines();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
    });

    it('updateUniforms writes amount, strength, density', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new Scanlines();
        fx.amount = 0.6;
        fx.strength = -8;
        fx.density = 200;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(640, 480));

        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[0]).toBeCloseTo(0.6);
        expect(buf[1]).toBeCloseTo(-8);
        expect(buf[2]).toBeCloseTo(200);
    });

    it('encodePass renders into destView', () => {
        const device = createMockGPUDevice();
        const fx = new Scanlines();
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
    });

    it('dispose is safe to call multiple times', () => {
        const fx = new Scanlines();
        fx.init(createMockGPUDevice(), FORMAT, SIZE);
        fx.dispose();
        fx.dispose();
    });
});
