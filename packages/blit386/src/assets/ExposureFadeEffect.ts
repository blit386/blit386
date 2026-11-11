/**
 * Linear-light exposure fade behind `BT.paletteFadeExposure`.
 */

import type { Color32 } from '../utils/Color32';
import { clampByte, clampUnit, INV_255, linearToSrgb, srgbToLinear } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import type { Palette } from './Palette';
import type { PaletteEffect } from './PaletteEffect';
import { computeFadeProgress, snapshotPaletteRange } from './paletteFade';

/**
 * Options for {@link ExposureFadeEffect}.
 *
 * @since 1.5.0
 */
export interface ExposureFadeOptions {
    /**
     * How far ahead of the schedule a fully lit entry runs, in range 0-1.
     *
     * `0` is a plain linear-light fade - every entry on the same schedule. Higher
     * values push bright entries further ahead on the way up and further behind on
     * the way down. Defaults to `0.5`. Values outside the range are clamped;
     * anything at or above the cap is held just below `1` so the schedule stays
     * divisible.
     */
    highlightLead?: number;

    /** Easing curve applied to the global schedule. Defaults to `'linear'`. */
    easing?: EasingFunction;
}

/**
 * Default per-entry timing offset for {@link ExposureFadeEffect}.
 *
 * Strong enough to read as an iris pull rather than a crossfade, gentle enough
 * that a mid-tone entry does not visibly stall at the start of a fade-in.
 */
const DEFAULT_HIGHLIGHT_LEAD = 0.5;

/**
 * Largest per-entry timing offset allowed.
 *
 * The schedule divides by `1 - lead`, so the offset has to stay strictly below 1.
 * Capping here means a caller can pass `1` (or `Infinity`) and get the most
 * extreme usable curve instead of a palette full of `NaN`.
 */
const MAX_HIGHLIGHT_LEAD = 0.95;

/**
 * Clamps a caller-supplied highlight lead into the usable range.
 *
 * @param value - Raw option value, possibly missing or out of range.
 * @returns Offset in range [0, {@link MAX_HIGHLIGHT_LEAD}].
 */
function resolveHighlightLead(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) {
        return DEFAULT_HIGHLIGHT_LEAD;
    }

    return value < 0 ? 0 : value > MAX_HIGHLIGHT_LEAD ? MAX_HIGHLIGHT_LEAD : value;
}

/**
 * Computes the schedule offset for one palette entry.
 *
 * The offset stands in for exposure headroom, which a palette engine does not
 * have: 255 is the ceiling, so a bright entry cannot sit above diffuse white and
 * clip through the first stops of an iris pull. Shifting its schedule instead
 * produces the same read - bright entries rise first and fall last, dark entries
 * come in late and crush early.
 *
 * The entry's own lit brightness drives the offset, and the direction of travel
 * decides which way it points, so a fade-out mirrors a fade-in rather than
 * inverting it.
 *
 * @param snap - Entry color at fade start.
 * @param target - Entry color at fade end.
 * @param highlightLead - Resolved offset scale in range [0, 1).
 * @returns Offset subtracted from the global schedule for this entry.
 */
function entryLead(snap: Color32, target: Color32, highlightLead: number): number {
    const sourceLuminance = snap.luminance * INV_255;
    const targetLuminance = target.luminance * INV_255;

    // Rising entries are timed off where they end up, falling entries off where
    // they started - either way it is the lit end that gets the headroom.
    const isRising = targetLuminance >= sourceLuminance;
    const litLuminance = isRising ? targetLuminance : sourceLuminance;

    return highlightLead * (isRising ? 1 - litLuminance : litLuminance);
}

/**
 * Interpolates one channel through linear light and re-encodes the result.
 *
 * @param from - Encoded channel byte at fade start.
 * @param to - Encoded channel byte at fade end.
 * @param tc - Per-entry progress in range [0, 1].
 * @returns Encoded channel byte at progress `tc`.
 */
function exposeChannel(from: number, to: number, tc: number): number {
    const fromLinear = srgbToLinear(from * INV_255);
    const toLinear = srgbToLinear(to * INV_255);
    const lit = fromLinear + (toLinear - fromLinear) * tc;

    return clampByte(Math.round(linearToSrgb(lit) * 255));
}

