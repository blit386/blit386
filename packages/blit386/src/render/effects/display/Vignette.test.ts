import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { Vignette } from './Vignette';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('Vignette', () => {
    it("declares tier='display'", () => {
        expect(new Vignette().tier).toBe('display');
    });

    it('init allocates a 16-byte uniform buffer', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new Vignette();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
    });

    it('updateUniforms writes resolution and amount', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new Vignette();
        fx.amount = 0.45;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(1024, 768));

        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[0]).toBe(1024);
        expect(buf[1]).toBe(768);
        expect(buf[2]).toBeCloseTo(0.45);
    });
});
