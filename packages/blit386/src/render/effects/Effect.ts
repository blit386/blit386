import type { Vector2i } from '../../utils/Vector2i';

/**
 * Tier identifier for a post-processing effect.
 *
 * - `'pixel'` - runs at logical render resolution (e.g. 320x240) on the `r8uint`
 *   framebuffer that stores **palette indices**, before palette resolve/upscale.
 *   Use for effects that stay in index space: glitch shifts, mosaic blocks,
 *   index inversion. Effects in this tier should avoid introducing values that are
 *   not meaningful palette slots (e.g. blurs, gradients).
 * - `'display'` - runs at the canvas output resolution (e.g. 1280x960) after
 *   palette resolve/upscale. Use for effects that simulate the physical display the
 *   game appears on: CRT scanlines, barrel distortion, RGB shadow mask,
 *   vignette, chromatic aberration, monochrome amber/green, bloom, etc. The
 *   higher resolution lets curved sampling (barrel) express smoothly without
 *   floor-quantizing onto the logical pixel grid.
 *
 * @since 1.0.3
 */
export type EffectTier = 'pixel' | 'display';

/**
 * Fullscreen post-processing effect contract.
 *
 * An effect samples a single source color texture and writes a processed result
 * into a destination color texture (the next chain link or the swap chain). The
 * {@link PostProcessChain} owns the source/destination wiring; effects are
 * responsible only for their own pipeline, uniform buffer, and per-pass encoding.
 *
 * Lifetime:
 * 1. {@link init} - called once when the effect is added to the chain.
 * 2. {@link updateUniforms} + {@link encodePass} - called once per frame.
 * 3. {@link dispose} - optional cleanup when the effect is removed or the chain
 *    is cleared.
 *
 * Implementations must reuse uniform buffers and avoid per-frame allocations on
 * the hot path.
 *
 * @since 1.0.3
 */
export interface Effect {
    /**
     * Tier this effect runs in. Determines whether the engine routes it to the
     * pixel chain (logical resolution) or the display chain (output resolution).
     *
     * See {@link EffectTier} for guidance on which tier suits a given effect.
     */
    readonly tier: EffectTier;

    /**
     * Creates GPU resources (pipeline, layout, uniform buffer, and sampler when
     * the chain format requires texture sampling). The `r8uint` pixel-tier path
     * uses `textureLoad` only and does not bind a sampler.
     *
     * Idempotent: calling twice on the same instance is undefined behavior; the
     * chain guarantees it is only invoked once per effect instance.
     *
     * @param device - WebGPU device used for resource creation.
     * @param format - Color attachment format for this chain (`r8uint` for the pixel
     *   tier, swap-chain format for the display tier) so ping-pong textures match the
     *   effect pipelines.
     * @param displaySize - Chain attachment dimensions in pixels for this pass
     *   (logical size for the pixel tier, output size for the display tier).
     */
    init(device: GPUDevice, format: GPUTextureFormat, displaySize: Vector2i): void;

    /**
     * Writes per-frame uniform data to the GPU.
     *
     * Called by {@link PostProcessChain} immediately before {@link encodePass}.
     *
     * @param deltaMs - Wall-clock milliseconds since the previous frame.
     * @param sourceSize - Pixel dimensions of the source texture for this pass.
     */
    updateUniforms(deltaMs: number, sourceSize: Vector2i): void;

    /**
     * Encodes a single full-screen render pass.
     *
     * The pass must begin with `colorAttachments[0].view = destView` and load
     * with `clear` (any clearColor; the shader overwrites the entire surface).
     * The pass binds the source texture view as its sampled input.
     *
     * @param encoder - Active command encoder owned by the renderer.
     * @param sourceView - View of the texture to sample from.
     * @param destView - View of the texture to render into.
     */
    encodePass(encoder: GPUCommandEncoder, sourceView: GPUTextureView, destView: GPUTextureView): void;

    /**
     * Releases GPU resources owned by this effect.
     *
     * Optional. Implementations that allocate `GPUBuffer` or `GPUTexture`
     * instances should destroy them here. The chain calls this when the effect
     * is removed or when the chain itself is disposed.
     */
    dispose?(): void;
}
