/**
 * Unit tests for {@link FullscreenEffect}.
 *
 * Covers the shared display-tier base paths that concrete effect suites do not
 * always hit: uninitialized encode/update early returns, bind-group caching,
 * and the not-initialized bind-group throw.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Vector2i } from '../../utils/Vector2i';
import { FullscreenEffect } from './FullscreenEffect';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const SIZE = new Vector2i(1280, 960);

const STUB_FRAGMENT = /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(uv, 0.0, 1.0);
}
`;

/**
 * Minimal concrete double for exercising the abstract base class.
 */
class StubFullscreenEffect extends FullscreenEffect {
    readonly tier = 'display' as const;

    protected readonly label = 'StubFullscreenEffect';

    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = STUB_FRAGMENT;

    protected writeUniforms(_deltaMs: number, _sourceSize: Vector2i): void {
        // No-op: tests do not inspect uniform contents.
    }
}

/** Runtime-only access to private GPU handles for guard-path tests. */
type InternalAccess = {
    pipeline: GPURenderPipeline | null;
    device: GPUDevice | null;
    uniformBuffer: GPUBuffer | null;
    sampler: GPUSampler | null;
    bindGroupLayout: GPUBindGroupLayout | null;
};

function asInternal(fx: FullscreenEffect): InternalAccess {
    return fx as unknown as InternalAccess;
}

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('FullscreenEffect', () => {
    it('init creates a pipeline, uniform buffer, and sampler', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new StubFullscreenEffect();

        fx.init(device, FORMAT, SIZE);

        expect(createPipeline).toHaveBeenCalledTimes(1);
        expect(createBuffer).toHaveBeenCalledTimes(1);
        expect(createSampler).toHaveBeenCalledTimes(1);
    });

    it('updateUniforms and encodePass are no-ops before init', () => {
        const device = createMockGPUDevice();
        const writeBuffer = vi.spyOn(device.queue, 'writeBuffer');
        const fx = new StubFullscreenEffect();
        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        fx.updateUniforms(16, SIZE);
        fx.encodePass(
            encoder,
            { label: 'src' } as unknown as GPUTextureView,
            { label: 'dst' } as unknown as GPUTextureView,
        );

        expect(writeBuffer).not.toHaveBeenCalled();
        expect(beginSpy).not.toHaveBeenCalled();
    });

    it('caches bind groups by sourceView', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const fx = new StubFullscreenEffect();
        fx.init(device, FORMAT, SIZE);

        const encoder = device.createCommandEncoder();
        const sourceA = { label: 'src-a' } as unknown as GPUTextureView;
        const sourceB = { label: 'src-b' } as unknown as GPUTextureView;
        const dest = { label: 'dst' } as unknown as GPUTextureView;

        fx.encodePass(encoder, sourceA, dest);
        fx.encodePass(encoder, sourceA, dest);
        expect(createBindGroup).toHaveBeenCalledTimes(1);

        fx.encodePass(encoder, sourceB, dest);
        expect(createBindGroup).toHaveBeenCalledTimes(2);
    });

    it('throws when encodePass runs with a pipeline but missing GPU handles', () => {
        const fx = new StubFullscreenEffect();
        const internal = asInternal(fx);
        internal.pipeline = { label: 'forced' } as unknown as GPURenderPipeline;

        const encoder = createMockGPUDevice().createCommandEncoder();

        expect(() =>
            fx.encodePass(
                encoder,
                { label: 'src' } as unknown as GPUTextureView,
                { label: 'dst' } as unknown as GPUTextureView,
            ),
        ).toThrow('StubFullscreenEffect.encodePass: effect was not initialized.');
    });

    it('throws when uniformBytes is not a positive multiple of 16', () => {
        class BadBytesEffect extends FullscreenEffect {
            readonly tier = 'display' as const;
            protected readonly label = 'BadBytesEffect';
            protected readonly uniformBytes = 8;
            protected readonly fragmentShader = STUB_FRAGMENT;
            protected writeUniforms(): void {}
        }

        expect(() => new BadBytesEffect().init(createMockGPUDevice(), FORMAT, SIZE)).toThrow(
            /uniformBytes must be a positive multiple of 16/,
        );
    });

    it('dispose is idempotent', () => {
        const fx = new StubFullscreenEffect();
        fx.init(createMockGPUDevice(), FORMAT, SIZE);

        expect(() => {
            fx.dispose();
            fx.dispose();
        }).not.toThrow();
    });
});
