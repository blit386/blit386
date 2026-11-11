/**
 * Palette: the active palette, palette effects, the shared random stream, and sprite re-indexing.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { MAX_PALETTE_SIZE, Palette } from '../assets/Palette';
import type { ExposureFadeOptions } from '../assets/PaletteEffect';
import { BTAPI } from '../core/BTAPI';
import type { Color32 } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import { NO_ACTIVE_PALETTE_MESSAGE } from '../utils/errorMessages';
import type { Random } from '../utils/Random';
import { showBeginnerRuntimeError } from './internal';

/** Palette, random, and sprite re-indexing members of `BT`. */
export const palette = {
    /**
     * Creates a standalone palette instance.
     *
     * @since 1.0.3
     * @param size - Palette size. Defaults to 256 colors.
     * @returns New mutable palette.
     */
    paletteCreate: (size: number = MAX_PALETTE_SIZE): Palette => {
        return new Palette(size);
    },

    /**
     * Stores the active engine palette.
     *
     * Use this to swap the **entire palette** (e.g. switch between a day and night
     * theme). After this call the renderer uploads the new palette uniform on the
     * next frame.
     *
     * **Palette-value swap (change what a slot looks like):** mutate the live
     * {@link BT.palette} in place with `palette.set(slot, newColor)`. The renderer
     * uploads dirty slots on the next frame; no `paletteSet()` or
     * {@link BT.spritesRefresh} needed.
     *
     * **Palette-layout swap (same colors, different slot positions):** build a new
     * palette with the same colors at new indices, call `paletteSet()`, then call
     * {@link BT.spritesRefresh} so every sprite sheet re-maps its original RGBA
     * pixels against the new slot layout.
     *
     * @since 1.0.3
     * @param palette - Palette to make active.
     */
    paletteSet: (palette: Palette): void => {
        if (!(palette instanceof Palette)) {
            showBeginnerRuntimeError(
                'BT.paletteSet expects a Palette. Did you forget to create one with BT.paletteCreate() or a preset like Palette.vga()?',
                'Palette Error',
            );
            return;
        }

        BTAPI.instance.setPalette(palette);
    },

    /**
     * Active engine palette (live reference - not a copy).
     *
     * Mutating slots updates colors on the next frame without {@link BT.paletteSet}.
     *
     * @since 1.0.4
     * @returns The active palette instance.
     * @throws Error if no palette has been set.
     */
    get palette(): Palette {
        const palette = BTAPI.instance.getPalette();

        if (!palette) {
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        return palette;
    },

    /**
     * Default engine PRNG (live reference - not a copy).
     *
     * Time-seeded when the engine singleton is created. Call {@link BT.randomSeed}
     * for a reproducible run, or open the page with `?seed=N` - applied in `BT.init()`
     * just before the demo's own `init()`, so a `randomSeed` call there still wins.
     * Mutating the instance (for example `BT.random.int(10)`) advances the shared stream.
     *
     * @since 1.5.0
     * @changed 1.7.1 `?seed=N` URL parameter seeds the shared generator before the demo's `init()`.
     * @returns The shared {@link Random} instance.
     * @example
     * BT.randomSeed(42);
     * BT.random.int(150, 420);
     * BT.random.pick(['a', 'b', 'c']);
     */
    get random(): Random {
        return BTAPI.instance.getRandom();
    },

    /**
     * Reseeds the default engine PRNG so subsequent draws are reproducible.
     *
     * Calling this from the demo's `init()` overrides a `?seed=N` URL parameter, which
     * `BT.init()` applies just before the demo's `init()`.
     *
     * @since 1.5.0
     * @changed 1.7.1 Documented precedence over the `?seed=N` URL parameter.
     * @changed 1.8.1 Throws a `RangeError` for a seed that is not a finite number (`NaN`, `undefined`, `Infinity`) instead of silently using seed 0.
     * @param seed - Any finite number; only its lower 32 bits are used.
     * @throws RangeError if `seed` is not a finite number.
     * @example
     * BT.randomSeed(1234);
     * const a = BT.random.next();
     * BT.randomSeed(1234);
     * const b = BT.random.next(); // a === b
     */
    randomSeed: (seed: number): void => {
        BTAPI.instance.randomSeed(seed);
    },

    /**
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation technique. Runs indefinitely until
     * canceled via {@link BT.paletteClearEffects}. Uses a fractional accumulator,
     * so slow speeds still step exactly on time.
     *
     * @since 1.0.3
     * @changed 1.8.0 Advances once per fixed update on the tick clock instead of once per rendered frame on wall time.
     * @changed 1.8.1 Requires an active palette and rejects slot 0 or an `end` past the palette at the call.
     * @param start - First palette index in the cycling range (inclusive).
     * @param end - Last palette index in the cycling range (inclusive).
     * @param speed - Steps per second. Positive = forward, negative = backward.
     * @throws Error if no palette is set, `speed` is not finite, `start` or `end` is not an integer, `start` is 0
     *   or not below `end`, or `end` is past the palette.
     */
    paletteCycle: (start: number, end: number, speed: number): void => {
        BTAPI.instance.paletteCycle(start, end, speed);
    },

    /**
     * Smoothly interpolates all palette entries toward a target over time.
     *
     * Snapshots the current palette at the moment this is called. Each fixed update the
     * entries are lerped between the snapshot and target using the easing curve.
     * Auto-removes when the fade completes.
     *
     * Common patterns:
     * - Fade to black: `BT.paletteFade(blackPalette, 1000)`
     * - Fade to white: `BT.paletteFade(whitePalette, 500)`
     * - Cross-fade: `BT.paletteFade(nightPalette, 2000, 'ease-in-out')`
     *
     * @since 1.0.3
     * @changed 1.8.0 Advances once per fixed update on the tick clock instead of once per rendered frame on wall time.
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     * @throws Error if no palette is set or `durationMs` is not a non-negative finite number.
     */
    paletteFade: (target: Palette, durationMs: number, easing?: EasingFunction): void => {
        BTAPI.instance.paletteFade(target, durationMs, easing);
    },

    /**
     * Fades all palette entries toward a target the way an iris pull does.
     *
     * {@link BT.paletteFade} interpolates encoded color values, which is a
     * post-production crossfade: every entry drops by the same proportion for the
     * whole fade and the image sags uniformly into gray. This one interpolates
     * each RGB channel in linear light instead, and offsets each entry's schedule
     * by its luminance, so bright entries come up first and hold on longest while
     * dark entries arrive late and crush early. The fade still lands exactly on
     * the target at completion.
     *
     * Fading up from black or down to black, which is the usual case, that
     * interpolation is exactly scaling light the way an iris does.
     *
     * `highlightLead` is the knob: `0` is a plain linear-light fade with every
     * entry on one schedule, higher values push the highlights further ahead.
     * Defaults to `0.5`.
     *
     * This is a per-index effect, not a per-pixel one - a dark object in a bright
     * scene fades on the dark schedule regardless of what surrounds it, because
     * the engine only knows its palette slot.
     *
     * Slots past the end of `target` are left alone, so passing a smaller target
     * palette scopes the fade to its own slots.
     *
     * Common patterns:
     * - Cinematic fade up from black: `BT.paletteFadeExposure(gamePalette, 1500)`
     * - Subtle version: `BT.paletteFadeExposure(gamePalette, 1500, { highlightLead: 0.2 })`
     * - Fade out: `BT.paletteFadeExposure(blackPalette, 1000)`
     *
     * @since 1.5.0
     * @changed 1.8.0 Advances once per fixed update on the tick clock instead of once per rendered frame on wall time.
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param options - Highlight lead and easing curve.
     * @throws Error if no palette is set or `durationMs` is not a non-negative finite number.
     */
    paletteFadeExposure: (target: Palette, durationMs: number, options?: ExposureFadeOptions): void => {
        BTAPI.instance.paletteFadeExposure(target, durationMs, options);
    },

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * Same as {@link BT.paletteFade} but restricted to the range `[start, end]`.
     * Indices outside the range are left untouched.
     *
     * @since 1.0.3
     * @changed 1.8.0 Advances once per fixed update on the tick clock instead of once per rendered frame on wall time.
     * @changed 1.8.1 Rejects slot 0 or an `end` past the palette at the call.
     * @param start - First palette index to fade (inclusive).
     * @param end - Last palette index to fade (inclusive).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     * @throws Error if no palette is set, `start` or `end` is not an integer, `start` is 0 or greater than
     *   `end`, `end` is past the palette, or `durationMs` is not a non-negative finite number.
     */
    paletteFadeRange: (
        start: number,
        end: number,
        target: Palette,
        durationMs: number,
        easing?: EasingFunction,
    ): void => {
        BTAPI.instance.paletteFadeRange(start, end, target, durationMs, easing);
    },

    /**
     * Temporarily sets all non-zero palette entries to a single color, then restores.
     *
     * Index 0 (transparent) is preserved. The original palette is saved internally
     * and restored after the duration elapses. Auto-removes when complete.
     *
     * @since 1.0.3
     * @changed 1.8.0 Advances once per fixed update on the tick clock instead of once per rendered frame on wall time.
     * @changed 1.8.1 Throws at the call when `color` is not a `Color32`, instead of throwing from inside a later tick.
     * @param color - Flash color applied to all non-zero entries.
     * @param durationMs - How long the flash lasts in milliseconds.
     * @throws Error if no palette is set, `color` is not a `Color32`, or `durationMs` is not a non-negative finite number.
     */
    paletteFlash: (color: Color32, durationMs: number): void => {
        BTAPI.instance.paletteFlash(color, durationMs);
    },

    /**
     * Instantly exchanges two palette entries.
     *
     * This is an immediate operation, not an animated effect. The visual change
     * takes effect on the next frame.
     *
     * @since 1.0.3
     * @changed 1.8.1 Rejects slot 0 before writing anything.
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     * @throws Error if no palette is set, either index is 0 (slot 0 is always transparent), or either index
     *   is past the palette.
     */
    paletteSwap: (indexA: number, indexB: number): void => {
        BTAPI.instance.paletteSwap(indexA, indexB);
    },

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when canceled.
     *
     * @since 1.0.3
     */
    paletteClearEffects: (): void => {
        BTAPI.instance.paletteClearEffects();
    },

    /**
     * Re-indexizes every sprite sheet against the current active palette.
     *
     * Covers each sheet indexized through `sheet.indexize()` or `SpriteSheet.loadIndexed`,
     * whether or not it has been drawn yet, until `sheet.destroy()` removes it.
     *
     * Only call this after a **palette-layout swap** - when the same colors have
     * moved to different slot positions and existing sprite indices now point to
     * the wrong slots. Each sheet re-runs exact RGBA-to-index matching against the
     * active palette via `SpriteSheet.reindexize()`. If any opaque pixel's original
     * color is missing from the new palette, `reindexize()` throws, and
     * `spritesRefresh()` logs that error and leaves the sheet with its old palette
     * indices; the next `spritesRefresh()` tries it again.
     *
     * **Do not call this after a palette-value swap.** If you changed what color a
     * slot holds (e.g. palette animation, theme tinting), the stored indices are
     * still correct - the fragment shader picks up the new color automatically.
     * Calling `spritesRefresh()` in that case is wasteful at best; at worst, if the
     * original RGBA values are gone from the palette, sheets with missing colors
     * fail reindexing and log an error.
     *
     * Typical usage after a layout swap:
     * ```ts
     * BT.paletteSet(newLayoutPalette);
     * BT.spritesRefresh(); // re-map all sheets to the new slot positions
     * ```
     *
     * @since 1.0.3
     * @changed 1.8.1 Covers every indexized sheet, not only sheets already drawn; `sheet.destroy()` removes a sheet. A sheet that fails to re-map keeps its old indices and is retried by the next call, instead of being dropped.
     * @throws If no active palette has been set.
     */
    spritesRefresh: (): void => {
        BTAPI.instance.spritesRefresh();
    },
};
