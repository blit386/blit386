/**
 * Information passed to a {@link GameLoop} dropped-frame callback.
 *
 * Emitted when the time between consecutive `requestAnimationFrame` callbacks
 * exceeds the auto-calibrated baseline, indicating the browser missed one or
 * more vsync deadlines.
 */
export interface FrameDropEvent {
    /**
     * Estimated number of refresh intervals skipped.
     *
     * Computed as `round(deltaTime / expectedInterval) - 1`, clamped to a
     * minimum of 1.
     */
    readonly droppedFrames: number;

    /** Actual time between rAF callbacks, in milliseconds. */
    readonly deltaTime: number;

    /**
     * Auto-calibrated baseline interval, in milliseconds. The shortest rAF
     * delta observed in the rolling window, which approximates the browser's
     * actual vsync interval (so detection works on 60 Hz, 120 Hz, 144 Hz,
     * etc., regardless of the configured `targetFPS`).
     */
    readonly expectedInterval: number;
}

/**
 * Callback invoked once per frame whose delta exceeded the drop threshold.
 *
 * Called from inside the rAF handler on the same frame the drop is detected.
 * Keep the callback cheap; coalescing/rate-limiting is the caller's responsibility.
 *
 * @param event - Details of the detected drop.
 */
export type FrameDropCallback = (event: FrameDropEvent) => void;

/**
 * Fixed-timestep game loop with variable-rate rendering.
 *
 * Implements the accumulator pattern to ensure update() runs at a deterministic
 * rate regardless of frame timing irregularities. render() runs at the browser's
 * native refresh rate.
 * The accumulator prevents a spiral-of-death catch-up burst by capping the
 * number of fixed updates processed in a single frame.
 *
 * Optionally detects dropped frames by comparing each rAF delta against an
 * auto-calibrated baseline. The baseline is the shortest delta observed in a
 * rolling window of recent frames, which tracks the browser's actual vsync
 * interval (so detection works for any display refresh rate, including the
 * common Firefox case where rAF fires at the display's native rate rather
 * than at `targetFPS`). When the delta exceeds 1.5x the auto-calibrated
 * baseline (see `DROP_THRESHOLD_MULTIPLIER`) and is shorter than 1000 ms
 * (see `BACKGROUND_THRESHOLD_MS`) to filter out tab-switch pauses, the
 * supplied callback is invoked.
 */
export class GameLoop {
    /** Maximum update steps per frame to prevent spiral-of-death after long pauses. */
    private static readonly MAX_STEPS = 8;

    /**
     * Frame must be at least this many times the auto-calibrated baseline to
     * be reported as a drop. 1.5x corresponds to a missed vsync deadline.
     */
    private static readonly DROP_THRESHOLD_MULTIPLIER = 1.5;

    /**
     * Gaps longer than this (in ms) are filtered out as likely tab-switch or
     * page-visibility pauses, which would otherwise generate huge spurious drops.
     */
    private static readonly BACKGROUND_THRESHOLD_MS = 1000;

    /** Number of recent rAF deltas retained when computing the rolling baseline. */
    private static readonly BASELINE_WINDOW = 60;

    /**
     * Tolerance, in milliseconds, for snapping a rAF delta onto the nearest exact
     * multiple of {@link updateInterval} before it is added to the accumulator.
     *
     * Browsers coarsen `performance.now()` resolution (commonly to ~1 ms, as a
     * Spectre-era timing-attack mitigation), so a display genuinely refreshing at the
     * target rate on average still reports deltas like 16 and 17 ms rather than a
     * clean 16.667 ms. Left uncorrected, that rounding noise walks the accumulator's
     * phase back and forth across a step boundary, producing a deterministic
     * "extra step, then a stalled frame" beat (for example 2, 0, 1, 2, 0, 1, ...)
     * instead of a steady one-step-per-frame cadence - visible as camera/scroll
     * jitter even though the true average frame rate matches the target exactly.
     * 2 ms comfortably covers that rounding noise while staying far below
     * {@link DROP_THRESHOLD_MULTIPLIER}'s much larger gap, so a genuine dropped frame
     * is never masked.
     */
    private static readonly SNAP_EPSILON_MS = 2;

