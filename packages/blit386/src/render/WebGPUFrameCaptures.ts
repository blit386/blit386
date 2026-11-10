/**
 * The WebGPU backend's three frame-capture slots and the display-size capture target they share.
 */

import { FrameCapture } from '../utils/FrameCapture';
import type { Vector2i } from '../utils/Vector2i';
import type { PaletteResolveUpscalePass } from './PaletteResolveUpscalePass';

/**
 * One {@link FrameCapture} per slot: the output frame (`captureFrame`), the logical frame
 * (`captureFrame({ size: 'display' })`), and the F9 / Shift+F9 shortcut, which captures the
 * logical frame from its own slot so a keypress and a public capture never cancel each other.
 * Both logical slots share one resolve pass into a lazily allocated RGBA target.
 */
export class WebGPUFrameCaptures {
    /** `captureFrame()`: the swap-chain texture at output size. */
    private readonly output = new FrameCapture();

    /** `captureFrame({ size: 'display' })`: the logical frame, no upscale or display effects. */
    private readonly display = new FrameCapture();

    /** F9 / Shift+F9: same capture as {@link display}, from its own slot. */
    private readonly shortcut = new FrameCapture();

    /** Both logical slots, serviced by one resolve pass. */
    private readonly displaySlots: readonly FrameCapture[] = [this.display, this.shortcut];

    /** Every slot, for {@link resolve}. */
    private readonly slots: readonly FrameCapture[] = [this.output, this.display, this.shortcut];

    /** Logical-size RGBA target the scene is resolved into for {@link displaySlots}; lazy. */
    private target: { texture: GPUTexture; view: GPUTextureView } | null = null;

    /**
     * Creates the slots; nothing is allocated until a logical capture is requested.
     *
     * @param device - WebGPU device.
     * @param displaySize - Logical render resolution.
     */
    constructor(
        /** WebGPU device. */
        private readonly device: GPUDevice,

        /** Logical render resolution. */
        private readonly displaySize: Vector2i,
    ) {}

    /**
     * Captures the next frame at output size.
     *
     * @returns Promise for the PNG.
     */
    requestOutput(): Promise<Blob> {
        return this.output.request();
    }

    /**
     * Captures the next frame at logical size.
     *
     * @returns Promise for the PNG.
     */
    requestDisplay(): Promise<Blob> {
        return this.display.request();
    }

    /**
     * Captures the next frame at logical size from the shortcut slot.
     *
     * @returns Promise for the PNG.
     */
    requestShortcut(): Promise<Blob> {
        return this.shortcut.request();
    }

    /**
     * Rejects every pending capture and releases the logical capture target.
     *
     * @param message - Rejection message.
     */
    destroy(message: string): void {
        if (this.output.hasPending()) {
            this.output.reject(new Error(message));
        }

        this.rejectDisplay(message);
        this.target?.texture.destroy();
        this.target = null;
    }

    /**
     * Records the readbacks for every pending slot into the frame's encoder. Without a
     * resolve pass (renderer not initialized) the logical captures reject instead of hanging.
     *
     * @param encoder - The frame's command encoder, after the scene and post-process passes.
     * @param swapTexture - Swap-chain texture the output capture reads.
     * @param resolvePass - Palette resolve pass, or `null` before init.
     * @param sceneView - Logical `r8uint` scene the logical captures resolve from.
     * @param format - RGBA format for the logical capture target, or `null` before init.
     */
    encode(
        encoder: GPUCommandEncoder,
        swapTexture: GPUTexture,
        resolvePass: PaletteResolveUpscalePass | null,
        sceneView: GPUTextureView,
        format: GPUTextureFormat | null,
    ): void {
        if (this.output.hasPending()) {
            this.output.executeInEncoder(this.device, swapTexture, encoder);
        }

        if (!this.displaySlots.some((capture) => capture.hasPending())) {
            return;
        }

        if (!resolvePass || !format) {
            this.rejectDisplay("Can't capture frame: renderer resolve pass not initialized");

            return;
        }

        const target = this.requireTarget(format);

        resolvePass.encode(encoder, sceneView, target.view, this.displaySize);

        for (const capture of this.displaySlots) {
            if (capture.hasPending()) {
                capture.executeInEncoder(this.device, target.texture, encoder);
            }
        }
    }

    /**
     * Starts the buffer readbacks {@link encode} recorded; call right after the queue submit. A slot
     * still pending here was recorded, since {@link encode} rejects any slot it cannot record.
     */
    resolve(): void {
        for (const capture of this.slots) {
            if (capture.hasPending()) {
                void capture.resolve(this.device);
            }
        }
    }

    /**
     * Rejects both logical slots.
     *
     * @param message - Rejection message.
     */
    private rejectDisplay(message: string): void {
        for (const capture of this.displaySlots) {
            if (capture.hasPending()) {
                capture.reject(new Error(message));
            }
        }
    }

    /**
     * Allocates the logical capture target on first use.
     *
     * @param format - RGBA format matching the resolve pass output.
     * @returns The capture target and its view.
     */
    private requireTarget(format: GPUTextureFormat): { texture: GPUTexture; view: GPUTextureView } {
        if (!this.target) {
            const texture = this.device.createTexture({
                label: 'Renderer Display-Size Capture Target',
                size: { width: this.displaySize.x, height: this.displaySize.y, depthOrArrayLayers: 1 },
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            });

            this.target = { texture, view: texture.createView() };
        }

        return this.target;
    }
}
