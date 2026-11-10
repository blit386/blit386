/**
 * Unit tests for {@link FullscreenPixelEffect}.
 *
 * Covers the `r8uint` init path, the non-`r8uint` rejection, bind-group caching,
 * encode-pass clear values, disposal / re-init, and the uninitialized guards.
 * Concrete pixel effects (`PixelGlitch`, `PixelMosaic`) have
 * their own colocated suites for param layout.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Vector2i } from '../../utils/Vector2i';
import { FullscreenPixelEffect } from './FullscreenPixelEffect';

const UINT_FORMAT: GPUTextureFormat = 'r8uint';
const RGBA_FORMAT: GPUTextureFormat = 'rgba8unorm';
const SIZE = new Vector2i(320, 240);

const STUB_FRAGMENT_RGBA = /* wgsl */ `
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(0.0);
}
`;

/** Matches the production `r8uint` contract (`fs_main` writes a palette index). */
const STUB_FRAGMENT_UINT = /* wgsl */ `
@fragment
fn fs_main() -> @location(0) u32 {
    return 0u;
}
`;

/**
 * Minimal concrete double for exercising the abstract base class.
 */
class StubPixelEffect extends FullscreenPixelEffect {
    protected readonly label = 'StubPixelEffect';

    protected readonly uniformBytes = 16;

    protected readonly fragmentShaderRgba = STUB_FRAGMENT_RGBA;

    protected readonly fragmentShaderUint = STUB_FRAGMENT_UINT;

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
    attachmentFormat: GPUTextureFormat | null;
};

function asInternal(fx: FullscreenPixelEffect): InternalAccess {
    return fx as unknown as InternalAccess;
}

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('FullscreenPixelEffect r8uint path', () => {
    it('init creates a pipeline and uniform buffer but no sampler', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');
        const createBuffer = vi.spyOn(device, 'createBuffer');
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new StubPixelEffect();

        fx.init(device, UINT_FORMAT, SIZE);

        expect(createPipeline).toHaveBeenCalledTimes(1);
        expect(createBuffer).toHaveBeenCalledTimes(1);
        expect(createBuffer.mock.calls[0]?.[0]?.size).toBe(16);
        expect(createSampler).not.toHaveBeenCalled();
    });

    it('encodePass clears into destView with alpha 0 and builds a uint bind group', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const fx = new StubPixelEffect();
        fx.init(device, UINT_FORMAT, SIZE);

        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');
        const sourceView = { label: 'src' } as unknown as GPUTextureView;
        const destView = { label: 'dst' } as unknown as GPUTextureView;

        fx.encodePass(encoder, sourceView, destView);

        const passDescriptor = beginSpy.mock.calls[0]?.[0];
        const firstColorAttachment = passDescriptor?.colorAttachments
            ? [...passDescriptor.colorAttachments][0]
            : undefined;
        expect(firstColorAttachment?.view).toBe(destView);
        expect(firstColorAttachment?.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });

        expect(createBindGroup).toHaveBeenCalledTimes(1);
        const entries = [...(createBindGroup.mock.calls[0]?.[0]?.entries ?? [])];
        expect(entries).toHaveLength(2);
        expect(entries[0]?.binding).toBe(0);
        expect(entries[1]?.binding).toBe(1);
        expect(entries[1]?.resource).toBe(sourceView);
    });

    it('caches uint bind groups by sourceView', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const fx = new StubPixelEffect();
        fx.init(device, UINT_FORMAT, SIZE);

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
});

describe('FullscreenPixelEffect dispose and re-init', () => {
    it('dispose is idempotent', () => {
        const fx = new StubPixelEffect();
        fx.init(createMockGPUDevice(), UINT_FORMAT, SIZE);

        expect(() => {
            fx.dispose();
            fx.dispose();
        }).not.toThrow();
    });

    it('re-init succeeds after dispose', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');
        const fx = new StubPixelEffect();

        fx.init(device, UINT_FORMAT, SIZE);
        fx.dispose();
        fx.init(device, UINT_FORMAT, SIZE);

        expect(createPipeline).toHaveBeenCalledTimes(2);
    });
});

describe('FullscreenPixelEffect uninitialized guards', () => {
    it('encodePass is a no-op when the pipeline is null', () => {
        const device = createMockGPUDevice();
        const fx = new StubPixelEffect();
        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        fx.encodePass(
            encoder,
            { label: 'src' } as unknown as GPUTextureView,
            { label: 'dst' } as unknown as GPUTextureView,
        );

        expect(beginSpy).not.toHaveBeenCalled();
    });

    it('throws when encodePass runs with a pipeline but missing GPU handles', () => {
        const fx = new StubPixelEffect();
        const internal = asInternal(fx);
        internal.pipeline = { label: 'forced' } as unknown as GPURenderPipeline;
        internal.attachmentFormat = UINT_FORMAT;

        const encoder = createMockGPUDevice().createCommandEncoder();

        expect(() =>
            fx.encodePass(
                encoder,
                { label: 'src' } as unknown as GPUTextureView,
                { label: 'dst' } as unknown as GPUTextureView,
            ),
        ).toThrow('StubPixelEffect.encodePass: effect was not initialized.');
    });
});

describe('FullscreenPixelEffect non-r8uint formats', () => {
    it('init throws for a float chain format and creates nothing', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');

        expect(() => new StubPixelEffect().init(device, RGBA_FORMAT, SIZE)).toThrow(
            'StubPixelEffect: pixel-tier effects run on the r8uint chain only (got rgba8unorm).',
        );
        expect(createPipeline).not.toHaveBeenCalled();
    });
});

describe('FullscreenPixelEffect uniformBytes validation', () => {
    it('throws when uniformBytes is not a positive multiple of 16', () => {
        class BadBytesEffect extends FullscreenPixelEffect {
            protected readonly label = 'BadBytesEffect';
            protected readonly uniformBytes = 8;
            protected readonly fragmentShaderRgba = STUB_FRAGMENT_RGBA;
            protected readonly fragmentShaderUint = STUB_FRAGMENT_UINT;
            protected writeUniforms(): void {}
        }

        expect(() => new BadBytesEffect().init(createMockGPUDevice(), UINT_FORMAT, SIZE)).toThrow(
            /uniformBytes must be a positive multiple of 16/,
        );
    });
});
