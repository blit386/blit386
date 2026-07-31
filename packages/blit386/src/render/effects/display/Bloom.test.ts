import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { Bloom } from './Bloom';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('Bloom', () => {
    it("declares tier='display'", () => {
        expect(new Bloom().tier).toBe('display');
    });

    it('init allocates a 16-byte uniform buffer', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new Bloom();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
    });

    it('updateUniforms writes resolution, spread, glow', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new Bloom();
        fx.spread = 4;
        fx.glow = 0.22;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(1024, 768));

        expect(writeBuffer).toHaveBeenCalledTimes(1);
        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[0]).toBe(1024);
        expect(buf[1]).toBe(768);
        expect(buf[2]).toBeCloseTo(4);
        expect(buf[3]).toBeCloseTo(0.22);
    });
});