/**
 * Applies one exposure-fade step to a single palette entry.
 *
 * @param palette - Active palette to modify.
 * @param index - Palette index to update.
 * @param snap - Snapshot color at fade start.
 * @param tgt - Target color at fade end.
 * @param t - Normalized progress in [0, 1].
 * @param easedT - Eased global progress factor.
 * @param highlightLead - Resolved offset scale in range [0, 1).
 */
function applyExposureEntry(
    palette: Palette,
    index: number,
    snap: Color32,
    tgt: Color32,
    t: number,
    easedT: number,
    highlightLead: number,
): void {
    if (t >= 1) {
        palette.getRef(index).copyFrom(tgt);

        return;
    }

    const lead = entryLead(snap, tgt, highlightLead);
    const tc = clampUnit((easedT - lead) / (1 - lead));

    // Alpha is coverage, not light, so it stays on the encoded schedule.
    const alpha = clampByte(Math.round(snap.a + (tgt.a - snap.a) * tc));

    palette
        .getRef(index)
        .setRGBAUnchecked(
            exposeChannel(snap.r, tgt.r, tc),
            exposeChannel(snap.g, tgt.g, tc),
            exposeChannel(snap.b, tgt.b, tc),
            alpha,
        );
}

/**
 * Fades all palette entries toward a target the way an iris pull does.
 *
 * {@link FadeEffect} interpolates encoded sRGB values, which is a post-production
 * crossfade: every entry drops by the same proportion for the whole fade and the
 * image sags uniformly into gray. This effect interpolates each RGB channel in
 * linear light instead, and gives each entry a luminance-derived timing offset,
 * so bright entries come up first and hold on longest while dark entries arrive
 * late and crush early.
 *
 * With black at one end of the fade, which is the usual case, interpolating in
 * linear light is exactly scaling light up or down, the way an iris does.
 *
 * Every entry still reaches `tc = 1` at `t = 1`, so the fade lands exactly on the
 * target palette with no drift.
 *
 * Note this is a per-index effect, not a per-pixel one: a dark object in a bright
 * scene fades on the dark schedule regardless of what surrounds it, because the
 * engine only knows its palette slot. For a fade up from black that reads fine.
 *
 * Entries past the end of `target` are left alone, so a smaller target palette
 * scopes the fade to its own slots and another effect can own the rest.
 *
 * Auto-removes when the fade completes.
 *
 * @since 1.5.0
 */
export class ExposureFadeEffect implements PaletteEffect {
    /** Accumulated elapsed time in milliseconds. */
    private elapsed = 0;

    /** Snapshot of the starting palette colors. */
    private readonly snapshotColors: Color32[];

    /** Target palette colors to fade toward. */
    private readonly targetColors: Color32[];

    /** Number of palette entries being faded. */
    private readonly size: number;

    /** Resolved per-entry timing offset in range [0, 1). */
    private readonly highlightLead: number;

    /** Easing curve applied to the global schedule. */
    private readonly easing: EasingFunction;

    /**
     * Creates a full-palette exposure fade.
     *
     * @param source - Snapshot of the starting palette (cloned internally).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param options - Highlight lead and easing curve.
     */
    constructor(
        source: Palette,
        target: Palette,
        private readonly durationMs: number,
        options: ExposureFadeOptions = {},
    ) {
        this.size = source.size;
        this.highlightLead = resolveHighlightLead(options.highlightLead);
        this.easing = options.easing ?? 'linear';

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

        for (let i = 1; i < count; i++) {
            // eslint-disable-next-line security/detect-object-injection -- i derived from loop bounds
            const snap = this.snapshotColors[i];
            // eslint-disable-next-line security/detect-object-injection -- i derived from loop bounds
            const tgt = this.targetColors[i];

            if (snap && tgt) {
                applyExposureEntry(palette, i, snap, tgt, t, easedT, this.highlightLead);
            }
        }

        palette.markDirty();

        return isRunning;
    }
}
