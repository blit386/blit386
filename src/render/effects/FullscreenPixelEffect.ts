import type { Vector2i } from '../../utils/Vector2i';
import type { Effect } from './Effect';
import { VS_WGSL } from './fullscreenVS';

/**
 * Base class for pixel-tier fullscreen effects on the logical `r8uint` chain.
 * Includes an RGBA fragment path for compatibility; production wiring always
 * uses the `r8uint` attachment format.
 *
 * @since 1.0.3
 */
export abstract class FullscreenPixelEffect implements Effect {
    readonly tier = 'pixel' as const;

    /** Debug label for GPU objects. */
    protected abstract readonly label: string;

    /** Byte size of the uniform block (multiple of 16). */
    protected abstract readonly uniformBytes: number;

    /** Fragment WGSL when {@link init} receives a floating-point chain format. */
    protected abstract readonly fragmentShaderRgba: string;

    /** Fragment WGSL when {@link init} receives `r8uint` chain format. */
    protected abstract readonly fragmentShaderUint: string;

    protected device: GPUDevice | null = null;
    protected pipeline: GPURenderPipeline | null = null;
    protected uniformBuffer: GPUBuffer | null = null;
    protected uniformData: Float32Array<ArrayBuffer> | null = null;
    protected sampler: GPUSampler | null = null;
    private attachmentFormat: GPUTextureFormat | null = null;

    private bindGroupsFloat = new WeakMap<GPUTextureView, GPUBindGroup>();
    private bindGroupsUint = new WeakMap<GPUTextureView, GPUBindGroup>();

    /**
     * Builds WGSL module and GPU pipeline for the supplied chain format.
     *
     * @param device - WebGPU device.
     * @param format - Pixel chain attachment format (`r8uint` or float swap format).
     * @param _chainSize - Chain resolution (unused by base; subclasses may read via uniforms).
     */
    init(device: GPUDevice, format: GPUTextureFormat, _chainSize: Vector2i): void {
        if (this.uniformBytes <= 0 || this.uniformBytes % 16 !== 0) {
            throw new Error(
                `FullscreenPixelEffect: uniformBytes must be a positive multiple of 16 (got ${this.uniformBytes}).`,
            );
        }

        this.disposeGPUState();

        this.device = device;
        this.attachmentFormat = format;
        this.uniformData = new Float32Array(new ArrayBuffer(this.uniformBytes));

        const fragment = format === 'r8uint' ? this.fragmentShaderUint : this.fragmentShaderRgba;
        const module = device.createShaderModule({
            label: `${this.label} Shader`,
            code: VS_WGSL + fragment,
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

        if (format !== 'r8uint') {
            this.sampler = device.createSampler({
                label: `${this.label} Sampler`,
                magFilter: 'nearest',
                minFilter: 'nearest',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            });
        }
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
        const uintClear = this.attachmentFormat === 'r8uint';

        const pass = encoder.beginRenderPass({
            label: `${this.label} Pass`,
            colorAttachments: [
                {
                    view: destView,
                    clearValue: uintClear ? { r: 0, g: 0, b: 0, a: 0 } : { r: 0, g: 0, b: 0, a: 1 },
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
     * Drops GPU handles so the effect can be re-initialized with a different chain format.
     */
    private disposeGPUState(): void {
        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.pipeline = null;
        this.sampler = null;
        this.device = null;
        this.uniformData = null;
        this.attachmentFormat = null;
        this.bindGroupsFloat = new WeakMap();
        this.bindGroupsUint = new WeakMap();
    }

    /**
     * Creates or returns a cached bind group for the active RGBA vs uint sampling layout.
     *
     * @param sourceView - Texture view feeding this fullscreen pass.
     * @returns Bind group bound to {@link sourceView}.
     */
    private getOrCreateBindGroup(sourceView: GPUTextureView): GPUBindGroup {
        const uint = this.attachmentFormat === 'r8uint';
        const cache = uint ? this.bindGroupsUint : this.bindGroupsFloat;
        const cached = cache.get(sourceView);
        if (cached) {
            return cached;
        }

        if (!this.device || !this.pipeline || !this.uniformBuffer) {
            throw new Error(`${this.label}.encodePass: effect was not initialized.`);
        }

        const layout = this.pipeline.getBindGroupLayout(0);
        const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: this.uniformBuffer } }];

        if (uint) {
            entries.push({ binding: 1, resource: sourceView });
        } else {
            if (!this.sampler) {
                throw new Error(`${this.label}.encodePass: sampler missing for RGBA pixel chain.`);
            }

            entries.push({ binding: 1, resource: sourceView }, { binding: 2, resource: this.sampler });
        }

        const bindGroup = this.device.createBindGroup({
            label: `${this.label} Bind Group`,
            layout,
            entries,
        });

        cache.set(sourceView, bindGroup);

        return bindGroup;
    }
}
