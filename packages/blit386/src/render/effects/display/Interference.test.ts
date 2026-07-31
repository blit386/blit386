import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { Interference } from './Interference';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('Interference', () => {
    it("declares tier='display'", () => {
        expect(new Interference().tier).toBe('display');
    });

    it('updateUniforms writes amount and time', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new Interference();
        fx.amount = 0.08;
        fx.time = 3.14;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, SIZE);

        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[2]).toBeCloseTo(0.08);
        expect(buf[3]).toBeCloseTo(3.14);
    });
});