    /**
     * Minimum samples required before the baseline is trusted enough to drive
     * detection. Avoids false positives during page-load warm-up where a few
     * rAF callbacks may fire with unusual cadence.
     */
    private static readonly BASELINE_WARMUP_SAMPLES = 8;

    /** Whether the loop is currently running. */
    private isRunning: boolean = false;

    /** Current tick count (increments once per fixed update call). */
    private ticks: number = 0;

    /** Timestamp of the last frame, in milliseconds. */
    private lastUpdateTime: number = 0;

    /** Accumulated time waiting to be consumed by fixed updates. */
    private accumulator: number = 0;

    /** Update interval in milliseconds (1000 / targetFPS). */
    private readonly updateInterval: number;

    /** Callback invoked once per fixed update step. */
    private readonly onUpdate: () => void;

    /** Callback invoked once per rendered frame. */
    private readonly onRender: () => void;

    /** Optional callback invoked when a dropped frame is detected. */
    private readonly onFrameDrop: FrameDropCallback | null;

    /**
     * Ring buffer of recent rAF deltas, in milliseconds. Pre-allocated to
     * {@link BASELINE_WINDOW} so writes are O(1) and no allocation occurs on
     * the hot path. The shortest sample approximates the browser's actual
     * vsync interval and is used as the baseline for drop detection.
     */
    private readonly recentDeltas: number[] = new Array<number>(GameLoop.BASELINE_WINDOW).fill(0);

    /** Next write index in {@link recentDeltas}; advances modulo BASELINE_WINDOW. */
    private deltaHead: number = 0;

    /** Number of valid samples in {@link recentDeltas}; saturates at BASELINE_WINDOW. */
    private deltaCount: number = 0;

    /**
     * Creates a new GameLoop.
     *
     * @param updateInterval - Milliseconds between fixed update steps (1000 / targetFPS).
     * @param onUpdate - Called once per fixed update step at the target rate.
     * @param onRender - Called once per rendered frame at the browser's refresh rate.
     * @param onFrameDrop - Optional callback invoked when a dropped frame is detected.
     * @throws {Error} If updateInterval is not a finite positive number.
     */
    constructor(updateInterval: number, onUpdate: () => void, onRender: () => void, onFrameDrop?: FrameDropCallback) {
        if (!Number.isFinite(updateInterval) || updateInterval <= 0) {
            throw new Error(`GameLoop updateInterval must be a finite positive number, got: ${updateInterval}`);
        }

        this.updateInterval = updateInterval;
        this.onUpdate = onUpdate;
        this.onRender = onRender;
        this.onFrameDrop = onFrameDrop ?? null;
    }

    /**
     * Starts the loop.
     *
     * Uses a double `requestAnimationFrame` delay before the first tick, so the
     * surrounding rendering surface is fully ready before timing begins.
     */
    public start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.lastUpdateTime = performance.now();

