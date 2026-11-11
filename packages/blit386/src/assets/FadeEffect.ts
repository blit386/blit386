/**
 * Full-palette fade effect behind `BT.paletteFade`.
 */

import type { Color32 } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import type { Palette } from './Palette';
import type { PaletteEffect } from './PaletteEffect';
import { applyFadeToRange, computeFadeProgress, snapshotPaletteRange } from './paletteFade';

/**
 * Smoothly interpolates all palette entries toward a target palette over time.
 *
 * Snapshots the current palette at creation. Each fixed update computes an eased
 * progress value and lerps between the snapshot and target. At completion,
 * sets entries to the exact target values to avoid floating-point drift.
 *
 * Auto-removes when the fade completes.
 */
export class FadeEffect implements PaletteEffect {
    /** Accumulated elapsed time in milliseconds. */
    private elapsed = 0;

    /** Snapshot of the starting palette colors. */
    private readonly snapshotColors: Color32[];

    /** Target palette colors to fade toward. */
    private readonly targetColors: Color32[];

    /** Number of palette entries being faded. */
    private readonly size: number;

    /**
     * Creates a full-palette fade effect.
     *
     * @param source - Snapshot of the starting palette (cloned internally).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve to apply. Defaults to `'linear'`.
     */
    constructor(
        source: Palette,
        target: Palette,
        private readonly durationMs: number,
        private readonly easing: EasingFunction = 'linear',
    ) {
        this.size = source.size;

        this.snapshotColors = snapshotPaletteRange(source, 0, this.size - 1);
        this.targetColors = snapshotPaletteRange(target, 0, target.size - 1);
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
        const count = Math.min(this.size, palette.size);

        applyFadeToRange(palette, this.snapshotColors, this.targetColors, 1, count - 1, 0, t, easedT);
        palette.markDirty();

        return isRunning;
    }
}
