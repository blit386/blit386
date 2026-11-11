/**
 * The active palette and its effects: `BT.paletteSet` / `BT.palette`, the `BT.palette*` effect methods,
 * `BT.spritesRefresh`, and the capture that holds a game's palette back while the splash owns the screen.
 * Part of {@link BTAPI}; not part of the BT API.
 */

import type { Palette } from '../../assets/Palette';
import { TRANSPARENT_PALETTE_INDEX } from '../../assets/Palette';
import {
    CycleEffect,
    ExposureFadeEffect,
    type ExposureFadeOptions,
    FadeEffect,
    FadeRangeEffect,
    FlashEffect,
    paletteSwap,
} from '../../assets/PaletteEffect';
import { getIndexedSheets } from '../../assets/SpriteSheet';
import { createBlackened, HANDOFF_FADE_MS } from '../../splash';
import { Color32 } from '../../utils/Color32';
import type { EasingFunction } from '../../utils/Easing';
import {
    NO_ACTIVE_PALETTE_MESSAGE,
    PALETTE_EFFECT_SLOT_ZERO_MESSAGE,
    paletteEffectEndOutOfRangeError,
    paletteEffectRangeOrderError,
    paletteFlashColorError,
} from '../../utils/errorMessages';
import type { BTAPI } from '../BTAPI';

/** The active palette, palette effects, and splash-time palette capture. */
export class PaletteController {
    /**
     * Whether {@link setPalette} defers instead of applying.
     *
     * Armed for the splash's duration only. The splash owns the palette while it
     * is on screen, so a game's `init()` calling `BT.paletteSet()` is captured and
     * applied at handoff rather than resolving every color through the splash's ramp.
     */
    private isCapturingPalette: boolean = false;

    /** Palette captured from the game's `init()`, applied at handoff. */
    private pendingPalette: Palette | null = null;

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Gets the active engine palette.
     *
     * @returns Active palette, or null if none has been set.
     */
    public getPalette(): Palette | null {
        // While the splash owns the palette, the game must see its own palette,
        // not the splash's ramp - otherwise in-place slot edits and
        // spritesRefresh() would both target the wrong object. Null until the
        // game sets one, which matches the pre-paletteSet behavior it already
        // expects.
        return this.isCapturingPalette ? this.pendingPalette : this.engine.palette;
    }

    /**
     * Sets the active engine palette and propagates it to the renderer.
     *
     * Replacing the palette object does not re-index sprites. A value swap (same
     * slot numbers, new colors) needs nothing else. A layout swap (the same colors
     * at new slot numbers) needs {@link spritesRefresh} afterwards. In-place
     * slot edits on the active palette do not go through this method.
     *
     * @param palette - Palette to store as the active engine palette.
     */
    public setPalette(palette: Palette): void {
        if (this.isCapturingPalette) {
            // The splash is on screen and owns the palette. Hold this until handoff.
            this.pendingPalette = palette;

            return;
        }

        this.installPalette(palette);
    }

    /**
     * Arms palette capture for the splash's duration.
     *
     * From here until {@link endPaletteCapture}, {@link setPalette} defers instead
     * of applying, and {@link getPalette} reports the deferred palette.
     */
    public beginPaletteCapture(): void {
        this.isCapturingPalette = true;
        this.pendingPalette = null;
    }

    /**
     * Disarms capture and performs the handoff into the game's palette.
     *
     * Installs the captured palette blackened, then brings it up with an exposure
     * fade so the splash fading down and the game fading up read as one continuous
     * in-camera move rather than a cut. When the game never called
     * `BT.paletteSet()` during `init()`, the splash's own palette is faded to black
     * instead, so the screen is black rather than showing stale splash grays until
     * the game sets a palette of its own.
     *
     * Palette effects started during capture are dropped: they hold snapshots of a
     * palette that is about to be replaced wholesale.
     *
     * @param reducedMotion - When `true`, skips the exposure fade entirely and installs the
     *   target colors immediately - no intermediate blackened state, no animation.
     */
    public endPaletteCapture(reducedMotion: boolean = false): void {
        const captured = this.pendingPalette;

        this.isCapturingPalette = false;
        this.pendingPalette = null;

        if (!captured) {
            const current = this.engine.palette;

            if (current) {
                this.engine.paletteEffects.clear();

                if (reducedMotion) {
                    current.copyFrom(createBlackened(current));
                } else {
                    this.engine.paletteEffects.add(
                        new ExposureFadeEffect(current, createBlackened(current), HANDOFF_FADE_MS),
                    );
                }
            }

            return;
        }

        if (reducedMotion) {
            this.installPalette(captured);

            return;
        }

        const target = captured.clone();

        for (let slot = 1; slot < captured.size; slot++) {
            captured.set(slot, Color32.black);
        }

        this.installPalette(captured);
        this.engine.paletteEffects.add(new ExposureFadeEffect(captured, target, HANDOFF_FADE_MS));
    }

    /**
     * Re-indexizes every indexized, not-yet-destroyed sprite sheet against the current
     * active palette, whether or not it has been drawn.
     *
     * Call this after a **palette-layout swap** (same colors at new slot indices)
     * so every sprite sheet re-maps its original RGBA pixels against the new
     * layout. Not needed for in-place palette value changes.
     *
     * @throws If no active palette has been set.
     */
    public spritesRefresh(): void {
        // getPalette(), not this.engine.palette: while the splash owns the screen this is the
        // game's captured palette, and reindexing sheets against the splash's gray ramp
        // would leave every sprite wrong once the handoff installs the real one.
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        let refreshed = 0;

        for (const sheet of getIndexedSheets()) {
            try {
                sheet.reindexize(palette);
                refreshed++;
            } catch (e) {
                // The throw lands before the indices change: the sheet keeps them and the next refresh retries it.
                console.error('[BT] spritesRefresh: failed to reindexize sheet, keeping its old palette indices:', e);
            }
        }

        console.log(`[BT] Refreshed ${refreshed} sprite sheet(s) against current palette`);
    }

