/**
 * The four WebGPU overlay tiers (bars, labels, top bars, top labels), drawn above the demo tier in a fixed order.
 */

import type { OverlayRendererDiagnostics } from '../overlay';
import { Vector2i } from '../utils/Vector2i';
import { PrimitivePipeline } from './PrimitivePipeline';
import { SpritePipeline } from './SpritePipeline';

/** Writable view of the diagnostics counters {@link OverlayPipelines.addDiagnostics} adds to. */
type Counts = { -readonly [K in keyof OverlayRendererDiagnostics]: OverlayRendererDiagnostics[K] };

/** Either pipeline kind an overlay tier holds. */
type Pipeline = PrimitivePipeline | SpritePipeline;

/** Overlay bars ({@link OverlayDrawTarget.drawBarFill}). */
const BARS = 0;

/** Overlay labels ({@link OverlayDrawTarget.drawLabel}). */
const LABELS = 1;

/** Tooltip chrome above the labels ({@link OverlayDrawTarget.drawBarFillOnTop}). */
const TOP_BARS = 2;

/** Tooltip labels ({@link OverlayDrawTarget.drawLabelOnTop}). */
const TOP_LABELS = 3;

/** Tier names for log messages, indexed like {@link OverlayPipelines.tiers}. */
const NAMES = ['overlayPrimitives', 'overlaySprites', 'overlayTopPrimitives', 'overlayTopSprites'] as const;

/** Pipeline class for each tier, indexed like {@link OverlayPipelines.tiers}. */
const KINDS: ReadonlyArray<new () => Pipeline> = [PrimitivePipeline, SpritePipeline, PrimitivePipeline, SpritePipeline];

/**
 * Lazily allocated overlay pipelines. A tier stays `null` until the overlay is enabled at
 * {@link init} or its first draw call, so a game with the overlay off allocates none of them.
 * Tiers encode in index order, after the demo tier, whatever order the overlay drew in.
 */
export class OverlayPipelines {
    /** One slot per tier, in encode order; `null` until allocated. */
    private readonly tiers: Array<Pipeline | null> = [null, null, null, null];

    /** Camera offset copied into every tier, including ones allocated later. */
    private readonly cameraOffset = new Vector2i(0, 0);

    /** Shared palette uniform buffer from the last {@link init}; `null` before it. */
    private paletteBuffer: GPUBuffer | null = null;

    /**
     * Creates the tier table; no pipeline is allocated until {@link init} or a first draw.
     *
     * @param device - WebGPU device the pipelines are created on.
     * @param displaySize - Logical render resolution.
     * @param targetFormat - Logical scene attachment format.
     * @param isEnabled - Allocate every tier at {@link init} instead of on first draw.
     */
    constructor(
        /** WebGPU device the pipelines are created on. */
        private readonly device: GPUDevice,

        /** Logical render resolution. */
        private readonly displaySize: Vector2i,

        /** Logical scene attachment format. */
        private readonly targetFormat: GPUTextureFormat,

        /** Allocate every tier at {@link init} instead of on first draw. */
        private readonly isEnabled: boolean,
    ) {}

    /**
     * (Re)initializes every allocated tier against a new palette buffer, allocating all four
     * first when the overlay is enabled.
     *
     * @param paletteBuffer - Shared palette uniform buffer.
     */
    async init(paletteBuffer: GPUBuffer): Promise<void> {
        this.paletteBuffer = paletteBuffer;

        for (let tier = BARS; tier <= TOP_LABELS; tier++) {
            // eslint-disable-next-line security/detect-object-injection
            const pipeline = this.tiers[tier] ?? (this.isEnabled ? new (KINDS[tier] as new () => Pipeline)() : null);

            if (pipeline) {
                await pipeline.init(this.device, this.displaySize, paletteBuffer, this.targetFormat);
                pipeline.setCameraOffset(this.cameraOffset);
                // eslint-disable-next-line security/detect-object-injection
                this.tiers[tier] = pipeline;
            }
        }
    }