                requestAnimationFrame((t) => this.tick(t));
            });
        });
    }

    /**
     * Stops the loop.
     * The current frame, if already running, is allowed to finish.
     */
    public stop(): void {
        this.isRunning = false;
    }

    /**
     * Gets the current tick count.
     * Ticks increment once per fixed update step.
     *
     * @returns Number of update ticks since the loop started or since the last reset.
     */
    public getTicks(): number {
        return this.ticks;
    }

    /**
     * Resets the tick counter to zero.
     */
    public resetTicks(): void {
        this.ticks = 0;
    }

    /**
     * Processes one animation frame.
     *
     * Advances the accumulator, runs zero or more fixed updates, renders once,
     * and schedules the next frame while the loop remains active.
     *
     * @param currentTime - High-resolution timestamp provided by rAF, in milliseconds.
     */
    private tick(currentTime: number): void {
        if (!this.isRunning) {
            return;
        }

        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;

        this.detectFrameDrop(deltaTime);

        this.accumulator += this.snapDeltaTime(deltaTime);

        const maxAccumulator = this.updateInterval * GameLoop.MAX_STEPS;

        if (this.accumulator > maxAccumulator) {
            this.accumulator = maxAccumulator;
        }

        // Fixed update loop (capped at MAX_STEPS per frame).
        const steps = Math.min(Math.floor(this.accumulator / this.updateInterval), GameLoop.MAX_STEPS);

        for (let i = 0; i < steps; i++) {
            this.onUpdate();
            this.ticks++;
        }

        this.accumulator -= steps * this.updateInterval;

        this.onRender();

        requestAnimationFrame((t) => this.tick(t));
    }

    /**
     * Corrects rAF timer coarsening by snapping a delta that already lands close to an
     * exact multiple of {@link updateInterval} onto that multiple.
     *
     * @param deltaTime - Raw milliseconds between the current and previous rAF callback.
     * @returns `deltaTime`, or the nearest update-interval multiple when within {@link SNAP_EPSILON_MS} of it.
     */
    private snapDeltaTime(deltaTime: number): number {
        const nearestMultiple = Math.round(deltaTime / this.updateInterval) * this.updateInterval;

        return Math.abs(deltaTime - nearestMultiple) <= GameLoop.SNAP_EPSILON_MS ? nearestMultiple : deltaTime;
    }

    /**
     * Reports a dropped-frame event when the rAF gap exceeds the auto-calibrated baseline.
     *
     * The baseline is the shortest rAF delta observed in a rolling window of
     * recent frames, which approximates the browser's actual vsync interval.
     * This makes detection work regardless of display refresh rate or how the
     * configured `targetFPS` relates to it.
     *
     * Skips reporting when:
     * - no callback was supplied
     * - the gap looks like a tab-switch / page-visibility pause (>= 1000 ms)
     * - the warm-up window has not yet collected enough samples
     * - the gap is within normal jitter of the baseline
     *
     * Background-pause gaps are also excluded from the rolling sample set so
     * they cannot pollute the baseline.
     *
     * @param deltaTime - Milliseconds elapsed since the previous tick.
     */
    private detectFrameDrop(deltaTime: number): void {
        if (!this.onFrameDrop) {
            return;
        }

        // Tab-switch / huge gap: skip detection AND skip the rolling window so
        // the baseline stays representative of real frames.
        if (deltaTime >= GameLoop.BACKGROUND_THRESHOLD_MS) {
            return;
        }

        // Ring-buffer write: O(1) overwrite of the oldest slot.
        this.recentDeltas[this.deltaHead] = deltaTime;
        this.deltaHead = (this.deltaHead + 1) % GameLoop.BASELINE_WINDOW;

        if (this.deltaCount < GameLoop.BASELINE_WINDOW) {
            this.deltaCount++;
        }

        // Wait until enough samples have accumulated to trust the baseline.
        if (this.deltaCount < GameLoop.BASELINE_WARMUP_SAMPLES) {
            return;
        }

        // Baseline = shortest recent delta. Robust to slow frames since drops
        // can only stretch deltas, never shorten them.
        let baseline = Number.POSITIVE_INFINITY;
        let seen = 0;

        for (const sample of this.recentDeltas) {
            if (seen >= this.deltaCount) {
                break;
            }

            if (sample < baseline) {
                baseline = sample;
            }

            seen++;
        }

        if (deltaTime <= baseline * GameLoop.DROP_THRESHOLD_MULTIPLIER) {
            return;
        }

        const droppedFrames = Math.max(1, Math.round(deltaTime / baseline) - 1);

        this.onFrameDrop({
            droppedFrames,
            deltaTime,
            expectedInterval: baseline,
        });
    }
}
