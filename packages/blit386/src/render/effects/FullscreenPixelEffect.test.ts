/**
 * Unit tests for {@link FullscreenPixelEffect}.
 *
 * Covers the shared `r8uint` / RGBA init paths, bind-group caching, encode-pass
 * clear values, disposal / re-init, and the defensive uninitialized / missing-
 * sampler guards. Concrete pixel effects (`PixelGlitch`, `PixelMosaic`) have
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

    it('re-init with a different format succeeds after dispose', () => {
        const device = createMockGPUDevice();
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new StubPixelEffect();

        fx.init(device, UINT_FORMAT, SIZE);
        expect(createSampler).not.toHaveBeenCalled();

        fx.dispose();
        fx.init(device, RGBA_FORMAT, SIZE);

        expect(createSampler).toHaveBeenCalledTimes(1);
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

describe('FullscreenPixelEffect RGBA fallback path', () => {
    it('init creates a nearest sampler for non-r8uint formats', () => {
        const device = createMockGPUDevice();
        const createSampler = vi.spyOn(device, 'createSampler');
        const fx = new StubPixelEffect();

        fx.init(device, RGBA_FORMAT, SIZE);

        expect(createSampler).toHaveBeenCalledTimes(1);
        expect(createSampler.mock.calls[0]?.[0]?.magFilter).toBe('nearest');
        expect(createSampler.mock.calls[0]?.[0]?.minFilter).toBe('nearest');
    });

    it('encodePass uses float clear alpha 1 and includes the sampler at binding 2', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const fx = new StubPixelEffect();
        fx.init(device, RGBA_FORMAT, SIZE);

        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');
        const sourceView = { label: 'src' } as unknown as GPUTextureView;
        const destView = { label: 'dst' } as unknown as GPUTextureView;

        fx.encodePass(encoder, sourceView, destView);

        const passDescriptor = beginSpy.mock.calls[0]?.[0];
        const firstColorAttachment = passDescriptor?.colorAttachments
            ? [...passDescriptor.colorAttachments][0]
            : undefined;
        expect(firstColorAttachment?.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });

        const entries = [...(createBindGroup.mock.calls[0]?.[0]?.entries ?? [])];
        expect(entries).toHaveLength(3);
        expect(entries[0]?.binding).toBe(0);
        expect(entries[1]?.binding).toBe(1);
        expect(entries[1]?.resource).toBe(sourceView);
        expect(entries[2]?.binding).toBe(2);
        expect(entries[2]?.resource).toBe(asInternal(fx).sampler);
    });

    it('throws when the RGBA cache path is entered without a sampler', () => {
        const device = createMockGPUDevice();
        const fx = new StubPixelEffect();
        fx.init(device, RGBA_FORMAT, SIZE);

        asInternal(fx).sampler = null;

        const encoder = device.createCommandEncoder();

        expect(() =>
            fx.encodePass(
                encoder,
                { label: 'src' } as unknown as GPUTextureView,
                { label: 'dst' } as unknown as GPUTextureView,
            ),
        ).toThrow('StubPixelEffect.encodePass: sampler missing for RGBA pixel chain.');
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
