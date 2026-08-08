import type { Vector2i } from '../../utils/Vector2i';
import type { Effect, EffectTier } from './Effect';
import { VS_WGSL } from './fullscreenVS';

/**
 * Sampler magnification/minification mode used by a fullscreen effect.
 *
 * - `'linear'` - bilinear filtering (default for display-tier effects).
 * - `'nearest'` - point sampling, palette-friendly for pixel-tier effects.
 */
export type EffectSamplerFilter = 'nearest' | 'linear';

/**
 * Base class for typical fullscreen post-processing effects.
 *
 * Owns the standard pipeline / uniform buffer / sampler / bind-group cache so
 * subclasses focus on the WGSL fragment shader and uniform layout. The bind
 * group layout always exposes:
 *
 * - `@group(0) @binding(0)` - uniform block (any subclass-defined `Params`).
 * - `@group(0) @binding(1)` - source `texture_2d<f32>` (named `src`).
 * - `@group(0) @binding(2)` - `sampler` (named `samp`).
 *
 * Subclasses provide:
 * - {@link tier}
 * - {@link label} - debug label for GPU resources.
 * - {@link uniformBytes} - byte size of the uniform block (multiple of 16).
 * - {@link fragmentShader} - WGSL fragment shader source.
 * - {@link writeUniforms} - populates `uniformData` from public params.
 * - Optionally {@link samplerFilter} (defaults to `'linear'`).
 *
 * @since 1.0.3
 */
export abstract class FullscreenEffect implements Effect {
    /** Tier this effect belongs to (`'pixel'` or `'display'`). */
    abstract readonly tier: EffectTier;

    /**
     * Sampler filter mode. Defaults to `'linear'` (smooth – appropriate for
     * display-tier effects). Pixel-tier effects can override to `'nearest'` to
     * preserve palette colors during sampling.
     */
    protected readonly samplerFilter: EffectSamplerFilter = 'linear';

    /** Human-readable label for GPU debug names. */
    protected abstract readonly label: string;

    /** Byte size of the uniform block. Must be a multiple of 16. */
    protected abstract readonly uniformBytes: number;

    /** WGSL fragment shader source. Must declare `Params`, `src`, `samp`. */
    protected abstract readonly fragmentShader: string;
    protected device: GPUDevice | null = null;

    protected pipeline: GPURenderPipeline | null = null;
    protected uniformBuffer: GPUBuffer | null = null;
    protected sampler: GPUSampler | null = null;
    protected bindGroupLayout: GPUBindGroupLayout | null = null;
    /**
     * Backing array for the uniform block. Lazily allocated in {@link init}
     * after subclass constants are set on `this`.
     */
    protected uniformData: Float32Array<ArrayBuffer> | null = null;
    /**
     * Per-source-view bind group cache. The chain ping-pongs between two
     * stable views, so a `WeakMap` keyed by view is safe.
     * Reassigned on every `dispose()` so stale bind groups are not reused
     * after a re-init cycle.
     */
    private bindGroups = new WeakMap<GPUTextureView, GPUBindGroup>();

    /**
     * Creates the GPU pipeline, uniform buffer, sampler, and bind-group layout.
     *
     * @param device – WebGPU device used for resource creation.
     * @param format – Color attachment format. Pixel chain: `r8uint`; display
     *   chain: swap-chain RGBA format.
     * @param _displaySize – Source render target resolution. Most effects ignore
     *   this and use the per-frame `sourceSize` from {@link updateUniforms}.
     */
    init(device: GPUDevice, format: GPUTextureFormat, _displaySize: Vector2i): void {
        if (this.uniformBytes <= 0 || this.uniformBytes % 16 !== 0) {
            throw new Error(
                `FullscreenEffect: uniformBytes must be a positive multiple of 16 (got ${this.uniformBytes}).`,
            );
        }

        this.device = device;
        this.uniformData = new Float32Array(new ArrayBuffer(this.uniformBytes));

        const module = device.createShaderModule({
            label: `${this.label} Shader`,
            code: VS_WGSL + this.fragmentShader,
        });

        this.pipeline = device.createRenderPipeline({
            label: `${this.label} Pipeline`,
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);

        this.uniformBuffer = device.createBuffer({
            label: `${this.label} Uniform Buffer`,
            size: this.uniformBytes,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.sampler = device.createSampler({
            label: `${this.label} Sampler`,
            magFilter: this.samplerFilter,
            minFilter: this.samplerFilter,
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
    }

    /**
     * Calls {@link writeUniforms} then uploads the uniform block to the GPU.
     *
     * @param deltaMs – Wall-clock milliseconds since the previous frame.
     * @param sourceSize – Pixel dimensions of the source texture for this pass.
     */
    updateUniforms(deltaMs: number, sourceSize: Vector2i): void {
        if (!this.device || !this.uniformBuffer || !this.uniformData) {
            return;
        }

        this.writeUniforms(deltaMs, sourceSize);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
    }

    /**
     * Encodes the fullscreen pass that samples the source texture and writes
     * the result into the destination view.
     *
     * @param encoder – Active command encoder owned by the renderer.
     * @param sourceView – View of the texture to sample from.
     * @param destView – View of the texture to render into.
     */
    encodePass(encoder: GPUCommandEncoder, sourceView: GPUTextureView, destView: GPUTextureView): void {
        if (!this.pipeline) {
            return;
        }

        const bindGroup = this.getOrCreateBindGroup(sourceView);
        const pass = encoder.beginRenderPass({
            label: `${this.label} Pass`,
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
     * Releases GPU resources owned by this effect. Safe to call multiple times.
     */
    dispose(): void {
        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.sampler = null;
        this.device = null;
        this.uniformData = null;
        this.bindGroups = new WeakMap();
    }

    /** Writes the per-frame uniform values into {@link uniformData}. */
    protected abstract writeUniforms(deltaMs: number, sourceSize: Vector2i): void;

    /**
     * Returns the bind group for the supplied source view, creating one on
     * first use and caching by view identity.
     *
     * @param sourceView – View of the source texture to sample.
     * @returns Cached or newly created bind group.
     */
    private getOrCreateBindGroup(sourceView: GPUTextureView): GPUBindGroup {
        const cached = this.bindGroups.get(sourceView);

        if (cached) {
            return cached;
        }

        if (!this.device || !this.bindGroupLayout || !this.uniformBuffer || !this.sampler) {
            throw new Error(`${this.label}.encodePass: effect was not initialized.`);
        }

        const bindGroup = this.device.createBindGroup({
            label: `${this.label} Bind Group`,
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: sourceView },
                { binding: 2, resource: this.sampler },
            ],
        });

        this.bindGroups.set(sourceView, bindGroup);

        return bindGroup;
    }
}
