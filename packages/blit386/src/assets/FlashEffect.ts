/**
 * Whole-palette flash effect behind `BT.paletteFlash`.
 */

import type { Color32 } from '../utils/Color32';
import type { Palette } from './Palette';
import type { PaletteEffect } from './PaletteEffect';
import { snapshotPaletteRange } from './paletteFade';

/**
 * Copies `color` into every palette slot except the transparent sentinel at index 0.
 *
 * @param palette - Active palette to modify.
 * @param color - Flash color applied to all palette slots except index 0 (transparent sentinel).
 */
function copyColorToNonZeroSlots(palette: Palette, color: Color32): void {
    for (let i = 1; i < palette.size; i++) {
        palette.getRef(i).copyFrom(color);
    }
}

/**
 * Restores palette slots 1..size-1 from a full-range snapshot array.
 *
 * @param palette - Active palette to modify.
 * @param snapshot - Colors captured before the flash (index-aligned).
 */
function restoreNonZeroSlots(palette: Palette, snapshot: Color32[]): void {
    for (let i = 1; i < palette.size; i++) {
        // eslint-disable-next-line security/detect-object-injection -- Loop index within validated snapshot bounds
        const saved = snapshot[i];

        if (saved) {
            palette.getRef(i).copyFrom(saved);
        }
    }
}

/**
 * Temporarily sets all palette entries to a single color, then restores.
 *
 * On its first update, snapshots all entries and overwrites them with the flash
 * color (index 0 is preserved as transparent). After the duration elapses,
 * restores the snapshot and auto-removes.
 */
export class FlashEffect implements PaletteEffect {
    /** Accumulated elapsed time in milliseconds. */
    private elapsed = 0;

    /** Snapshot of palette colors before flash. */
    private snapshotColors: Color32[] | null = null;

    /**
     * Creates a palette flash effect.
     *
     * @param color - Flash color applied to all palette slots except index 0 (transparent sentinel).
     * @param durationMs - How long the flash lasts in milliseconds.
     */
    constructor(
        private readonly color: Color32,
        private readonly durationMs: number,
    ) {}

    /**
     * Advances the effect by one update.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Milliseconds since the previous update. The engine updates palette effects once per fixed tick on its tick clock.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        let keepRunning = true;

        if (this.snapshotColors === null) {
            // First update: snapshot and apply flash.
            this.snapshotColors = snapshotPaletteRange(palette, 0, palette.size - 1);
            copyColorToNonZeroSlots(palette, this.color);
            palette.markDirty();
        } else {
            this.elapsed += deltaMs;

            if (this.elapsed >= this.durationMs) {
                restoreNonZeroSlots(palette, this.snapshotColors);
                palette.markDirty();
                keepRunning = false;
            }
            // Otherwise still holding the flash color: nothing changed this tick.
        }

        return keepRunning;
    }
}
