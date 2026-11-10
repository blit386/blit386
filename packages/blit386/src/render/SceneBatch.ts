/**
 * The WebGPU demo-tier draw list: primitives and sprites encoded in the order the game called them.
 */

import type { Vector2i } from '../utils/Vector2i';
import { PrimitivePipeline } from './PrimitivePipeline';
import { SpritePipeline } from './SpritePipeline';

/** No segment is open (start of frame, or right after {@link SceneBatch.encode}). */
const NONE = -1;

/** A run of primitive vertices; its end mark is a vertex count. */
const PRIMITIVE = 0;

/** A run of sprite batches; its end mark is a batch count. */
const SPRITE = 1;

/**
 * One primitive pipeline and one sprite pipeline whose draws keep their call order.
 *
 * Each pipeline still uploads its vertices once per frame. What changes is the encode: the frame is a
 * list of segments, a new one opening whenever a draw switches between primitive and sprite, and
 * {@link encode} walks that list, switching pipelines per segment. A rect fill drawn after a sprite
 * therefore lands on top of it, as it does on the software backend.
 */
export class SceneBatch {
    /** Pixels, lines, and rects. */
    readonly primitives = new PrimitivePipeline();

    /** Sprites and bitmap text. */
    readonly sprites = new SpritePipeline();

    /** Kind of the open segment: {@link PRIMITIVE}, {@link SPRITE}, or {@link NONE}. */
    private active: number = NONE;

    /** Kind of each closed segment, in call order. Reused across frames. */
    private readonly kinds: number[] = [];

    /** End mark of each closed segment (vertex count or batch count). Reused across frames. */
    private readonly ends: number[] = [];

    /**
     * Initializes both pipelines.
     *
     * @param device - WebGPU device.
     * @param displaySize - Logical render resolution.
     * @param paletteBuffer - Shared palette uniform buffer.
     * @param targetFormat - Color attachment format.
     */
    async init(
        device: GPUDevice,
        displaySize: Vector2i,
        paletteBuffer: GPUBuffer,
        targetFormat: GPUTextureFormat,
    ): Promise<void> {
        await this.primitives.init(device, displaySize, paletteBuffer, targetFormat);
        await this.sprites.init(device, displaySize, paletteBuffer, targetFormat);
    }

    /**
     * Returns the primitive pipeline for the next draw, opening a primitive segment if a sprite one is open.
     *
     * @returns The primitive pipeline.
     */
    usePrimitives(): PrimitivePipeline {
        if (this.active !== PRIMITIVE) {
            this.closeSegment();
            this.active = PRIMITIVE;
        }

        return this.primitives;
    }

    /**
     * Returns the sprite pipeline for the next draw, opening a sprite segment if a primitive one is open.
     *
     * @returns The sprite pipeline.
     */
    useSprites(): SpritePipeline {
        if (this.active !== SPRITE) {
            this.closeSegment();
            this.active = SPRITE;
        }

        return this.sprites;
    }

    /**
     * Uploads both pipelines and encodes every segment in call order.
     *
     * @param renderPass - Active render pass encoder.
     */
    encode(renderPass: GPURenderPassEncoder): void {
        this.closeSegment();
        this.active = NONE;
        this.primitives.upload();
        this.sprites.upload();

        let vertexStart = 0;
        let batchStart = 0;

        for (let i = 0; i < this.kinds.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            const end = this.ends[i] as number;

            // eslint-disable-next-line security/detect-object-injection
            if (this.kinds[i] === PRIMITIVE) {
                this.primitives.encodeRange(renderPass, vertexStart, end - vertexStart);
                vertexStart = end;
            } else {
                this.sprites.encodeBatches(renderPass, batchStart, end);
                batchStart = end;
            }
        }
    }

    /**
     * Clears both pipelines and the segment list.
     */
    reset(): void {
        this.primitives.reset();
        this.sprites.reset();
        this.kinds.length = 0;
        this.ends.length = 0;
        this.active = NONE;
    }

    /**
     * Sets the camera offset on both pipelines.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        this.primitives.setCameraOffset(offset);
        this.sprites.setCameraOffset(offset);
    }

    /**
     * Records the open segment's end mark. A segment that queued nothing still records its mark,
     * which encodes as an empty range.
     */
    private closeSegment(): void {
        if (this.active === PRIMITIVE) {
            this.kinds.push(PRIMITIVE);
            this.ends.push(this.primitives.getFrameSubmittedVertices());
        } else if (this.active === SPRITE) {
            this.kinds.push(SPRITE);
            this.ends.push(this.sprites.endBatch());
        }
    }
}
