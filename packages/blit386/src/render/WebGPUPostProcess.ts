/**
 * The WebGPU backend's frame targets after the scene pass: the logical scene framebuffer, the pixel and
 * display post-process chains, and the palette resolve + upscale pass between them.
 */

import type { OutputUpscaleFilter } from '../core/IBTDemo';
import type { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import { PaletteResolveUpscalePass } from './PaletteResolveUpscalePass';
import { PostProcessChain } from './PostProcessChain';
import type { WebGPUFrameCaptures } from './WebGPUFrameCaptures';

/** Logical scene + pixel chain format (palette index in the red channel). */
export const LOGICAL_TARGET_FORMAT: GPUTextureFormat = 'r8uint';

/**
 * Owns everything between the scene pass and the swap chain:
 *
 * ```text
 * scene (r8uint logical) -> [pixel chain, r8uint]
 *                        -> palette resolve + upscale (rgba)
 *                        -> [display chain, rgba]
 *                        -> swap chain
 * ```
 *
 * Pixel-tier effects run in the index-native logical domain; RGBA exists only after the resolve.
 */
export class WebGPUPostProcess {
    /** Pixel-tier post-process chain (logical resolution). */
    private pixelChain: PostProcessChain | null = null;

    /** Display-tier post-process chain (output resolution). */
    private displayChain: PostProcessChain | null = null;

    /** Pass that resolves logical palette indices to RGBA and upscales to output size. */
    private resolvePass: PaletteResolveUpscalePass | null = null;

    /** Logical-resolution scene framebuffer; allocated lazily. */
    private sceneTex: GPUTexture | null = null;

    /** Stable view of the scene framebuffer. */
    private sceneTexView: GPUTextureView | null = null;

    /** Swap-chain format from the last {@link init}; `null` before it. */
    private swapFormat: GPUTextureFormat | null = null;

    /**
     * Stores the sizes and filter; nothing is allocated until {@link init}.
     *
     * @param device - WebGPU device.
     * @param displaySize - Logical render resolution.
     * @param outputSize - Output drawing-buffer resolution.
     * @param upscaleFilter - Magnification filter for the resolve pass.
     * @param isDisplayTierEnabled - Whether display-tier effects may be added (`drawingBufferSize` was set).
     */
    constructor(
        private readonly device: GPUDevice,
        private readonly displaySize: Vector2i,
        private readonly outputSize: Vector2i,
        private readonly upscaleFilter: OutputUpscaleFilter,
        private readonly isDisplayTierEnabled: boolean,
    ) {}

    /**
     * Creates both chains and the resolve pass. Call {@link destroy} first when re-initializing.
     *
     * @param paletteBuffer - Shared palette uniform buffer.
     */
    init(paletteBuffer: GPUBuffer): void {
        this.swapFormat = navigator.gpu.getPreferredCanvasFormat();

        // Pixel chain operates at logical resolution (320x240 etc.).
        this.pixelChain = new PostProcessChain(this.device, LOGICAL_TARGET_FORMAT, this.displaySize, 'pixel');

        // Display chain operates at output resolution. When there is no upscale (output == logical),
        // display-tier effects still run on a same-size source; the chain exists either way.
        this.displayChain = new PostProcessChain(this.device, this.swapFormat, this.outputSize, 'display');

        this.resolvePass = new PaletteResolveUpscalePass();
        this.resolvePass.init(this.device, this.swapFormat, this.upscaleFilter, paletteBuffer);
    }

    /** Releases both chains, the resolve pass, and the scene framebuffer. */
    destroy(): void {
        this.pixelChain?.dispose();
        this.pixelChain = null;
        this.displayChain?.dispose();
        this.displayChain = null;
        this.resolvePass?.dispose();
        this.resolvePass = null;
        this.sceneTex?.destroy();
        this.sceneTex = null;
        this.sceneTexView = null;
    }

    /**
     * Appends an effect to the chain matching its {@link Effect.tier}.
     *
     * @param effect - Effect instance to append.
     * @throws If {@link init} has not run.
     * @throws If a `'display'` effect is added without `drawingBufferSize` set in `configure()`.
     */
    add(effect: Effect): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.addEffect: renderer not initialized.');
        }

        if (effect.tier === 'display' && !this.isDisplayTierEnabled) {
            throw new Error(
                'WebGPURenderer.addEffect: display-tier effects require drawingBufferSize to be set in configure().',
            );
        }

        const chain = effect.tier === 'pixel' ? this.pixelChain : this.displayChain;

        chain.add(effect);
    }

    /**
     * Removes an effect from the chain matching its tier, falling back to the other chain.
     * Removing an effect that was never added is a no-op.
     *
     * @param effect - Effect instance to remove.
     * @throws If {@link init} has not run.
     */
    remove(effect: Effect): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.removeEffect: renderer not initialized.');
        }

        const [primary, fallback] =
            effect.tier === 'pixel' ? [this.pixelChain, this.displayChain] : [this.displayChain, this.pixelChain];

        if (!primary.remove(effect)) {
            fallback.remove(effect);
        }
    }

    /**
     * Removes every effect from both chains.
     *
     * @throws If {@link init} has not run.
     */
    clear(): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.clearEffects: renderer not initialized.');
        }

        this.pixelChain.clear();
        this.displayChain.clear();
    }

    /**
     * Returns the view the scene pass renders into this frame: the pixel chain's input when it has
     * effects, otherwise the scene framebuffer.
     *
     * @returns Logical `r8uint` scene attachment.
     */
    sceneTarget(): GPUTextureView {
        if (this.pixelChain?.isActive()) {
            return this.pixelChain.getInputView();
        }

        return this.requireSceneTexView();
    }

    /**
     * Encodes the pixel chain (into the scene framebuffer), the resolve + upscale, and the display chain.
     *
     * @param encoder - Active command encoder, after the scene pass.
     * @param swapChainView - Current swap-chain view (final destination).
     * @param deltaMs - Milliseconds of effect time since the previous frame.
     */
    encode(encoder: GPUCommandEncoder, swapChainView: GPUTextureView, deltaMs: number): void {
        if (this.pixelChain?.isActive()) {
            this.pixelChain.encode(encoder, deltaMs, this.requireSceneTexView());
        }

        const displayChain = this.displayChain?.isActive() ? this.displayChain : null;

        // The logical scene is index-native, so it always goes through the resolve pass, even at 1:1.
        if (this.resolvePass) {
            const resolveDest = displayChain ? displayChain.getInputView() : swapChainView;

            this.resolvePass.encode(encoder, this.requireSceneTexView(), resolveDest, this.displaySize);
        }

        displayChain?.encode(encoder, deltaMs, swapChainView);
    }

    /**
     * Records the frame's capture readbacks from the post-pixel-chain scene.
     *
     * @param captures - Capture slots.
     * @param encoder - Active command encoder, after {@link encode}.
     * @param swapTexture - Swap-chain texture the output capture reads.
     */
    encodeCaptures(captures: WebGPUFrameCaptures, encoder: GPUCommandEncoder, swapTexture: GPUTexture): void {
        captures.encode(encoder, swapTexture, this.resolvePass, this.requireSceneTexView(), this.swapFormat);
    }

    /**
     * Lazily allocates the logical-resolution scene framebuffer and returns its view.
     *
     * @returns Stable view of the scene framebuffer.
     */
    private requireSceneTexView(): GPUTextureView {
        if (!this.sceneTexView) {
            this.sceneTex = this.device.createTexture({
                label: 'Renderer Scene Framebuffer',
                size: { width: this.displaySize.x, height: this.displaySize.y, depthOrArrayLayers: 1 },
                format: LOGICAL_TARGET_FORMAT,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });

            this.sceneTexView = this.sceneTex.createView();
        }

        return this.sceneTexView;
    }
}
