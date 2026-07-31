import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';

/**
 * Maximum number of primitive vertices retained for a frame.
 *
 * Note: Axis-aligned lines are optimized to use 6 vertices total instead of
 * 6 vertices per pixel, dramatically reducing buffer requirements.
 */
const MAX_VERTICES = 50000;

/**
 * Number of 4-byte values per vertex: x (f32), y (f32), paletteIndex (u32).
 */
const VALUES_PER_VERTEX = 3;

/**
 * Byte stride per vertex (3 values x 4 bytes each = 12 bytes).
 */
const VERTEX_STRIDE = VALUES_PER_VERTEX * 4;

/**
 * Batched WebGPU pipeline for palette-indexed primitives.
 *
 * The pipeline collects CPU-side vertices for pixels, lines, and rectangles
 * during a frame, then uploads and draws them in `encodePass()`. Bitmap text
 * is handled by {@link SpritePipeline}.
 *
 * Each vertex stores a palette index. The fragment shader writes that index into
 * an `r8uint` logical target (palette lookup happens later during resolve/upscale).
 * Palette uniforms remain bound so fully transparent slots can `discard`, matching
 * prior RGBA behavior.
 */
export class PrimitivePipeline {
    /** WebGPU device, set during init(). */
    private device: GPUDevice | null = null;

    /** Render pipeline for palette-indexed geometry. */
    private pipeline: GPURenderPipeline | null = null;

    /** Uniform buffer containing screen resolution. */
    private uniformBuffer: GPUBuffer | null = null;

    /** Bind group for the uniform and palette buffers. */
    private bindGroup: GPUBindGroup | null = null;

    /** GPU vertex buffer. */
    private vertexBuffer: GPUBuffer | null = null;

    /**
     * CPU-side vertex data backing buffer.
     * Shared between {@link vertexFloats} and {@link vertexIndices} views.
     */
    private readonly vertexArrayBuffer: ArrayBuffer;

    /** Float view for writing position values (x, y). */
    private readonly vertexFloats: Float32Array;

    /** Uint32 view for writing palette index values. */
    private readonly vertexIndices: Uint32Array;

    /** Number of vertices in the current (unflushed) batch. */
    private vertexCount: number = 0;

    /** Camera offset applied to all drawing operations. */
    private cameraOffset: Vector2i = Vector2i.zero();

    /** Primitive batches recorded after each early flush. */
    private batches: Array<{ vertexStart: number; vertexCount: number }> = [];

    /** Total primitive vertices across all flushed batches. */
    private totalVertices: number = 0;

    /** Overflow events recorded this frame (dropped pixels or vertices). */
    private overflowCount: number = 0;

    /** Pre-allocated rect to avoid per-call allocations in hot paths. */
    private readonly tempRect: Rect2i = new Rect2i(0, 0, 0, 0);

    /**
     * Creates an empty primitive pipeline.
     * Call `init()` before encoding GPU work.
     */
    constructor() {
        this.vertexArrayBuffer = new ArrayBuffer(MAX_VERTICES * VERTEX_STRIDE);
        this.vertexFloats = new Float32Array(this.vertexArrayBuffer);
        this.vertexIndices = new Uint32Array(this.vertexArrayBuffer);
    }

