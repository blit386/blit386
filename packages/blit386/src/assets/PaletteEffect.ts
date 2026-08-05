/**
 * Palette effect system for animated color manipulation.
 *
 * Effects mutate {@link Palette} entries in place via {@link Palette.getRef}. The visual
 * change happens automatically on the next frame when the renderer detects the
 * dirty flag and re-uploads the palette uniform buffer.
 *
 * The {@link PaletteEffectManager} is called once per frame from the render
 * callback, after `demo.render()` but before {@link IRenderer.endFrame}.
 */

import { clampByte, clampUnit, Color32, INV_255, linearToSrgb, srgbToLinear } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import { applyEasing } from '../utils/Easing';
import type { Palette } from './Palette';

/**
 * A single palette effect that runs over time.
 *
 * The manager calls {@link update} once per frame. The effect mutates palette
 * entries via `palette.getRef()` and returns `true` to keep running or `false`
 * to signal completion (the manager removes it automatically).
 */
export interface PaletteEffect {
    /**
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean;
}

/**
 * Manages active palette effects and updates them each frame.
 *
 * Tracks wall-clock time internally via an injectable time provider so the
 * {@link GameLoop} callback signatures remain unchanged.
 */
export class PaletteEffectManager {
    /** Active effects managed by this instance. */
    private effects: PaletteEffect[] = [];

    /** Last wall-clock time in milliseconds, used to compute delta time. */
    private lastTime = 0;

    /** Clock function returning milliseconds. */
    private readonly timeProvider: () => number;

    /**
     * Creates a new effect manager.
     *
     * @param timeProvider - Clock function returning milliseconds. Defaults to
     *   `performance.now()`. Pass a custom function for deterministic unit tests.
     */
    constructor(timeProvider: () => number = () => performance.now()) {
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
     * @param effect - Effect instance to run each frame.
     */
    add(effect: PaletteEffect): void {
        // Reset the clock when waking from idle so the first update after a gap
        // sees delta=0 instead of the entire idle duration.
        if (this.effects.length === 0) {
            this.lastTime = 0;
        }

        this.effects.push(effect);
    }

    /**
     * Updates all active effects and removes completed ones.
     *
     * Call this once per frame. Completed effects (returning `false`) are pruned
     * in place without allocating a new array.
     *
     * @param palette - Active palette to pass to each effect.
     */
    update(palette: Palette): void {
        const now = this.timeProvider();
        const deltaMs = this.lastTime === 0 ? 0 : now - this.lastTime;

        this.lastTime = now;

        if (this.effects.length > 0) {
            // In-place compaction: keep running effects, drop completed ones.
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
            palette.markDirty();
        }
    }

    /** Removes all active effects immediately. The palette stays at its current state. */
    clear(): void {
        this.effects.length = 0;
    }
}

/**
 * Rotates a range of palette entries at a constant speed.
 *
 * Classic water/fire/plasma animation. Runs indefinitely until canceled
 * via {@link PaletteEffectManager.clear}.
 *
 * Uses a fractional accumulator for sub-frame precision and a pre-allocated
 * temporary {@link Color32} to avoid per-frame allocations.
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
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        if (this.speed !== 0 && this.start < this.end) {
            // Milliseconds per second for delta-to-rate conversion in time-based effects.
            const msPerSecond = 1_000;

            this.accumulator += (this.speed * deltaMs) / msPerSecond;
            this.applyForwardSteps(palette);
            this.applyBackwardSteps(palette);
        }

        return true; // Runs indefinitely.
    }

    /**
     * Drains the forward accumulator, rotating entries toward lower indices one step at a time.
     *
     * @param palette - Palette whose entries are rotated.
     */
    private applyForwardSteps(palette: Palette): void {
        while (this.accumulator >= 1) {
            this.accumulator -= 1;
            this.rotateForward(palette);
        }
    }

    /**
     * Drains the backward accumulator, rotating entries toward higher indices one step at a time.
     *
     * @param palette - Palette whose entries are rotated.
     */
    private applyBackwardSteps(palette: Palette): void {
        while (this.accumulator <= -1) {
            this.accumulator += 1;
            this.rotateBackward(palette);
        }
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

/**
 * Snapshots a contiguous palette index range into a new array.
 *
 * @param source - Palette to read from.
 * @param start - First index (inclusive).
 * @param end - Last index (inclusive).
 * @returns Cloned colors for each index in the range.
 */
function snapshotPaletteRange(source: Palette, start: number, end: number): Color32[] {
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
function computeFadeProgress(
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
function applyFadeEntry(palette: Palette, index: number, snap: Color32, tgt: Color32, t: number, easedT: number): void {
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
function applyFadeToRange(
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

/**
 * Smoothly interpolates all palette entries toward a target palette over time.
 *
 * Snapshots the current palette at creation. Each frame computes an eased
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
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        this.elapsed += deltaMs;

        const { t, easedT, isRunning } = computeFadeProgress(this.elapsed, this.durationMs, this.easing);
        const count = Math.min(this.size, palette.size);

        applyFadeToRange(palette, this.snapshotColors, this.targetColors, 1, count - 1, 0, t, easedT);

        return isRunning;
    }
}

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
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        this.elapsed += deltaMs;

        const { t, easedT, isRunning } = computeFadeProgress(this.elapsed, this.durationMs, this.easing);

        applyFadeToRange(palette, this.snapshotColors, this.targetColors, this.start, this.end, this.start, t, easedT);

        return isRunning;
    }
}

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
 * @returns Encoded channel byte for the current frame.
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
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
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

        return isRunning;
    }
}

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
 * On the first frame, snapshots all entries and overwrites them with the flash
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
     * Advances the effect by one frame.
     *
     * @param palette - Active palette to modify.
     * @param deltaMs - Wall-clock milliseconds since the last frame.
     * @returns `true` to keep running, `false` to remove from the manager.
     */
    update(palette: Palette, deltaMs: number): boolean {
        let keepRunning = true;

        if (this.snapshotColors === null) {
            // First frame: snapshot and apply flash.
            this.snapshotColors = snapshotPaletteRange(palette, 0, palette.size - 1);
            copyColorToNonZeroSlots(palette, this.color);
        } else {
            this.elapsed += deltaMs;

            if (this.elapsed >= this.durationMs) {
                restoreNonZeroSlots(palette, this.snapshotColors);
                keepRunning = false;
            }
        }

        return keepRunning;
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
