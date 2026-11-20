import { OVERLAY_DIAGNOSTICS_OVERFLOW_FIELD_WIDTH, OVERLAY_DIAGNOSTICS_VERTEX_FIELD_WIDTH } from '../constants';
import { padOverlayField } from '../labels';
import type { OverlayTimingSnapshot } from '../types';
import { OVERLAY_EMA_SMOOTHING } from './constants';

/**
 * Exponentially smoothed overlay timings sourced from {@link OverlayTimingSnapshot}.
 */
export class TimingSampler {
    #hasSample = false;

    #smoothedFrameMs = 0;

    #smoothedUpdateMs = 0;

    #smoothedRenderMs = 0;

    #updateSteps = 0;

    #drawCalls = 0;

    #primitiveOverflowCount = 0;

    #spriteOverflowCount = 0;

    #primitiveSubmittedVertices = 0;

    #spriteSubmittedVertices = 0;

    /** Counts the cached diagnostics label was built from; `-1` forces the first build. */
    #cachedPrimVertices = -1;

    #cachedPrimOverflow = -1;

    #cachedSprVertices = -1;

    #cachedSprOverflow = -1;

    /** Diagnostics label rebuilt only when one of the four counts above changes. */
    #cachedDiagnosticsLabel = '';

    /**
     * Smoothed full-frame CPU time in milliseconds.
     *
     * @returns Smoothed frame time.
     */
    get frameMs(): number {
        return this.#smoothedFrameMs;
    }

    /**
     * Smoothed update-loop CPU time in milliseconds.
     *
     * @returns Smoothed update time.
     */
    get updateMs(): number {
        return this.#smoothedUpdateMs;
    }

    /**
     * Smoothed demo render CPU time in milliseconds.
     *
     * @returns Smoothed demo render time.
     */
    get renderMs(): number {
        return this.#smoothedRenderMs;
    }

    /**
     * Most recent fixed-step count for the frame.
     *
     * @returns Fixed update-step count.
     */
    get updateSteps(): number {
        return this.#updateSteps;
    }

    /**
     * Most recent draw-call count for the frame.
     *
     * @returns Draw-call count from demo draw APIs.
     */
    get drawCalls(): number {
        return this.#drawCalls;
    }

    /** Forgets every sample, so the next one is taken as-is instead of smoothed into older wall-clock values. */
    reset(): void {
        this.#hasSample = false;
        this.#smoothedFrameMs = 0;
        this.#smoothedUpdateMs = 0;
        this.#smoothedRenderMs = 0;
    }

    /**
     * Ingests one frame-timing snapshot.
     *
     * @param sample - Current-frame timing values from BTAPI.
     */
    sample(sample: OverlayTimingSnapshot): void {
        const frameMs = Math.max(0, sample.frameMs);
        const updateMs = Math.max(0, sample.updateMs);
        const renderMs = Math.max(0, sample.renderMs);

        if (this.#hasSample) {
            this.#smoothedFrameMs += (frameMs - this.#smoothedFrameMs) * OVERLAY_EMA_SMOOTHING;
            this.#smoothedUpdateMs += (updateMs - this.#smoothedUpdateMs) * OVERLAY_EMA_SMOOTHING;
            this.#smoothedRenderMs += (renderMs - this.#smoothedRenderMs) * OVERLAY_EMA_SMOOTHING;
        } else {
            this.#smoothedFrameMs = frameMs;
            this.#smoothedUpdateMs = updateMs;
            this.#smoothedRenderMs = renderMs;
            this.#hasSample = true;
        }

        this.#updateSteps = Math.max(0, Math.floor(sample.updateSteps));
        this.#drawCalls = Math.max(0, Math.floor(sample.drawCalls));
        this.#primitiveOverflowCount = Math.max(0, Math.floor(sample.primitiveOverflowCount));
        this.#spriteOverflowCount = Math.max(0, Math.floor(sample.spriteOverflowCount));
        this.#primitiveSubmittedVertices = Math.max(0, Math.floor(sample.primitiveSubmittedVertices));
        this.#spriteSubmittedVertices = Math.max(0, Math.floor(sample.spriteSubmittedVertices));
    }

    /**
     * Formats the renderer diagnostics overlay row from the latest sample.
     *
     * @returns Single-line GPU batch summary for the diagnostics bar.
     */
    formatRendererDiagnosticsLabel(): string {
        if (
            this.#primitiveSubmittedVertices === this.#cachedPrimVertices &&
            this.#primitiveOverflowCount === this.#cachedPrimOverflow &&
            this.#spriteSubmittedVertices === this.#cachedSprVertices &&
            this.#spriteOverflowCount === this.#cachedSprOverflow
        ) {
            return this.#cachedDiagnosticsLabel;
        }

        this.#cachedPrimVertices = this.#primitiveSubmittedVertices;
        this.#cachedPrimOverflow = this.#primitiveOverflowCount;
        this.#cachedSprVertices = this.#spriteSubmittedVertices;
        this.#cachedSprOverflow = this.#spriteOverflowCount;

        const primStats = this.#formatBatchStats(this.#primitiveSubmittedVertices, this.#primitiveOverflowCount);
        const sprStats = this.#formatBatchStats(this.#spriteSubmittedVertices, this.#spriteOverflowCount);

        this.#cachedDiagnosticsLabel = `Prim ${primStats}|Spr ${sprStats}`;

        return this.#cachedDiagnosticsLabel;
    }

    /**
     * Pads one pipeline's vertex and overflow counts to their fixed field widths.
     *
     * @param vertices - Submitted vertex count for the pipeline.
     * @param overflow - Overflow (dropped-batch) count for the pipeline.
     * @returns Formatted `Xv ov Y` segment with fixed-width padded fields.
     */
    #formatBatchStats(vertices: number, overflow: number): string {
        const paddedVertices = padOverlayField(String(vertices), OVERLAY_DIAGNOSTICS_VERTEX_FIELD_WIDTH);
        const paddedOverflow = padOverlayField(String(overflow), OVERLAY_DIAGNOSTICS_OVERFLOW_FIELD_WIDTH);

        return `${paddedVertices}v ov ${paddedOverflow}`;
    }
}
