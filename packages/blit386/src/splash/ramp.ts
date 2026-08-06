/**
 * The splash's own palette: a 16-step ramp between two configurable endpoints.
 *
 * Generated in linear light and encoded once at the end, so the steps are
 * physically even – consistent with what `ExposureFadeEffect` does to them
 * during the fades. Stepping evenly in encoded space would be perceptually even
 * instead, which fights the fade rather than complementing it.
 *
 * `Color32#toLinear()` is deliberately not used: it keeps channels 8-bit and
 * drifts by up to ~8 levels near black, which is visible banding across 16 steps.
 * The float `srgbToLinear` / `linearToSrgb` helpers avoid the intermediate
 * quantization.
 */

import { Palette } from '../assets/Palette';
import { Color32, linearToSrgb, srgbToLinear } from '../utils/Color32';
import { RAMP_FIRST_SLOT, RAMP_PALETTE_SIZE, RAMP_STEPS } from './constants';

/** Reciprocal of the 8-bit channel maximum, for normalizing to [0, 1]. */
const INV_255 = 1 / 255;

/**
 * Builds the splash palette.
 *
 * Slot 0 stays transparent (the engine reserves it); the ramp occupies slots
 * {@link RAMP_FIRST_SLOT} through `RAMP_FIRST_SLOT + RAMP_STEPS - 1`. Because the
 * splash palette and the game's palette never coexist, the slot count costs the
 * game nothing.
 *
 * @param dark - Dark endpoint. Defaults to black.
 * @param light - Light endpoint. Defaults to white.
 * @returns A fresh palette holding the ramp.
 */
export function createRamp(dark: Color32 = Color32.black, light: Color32 = Color32.white): Palette {
    const palette = new Palette(RAMP_PALETTE_SIZE);

    const darkLinear = toLinearTriple(dark);
    const lightLinear = toLinearTriple(light);
    const lastStep = RAMP_STEPS - 1;

    for (let step = 0; step < RAMP_STEPS; step++) {
        const t = step / lastStep;

        palette.set(
            RAMP_FIRST_SLOT + step,
            new Color32(
                encode(darkLinear[0] + (lightLinear[0] - darkLinear[0]) * t),
                encode(darkLinear[1] + (lightLinear[1] - darkLinear[1]) * t),
                encode(darkLinear[2] + (lightLinear[2] - darkLinear[2]) * t),
            ),
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
 * @param source - Palette whose size is mirrored.
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
 * Converts an encoded color to normalized linear-light RGB.
 *
 * @param color - Encoded sRGB color.
 * @returns Linear-light red, green, and blue in [0, 1].
 */
function toLinearTriple(color: Color32): [number, number, number] {
    return [srgbToLinear(color.r * INV_255), srgbToLinear(color.g * INV_255), srgbToLinear(color.b * INV_255)];
}

/**
 * Encodes one normalized linear-light channel back to an 8-bit sRGB value.
 *
 * @param linear - Linear-light channel in [0, 1].
 * @returns Encoded channel in [0, 255].
 */
function encode(linear: number): number {
    return Math.max(0, Math.min(255, Math.round(linearToSrgb(linear) * 255)));
}
