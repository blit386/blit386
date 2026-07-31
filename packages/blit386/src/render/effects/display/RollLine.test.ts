import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { RollLine } from './RollLine';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('RollLine', () => {
    it("declares tier='display'", () => {
        expect(new RollLine().tier).toBe('display');
    });

    it('init allocates a 32-byte uniform buffer', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new RollLine();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(32);
    });

    it('updateUniforms writes amount, speed, time', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new RollLine();
        fx.amount = 0.15;
        fx.speed = 2;
        fx.time = 7.5;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, SIZE);

        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[2]).toBeCloseTo(0.15);
        expect(buf[3]).toBeCloseTo(2);
        expect(buf[4]).toBeCloseTo(7.5);
    });
});
