/**
 * Palette range fade effect behind `BT.paletteFadeRange`.
 */

import type { Color32 } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import type { Palette } from './Palette';
import type { PaletteEffect } from './PaletteEffect';
import { applyFadeToRange, computeFadeProgress, snapshotPaletteRange } from './paletteFade';

/**
 * Fades only a subset of palette indices toward a target palette.
 *
 * Identical to {@link FadeEffect} but restricted to the range `[start, end]`.
 * Auto-removes when the fade completes.
 */
export class FadeRangeEffect implements PaletteEffect {
    /** Accumulated elapsed time in milliseconds. */
    private elapsed = 0;

    /** Snapshot of the starting palette colors. */
    private readonly snapshotColors: Color32[];

    /** Target palette colors to fade toward. */
    private readonly targetColors: Color32[];

    /**
     * Creates a range-limited fade effect.
     *
     * @param start - First palette index to fade (inclusive).
     * @param end - Last palette index to fade (inclusive).
     * @param source - Snapshot of the starting palette (cloned internally).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve to apply. Defaults to `'linear'`.
     */
    constructor(
        private readonly start: number,
        private readonly end: number,
        source: Palette,
        target: Palette,
        private readonly durationMs: number,
        private readonly easing: EasingFunction = 'linear',
    ) {
        this.snapshotColors = snapshotPaletteRange(source, start, end);
        this.targetColors = snapshotPaletteRange(target, start, end);
    }

    /**
     * Advances the effect by one update.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Milliseconds since the previous update. The engine updates palette effects once per fixed tick on its tick clock.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        this.elapsed += deltaMs;

        const { t, easedT, isRunning } = computeFadeProgress(this.elapsed, this.durationMs, this.easing);

        applyFadeToRange(palette, this.snapshotColors, this.targetColors, this.start, this.end, this.start, t, easedT);
        palette.markDirty();

        return isRunning;
    }
}
