/**
 * Unit tests for {@link PaletteResolveUpscalePass}: the resolve shader writes premultiplied alpha,
 * which the `alphaMode: 'premultiplied'` canvas expects (BT-756).
 */

import { describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, createMockPaletteBuffer } from '../__test__/webgpu-mock';
import { PaletteResolveUpscalePass } from './PaletteResolveUpscalePass';

/** Initializes the pass on a mock device and returns the WGSL it compiled. */
function compiledShader(): string {
    const device = createMockGPUDevice();
    const createShaderModule = vi.spyOn(device, 'createShaderModule');

    new PaletteResolveUpscalePass().init(device, 'bgra8unorm', 'nearest', createMockPaletteBuffer());

    const descriptor = createShaderModule.mock.calls[0]?.[0];

    if (!descriptor) {
        throw new Error('init() compiled no shader');
    }

    return descriptor.code;
}

describe('PaletteResolveUpscalePass shader', () => {
    it('premultiplies the palette color on the nearest path', () => {
        expect(compiledShader()).toContain('return vec4<f32>(color.rgb * color.a, color.a);');
    });

    it('returns the premultiplied mix on the linear path without dividing alpha back out', () => {
        const code = compiledShader();

        expect(code).toContain('return vec4<f32>(color.rgb * a, a);');
        expect(code).not.toContain('/ pm.a');
        expect(code).not.toContain('vec4<f32>(color.rgb, color.a)');
    });
});
