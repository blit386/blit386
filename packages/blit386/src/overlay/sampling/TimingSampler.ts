import { OVERLAY_DIAGNOSTICS_OVERFLOW_FIELD_WIDTH, OVERLAY_DIAGNOSTICS_VERTEX_FIELD_WIDTH } from '../constants';
import { padOverlayField } from '../labels';
import type { OverlayTimingSnapshot } from '../types';
import { FPS_SMOOTHING } from './constants';

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
            this.#smoothedFrameMs += (frameMs - this.#smoothedFrameMs) * FPS_SMOOTHING;
            this.#smoothedUpdateMs += (updateMs - this.#smoothedUpdateMs) * FPS_SMOOTHING;
            this.#smoothedRenderMs += (renderMs - this.#smoothedRenderMs) * FPS_SMOOTHING;
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
        const primStats = this.#formatBatchStats(this.#primitiveSubmittedVertices, this.#primitiveOverflowCount);
        const sprStats = this.#formatBatchStats(this.#spriteSubmittedVertices, this.#spriteOverflowCount);

        return `Prim ${primStats}|Spr ${sprStats}`;
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
