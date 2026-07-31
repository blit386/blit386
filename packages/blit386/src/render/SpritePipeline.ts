import type { BitmapFont } from '../assets/BitmapFont';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';

/**
 * Maximum number of sprite vertices retained for a frame.
 */
const MAX_VERTICES = 50000;

/**
 * Number of values per vertex: x (f32), y (f32), u (f32), v (f32), paletteOffset (u32).
 */
const VALUES_PER_VERTEX = 5;

/**
 * Byte stride per vertex: 5 values * 4 bytes.
 */
const VERTEX_STRIDE = 20;

/**
 * Batched WebGPU pipeline for indexed-palette sprite rendering.
 *
 * Sprites are stored as `r8uint` palette-index textures. The fragment shader
 * loads sprite texels, applies {@link paletteOffset}, and writes the combined
 * palette index into the logical `r8uint` framebuffer (colors resolve later).
 * Palette uniforms are still used to `discard` pixels mapped to fully transparent
 * palette slots.
 *
 * Vertices are collected during a frame, grouped by texture, and emitted as one
 * draw call per texture batch in `encodePass()`.
 */
export class SpritePipeline {
    /** WebGPU device, set during init(). */
    private device: GPUDevice | null = null;

    /** Render pipeline for indexed sprites. */
    private pipeline: GPURenderPipeline | null = null;

    /** Uniform buffer containing screen resolution. */
    private uniformBuffer: GPUBuffer | null = null;

    /** Shared palette uniform buffer (256 x vec4f, 4 KB). */
    private paletteBuffer: GPUBuffer | null = null;

    /** Bind group 0: uniforms + palette (shared across all textures). */
    private sharedBindGroup: GPUBindGroup | null = null;

    /** GPU vertex buffer. */
    private vertexBuffer: GPUBuffer | null = null;

    /** Backing buffer for all vertex data. */
    private readonly vertexArrayBuffer: ArrayBuffer;

    /** Float32 view over vertexArrayBuffer - for x, y, u, v (indices i*5+0..+3). */
    private readonly vertexFloats: Float32Array;

    /** Uint32 view over vertexArrayBuffer - for paletteOffset (index i*5+4). */
    private readonly vertexUints: Uint32Array;

    /** Number of vertices in the current (unflushed) batch. */
    private vertexCount: number = 0;

    /** Camera offset applied to all drawing operations. */
    private cameraOffset: Vector2i = Vector2i.zero();

    /** Currently bound texture for sprite rendering. */
    private currentTexture: GPUTexture | null = null;

    /** Currently bound group-1 bind group for sprite rendering. */
    private currentBindGroup: GPUBindGroup | null = null;

    /** Cache of per-texture bind groups (group 1) for reuse. WeakMap allows GC to collect destroyed textures. */
    private readonly textureBindGroups: WeakMap<GPUTexture, GPUBindGroup> = new WeakMap();

    /** Sprite batches to render (one per texture). */
    private batches: Array<{ bindGroup: GPUBindGroup; vertexStart: number; vertexCount: number }> = [];

    /** Total sprite vertices across all flushed batches. */
    private totalVertices: number = 0;

    /** Overflow events recorded this frame (dropped quads). */
    private overflowCount: number = 0;

    /** Pre-allocated vector for character positions in drawBitmapText. */
    private readonly tempVec: Vector2i = new Vector2i(0, 0);

    /** Pre-allocated vector for sprite size in drawSprite. */
    private readonly tempSize: Vector2i = new Vector2i(0, 0);

    /**
     * Creates an empty sprite pipeline.
     * Call `init()` before encoding GPU work.
     */
    constructor() {
        this.vertexArrayBuffer = new ArrayBuffer(MAX_VERTICES * VERTEX_STRIDE);
        this.vertexFloats = new Float32Array(this.vertexArrayBuffer);
        this.vertexUints = new Uint32Array(this.vertexArrayBuffer);
    }

