/**
 * Utilities for capturing a rendered WebGPU frame as a PNG blob.
 *
 * The module handles row alignment, optional BGRA swizzling, GPU readback, and
 * browser-side PNG encoding.
 */

/** WebGPU row alignment requirement (bytes per row must be a multiple of 256). */
const BYTES_PER_ROW_ALIGNMENT = 256;

/** Bytes per pixel for RGBA/BGRA pixel data. */
const BYTES_PER_PIXEL = 4;

/** Promise resolve callback for a pending frame capture. */
type Resolve = (blob: Blob) => void;

/** Promise reject callback for a pending frame capture. */
type Reject = (reason: Error) => void;

/**
 * Calculates the WebGPU-aligned byte size per row for a given image width.
 *
 * @param width - Image width in pixels.
 * @returns Byte count per row, padded to the GPU alignment boundary.
 */
export function alignedBytesPerRow(width: number): number {
    const unaligned = width * BYTES_PER_PIXEL;

    return Math.ceil(unaligned / BYTES_PER_ROW_ALIGNMENT) * BYTES_PER_ROW_ALIGNMENT;
}

/**
 * Swaps blue and red channels in a BGRA pixel array to produce RGBA (in place).
 *
 * @param data - Pixel array in BGRA order (4 bytes per pixel).
 */
export function swizzleBGRAtoRGBA(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += BYTES_PER_PIXEL) {
        // eslint-disable-next-line security/detect-object-injection -- typed array indexed by loop counter
        const b = data[i] ?? 0;

        // eslint-disable-next-line security/detect-object-injection -- typed array indexed by loop counter
        data[i] = data[i + 2] ?? 0;
        data[i + 2] = b;
    }
}

/**
 * Converts a raw pixel buffer into a PNG image Blob.
 *
 * @param buffer - Raw pixel data (potentially padded and in BGRA order).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param paddedBytesPerRow - Bytes per row including GPU alignment padding.
 * @param isBGRA - Whether the pixel data needs BGRA-to-RGBA swizzling.
 * @returns PNG-encoded Blob.
 */
export async function pixelBufferToPNG(
    buffer: ArrayBuffer,
    width: number,
    height: number,
    paddedBytesPerRow: number,
    isBGRA: boolean,
): Promise<Blob> {
    const actualBytesPerRow = width * BYTES_PER_PIXEL;
    const pixels = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL);
    const source = new Uint8Array(buffer);

    // Copy rows, stripping any padding bytes.
    for (let y = 0; y < height; y++) {
        const srcOffset = y * paddedBytesPerRow;
        const dstOffset = y * actualBytesPerRow;

        pixels.set(source.subarray(srcOffset, srcOffset + actualBytesPerRow), dstOffset);
    }

    if (isBGRA) {
        swizzleBGRAtoRGBA(pixels);
    }

    const imageData = new ImageData(pixels, width, height);
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to create 2D context on OffscreenCanvas');
    }

    ctx.putImageData(imageData, 0, 0);

    return await offscreen.convertToBlob({ type: 'image/png' });
}

/**
 * Manages single-frame capture from the WebGPU rendering pipeline.
 *
 * A capture request is queued via {@link request}, executed during the
 * next render pass via {@link executeInEncoder}, and resolved
 * asynchronously in {@link resolve}.
 */
export class FrameCapture {
    /** Resolve callback for the pending capture. */
    private pendingResolve: Resolve | null = null;

    /** Reject callback for the pending capture. */
    private pendingReject: Reject | null = null;

    /** Staging buffer for GPU-to-CPU readback. */
    private stagingBuffer: GPUBuffer | null = null;

    /** Width of the captured frame. */
    private width = 0;

    /** Height of the captured frame. */
    private height = 0;

    /** Padded bytes per row used in the staging buffer. */
    private paddedBytesPerRow = 0;

    /** Whether the source format is BGRA. */
    private isBGRA = false;

    /**
     * Returns true if a capture is queued and waiting for the next frame.
     *
     * @returns True if a capture request is pending.
     */
    hasPending(): boolean {
        return this.pendingResolve !== null;
    }

    /**
     * Queues capture of the next submitted frame.
     * If another request is already pending, that earlier request is rejected.
     *
     * @returns Promise resolving to the captured PNG Blob.
     */
    request(): Promise<Blob> {
        if (this.pendingResolve) {
            this.pendingReject?.(new Error('[FrameCapture] Capture superseded by a new request'));

            this.cleanup();
        }

        return new Promise<Blob>((resolve, reject) => {
            this.pendingResolve = resolve;
            this.pendingReject = reject;
        });
    }

    /**
     * Records the texture-to-buffer copy needed for a pending frame capture.
     * Call only when {@link hasPending} is true, after the render pass ends but
     * before submitting the command buffer.
     *
     * @param device - WebGPU device for buffer creation.
     * @param texture - The rendered canvas texture to capture.
     * @param commandEncoder - Active command encoder to add the copy command to.
     */
    executeInEncoder(device: GPUDevice, texture: GPUTexture, commandEncoder: GPUCommandEncoder): void {
        this.width = texture.width;
        this.height = texture.height;
        this.paddedBytesPerRow = alignedBytesPerRow(this.width);
        this.isBGRA = texture.format === 'bgra8unorm';

        const bufferSize = this.paddedBytesPerRow * this.height;

        this.stagingBuffer = device.createBuffer({
            label: 'Frame Capture Staging',
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        commandEncoder.copyTextureToBuffer(
            { texture },
            { buffer: this.stagingBuffer, bytesPerRow: this.paddedBytesPerRow, rowsPerImage: this.height },
            { width: this.width, height: this.height },
        );
    }

    /**
     * Waits for GPU completion, reads back the staging buffer, and resolves the pending capture.
     *
     * @param device - WebGPU device (used for onSubmittedWorkDone).
     */
    async resolve(device: GPUDevice): Promise<void> {
        const resolve = this.pendingResolve;
        const reject = this.pendingReject;
        const buffer = this.stagingBuffer;

        // Clear pending state immediately so the next frame is not affected.
        this.pendingResolve = null;
        this.pendingReject = null;
        this.stagingBuffer = null;

        if (!resolve || !reject || !buffer) {
            return;
        }

        try {
            await device.queue.onSubmittedWorkDone();
            await buffer.mapAsync(GPUMapMode.READ);

            const data = buffer.getMappedRange();
            const blob = await pixelBufferToPNG(data, this.width, this.height, this.paddedBytesPerRow, this.isBGRA);

            buffer.unmap();
            buffer.destroy();
            resolve(blob);
        } catch (error) {
            buffer.destroy();
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /** Clears the pending capture state and destroys any staging buffer. */
    private cleanup(): void {
        this.pendingResolve = null;
        this.pendingReject = null;

        if (this.stagingBuffer) {
            this.stagingBuffer.destroy();
            this.stagingBuffer = null;
        }
    }
}
