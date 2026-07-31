import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../../__test__/webgpu-mock';
import { Vector2i } from '../../../utils/Vector2i';
import { ChromaticAberration } from './ChromaticAberration';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('ChromaticAberration', () => {
    it("declares tier='display'", () => {
        expect(new ChromaticAberration().tier).toBe('display');
    });

    it('init allocates a 16-byte uniform buffer', () => {
        const device = createMockGPUDevice();
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const fx = new ChromaticAberration();

        fx.init(device, FORMAT, SIZE);

        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
    });

    it('updateUniforms writes resolution and aberration', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new ChromaticAberration();
        fx.aberration = 2.5;

        fx.init(device, FORMAT, SIZE);
        fx.updateUniforms(16, new Vector2i(1280, 960));

        const buf = writeBuffer.mock.calls[0]?.[2] as Float32Array;
        expect(buf[2]).toBeCloseTo(2.5);
    });
});
