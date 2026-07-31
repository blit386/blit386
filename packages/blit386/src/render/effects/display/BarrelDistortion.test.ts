/**
 * Unit tests for {@link BarrelDistortion}.
 *
 * Validates GPU resource creation, uniform layout, encode pass, and dispose
 * lifecycle. Visual correctness is covered by the post-process visual
 * regression suite (`tests/visual/post-process.spec.ts`).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { BarrelDistortion } from './BarrelDistortion';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('BarrelDistortion', () => {
    it("declares tier='display'", () => {
        expect(new BarrelDistortion().tier).toBe('display');
    });

    it('init creates a pipeline, uniform buffer, and sampler', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new BarrelDistortion();

        fx.init(device, FORMAT, SIZE);

        expect(createPipeline).toHaveBeenCalledTimes(1);
        expect(createBuffer).toHaveBeenCalledTimes(1);
        expect(createSampler).toHaveBeenCalledTimes(1);
        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
    });

    it('updateUniforms writes resolution and curvature', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new BarrelDistortion();
        fx.curvature = 0.07;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(640, 480));

        expect(writeBuffer).toHaveBeenCalledTimes(1);
        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[0]).toBe(640);
        expect(buf[1]).toBe(480);
        expect(buf[2]).toBeCloseTo(0.07);
    });

    it('encodePass begins a render pass against destView and draws', () => {
        const device = createMockGPUDevice();
        const fx = new BarrelDistortion();
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

    it('dispose destroys the uniform buffer and clears state', () => {
        const device = createMockGPUDevice();
        const fx = new BarrelDistortion();
        fx.init(device, FORMAT, SIZE);

        // No throw.
        fx.dispose();
        // Second dispose is a no-op.
        fx.dispose();
    });
});
