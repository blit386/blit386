import type { Vector2i } from '../utils/Vector2i';
import type { Effect, EffectTier } from './effects/Effect';

/**
 * Stackable post-processing effect chain that runs at a single resolution tier.
 *
 * The renderer owns one chain per tier:
 * - A `'pixel'` chain at the logical render resolution (e.g. 320x240).
 * - A `'display'` chain at the canvas output resolution (e.g. 1280x960).
 *
 * Each chain owns its own offscreen color texture(s). Individual effects own
 * their samplers and pipelines. Resources are allocated lazily: nothing is
 * allocated on the GPU until an effect is added, and everything is destroyed when the chain
 * empties via {@link clear} or the last {@link remove}.
 *
 * Texture model:
 * - Zero effects: no textures allocated, {@link isActive} returns `false`.
 * - One effect: only `texA` exists. The previous stage renders into `texA`; the
 *   effect samples `texA` and writes directly to the final destination view.
 * - N >= 2 effects: `texB` is also allocated. The previous stage renders into
 *   `texA`; intermediate effects ping-pong between `texA` and `texB`; the final
 *   effect writes to the destination view regardless of which buffer it sampled
 *   from.
 *
 * Effect ordering is the order of {@link add} calls.
 */
export class PostProcessChain {
    /** Tier this chain serves. Effects added to it must declare the same tier. */
    readonly tier: EffectTier;

    /** WebGPU device used for resource creation. */
    private readonly device: GPUDevice;

    /** Chain attachment format (`r8uint` for pixel tier, RGBA for display tier). */
    private readonly format: GPUTextureFormat;

    /** Resolution of this chain's render targets in pixels. */
    private readonly size: Vector2i;

    /** Effects in execution order. */
    private effects: Effect[] = [];

    /** Primary offscreen color attachment, allocated on first {@link add}. */
    private texA: GPUTexture | null = null;

    /** Cached view for {@link texA}, regenerated when the texture is recreated. */
    private texAView: GPUTextureView | null = null;

    /**
     * Secondary offscreen color attachment for chains with two or more effects.
     * Allocated lazily on the second {@link add}.
     */
    private texB: GPUTexture | null = null;

    /** Cached view for {@link texB}, regenerated when the texture is recreated. */
    private texBView: GPUTextureView | null = null;

    /**
     * Creates a chain bound to a device, swap-chain format, render resolution,
     * and tier.
     *
     * No GPU resources are created until the first effect is registered.
     *
     * @param device - WebGPU device used for resource creation.
     * @param format - Attachment format for this chain's offscreen textures.
     *   Pixel tier typically uses `r8uint`; display tier uses an RGBA format.
     * @param chainSize - Render target resolution in pixels for this tier.
     * @param tier - Tier this chain serves. Effects added must match.
     */
    constructor(device: GPUDevice, format: GPUTextureFormat, chainSize: Vector2i, tier: EffectTier) {
        this.device = device;
        this.format = format;
        this.size = chainSize.clone();
        this.tier = tier;
    }

    /**
     * Returns `true` when at least one effect is registered.
     *
     * The renderer uses this to decide whether to allocate offscreen textures
     * for this chain's stage.
     *
     * @returns `true` when the chain has at least one effect.
     */
    isActive(): boolean {
        return this.effects.length > 0;
    }

    /**
     * Registers an effect at the end of the chain.
     *
     * The effect's {@link Effect.init} is called once and only on success is
     * the effect appended to the chain. GPU resources for the chain itself
     * are allocated lazily here: {@link texA} on the first add, {@link texB}
     * on the second. Existing offscreen textures are **reused** across
     * remove/re-add cycles - we never reallocate a texture that is already
     * present.
     *
     * Adding the same effect instance twice throws. Construct a new instance
     * if you want a second copy of the same look.
     *
     * @param effect - Effect to append to the chain.
     * @throws If the effect's tier does not match this chain's tier.
     * @throws If the effect instance is already registered.
     */
    add(effect: Effect): void {
        if (effect.tier !== this.tier) {
            throw new Error(
                `PostProcessChain.add: effect.tier='${effect.tier}' does not match chain tier='${this.tier}'.`,
            );
        }

        if (this.effects.includes(effect)) {
            throw new Error('PostProcessChain.add: effect instance is already registered.');
        }

        // Allocate any missing offscreen textures *before* init: init can
        // throw, but the textures are inert until referenced and will be
        // freed by the next clear()/dispose() if init fails.
        if (this.texA === null) {
            this.allocatePrimary();
        }
        if (this.effects.length >= 1 && this.texB === null) {
            this.allocateSecondary();
        }

        effect.init(this.device, this.format, this.size);
        this.effects = [...this.effects, effect];
    }

