import type { Vector2i } from '../utils/Vector2i';
import { VS_WGSL } from './effects/fullscreenVS';

/**
 * Upscale filter applied between the pixel chain (logical resolution) and the
 * display chain (canvas output resolution).
 *
 * - `'nearest'` - point sampling, preserves crisp pixel edges. Default.
 * - `'linear'` - bilinear sampling, gives a soft "old TV" feel.
 */
export type UpscaleFilter = 'nearest' | 'linear';

/**
 * Legacy/test utility: fullscreen pass that copies a logical-resolution texture
 * onto a display-resolution texture with a configurable magnification filter.
 *
 * Production rendering uses {@link PaletteResolveUpscalePass} (palette-index
 * resolve + upscale) between the pixel and display chains. This class remains
 * for unit tests and standalone upscale scenarios.
 *
 * The pass owns its render pipeline, sampler, and a per-source-view bind-group
 * cache. It does **not** own the source or destination textures - the caller
 * supplies views every frame.
 */
export class UpscalePass {
    private device: GPUDevice | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private sampler: GPUSampler | null = null;

    /** Filter mode this pass was initialized with. */
    private filterMode: UpscaleFilter = 'nearest';

    /**
     * Per-source-view bind group cache. Source views are stable for the
     * lifetime of the pixel chain, so a `WeakMap` is safe.
     */
    private readonly bindGroups = new WeakMap<GPUTextureView, GPUBindGroup>();

    /**
     * Returns the filter mode this pass was initialized with.
     *
     * @returns Filter mode (`'nearest'` or `'linear'`).
     */
    get filter(): UpscaleFilter {
        return this.filterMode;
    }

    /**
     * Allocates a texture for the upscale pass output at the supplied size and
     * format.
     *
     * The renderer typically owns this texture and recreates it whenever the
     * canvas resizes; the pass itself only encodes the draw and is unaware of
     * lifecycle.
     *
     * @param device - WebGPU device used for resource creation.
     * @param size - Target texture dimensions in pixels.
     * @param format - Color format (match the swap chain).
     * @param label - Optional debug label.
     * @returns Newly created texture with usage flags suitable for upscale output.
     */
    static createOutputTexture(
        device: GPUDevice,
        size: Vector2i,
        format: GPUTextureFormat,
        label = 'UpscalePass Output',
    ): GPUTexture {
        return device.createTexture({
            label,
            size: { width: size.x, height: size.y, depthOrArrayLayers: 1 },
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    /**
     * Creates the GPU pipeline and the magnification sampler.
     *
     * Idempotent only on a freshly disposed instance: calling `init` twice
     * without `dispose` will leak the previous sampler and pipeline.
     *
     * @param device - WebGPU device used for resource creation.
     * @param format - Color attachment format (matches the swap chain).
     * @param filter - Magnification filter mode.
     */
    init(device: GPUDevice, format: GPUTextureFormat, filter: UpscaleFilter): void {
        this.device = device;
        this.filterMode = filter;

        const module = device.createShaderModule({
            label: 'UpscalePass Shader',
            code: VS_WGSL + FRAGMENT_WGSL,
        });

        this.pipeline = device.createRenderPipeline({
            label: 'UpscalePass Pipeline',
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);

        this.sampler = device.createSampler({
            label: `UpscalePass Sampler (${filter})`,
            magFilter: filter,
            minFilter: filter,
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
    }

    /**
     * Encodes a single full-screen pass that samples {@link sourceView} and
     * writes into {@link destView}.
     *
     * @param encoder - Active command encoder.
     * @param sourceView - View of the logical-resolution framebuffer.
     * @param destView - View of the display-resolution destination texture
     *   (or the swap chain when no display effects are active).
     */
    encode(encoder: GPUCommandEncoder, sourceView: GPUTextureView, destView: GPUTextureView): void {
        if (!this.pipeline) {
            throw new Error('UpscalePass.encode: pass was not initialized.');
        }

        const bindGroup = this.getOrCreateBindGroup(sourceView);
        const pass = encoder.beginRenderPass({
            label: 'UpscalePass Pass',
            colorAttachments: [
                {
                    view: destView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();
    }

    /**
     * Releases GPU resources owned by this pass.
     *
     * Safe to call multiple times.
     */
    dispose(): void {
        // Bind groups don't have a destroy method - dropping the WeakMap entries is enough.
        // Sampler / pipeline / layout are reference-counted by WebGPU; clearing the refs is enough.
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.sampler = null;
        this.device = null;
    }

    /**
     * Returns the bind group for the supplied source view, creating one on
     * first use and caching by view identity for subsequent frames.
     *
     * @param sourceView - View of the source texture to sample.
     * @returns Cached or newly created bind group.
     */
    private getOrCreateBindGroup(sourceView: GPUTextureView): GPUBindGroup {
        const cached = this.bindGroups.get(sourceView);

        if (cached) {
            return cached;
        }

        if (!this.device || !this.bindGroupLayout || !this.sampler) {
            throw new Error('UpscalePass.encode: pass was not initialized.');
        }

        const bindGroup = this.device.createBindGroup({
            label: 'UpscalePass Bind Group',
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: sourceView },
                { binding: 1, resource: this.sampler },
            ],
        });

        this.bindGroups.set(sourceView, bindGroup);

        return bindGroup;
    }
}

const FRAGMENT_WGSL = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    return textureSample(src, samp, in.uv);
}
`;
