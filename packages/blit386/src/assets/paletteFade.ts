/**
 * Fade helpers shared by the palette effects: range snapshots, eased progress, and the
 * per-entry and per-range lerp that {@link FadeEffect} and {@link FadeRangeEffect} apply.
 */

import { clampUnit, type Color32 } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import { applyEasing } from '../utils/Easing';
import type { Palette } from './Palette';

/**
 * Snapshots a contiguous palette index range into a new array.
 *
 * @param source - Palette to read from.
 * @param start - First index (inclusive).
 * @param end - Last index (inclusive).
 * @returns Cloned colors for each index in the range.
 */
export function snapshotPaletteRange(source: Palette, start: number, end: number): Color32[] {
    return Array.from({ length: end - start + 1 }, (_, index) => source.get(start + index));
}

/**
 * Computes normalized and eased fade progress for the current elapsed time.
 *
 * @param elapsed - Elapsed fade time in milliseconds.
 * @param durationMs - Total fade duration in milliseconds.
 * @param easing - Easing curve to apply.
 * @returns Normalized `t`, eased factor, and whether the fade is still running.
 */
export function computeFadeProgress(
    elapsed: number,
    durationMs: number,
    easing: EasingFunction,
): { t: number; easedT: number; isRunning: boolean } {
    const rawT = durationMs <= 0 ? 1 : elapsed / durationMs;
    const t = clampUnit(rawT);
    const easedT = applyEasing(t, easing);

    return { t, easedT, isRunning: t < 1 };
}

/**
 * Applies one fade step to a single palette entry.
 *
 * @param palette - Active palette to modify.
 * @param index - Palette index to update.
 * @param snap - Snapshot color at fade start.
 * @param tgt - Target color at fade end.
 * @param t - Normalized progress in [0, 1].
 * @param easedT - Eased progress factor.
 */
export function applyFadeEntry(
    palette: Palette,
    index: number,
    snap: Color32,
    tgt: Color32,
    t: number,
    easedT: number,
): void {
    if (t >= 1) {
        palette.getRef(index).copyFrom(tgt);
    } else {
        palette.getRef(index).copyFrom(snap).lerpInPlace(tgt, easedT);
    }
}

/**
 * Applies one fade step to a contiguous sub-range of palette entries.
 *
 * Both {@link FadeEffect} and {@link FadeRangeEffect} use this helper.
 * Snapshot arrays use zero-based local indices; `offset` maps them to palette
 * indices: `snapshot[i - offset]` corresponds to palette entry `i`.
 *
 * @param palette - Active palette to modify.
 * @param snapshot - Snapshot colors indexed from `0`.
 * @param targets - Target colors indexed from `0`.
 * @param from - First palette index to update (inclusive).
 * @param to - Last palette index to update (inclusive).
 * @param offset - Value subtracted from a palette index to get the snapshot array index.
 * @param t - Normalized progress in [0, 1].
 * @param easedT - Eased progress factor.
 */
export function applyFadeToRange(
    palette: Palette,
    snapshot: Color32[],
    targets: Color32[],
    from: number,
    to: number,
    offset: number,
    t: number,
    easedT: number,
): void {
    for (let i = from; i <= to; i++) {
        const localIdx = i - offset;

        // eslint-disable-next-line security/detect-object-injection -- localIdx derived from loop bounds
        const snap = snapshot[localIdx];
        // eslint-disable-next-line security/detect-object-injection -- localIdx derived from loop bounds
        const tgt = targets[localIdx];

        if (!snap || !tgt) {
            continue;
        }

        applyFadeEntry(palette, i, snap, tgt, t, easedT);
    }
}
