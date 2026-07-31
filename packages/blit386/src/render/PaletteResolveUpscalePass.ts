import type { Vector2i } from '../utils/Vector2i';
import { VS_WGSL } from './effects/fullscreenVS';
import type { UpscaleFilter } from './UpscalePass';

/**
 * Fullscreen pass that reads an `r8uint` palette-index texture, resolves indices through
 * the shared palette uniform buffer, and writes RGBA at an arbitrary output resolution.
 *
 * Replaces {@link UpscalePass} for logical-index framebuffers: palette lookup happens here,
 * after the pixel-tier chain.
 */
export class PaletteResolveUpscalePass {
    private device: GPUDevice | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private paletteBuffer: GPUBuffer | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    /** logicalW, logicalH, filterLinear (0|1), pad */
    private uniformData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(16));
    private filterMode: UpscaleFilter = 'nearest';
    private bindGroups = new WeakMap<GPUTextureView, GPUBindGroup>();

    /** Cached encode params so redundant uniform uploads are skipped when unchanged. */
    private lastLogicalSizeX = -1;
    private lastLogicalSizeY = -1;
    /** Unset -1; then 0 = nearest, 1 = linear (matches uniformData[2]). */
    private lastFilterLinear = -1;

    /**
     * Initializes pipeline and uniform buffer. Call once per renderer init.
     *
     * @param device - WebGPU device.
     * @param destFormat - RGBA output format (swap chain format).
     * @param filter - `'nearest'` or `'linear'` magnification (linear blends resolved RGBA neighbors).
     * @param paletteBuffer - Shared 256-entry palette uniform buffer (same as scene pipelines).
     */
    init(device: GPUDevice, destFormat: GPUTextureFormat, filter: UpscaleFilter, paletteBuffer: GPUBuffer): void {
        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.bindGroups = new WeakMap();

        this.device = device;
        this.filterMode = filter;
        this.paletteBuffer = paletteBuffer;
        this.lastLogicalSizeX = -1;
        this.lastLogicalSizeY = -1;
        this.lastFilterLinear = -1;

        const module = device.createShaderModule({
            label: 'PaletteResolveUpscalePass Shader',
            code: VS_WGSL + FRAGMENT_WGSL,
        });

        this.pipeline = device.createRenderPipeline({
            label: 'PaletteResolveUpscalePass Pipeline',
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format: destFormat }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        this.uniformBuffer = device.createBuffer({
            label: 'PaletteResolveUpscalePass Uniforms',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Encodes resolve + upscale into {@link destView}.
     *
     * @param encoder - Command encoder.
     * @param sourceUintView - Logical-resolution `r8uint` texture view.
     * @param destView - Destination RGBA view (any size).
     * @param logicalSize - Pixel dimensions of {@link sourceUintView}.
     */
    encode(
        encoder: GPUCommandEncoder,
        sourceUintView: GPUTextureView,
        destView: GPUTextureView,
        logicalSize: Vector2i,
    ): void {
        if (!this.pipeline || !this.uniformBuffer || !this.device) {
            throw new Error('PaletteResolveUpscalePass.encode: pass was not initialized.');
        }

        const filterLinear = this.filterMode === 'linear' ? 1 : 0;
        if (
            logicalSize.x !== this.lastLogicalSizeX ||
            logicalSize.y !== this.lastLogicalSizeY ||
            filterLinear !== this.lastFilterLinear
        ) {
            this.lastLogicalSizeX = logicalSize.x;
            this.lastLogicalSizeY = logicalSize.y;
            this.lastFilterLinear = filterLinear;
            this.uniformData[0] = logicalSize.x;
            this.uniformData[1] = logicalSize.y;
            this.uniformData[2] = filterLinear;
            this.uniformData[3] = 0;
            this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
        }

        const bindGroup = this.getOrCreateBindGroup(sourceUintView);

        const pass = encoder.beginRenderPass({
            label: 'PaletteResolveUpscalePass Pass',
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
     * Drops GPU references (pipelines have no explicit destroy in WebGPU).
     */
    dispose(): void {
        this.pipeline = null;
        this.paletteBuffer = null;
        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.device = null;
        this.lastLogicalSizeX = -1;
        this.lastLogicalSizeY = -1;
        this.lastFilterLinear = -1;
        this.bindGroups = new WeakMap();
    }

    /**
     * Creates or returns a cached bind group wired to the supplied index texture view.
     *
     * @param sourceView - Logical-resolution `r8uint` texture view.
     * @returns Bind group for resolve pass sampling the index texture view.
     */
    private getOrCreateBindGroup(sourceView: GPUTextureView): GPUBindGroup {
        const cached = this.bindGroups.get(sourceView);
        if (cached) {
            return cached;
        }

        if (!this.device || !this.pipeline || !this.uniformBuffer || !this.paletteBuffer) {
            throw new Error('PaletteResolveUpscalePass.encode: pass was not initialized.');
        }

        const bindGroup = this.device.createBindGroup({
            label: 'PaletteResolveUpscalePass Bind Group',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.paletteBuffer } },
                { binding: 2, resource: sourceView },
            ],
        });

        this.bindGroups.set(sourceView, bindGroup);

        return bindGroup;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    logicalSize: vec2<f32>,
    filterLinear: f32,
    _pad: f32,
}

struct Palette {
    colors: array<vec4<f32>, 256>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> palette: Palette;
@group(0) @binding(2) var srcIndices: texture_2d<u32>;

fn resolve_premultiplied_coord(ic: vec2<i32>, lw: i32, lh: i32) -> vec4<f32> {
    let sx = clamp(ic.x, 0, lw - 1);
    let sy = clamp(ic.y, 0, lh - 1);
    let idx = textureLoad(srcIndices, vec2<i32>(sx, sy), 0).r;
    let color = palette.colors[idx];
    let a = color.a;
    if (a == 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    return vec4<f32>(color.rgb * a, a);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let lw = max(i32(params.logicalSize.x), 1);
    let lh = max(i32(params.logicalSize.y), 1);
    let lwf = max(params.logicalSize.x, 1.0);
    let lhf = max(params.logicalSize.y, 1.0);

    if (params.filterLinear < 0.5) {
        let sx = clamp(i32(floor(in.uv.x * lwf)), 0, lw - 1);
        let sy = clamp(i32(floor(in.uv.y * lhf)), 0, lh - 1);
        let idx = textureLoad(srcIndices, vec2<i32>(sx, sy), 0).r;
        let color = palette.colors[idx];
        return vec4<f32>(color.rgb, color.a);
    }

    let px = in.uv.x * lwf - 0.5;
    let py = in.uv.y * lhf - 0.5;
    let x0 = i32(floor(px));
    let y0 = i32(floor(py));
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    let fx = px - f32(x0);
    let fy = py - f32(y0);

    let c00 = resolve_premultiplied_coord(vec2<i32>(x0, y0), lw, lh);
    let c10 = resolve_premultiplied_coord(vec2<i32>(x1, y0), lw, lh);
    let c01 = resolve_premultiplied_coord(vec2<i32>(x0, y1), lw, lh);
    let c11 = resolve_premultiplied_coord(vec2<i32>(x1, y1), lw, lh);

    let top = mix(c00, c10, fx);
    let bot = mix(c01, c11, fx);
    let pm = mix(top, bot, fy);

    if (pm.a <= 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    return vec4<f32>(pm.rgb / pm.a, pm.a);
}
`;
