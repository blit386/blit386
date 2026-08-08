/**
 * The splash's own palette: a 16-step ramp between two configurable endpoints.
 *
 * Steps are spaced evenly in encoded 8-bit sRGB channel values – the numbers an
 * image editor reports – so an artist's mid-gray lands on the nearest step to the
 * value they drew it as. (Even in encoded sRGB is close to, but not the same as,
 * even in perceived lightness; the point here is predictable quantization of the
 * values the artwork is authored in.) An earlier version
 * spaced them evenly in linear light instead; that put the first step at encoded
 * 73 and left no slot at all below it, so shadow detail authored in an image
 * editor either jumped several steps brighter or crushed to black.
 *
 * This costs the fades nothing. `ExposureFadeEffect` converts to linear light
 * itself, per channel, on whatever colors the palette holds – so the in-camera
 * behavior of the fade is independent of how the static steps are distributed.
 * The two concerns only looked coupled.
 */

import { Palette } from '../assets/Palette';
import { Color32 } from '../utils/Color32';
import { RAMP_FIRST_SLOT, RAMP_PALETTE_SIZE, RAMP_STEPS } from './constants';

/**
 * Builds the splash palette.
 *
 * Slot 0 stays transparent (the engine reserves it); the ramp occupies slots
 * {@link RAMP_FIRST_SLOT} through `RAMP_FIRST_SLOT + RAMP_STEPS - 1`. Because the
 * splash palette and the game's palette never coexist, the slot count costs the
 * game nothing.
 *
 * @param dark – Dark endpoint. Defaults to black.
 * @param light – Light endpoint. Defaults to white.
 * @returns A fresh palette holding the ramp.
 */
export function createRamp(dark: Color32 = Color32.black, light: Color32 = Color32.white): Palette {
    const palette = new Palette(RAMP_PALETTE_SIZE);

    const lastStep = RAMP_STEPS - 1;

    for (let step = 0; step < RAMP_STEPS; step++) {
        const t = step / lastStep;

        palette.set(
            RAMP_FIRST_SLOT + step,
            new Color32(mixChannel(dark.r, light.r, t), mixChannel(dark.g, light.g, t), mixChannel(dark.b, light.b, t)),
        );
    }

    return palette;
}

/**
 * Builds an all-black copy of a palette, preserving its size.
 *
 * Used twice: as the starting point the splash fades up from, and as the state
 * the game's captured palette is installed in before its handoff fade brings it
 * up.
 *
 * @param source – Palette whose size is mirrored.
 * @returns A fresh same-sized palette, slot 0 transparent and every other slot opaque black.
 */
export function createBlackened(source: Palette): Palette {
    const palette = new Palette(source.size);

    for (let slot = 1; slot < source.size; slot++) {
        palette.set(slot, Color32.black);
    }

    return palette;
}

/**
 * Interpolates one encoded 8-bit channel between the two ramp endpoints.
 *
 * @param from – Dark endpoint channel in [0, 255].
 * @param to – Light endpoint channel in [0, 255].
 * @param t – Position along the ramp in [0, 1].
 * @returns Encoded channel in [0, 255].
 */
function mixChannel(from: number, to: number, t: number): number {
    return Math.max(0, Math.min(255, Math.round(from + (to - from) * t)));
}