    /**
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation. Runs indefinitely until canceled
     * via {@link paletteClearEffects}.
     *
     * @param start - First palette index in the cycling range (inclusive). Must be 1 or higher.
     * @param end - Last palette index in the cycling range (inclusive). Must be below the palette size.
     * @param speed - Steps per second. Positive = forward, negative = backward.
     * @throws If no palette is set, `start` is 0, or `end` is past the palette.
     */
    public paletteCycle(start: number, end: number, speed: number): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        if (!Number.isFinite(speed)) {
            throw new Error(`paletteCycle: 'speed' should be a number (got ${speed}).`);
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
            throw new Error(`paletteCycle: start must be an integer less than end, got [${start}, ${end}].`);
        }

        this.assertEffectRange(start, end, palette.size);

        this.engine.paletteEffects.add(new CycleEffect(start, end, speed));
    }

    /**
     * Smoothly interpolates all palette entries toward a target over time.
     *
     * Snapshots the current palette at start. Auto-removes when complete.
     *
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    public paletteFade(target: Palette, durationMs: number, easing?: EasingFunction): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        this.assertFiniteDuration('paletteFade', durationMs);
        this.engine.paletteEffects.add(new FadeEffect(palette, target, durationMs, easing));
    }

    /**
     * Fades all palette entries toward a target the way an iris pull does.
     *
     * Interpolates each RGB channel in linear light rather than in encoded
     * values, and offsets each entry's schedule by its luminance. With black at
     * one end that is a straight scaling of light. Auto-removes when complete.
     *
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param options - Highlight lead and easing curve.
     */
    public paletteFadeExposure(target: Palette, durationMs: number, options?: ExposureFadeOptions): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        this.assertFiniteDuration('paletteFadeExposure', durationMs);
        this.engine.paletteEffects.add(new ExposureFadeEffect(palette, target, durationMs, options));
    }

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * @param start - First palette index to fade (inclusive). Must be 1 or higher.
     * @param end - Last palette index to fade (inclusive). Must be below the palette size.
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     * @throws If no palette is set, `start` is 0, `start` is greater than `end`, or `end` is past the palette.
     */
    public paletteFadeRange(
        start: number,
        end: number,
        target: Palette,
        durationMs: number,
        easing?: EasingFunction,
    ): void {
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
            throw new Error(paletteEffectRangeOrderError(start, end));
        }

        this.assertEffectRange(start, end, palette.size);
        this.assertFiniteDuration('paletteFadeRange', durationMs);
        this.engine.paletteEffects.add(new FadeRangeEffect(start, end, palette, target, durationMs, easing));
    }

    /**
     * Temporarily sets all non-zero palette entries to a single color, then restores.
     *
     * Index 0 (transparent) is preserved. Auto-removes after duration.
     *
     * @param color - Flash color applied to all non-zero entries.
     * @param durationMs - How long the flash lasts in milliseconds.
     * @throws Error if no palette is set, `color` is not a `Color32`, or `durationMs` is not a
     *   non-negative finite number.
     */
    public paletteFlash(color: Color32, durationMs: number): void {
        if (!this.getPalette()) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        // Plain JavaScript callers can pass anything; unchecked, a bad color throws from inside a later tick.
        if (!(color instanceof Color32)) {
            throw new Error(paletteFlashColorError(color));
        }

        this.assertFiniteDuration('paletteFlash', durationMs);
        this.engine.paletteEffects.add(new FlashEffect(color, durationMs));
    }

    /**
     * Instantly exchanges two palette entries.
     *
     * This is an immediate operation, not an animated effect.
     *
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     * @throws If either index is 0 (slot 0 is always transparent).
     */
    public paletteSwap(indexA: number, indexB: number): void {
        // getPalette(), so a swap during the splash edits the game's captured palette
        // instead of corrupting the ramp the splash is still animating on screen.
        const palette = this.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        paletteSwap(palette, indexA, indexB);
    }

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when canceled.
     */
    public paletteClearEffects(): void {
        this.engine.paletteEffects.clear();
    }

    /**
     * Stores a palette as the active engine palette and propagates it to the renderer.
     *
     * Shared by {@link setPalette} and the splash handoff, so a deferred
     * `BT.paletteSet()` is installed once.
     *
     * @param palette - Palette to store as the active engine palette.
     */
    public installPalette(palette: Palette): void {
        // In-flight effects hold snapshots of the old palette. Drop them so they
        // don't apply stale colors to the new palette.
        this.engine.paletteEffects.clear();

        this.engine.palette = palette;
        this.engine.renderer?.setPalette(palette);
    }

    /**
     * Rejects an effect range that includes the frozen transparent slot 0 or runs past the palette.
     *
     * @param start - First index of the range.
     * @param end - Last index of the range (inclusive).
     * @param size - Active palette size.
     */
    private assertEffectRange(start: number, end: number, size: number): void {
        if (start <= TRANSPARENT_PALETTE_INDEX) {
            throw new Error(PALETTE_EFFECT_SLOT_ZERO_MESSAGE);
        }

        if (end >= size) {
            throw new Error(paletteEffectEndOutOfRangeError(end, size));
        }
    }

    /**
     * Validates that a duration is a finite, non-negative number.
     *
     * @param method - Calling method name for the error message.
     * @param durationMs - Duration to validate.
     * @throws Error if the duration is not finite or is negative.
     */
    private assertFiniteDuration(method: string, durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            throw new Error(`${method}: the time should be a non-negative number of milliseconds (got ${durationMs}).`);
        }
    }
}
