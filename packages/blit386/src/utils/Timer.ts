import { BTAPI } from '../core/BTAPI';

/**
 * Fixed-tick interval helper for {@link IBTDemo.update} loops.
 *
 * Counts engine ticks ({@link BT.ticks}), which advance once per fixed update at
 * {@link HardwareSettings.targetFPS}, not once per {@link IBTDemo.render} frame.
 * Convert ticks to seconds with `intervalTicks / BT.targetFPS`.
 *
 * Tracks a "last fired" tick and reports when a configured interval has elapsed.
 * Useful for periodic events such as particle spawning, score ticks, or palette swaps.
 *
 * @since 1.0.3
 */
export class Timer {
    /** Interval size in ticks. */
    public readonly intervalTicks: number;

    /** Tick when this timer last fired (or was reset). */
    private lastFiredTick: number;

    /**
     * Creates a timer that fires once per fixed-tick interval.
     *
     * @param intervalTicks – Number of ticks required between firings; must be a positive integer.
     */
    public constructor(intervalTicks: number) {
        if (!Number.isInteger(intervalTicks) || intervalTicks <= 0) {
            throw new RangeError('Timer intervalTicks must be a positive integer.');
        }

        this.intervalTicks = intervalTicks;
        this.lastFiredTick = BTAPI.instance.getTicks();
    }

    /**
     * Returns true once per interval and advances the internal last-fired tick.
     *
     * @param currentTick – Tick to evaluate against; defaults to engine tick counter.
     * @returns True when at least `intervalTicks` have elapsed since the last fire/reset.
     */
    public fireIfElapsed(currentTick: number = BTAPI.instance.getTicks()): boolean {
        if (currentTick < this.lastFiredTick) {
            this.lastFiredTick = currentTick;
            return false;
        }

        if (this.elapsedTicks(currentTick) < this.intervalTicks) {
            return false;
        }

        this.lastFiredTick = currentTick;
        return true;
    }

    /**
     * Backward-compatible alias for {@link fireIfElapsed}.
     *
     * @deprecated Deprecated since 1.0.3 (2026-05-31). Use {@link fireIfElapsed} instead.
     * @param currentTick – Tick to evaluate against; defaults to engine tick counter.
     * @returns True when at least `intervalTicks` have elapsed since the last fire/reset.
     */
    public tick(currentTick: number = BTAPI.instance.getTicks()): boolean {
        return this.fireIfElapsed(currentTick);
    }

    /**
     * Resets the timer baseline to a tick value.
     *
     * @param currentTick – Tick to reset against; defaults to engine tick counter.
     */
    public reset(currentTick: number = BTAPI.instance.getTicks()): void {
        this.lastFiredTick = currentTick;
    }

    /**
     * Returns ticks elapsed since this timer last fired or reset.
     *
     * @param currentTick – Tick to compare against; defaults to engine tick counter.
     * @returns Number of elapsed ticks.
     */
    public elapsedTicks(currentTick: number = BTAPI.instance.getTicks()): number {
        return Math.max(0, currentTick - this.lastFiredTick);
    }

    /**
     * Returns ticks remaining until the timer will fire.
     *
     * @param currentTick – Tick to compare against; defaults to engine tick counter.
     * @returns Remaining ticks in `[0, intervalTicks]`.
     */
    public remainingTicks(currentTick: number = BTAPI.instance.getTicks()): number {
        return Math.min(this.intervalTicks, Math.max(0, this.intervalTicks - this.elapsedTicks(currentTick)));
    }
}
