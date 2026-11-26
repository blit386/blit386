import { BACKGROUND_THRESHOLD_MS } from '../../core/frameTiming';
import { MS_PER_SECOND, OVERLAY_EMA_SMOOTHING } from './constants';

/**
 * Smoothed render-frame FPS from `performance.now()` deltas between overlay draws.
 * Not the configured fixed-update rate; measures actual `requestAnimationFrame` cadence.
 */
export class FpsSampler {
    /** `performance.now()` at the previous sample, or `null` before the first one. */
    #lastSampleMs: number | null = null;

    /** EMA of the instantaneous frame rate, or `null` before the first sample. */
    #smoothedFps: number | null = null;

    /** Configured rate the readout starts from and falls back to. */
    readonly #targetFps: number;

    /**
     * Creates a sampler seeded with the configured target rate.
     *
     * @param targetFps - Configured target FPS used until the first sample arrives.
     */
    constructor(targetFps: number) {
        this.#targetFps = targetFps;
    }

    /**
     * Rounded smoothed render-frame rate from recent samples.
     *
     * @returns Smoothed frames per second.
     */
    get measuredFps(): number {
        return Math.round(this.#smoothedFps ?? this.#targetFps);
    }

    /** Forgets every sample, so {@link measuredFps} reads the target rate until the next two samples. */
    reset(): void {
        this.#lastSampleMs = null;
        this.#smoothedFps = null;
    }

    /** Ingests one render-frame timing sample. */
    sample(): void {
        const now = performance.now();

        if (this.#lastSampleMs === null) {
            this.#lastSampleMs = now;
            this.#smoothedFps = this.#targetFps;

            return;
        }

        const deltaMs = now - this.#lastSampleMs;
        const deltaSeconds = deltaMs / MS_PER_SECOND;

        this.#lastSampleMs = now;

        // A background-tab gap is not a frame rate; feeding it in would drag the readout down for ~30 frames.
        if (deltaMs >= BACKGROUND_THRESHOLD_MS || deltaSeconds <= 0) {
            return;
        }

        if (this.#smoothedFps === null) {
            this.#smoothedFps = this.#targetFps;
        }

        const instantFps = 1 / deltaSeconds;

        this.#smoothedFps += (instantFps - this.#smoothedFps) * OVERLAY_EMA_SMOOTHING;
    }
}