    /**
     * Removes a previously registered effect.
     *
     * Calls the effect's {@link Effect.dispose} hook if defined. When the last
     * effect is removed, the offscreen textures are destroyed and the chain
     * reverts to its inactive state.
     *
     * Removing an effect that was never added is a no-op.
     *
     * @param effect - Effect instance to remove.
     * @returns `true` if the effect was found and removed; otherwise `false`.
     */
    remove(effect: Effect): boolean {
        const index = this.effects.indexOf(effect);

        if (index === -1) {
            return false;
        }

        effect.dispose?.();
        this.effects = [...this.effects.slice(0, index), ...this.effects.slice(index + 1)];

        if (this.effects.length === 0) {
            this.releaseTextures();
        }

        return true;
    }

    /**
     * Removes every registered effect and destroys all offscreen textures.
     *
     * Disposes each effect in registration order. After this call the chain is
     * inactive again and a subsequent {@link add} will reallocate textures
     * from scratch.
     */
    clear(): void {
        if (this.effects.length === 0) {
            return;
        }

        for (const effect of this.effects) {
            effect.dispose?.();
        }

        this.effects = [];
        this.releaseTextures();
    }

    /**
     * Returns the texture view the previous stage should write into when
     * {@link isActive} is `true`.
     *
     * The same view is returned across consecutive frames until the chain is
     * cleared or disposed; the renderer can cache it without invalidation
     * tracking.
     *
     * @returns Stable view of the chain's primary offscreen color texture.
     * @throws If the chain is inactive (no effects registered).
     */
    getInputView(): GPUTextureView {
        if (!this.texAView) {
            throw new Error('PostProcessChain.getInputView: called with no active effects.');
        }

        return this.texAView;
    }

    /**
     * Encodes the post-process passes for this frame.
     *
     * Walks the effect chain in registration order:
     *
     * - Single-effect chain: source = `texA`, dest = `destinationView` (one pass,
     *   no ping-pong, no extra blit).
     * - Multi-effect chain: each pass reads from the previous pass's output and
     *   writes into the other offscreen texture; the **last** pass always
     *   writes to `destinationView`.
     *
     * Each effect's {@link Effect.updateUniforms} is called immediately before
     * its {@link Effect.encodePass}.
     *
     * No-op when no effects are registered.
     *
     * @param encoder - Active command encoder.
     * @param deltaMs - Wall-clock milliseconds since the previous frame.
     * @param destinationView - View the final effect writes to (the next stage's
     *   input texture, or the swap chain).
     */
    encode(encoder: GPUCommandEncoder, deltaMs: number, destinationView: GPUTextureView): void {
        if (this.effects.length === 0 || !this.texAView) {
            return;
        }

        let read: GPUTextureView = this.texAView;
        const effectCount = this.effects.length;

        for (let i = 0; i < effectCount; i++) {
            const isLast = i === effectCount - 1;
            const write: GPUTextureView = isLast ? destinationView : this.pickOffscreenView(read);
            // Safe: bounds checked by loop variable; the read makes the array
            // entry non-null for tsc. Index is a loop counter, not user input.
            // eslint-disable-next-line security/detect-object-injection
            const effect = this.effects[i] as Effect;

            effect.updateUniforms(deltaMs, this.size);
            effect.encodePass(encoder, read, write);

            read = write;
        }
    }

    /**
     * Releases every GPU resource owned by the chain.
     *
     * Disposes each registered effect, destroys the offscreen textures, and
     * empties the effect list. Safe to call multiple times.
     */
    dispose(): void {
        this.clear();
    }

    /** Allocates {@link texA}. */
    private allocatePrimary(): void {
        this.texA = this.device.createTexture({
            label: `PostProcessChain[${this.tier}] texA`,
            size: { width: this.size.x, height: this.size.y, depthOrArrayLayers: 1 },
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.texAView = this.texA.createView();
    }

    /** Allocates {@link texB} for chains with two or more effects. */
    private allocateSecondary(): void {
        this.texB = this.device.createTexture({
            label: `PostProcessChain[${this.tier}] texB`,
            size: { width: this.size.x, height: this.size.y, depthOrArrayLayers: 1 },
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.texBView = this.texB.createView();
    }

    /**
     * Returns the ping-pong partner of the supplied source view.
     *
     * `texAView` partners with `texBView`; called only on multi-effect chains
     * where `texBView` is guaranteed to be allocated.
     *
     * @param read - View currently being sampled by the effect.
     * @returns The opposite offscreen view to write into next.
     */
    private pickOffscreenView(read: GPUTextureView): GPUTextureView {
        if (!this.texBView || !this.texAView) {
            throw new Error('PostProcessChain.encode: ping-pong texture not allocated.');
        }
        return read === this.texAView ? this.texBView : this.texAView;
    }

    /** Destroys both offscreen textures and clears their cached views. */
    private releaseTextures(): void {
        this.texA?.destroy();
        this.texB?.destroy();
        this.texA = null;
        this.texB = null;
        this.texAView = null;
        this.texBView = null;
    }
}