    /**
     * Returns the overlay bar pipeline, allocating it on first use.
     *
     * @returns Overlay bar pipeline.
     */
    bars(): PrimitivePipeline {
        return this.lazy(BARS) as PrimitivePipeline;
    }

    /**
     * Returns the overlay label pipeline, allocating it on first use.
     *
     * @returns Overlay label pipeline.
     */
    labels(): SpritePipeline {
        return this.lazy(LABELS) as SpritePipeline;
    }

    /**
     * Returns the tooltip chrome pipeline, allocating it on first use.
     *
     * @returns Tooltip chrome pipeline.
     */
    topBars(): PrimitivePipeline {
        return this.lazy(TOP_BARS) as PrimitivePipeline;
    }

    /**
     * Returns the tooltip label pipeline, allocating it on first use.
     *
     * @returns Tooltip label pipeline.
     */
    topLabels(): SpritePipeline {
        return this.lazy(TOP_LABELS) as SpritePipeline;
    }

    /**
     * Encodes every allocated tier in tier order.
     *
     * @param renderPass - Active scene render pass.
     */
    encode(renderPass: GPURenderPassEncoder): void {
        for (const pipeline of this.tiers) {
            pipeline?.encodePass(renderPass);
        }
    }

    /** Clears every allocated tier's batch. */
    reset(): void {
        for (const pipeline of this.tiers) {
            pipeline?.reset();
        }
    }

    /**
     * Sets the camera offset on every tier, now and for tiers allocated later.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        offset.cloneTo(this.cameraOffset);

        for (const pipeline of this.tiers) {
            pipeline?.setCameraOffset(this.cameraOffset);
        }
    }

    /**
     * Adds every allocated tier's overflow and vertex counts to `out`.
     *
     * @param out - Diagnostics already holding the demo tier's counts.
     */
    addDiagnostics(out: Counts): void {
        for (const pipeline of this.tiers) {
            if (pipeline instanceof PrimitivePipeline) {
                out.primitiveOverflowCount += pipeline.getFrameOverflowCount();
                out.primitiveSubmittedVertices += pipeline.getFrameSubmittedVertices();
            } else if (pipeline) {
                out.spriteOverflowCount += pipeline.getFrameOverflowCount();
                out.spriteSubmittedVertices += pipeline.getFrameSubmittedVertices();
            }
        }
    }

    /**
     * Returns a tier's pipeline, constructing and initializing it on first use.
     *
     * Pipeline `init()` makes only synchronous WebGPU calls today, so setup completes before
     * this returns even though the promise is not awaited (the overlay draw API is synchronous).
     * If `init()` ever gains real async work, this needs to change. A failed init logs and
     * clears the slot, so the next draw retries instead of encoding a half-built pipeline.
     *
     * @param tier - Tier index.
     * @returns The tier's pipeline.
     */
    private lazy(tier: number): Pipeline {
        // eslint-disable-next-line security/detect-object-injection
        const existing = this.tiers[tier];

        if (existing) {
            return existing;
        }

        if (!this.paletteBuffer) {
            throw new Error('[WebGPURenderer] Overlay drawn before init() finished');
        }

        // eslint-disable-next-line security/detect-object-injection
        const pipeline = new (KINDS[tier] as new () => Pipeline)();

        // eslint-disable-next-line security/detect-object-injection
        this.tiers[tier] = pipeline;
        void pipeline
            .init(this.device, this.displaySize, this.paletteBuffer, this.targetFormat)
            .catch((error: unknown) => {
                // eslint-disable-next-line security/detect-object-injection
                console.error(`[WebGPURenderer] Failed to initialize ${NAMES[tier]} pipeline:`, error);

                // eslint-disable-next-line security/detect-object-injection
                if (this.tiers[tier] === pipeline) {
                    // eslint-disable-next-line security/detect-object-injection
                    this.tiers[tier] = null;
                }
            });
        pipeline.setCameraOffset(this.cameraOffset);

        return pipeline;
    }
}
