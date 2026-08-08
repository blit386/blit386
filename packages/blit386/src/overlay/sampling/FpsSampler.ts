import { FPS_SMOOTHING, MS_PER_SECOND } from './constants';

/**
 * Smoothed render-frame FPS from `performance.now()` deltas between overlay draws.
 * Not the configured fixed-update rate; measures actual `requestAnimationFrame` cadence.
 */
export class FpsSampler {
    #lastSampleMs: number | null = null;

    #smoothedFps: number | null = null;

    readonly #targetFps: number;

    /**
     * Creates a sampler seeded with the configured target rate.
     *
     * @param targetFps – Configured target FPS used until the first sample arrives.
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

    /** Ingests one render-frame timing sample. */
    sample(): void {
        const now = performance.now();

        if (this.#lastSampleMs === null) {
            this.#lastSampleMs = now;
            this.#smoothedFps = this.#targetFps;

            return;
        }

        const deltaSeconds = (now - this.#lastSampleMs) / MS_PER_SECOND;

        this.#lastSampleMs = now;

        if (deltaSeconds <= 0) {
            return;
        }

        if (this.#smoothedFps === null) {
            this.#smoothedFps = this.#targetFps;
        }

        const instantFps = 1 / deltaSeconds;

        this.#smoothedFps += (instantFps - this.#smoothedFps) * FPS_SMOOTHING;
    }
}
