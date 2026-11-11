/**
 * Palette cycling effect behind `BT.paletteCycle`.
 */

import { Color32 } from '../utils/Color32';
import type { Palette } from './Palette';
import type { PaletteEffect } from './PaletteEffect';

/**
 * Rotates a range of palette entries at a constant speed.
 *
 * Classic water/fire/plasma animation. Runs indefinitely until canceled
 * via {@link PaletteEffectManager.clear}.
 *
 * Uses a fractional accumulator for sub-step precision and a pre-allocated
 * temporary {@link Color32} to avoid per-update allocations.
 */
export class CycleEffect implements PaletteEffect {
    /** Accumulator for tracking the cycling progress. */
    private accumulator = 0;

    /** Temporary {@link Color32} used for color calculations. */
    private readonly temp = new Color32(0, 0, 0, 0);

    /**
     * Creates a palette cycling effect.
     *
     * @param start - First palette index in the cycling range (inclusive).
     * @param end - Last palette index in the cycling range (inclusive).
     * @param speed - Steps per second. Positive = forward, negative = backward.
     */
    constructor(
        /** First palette index in the cycling range (inclusive). */
        private readonly start: number,

        /** Last palette index in the cycling range (inclusive). */
        private readonly end: number,

        /** Steps per second. Positive = forward, negative = backward. */
        private readonly speed: number,
    ) {}

    /**
     * Advances the effect by one update.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Milliseconds since the previous update. The engine updates palette effects once per fixed tick on its tick clock.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        if (this.speed !== 0 && this.start < this.end) {
            // Milliseconds per second for delta-to-rate conversion in time-based effects.
            const msPerSecond = 1_000;

            this.accumulator += (this.speed * deltaMs) / msPerSecond;

            // Only whole steps mutate the palette; a slow cycle spends most ticks accumulating.
            const steps = Math.trunc(this.accumulator);

            this.accumulator -= steps;

            // Whole turns of the range change nothing, so a huge speed costs at most one turn per tick.
            // shortcut: a speed past ~1e307 overflows the accumulator to NaN and the cycle stops; no caller gets near it.
            const netSteps = steps % (this.end - this.start + 1);

            for (let i = 0; i < Math.abs(netSteps); i++) {
                if (netSteps > 0) {
                    this.rotateForward(palette);
                } else {
                    this.rotateBackward(palette);
                }
            }

            if (netSteps !== 0) {
                palette.markDirty();
            }
        }

        return true; // Runs indefinitely.
    }

    /**
     * Shifts entries toward lower indices, wrapping the first entry to the end.
     *
     * @param palette - Palette whose entries are rotated.
     */
    private rotateForward(palette: Palette): void {
        this.temp.copyFrom(palette.getRef(this.start));

        for (let i = this.start; i < this.end; i++) {
            palette.getRef(i).copyFrom(palette.getRef(i + 1));
        }

        palette.getRef(this.end).copyFrom(this.temp);
    }

    /**
     * Shifts entries toward higher indices, wrapping the last entry to the start.
     *
     * @param palette - Palette whose entries are rotated.
     */
    private rotateBackward(palette: Palette): void {
        this.temp.copyFrom(palette.getRef(this.end));

        for (let i = this.end; i > this.start; i--) {
            palette.getRef(i).copyFrom(palette.getRef(i - 1));
        }

        palette.getRef(this.start).copyFrom(this.temp);
    }
}
