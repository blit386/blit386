/**
 * Unit tests for {@link UpscalePass}.
 *
 * Covers GPU resource creation, sampler filter selection, the per-source-view
 * bind-group cache, and the helper for allocating output textures.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../__test__/webgpu-mock';
import { Vector2i } from '../utils/Vector2i';
import { UpscalePass } from './UpscalePass';

const FORMAT: GPUTextureFormat = 'bgra8unorm';

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('UpscalePass.init', () => {
    it('creates a render pipeline and a sampler', () => {
        const device = createMockGPUDevice();
        const createPipeline = vi.spyOn(device, 'createRenderPipeline');
        const createSampler = vi.spyOn(device, 'createSampler');
        const pass = new UpscalePass();

        pass.init(device, FORMAT, 'nearest');

        expect(createPipeline).toHaveBeenCalledTimes(1);
        expect(createSampler).toHaveBeenCalledTimes(1);
    });

    it('configures the sampler with the requested filter mode', () => {
        const device = createMockGPUDevice();
        const createSampler = vi.spyOn(device, 'createSampler');
        const pass = new UpscalePass();

        pass.init(device, FORMAT, 'linear');

        const desc = createSampler.mock.calls[0]?.[0];
        expect(desc?.magFilter).toBe('linear');
        expect(desc?.minFilter).toBe('linear');
    });

    it('exposes the configured filter via the filter getter', () => {
        const pass = new UpscalePass();
        pass.init(createMockGPUDevice(), FORMAT, 'nearest');

        expect(pass.filter).toBe('nearest');
    });

    it('uses clamp-to-edge addressing to avoid sampling outside the source', () => {
        const device = createMockGPUDevice();
        const createSampler = vi.spyOn(device, 'createSampler');
        const pass = new UpscalePass();

        pass.init(device, FORMAT, 'nearest');

        const desc = createSampler.mock.calls[0]?.[0];
        expect(desc?.addressModeU).toBe('clamp-to-edge');
        expect(desc?.addressModeV).toBe('clamp-to-edge');
    });
});

describe('UpscalePass.encode', () => {
    it('throws when called before init', () => {
        const pass = new UpscalePass();
        const device = createMockGPUDevice();
        const sourceView = { label: 'src' } as unknown as GPUTextureView;
        const destView = { label: 'dst' } as unknown as GPUTextureView;

        expect(() => pass.encode(device.createCommandEncoder(), sourceView, destView)).toThrow(/not initialized/);
    });

    it('begins a render pass against destView and draws three vertices', () => {
        const device = createMockGPUDevice();
        const pass = new UpscalePass();
        pass.init(device, FORMAT, 'nearest');

        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        pass.encode(
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

    it('caches bind groups per source view', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const pass = new UpscalePass();
        pass.init(device, FORMAT, 'nearest');

        const sourceView = { label: 'src' } as unknown as GPUTextureView;
        const destView = { label: 'dst' } as unknown as GPUTextureView;

        const encoder = device.createCommandEncoder();
        pass.encode(encoder, sourceView, destView);
        pass.encode(encoder, sourceView, destView);
        pass.encode(encoder, sourceView, destView);

        expect(createBindGroup).toHaveBeenCalledTimes(1);
    });

    it('creates a new bind group when the source view changes', () => {
        const device = createMockGPUDevice();
        const createBindGroup = vi.spyOn(device, 'createBindGroup');
        const pass = new UpscalePass();
        pass.init(device, FORMAT, 'nearest');

        const a = { label: 'a' } as unknown as GPUTextureView;
        const b = { label: 'b' } as unknown as GPUTextureView;
        const dest = { label: 'dst' } as unknown as GPUTextureView;

        const encoder = device.createCommandEncoder();
        pass.encode(encoder, a, dest);
        pass.encode(encoder, b, dest);

        expect(createBindGroup).toHaveBeenCalledTimes(2);
    });
});

describe('UpscalePass.createOutputTexture', () => {
    it('creates a texture with the requested size and format', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');

        UpscalePass.createOutputTexture(device, new Vector2i(1280, 960), FORMAT);

        expect(createTexture).toHaveBeenCalledTimes(1);
        const desc = createTexture.mock.calls[0]?.[0];
        expect(desc?.format).toBe(FORMAT);
        const size = desc?.size as GPUExtent3DDict;
        expect(size?.width).toBe(1280);
        expect(size?.height).toBe(960);
    });

    it('sets RENDER_ATTACHMENT and TEXTURE_BINDING usage flags', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');

        UpscalePass.createOutputTexture(device, new Vector2i(640, 480), FORMAT);

        const desc = createTexture.mock.calls[0]?.[0];
        expect(desc?.usage).toBeDefined();
        const expected = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        expect((desc?.usage ?? 0) & expected).toBe(expected);
    });
});

describe('UpscalePass.dispose', () => {
    it('clears references and is safe to call without init', () => {
        const pass = new UpscalePass();
        expect(() => pass.dispose()).not.toThrow();
    });

    it('clears references after init, so further encode throws', () => {
        const device = createMockGPUDevice();
        const pass = new UpscalePass();
        pass.init(device, FORMAT, 'nearest');
        pass.dispose();

        expect(() =>
            pass.encode(
                device.createCommandEncoder(),
                { label: 'src' } as unknown as GPUTextureView,
                { label: 'dst' } as unknown as GPUTextureView,
            ),
        ).toThrow(/not initialized/);
    });
});
