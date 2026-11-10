import type { Vector2i } from '../../utils/Vector2i';
import type { Effect } from './Effect';
import { VS_WGSL } from './fullscreenVS';

/**
 * Base class for pixel-tier fullscreen effects on the logical `r8uint` chain.
 *
 * @since 1.0.3
 * @changed 1.8.1 `r8uint` only: the unused RGBA path is gone, so `fragmentShaderRgba` is no longer read, the protected `sampler` field is removed, and `init` throws for any other chain format.
 */
export abstract class FullscreenPixelEffect implements Effect {
    readonly tier = 'pixel' as const;

    /** Debug label for GPU objects. */
    protected abstract readonly label: string;

    /** Byte size of the uniform block (multiple of 16). */
    protected abstract readonly uniformBytes: number;

    /** Fragment WGSL: samples `texture_2d<u32>` at binding 1 and writes a palette index. */
    protected abstract readonly fragmentShaderUint: string;

    protected device: GPUDevice | null = null;
    protected pipeline: GPURenderPipeline | null = null;
    protected uniformBuffer: GPUBuffer | null = null;
    protected uniformData: Float32Array<ArrayBuffer> | null = null;

    private bindGroups = new WeakMap<GPUTextureView, GPUBindGroup>();

    /**
     * Builds WGSL module and GPU pipeline for the supplied chain format.
     *
     * @param device - WebGPU device.
     * @param format - Pixel chain attachment format; must be `r8uint`.
     * @param _chainSize - Chain resolution (unused by base; subclasses may read via uniforms).
     */
    init(device: GPUDevice, format: GPUTextureFormat, _chainSize: Vector2i): void {
        if (this.uniformBytes <= 0 || this.uniformBytes % 16 !== 0) {
            throw new Error(
                `FullscreenPixelEffect: uniformBytes must be a positive multiple of 16 (got ${this.uniformBytes}).`,
            );
        }

        if (format !== 'r8uint') {
            throw new Error(`${this.label}: pixel-tier effects run on the r8uint chain only (got ${format}).`);
        }

        this.disposeGPUState();

        this.device = device;
        this.uniformData = new Float32Array(new ArrayBuffer(this.uniformBytes));

        const module = device.createShaderModule({
            label: `${this.label} Shader`,
            code: VS_WGSL + this.fragmentShaderUint,
        });

        this.pipeline = device.createRenderPipeline({
            label: `${this.label} Pipeline`,
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        this.uniformBuffer = device.createBuffer({
            label: `${this.label} Uniform Buffer`,
            size: this.uniformBytes,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Uploads uniform block after {@link writeUniforms}.
     *
     * @param deltaMs - Milliseconds since previous frame.
     * @param sourceSize - Source texture dimensions for this pass.
     */
    updateUniforms(deltaMs: number, sourceSize: Vector2i): void {
        if (!this.device || !this.uniformBuffer || !this.uniformData) {
            return;
        }

        this.writeUniforms(deltaMs, sourceSize);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
    }

    /**
     * Draws a fullscreen triangle sampling {@link sourceView} into {@link destView}.
     *
     * @param encoder - Frame command encoder.
     * @param sourceView - Input texture view.
     * @param destView - Render target view.
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
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
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
     * Destroys GPU buffers and pipelines owned by this effect.
     */
    dispose(): void {
        this.disposeGPUState();
    }

    /** Populates {@link uniformData} before GPU upload. */
    protected abstract writeUniforms(deltaMs: number, sourceSize: Vector2i): void;

    /**
     * Drops GPU handles so the effect can be re-initialized.
     */
    private disposeGPUState(): void {
        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.pipeline = null;
        this.device = null;
        this.uniformData = null;
        this.bindGroups = new WeakMap();
    }

    /**
     * Creates or returns the cached bind group for {@link sourceView}.
     *
     * @param sourceView - Texture view feeding this fullscreen pass.
     * @returns Bind group bound to {@link sourceView}.
     */
    private getOrCreateBindGroup(sourceView: GPUTextureView): GPUBindGroup {
        const cached = this.bindGroups.get(sourceView);
        if (cached) {
            return cached;
        }

        if (!this.device || !this.pipeline || !this.uniformBuffer) {
            throw new Error(`${this.label}.encodePass: effect was not initialized.`);
        }

        const bindGroup = this.device.createBindGroup({
            label: `${this.label} Bind Group`,
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: sourceView },
            ],
        });

        this.bindGroups.set(sourceView, bindGroup);

        return bindGroup;
    }
}
