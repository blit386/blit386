/**
 * Palette effect system for animated color manipulation.
 *
 * Effects mutate {@link Palette} entries in place via {@link Palette.getRef}. The visual
 * change happens automatically on the next frame when the renderer detects the
 * dirty flag and re-uploads the palette uniform buffer.
 *
 * The {@link PaletteEffectManager} is called once per fixed update from the loop's
 * update callback, after `demo.update()`.
 */

import { PALETTE_EFFECT_SLOT_ZERO_MESSAGE } from '../utils/errorMessages';
import type { Palette } from './Palette';
import { TRANSPARENT_PALETTE_INDEX } from './Palette';

// The effect classes live one per file; re-exported so importers keep one entry point.
export { CycleEffect } from './CycleEffect';
export { ExposureFadeEffect, type ExposureFadeOptions } from './ExposureFadeEffect';
export { FadeEffect } from './FadeEffect';
export { FadeRangeEffect } from './FadeRangeEffect';
export { FlashEffect } from './FlashEffect';

/**
 * A single palette effect that runs over time.
 *
 * The manager calls {@link update} once per fixed update. The effect mutates palette
 * entries via `palette.getRef()` and returns `true` to keep running or `false`
 * to signal completion (the manager removes it automatically).
 *
 * An implementation **must** call {@link Palette.markDirty} itself on every tick
 * where it actually mutates an entry (including the terminal tick that lands on
 * a final value), and must not call it on a tick that leaves the palette
 * unchanged. The manager no longer marks the palette dirty on an effect's
 * behalf, so a tick that mutates without calling `markDirty` silently skips the
 * next GPU upload.
 */
export interface PaletteEffect {
    /**
     * Advances the effect by one update.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Milliseconds since the previous update. The engine updates palette effects once per fixed tick on its tick clock.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean;
}

/**
 * Manages active palette effects and updates them once per fixed update.
 *
 * Tracks time through an injectable provider so the {@link GameLoop} callback signatures remain unchanged. The engine
 * passes its tick clock (`ticks * 1000 / targetFPS`), which is what makes palette effects seekable by `BT.renderAt`.
 */
export class PaletteEffectManager {
    /** Active effects managed by this instance. */
    private effects: PaletteEffect[] = [];

    /** Provider time of the previous update, or of the add that woke the manager from idle. */
    private lastTime = 0;

    /** Clock function returning milliseconds. */
    private readonly timeProvider: () => number;

    /**
     * Creates a new effect manager.
     *
     * @param timeProvider - Clock function returning milliseconds. The engine passes its tick clock
     *   (`ticks * 1000 / targetFPS`); the splash passes its own wall clock; tests pass a fake clock.
     */
    constructor(timeProvider: () => number) {
        this.timeProvider = timeProvider;
    }

    /**
     * Number of currently running effects.
     *
     * @returns Count of active effects in the manager.
     */
    get activeCount(): number {
        return this.effects.length;
    }

    /**
     * Adds an effect to the active list.
     *
     * @param effect - Effect instance to run once per fixed update.
     */
    add(effect: PaletteEffect): void {
        // Waking from idle starts the clock now, so the first update sees only the time since the
        // effect was added. No sentinel value: the engine's tick clock really does read 0 at boot.
        if (this.effects.length === 0) {
            this.lastTime = this.timeProvider();
        }

        this.effects.push(effect);
    }

    /**
     * Updates all active effects and removes completed ones.
     *
     * Call this once per fixed update. Completed effects (returning `false`) are pruned
     * in place without allocating a new array.
     *
     * @param palette - Active palette to pass to each effect.
     */
    update(palette: Palette): void {
        const now = this.timeProvider();
        // Clamped: a clock that moved backwards (BT.ticksReset() mid-effect) must not run effects in reverse.
        const deltaMs = Math.max(0, now - this.lastTime);

        this.lastTime = now;

        if (this.effects.length > 0) {
            // In-place compaction: keep running effects, drop completed ones. Each
            // effect calls palette.markDirty() itself on ticks where it actually
            // mutates, so the manager does not mark dirty unconditionally here.
            let writeIdx = 0;

            for (let i = 0; i < this.effects.length; i++) {
                // eslint-disable-next-line security/detect-object-injection -- Safe: i is a controlled loop index within bounds
                const effect = this.effects[i];

                if (effect?.update(palette, deltaMs)) {
                    // eslint-disable-next-line security/detect-object-injection -- Safe: writeIdx <= i, always within bounds
                    this.effects[writeIdx] = effect;
                    writeIdx++;
                }
            }

            this.effects.length = writeIdx;
        }
    }

    /** Removes all active effects immediately. The palette stays at its current state. */
    clear(): void {
        this.effects.length = 0;
    }
}

/**
 * Instantly exchanges two palette entries.
 *
 * This is an immediate operation, not an animated effect. It modifies the
 * palette directly and marks it dirty for the renderer.
 *
 * @param palette - Palette to modify.
 * @param indexA - First palette index.
 * @param indexB - Second palette index.
 */
export function paletteSwap(palette: Palette, indexA: number, indexB: number): void {
    // Slot 0 is the frozen transparent singleton; reject before any write so a partial swap can't corrupt the other slot.
    if (indexA === TRANSPARENT_PALETTE_INDEX || indexB === TRANSPARENT_PALETTE_INDEX) {
        throw new Error(PALETTE_EFFECT_SLOT_ZERO_MESSAGE);
    }

    if (indexA !== indexB) {
        const refA = palette.getRef(indexA);
        const refB = palette.getRef(indexB);

        const tempR = refA.r;
        const tempG = refA.g;
        const tempB = refA.b;
        const tempAlpha = refA.a;

        refA.copyFrom(refB);
        refB.setRGBA(tempR, tempG, tempB, tempAlpha);

        palette.markDirty();
    }
}