    /**
     * Initializes the GPU pipeline state and backing buffers.
     *
     * @param device - WebGPU device for GPU operations.
     * @param displaySize - Render target resolution in pixels.
     * @param paletteBuffer - Shared palette uniform buffer (256 x vec4f = 4096 bytes).
     * @param targetFormat - Color attachment format for primitive output.
     */
    async init(
        device: GPUDevice,
        displaySize: Vector2i,
        paletteBuffer: GPUBuffer,
        targetFormat: GPUTextureFormat,
    ): Promise<void> {
        this.device = device;
        await this.createPipeline(displaySize, paletteBuffer, targetFormat);
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
     * Draws a filled rectangle using two triangles.
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void {
        const x0 = rect.x;
        const y0 = rect.y;
        const x1 = rect.x + rect.width;
        const y1 = rect.y + rect.height;

        this.addVertex(x0, y0, paletteIndex);
        this.addVertex(x1, y0, paletteIndex);
        this.addVertex(x0, y1, paletteIndex);

        this.addVertex(x1, y0, paletteIndex);
        this.addVertex(x1, y1, paletteIndex);
        this.addVertex(x0, y1, paletteIndex);
    }

    /**
     * Draws a single pixel as a 1x1 filled rectangle.
     *
     * @param pos - Pixel position.
     * @param paletteIndex - Palette color index.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void {
        // Use pre-allocated rect to avoid allocation per pixel.
        this.tempRect.set(pos.x, pos.y, 1, 1);
        this.drawRectFill(this.tempRect, paletteIndex);
    }

    /**
     * Draws a single pixel at raw coordinates.
     * More efficient than `drawPixel()` when coordinates are already unpacked.
     *
     * @param x - X position.
     * @param y - Y position.
     * @param paletteIndex - Palette color index.
     */
    drawPixelXY(x: number, y: number, paletteIndex: number): void {
        // Draw 1x1 rectangle (2 triangles = 6 vertices).
        const x1 = x + 1;
        const y1 = y + 1;

        this.addVertex(x, y, paletteIndex);
        this.addVertex(x1, y, paletteIndex);
        this.addVertex(x, y1, paletteIndex);

        this.addVertex(x1, y, paletteIndex);
        this.addVertex(x1, y1, paletteIndex);
        this.addVertex(x, y1, paletteIndex);
    }

    /**
     * Draws a line using optimized quad rendering for axis-aligned lines,
     * falling back to Bresenham's algorithm for diagonal lines.
     *
     * Horizontal and vertical lines are emitted as a single quad. Diagonal
     * lines fall back to Bresenham-style pixel steps for pixel-art fidelity.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        // Vector2i already guarantees integers, but |0 ensures the 32-bit int for bitwise ops.
        const x0 = p0.x | 0;
        const y0 = p0.y | 0;
        const x1 = p1.x | 0;
        const y1 = p1.y | 0;

        // Optimization: Axis-aligned lines use a single quad (6 vertices total).
        // This provides ~600x vertex reduction for typical grid lines.
        if (y0 === y1) {
            // Horizontal line: single 1px-tall quad.
            const minX = Math.min(x0, x1);
            const maxX = Math.max(x0, x1);

            this.tempRect.set(minX, y0, maxX - minX + 1, 1);
            this.drawRectFill(this.tempRect, paletteIndex);

            return;
        }

        if (x0 === x1) {
            // Vertical line: single 1px-wide quad.
            const minY = Math.min(y0, y1);
            const maxY = Math.max(y0, y1);

            this.tempRect.set(x0, minY, 1, maxY - minY + 1);
            this.drawRectFill(this.tempRect, paletteIndex);

            return;
        }

        // Diagonal lines: fall back to Bresenham for pixel-perfect rendering.
        this.drawLineBresenham(x0, y0, x1, y1, paletteIndex);
    }

    /**
     * Draws a rectangle outline using four 1-pixel quads.
     * Emits quads directly rather than delegating to `drawLine()`.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    drawRect(rect: Rect2i, paletteIndex: number): void {
        const x0 = rect.x;
        const y0 = rect.y;
        const x1 = rect.x + rect.width - 1;
        const y1 = rect.y + rect.height - 1;

        // Draw 4-line quads directly using the pre-allocated tempRect.
        // This avoids 4 function calls to drawLine and their overhead.

        // Top line (horizontal): from (x0, y0) to (x1, y0), 1px tall.
        this.tempRect.set(x0, y0, x1 - x0 + 1, 1);
        this.drawRectFill(this.tempRect, paletteIndex);

        // Bottom line (horizontal): from (x0, y1) to (x1, y1), 1px tall.
        this.tempRect.set(x0, y1, x1 - x0 + 1, 1);
        this.drawRectFill(this.tempRect, paletteIndex);

        // Left line (vertical): from (x0, y0+1) to (x0, y1-1), 1px wide.
        // Shortened to avoid corner overlap with top/bottom lines.
        if (y1 - y0 > 1) {
            this.tempRect.set(x0, y0 + 1, 1, y1 - y0 - 1);
            this.drawRectFill(this.tempRect, paletteIndex);
        }

        // Right line (vertical): from (x1, y0+1) to (x1, y1-1), 1px wide.
        // Shortened to avoid corner overlap with top/bottom lines.
        if (y1 - y0 > 1) {
            this.tempRect.set(x1, y0 + 1, 1, y1 - y0 - 1);
            this.drawRectFill(this.tempRect, paletteIndex);
        }
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     * Alias for `drawRectFill()` kept for renderer API consistency.
     *
     * @param rect - Region to fill.
     * @param paletteIndex - Palette color index.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void {
        this.drawRectFill(rect, paletteIndex);
    }

    /**
     * Uploads accumulated primitive vertices and encodes draw calls.
     * No-op when nothing has been queued for the current frame.
     *
     * @param renderPass - Active render pass encoder.
     */
    encodePass(renderPass: GPURenderPassEncoder): void {
        // Flush any remaining vertices into the batch queue.
        this.earlyFlush();

        if (this.batches.length === 0 || this.totalVertices === 0) {
            return;
        }

        // Upload all vertex data at once.
        // Safe assertions: these resources are created in init() before any rendering.
        (this.device as GPUDevice).queue.writeBuffer(
            this.vertexBuffer as GPUBuffer,
            0,
            this.vertexArrayBuffer,
            0,
            this.totalVertices * VERTEX_STRIDE,
        );

        renderPass.setPipeline(this.pipeline as GPURenderPipeline);
        renderPass.setBindGroup(0, this.bindGroup as GPUBindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer as GPUBuffer);

        for (const batch of this.batches) {
            renderPass.draw(batch.vertexCount, 1, batch.vertexStart, 0);
        }
    }

    /**
     * Clears per-frame batching state.
     */
    reset(): void {
        this.vertexCount = 0;
        this.totalVertices = 0;
        this.batches = [];
        this.overflowCount = 0;
    }

    /**
     * Overflow events recorded since the last {@link reset} (dropped pixels or vertices).
     *
     * @returns Per-frame primitive overflow count.
     */
    getFrameOverflowCount(): number {
        return this.overflowCount;
    }

    /**
     * Primitive vertices queued for GPU submission this frame (flushed + pending).
     *
     * @returns Total vertex count across all batches.
     */
    getFrameSubmittedVertices(): number {
        return this.totalVertices + this.vertexCount;
    }

    /**
     * Creates shader modules, pipeline state, and GPU buffers for primitive draws.
     *
     * @param displaySize - Render target resolution in pixels.
     * @param paletteBuffer - Shared palette uniform buffer.
     * @param targetFormat - Color attachment format for primitive output.
     */
    private async createPipeline(
        displaySize: Vector2i,
        paletteBuffer: GPUBuffer,
        targetFormat: GPUTextureFormat,
    ): Promise<void> {
        const device = this.device as GPUDevice;

        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;
        this.vertexBuffer?.destroy();
        this.vertexBuffer = null;
        this.bindGroup = null;
        this.pipeline = null;

        const shaderModule = device.createShaderModule({
            label: 'Primitive Shader',
            code: `
                struct Uniforms {
                    resolution: vec2<f32>,
                }

                struct Palette {
                    colors: array<vec4<f32>, 256>,
                }

                @group(0) @binding(0) var<uniform> uniforms: Uniforms;
                @group(0) @binding(1) var<uniform> palette: Palette;

                struct VertexInput {
                    @location(0) position: vec2<f32>,
                    @location(1) paletteIndex: u32,
                }

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    // @interpolate(flat) prevents the GPU from blending u32 values
                    // between triangle vertices, which would corrupt palette lookups.
                    @location(0) @interpolate(flat) paletteIndex: u32,
                }

                @vertex
                fn vs_main(input: VertexInput) -> VertexOutput {
                    var output: VertexOutput;

                    let clipX = (input.position.x / uniforms.resolution.x) * 2.0 - 1.0;
                    let clipY = 1.0 - (input.position.y / uniforms.resolution.y) * 2.0;

                    output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                    output.paletteIndex = input.paletteIndex;

                    return output;
                }

                @fragment
                fn fs_main(input: VertexOutput) -> @location(0) u32 {
                    let color = palette.colors[input.paletteIndex];
                    if (color.a == 0.0) { discard; }
                    return input.paletteIndex;
                }
            `,
        });

        this.pipeline = device.createRenderPipeline({
            label: 'Primitive Pipeline',
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    {
                        arrayStride: VERTEX_STRIDE,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                            { shaderLocation: 1, offset: 2 * 4, format: 'uint32' }, // paletteIndex
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
            label: 'Primitive Uniform Buffer',
            size: 8, // vec2
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([displaySize.x, displaySize.y]));

        // Safe assertion: pipeline is created above.
        this.bindGroup = device.createBindGroup({
            label: 'Primitive Bind Group',
            layout: (this.pipeline as GPURenderPipeline).getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: paletteBuffer } },
            ],
        });

        this.vertexBuffer = device.createBuffer({
            label: 'Primitive Vertex Buffer',
            size: this.vertexArrayBuffer.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Draws a diagonal line using Bresenham's line algorithm.
     * Produces pixel-perfect lines without antialiasing by emitting 1x1 quads
     * for each stepped pixel.
     *
     * @param x0 - Start X coordinate.
     * @param y0 - Start Y coordinate.
     * @param x1 - End X coordinate.
     * @param y1 - End Y coordinate.
     * @param paletteIndex - Palette color index.
     */
    private drawLineBresenham(x0: number, y0: number, x1: number, y1: number, paletteIndex: number): void {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let cx = x0;
        let cy = y0;

        while (true) {
            // Draw pixel directly without creating Vector2i.
            this.addPixelVertices(cx, cy, paletteIndex);

            if (cx === x1 && cy === y1) {
                break;
            }

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    /**
     * Adds vertices for a single pixel (6 vertices for 2 triangles).
     * Internal helper used by the Bresenham path.
     *
     * @param x - X position.
     * @param y - Y position.
     * @param paletteIndex - Palette color index.
     */
    private addPixelVertices(x: number, y: number, paletteIndex: number): void {
        // Ensure space for complete pixel (6 vertices) to prevent partial geometry.
        const index = (this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX;
        const pixelValues = 6 * VALUES_PER_VERTEX; // 6 vertices * 3 values

        if (index + pixelValues > this.vertexFloats.length) {
            if (this.vertexCount > 0) {
                this.earlyFlush();
            }

            // Check again after flush - if still no space, buffer is exhausted.
            if ((this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX + pixelValues > this.vertexFloats.length) {
                console.warn('[PrimitivePipeline] Buffer exhausted, pixel dropped');
                this.overflowCount++;

                return;
            }
        }

        const x1 = x + 1;
        const y1 = y + 1;

        this.addVertex(x, y, paletteIndex);
        this.addVertex(x1, y, paletteIndex);
        this.addVertex(x, y1, paletteIndex);

        this.addVertex(x1, y, paletteIndex);
        this.addVertex(x1, y1, paletteIndex);
        this.addVertex(x, y1, paletteIndex);
    }

    /**
     * Adds a single vertex to the primitive batch.
     * Flushes batching state first if the frame buffer has been filled.
     *
     * @param x - X position in pixels.
     * @param y - Y position in pixels.
     * @param paletteIndex - Palette color index (written as uint32).
     */
    private addVertex(x: number, y: number, paletteIndex: number): void {
        const index = (this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX;

        if (index + VALUES_PER_VERTEX > this.vertexFloats.length) {
            this.earlyFlush();

            // Re-check after flush - if still no space, buffer is exhausted for this frame.
            const newIndex = (this.totalVertices + this.vertexCount) * VALUES_PER_VERTEX;

            if (newIndex + VALUES_PER_VERTEX > this.vertexFloats.length) {
                console.warn('[PrimitivePipeline] Primitive buffer capacity exceeded for this frame, vertex dropped');
                this.overflowCount++;
                return;
            }

            // Space available after flush, continue with vertex addition below.
        }

        // Position stored as float32 via the float view.
        // eslint-disable-next-line security/detect-object-injection
        this.vertexFloats[index] = x - this.cameraOffset.x;
        this.vertexFloats[index + 1] = y - this.cameraOffset.y;

        // Palette index stored as uint32 via the uint view.
        this.vertexIndices[index + 2] = paletteIndex;

        this.vertexCount++;
    }

    /**
     * Records the current vertex batch and resets the vertex count.
     * Used for early flush when the buffer is full mid-frame.
     * Does not write to GPU - encodePass() uploads all batches at once.
     */
    private earlyFlush(): void {
        if (this.vertexCount === 0) {
            return;
        }

        this.batches.push({ vertexStart: this.totalVertices, vertexCount: this.vertexCount });
        this.totalVertices += this.vertexCount;
        this.vertexCount = 0;
    }
}