    /**
     * Initializes the GPU pipeline state and vertex buffer.
     *
     * @param device - WebGPU device for GPU operations.
     * @param displaySize - Render target resolution in pixels.
     * @param paletteBuffer - Shared palette uniform buffer (256 x vec4f).
     * @param targetFormat - Color attachment format for sprite output.
     */
    async init(
        device: GPUDevice,
        displaySize: Vector2i,
        paletteBuffer: GPUBuffer,
        targetFormat: GPUTextureFormat,
    ): Promise<void> {
        this.device = device;
        this.paletteBuffer = paletteBuffer;

        await this.createPipeline(displaySize, targetFormat);
    }

    /**
     * Sets the camera offset applied to all drawing operations.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        this.cameraOffset = offset;
    }

    /**
     * Draws a sprite region from an indexed sprite sheet.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw at.
     * @param paletteOffset - Index offset added to every sprite pixel at draw time (default 0).
     */
    drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        const texture = spriteSheet.getTexture(this.device as GPUDevice);
        const uvs = spriteSheet.getUVs(srcRect);

        // Use a pre-allocated vector for size to avoid allocation.
        this.tempSize.set(srcRect.width, srcRect.height);

        this.drawTexturedQuad(texture, destPos, this.tempSize, uvs.u0, uvs.v0, uvs.u1, uvs.v1, paletteOffset);
    }

    /**
     * Draws text using a bitmap font through the indexed sprite pipeline.
     * Renders each character as a textured sprite using glyph metadata from the font.
     *
     * @param font - Bitmap font with character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Index offset applied to every glyph pixel (default 0).
     */
    drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        const spriteSheet = font.getSpriteSheet();
        let cursorX = pos.x;
        const len = text.length;

        // Optimized loop using charCodeAt and getGlyphByCode for ASCII fast-path.
        for (let i = 0; i < len; i++) {
            const code = text.charCodeAt(i);
            const glyph = font.getGlyphByCode(code);

            if (glyph) {
                // Use a pre-allocated vector to avoid allocation per character.
                this.tempVec.set(cursorX + glyph.offsetX, pos.y + glyph.offsetY);
                this.drawSprite(spriteSheet, glyph.rect, this.tempVec, paletteOffset);

                cursorX += glyph.advance;
            }
        }
    }

    /**
     * Uploads accumulated sprite data and encodes draw calls for each texture batch.
     * No-op when nothing has been queued for the current frame.
     *
     * @param renderPass - Active render pass encoder.
     */
    encodePass(renderPass: GPURenderPassEncoder): void {
        // Flush any remaining vertices into the batch queue.
        this.flushCurrentBatch();

        if (this.batches.length === 0 || this.totalVertices === 0) {
            return;
        }

        // Upload all sprite vertices at once.
        // Safe assertions: these resources are created in init() before any rendering.
        (this.device as GPUDevice).queue.writeBuffer(
            this.vertexBuffer as GPUBuffer,
            0,
            this.vertexArrayBuffer,
            0,
            this.totalVertices * VERTEX_STRIDE,
        );

        renderPass.setPipeline(this.pipeline as GPURenderPipeline);
        renderPass.setVertexBuffer(0, this.vertexBuffer as GPUBuffer);
        renderPass.setBindGroup(0, this.sharedBindGroup as GPUBindGroup);

        // Draw each batch with its own per-texture bind group (group 1).
        for (const batch of this.batches) {
            renderPass.setBindGroup(1, batch.bindGroup);
            renderPass.draw(batch.vertexCount, 1, batch.vertexStart, 0);
        }
    }

    /**
     * Clears all per-frame batching state.
     */
    reset(): void {
        this.vertexCount = 0;
        this.totalVertices = 0;
        this.batches = [];
        this.currentTexture = null;
        this.currentBindGroup = null;
        this.overflowCount = 0;
    }

    /**
     * Overflow events recorded since the last {@link reset} (dropped quads).
     *
     * @returns Per-frame sprite overflow count.
     */
    getFrameOverflowCount(): number {
        return this.overflowCount;
    }

    /**
     * Sprite vertices queued for GPU submission this frame (flushed + pending).
     *
     * @returns Total vertex count across all batches.
     */
    getFrameSubmittedVertices(): number {
        return this.totalVertices + this.vertexCount;
    }

    /**
     * Creates shader modules, pipeline state, and GPU buffers.
     *
     * @param displaySize - Render target resolution in pixels.
     * @param targetFormat - Color attachment format for sprite output.
     */
    private async createPipeline(displaySize: Vector2i, targetFormat: GPUTextureFormat): Promise<void> {
        const device = this.device as GPUDevice;

        const shaderModule = device.createShaderModule({
            label: 'Sprite Shader',
            code: `
                struct Uniforms {
                    resolution: vec2<f32>,
                }

                struct Palette {
                    colors: array<vec4<f32>, 256>,
                }

                @group(0) @binding(0) var<uniform> uniforms: Uniforms;
                @group(0) @binding(1) var<uniform> palette: Palette;
                @group(1) @binding(0) var spriteTexture: texture_2d<u32>;

                struct VertexInput {
                    @location(0) position: vec2<f32>,
                    @location(1) uv: vec2<f32>,
                    @location(2) paletteOffset: u32,
                }

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) uv: vec2<f32>,
                    @location(1) @interpolate(flat) paletteOffset: u32,
                }

                @vertex
                fn vs_main(input: VertexInput) -> VertexOutput {
                    var out: VertexOutput;

                    let cx = (input.position.x / uniforms.resolution.x) * 2.0 - 1.0;
                    let cy = 1.0 - (input.position.y / uniforms.resolution.y) * 2.0;

                    out.position = vec4<f32>(cx, cy, 0.0, 1.0);
                    out.uv = input.uv;
                    out.paletteOffset = input.paletteOffset;

                    return out;
                }

                @fragment
                fn fs_main(input: VertexOutput) -> @location(0) u32 {
                    let dims = textureDimensions(spriteTexture);
                    let coords = vec2<i32>(
                        i32(input.uv.x * f32(dims.x)),
                        i32(input.uv.y * f32(dims.y))
                    );

                    // r8uint: single-channel unsigned integer index.
                    let rawIndex = textureLoad(spriteTexture, coords, 0).r;

                    if (rawIndex == 0u) { discard; }

                    let combined = rawIndex + input.paletteOffset;
                    let index = min(combined, 255u);

                    let color = palette.colors[index];
                    if (color.a == 0.0) { discard; }

                    return index;
                }
            `,
        });

        this.pipeline = device.createRenderPipeline({
            label: 'Sprite Pipeline',
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    {
                        arrayStride: VERTEX_STRIDE,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                            { shaderLocation: 1, offset: 2 * 4, format: 'float32x2' }, // uv
                            { shaderLocation: 2, offset: 4 * 4, format: 'uint32' }, // paletteOffset
                        ],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [
                    {
                        format: targetFormat,
                    },
                ],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        this.uniformBuffer = device.createBuffer({
            label: 'Sprite Uniform Buffer',
            size: 8, // vec2<f32>
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([displaySize.x, displaySize.y]));

        this.vertexBuffer = device.createBuffer({
            label: 'Sprite Vertex Buffer',
            size: this.vertexArrayBuffer.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Shared bind group (group 0): uniforms + palette - created once and reused for all textures.
        this.sharedBindGroup = device.createBindGroup({
            label: 'Sprite Shared Bind Group',
            layout: (this.pipeline as GPURenderPipeline).getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.paletteBuffer as GPUBuffer } },
            ],
        });
    }

    /**
     * Draws a textured quad (two triangles) to the screen.
     * Handles texture switching and keeps quad emission atomic so partial quads
     * are never left in the vertex buffer.
     *
     * @param texture - GPU r8uint index texture.
     * @param pos - Screen position (top-left corner).
     * @param size - Quad dimensions in pixels.
     * @param u0 - Left UV coordinate (0-1).
     * @param v0 - Top UV coordinate (0-1).
     * @param u1 - Right UV coordinate (0-1).
     * @param v1 - Bottom UV coordinate (0-1).
     * @param paletteOffset - Palette index offset for this quad.
     */
    private drawTexturedQuad(
        texture: GPUTexture,
        pos: Vector2i,
        size: Vector2i,
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        paletteOffset: number,
    ): void {
        // Flush if switching textures.
        if (this.currentTexture !== texture) {
            if (this.vertexCount > 0) {
                this.flushCurrentBatch();
            }

            this.currentTexture = texture;
            this.currentBindGroup = this.getOrCreateTextureBindGroup(texture);
        }

        // Ensure there is space for a complete quad (6 vertices) before adding any.
        // This prevents partial quads that would cause rendering corruption.
        if (!this.hasSpaceForQuad()) {
            if (this.vertexCount > 0) {
                this.flushCurrentBatch();
            }

            // Check again after flush - if still no space, the buffer is full for this frame.
            if (!this.hasSpaceForQuad()) {
                console.warn('[SpritePipeline] Sprite buffer capacity exceeded for this frame, quad dropped');
                this.overflowCount++;

                return;
            }
        }

        const x0 = pos.x;
        const y0 = pos.y;
        const x1 = pos.x + size.x;
        const y1 = pos.y + size.y;

        // Triangle 1.
        this.addVertex(x0, y0, u0, v0, paletteOffset);
        this.addVertex(x1, y0, u1, v0, paletteOffset);
        this.addVertex(x0, y1, u0, v1, paletteOffset);

        // Triangle 2.
        this.addVertex(x1, y0, u1, v0, paletteOffset);
        this.addVertex(x1, y1, u1, v1, paletteOffset);
        this.addVertex(x0, y1, u0, v1, paletteOffset);
    }

    /**
     * Checks if there is enough buffer space for a complete quad (6 vertices).
     *
     * @returns True if a quad can be added without overflowing.
     */
    private hasSpaceForQuad(): boolean {
        const index = (this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX;
        const quadSize = 6 * VALUES_PER_VERTEX;

        return index + quadSize <= this.vertexFloats.length;
    }

    /**
     * Saves the current sprite batch and prepares for a new texture.
     * Called automatically when the active texture changes or before encoding.
     */
    private flushCurrentBatch(): void {
        if (this.vertexCount === 0 || !this.currentBindGroup) {
            return;
        }

        this.batches.push({
            bindGroup: this.currentBindGroup,
            vertexStart: this.totalVertices,
            vertexCount: this.vertexCount,
        });

        this.totalVertices += this.vertexCount;
        this.vertexCount = 0;
    }

    /**
     * Adds a sprite vertex to the batch.
     * Assumes buffer space has already been verified by `drawTexturedQuad()`.
     *
     * Writes x, y, u, v as floats and paletteOffset as u32 into the shared
     * ArrayBuffer using dual typed-array views.
     *
     * @param x - X position in pixels.
     * @param y - Y position in pixels.
     * @param u - U texture coordinate.
     * @param v - V texture coordinate.
     * @param paletteOffset - Palette index offset (u32).
     */
    private addVertex(x: number, y: number, u: number, v: number, paletteOffset: number): void {
        const base = (this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX;

        // eslint-disable-next-line security/detect-object-injection
        this.vertexFloats[base] = x - this.cameraOffset.x;
        this.vertexFloats[base + 1] = y - this.cameraOffset.y;
        this.vertexFloats[base + 2] = u;
        this.vertexFloats[base + 3] = v;
        this.vertexUints[base + 4] = paletteOffset;

        this.vertexCount++;
    }

    /**
     * Gets or creates a per-texture bind group (group 1) for the given texture.
     * Bind groups are cached per texture for reuse across frames.
     *
     * @param texture - r8uint GPU texture to create the bind group for.
     * @returns Bind group containing the texture view.
     */
    private getOrCreateTextureBindGroup(texture: GPUTexture): GPUBindGroup {
        const existing = this.textureBindGroups.get(texture);

        if (existing) {
            return existing;
        }

        // Safe assertions: pipeline is created in init() before any drawing.
        const bindGroup = (this.device as GPUDevice).createBindGroup({
            label: 'Sprite Texture Bind Group',
            layout: (this.pipeline as GPURenderPipeline).getBindGroupLayout(1),
            entries: [{ binding: 0, resource: texture.createView() }],
        });

        this.textureBindGroups.set(texture, bindGroup);

        return bindGroup;
    }
}
