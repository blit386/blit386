/**
 * Palette, palette effect, and HUD preset messages.
 */

/**
 * The "no active palette" error message, used whenever a palette must be set
 * before an operation can proceed.
 */
export const NO_ACTIVE_PALETTE_MESSAGE =
    'No palette set yet. Call BT.paletteSet(somePalette) before drawing or running palette effects.';

/**
 * Returns the error message for a palette index that is negative or not a
 * whole number.
 *
 * @param index - The invalid index value that was supplied.
 * @returns User-facing error string.
 */
export function paletteIndexNegativeError(index: number): string {
    return `The color number must be a whole number that's 0 or higher (got ${index}).`;
}

/**
 * Returns the error message for a palette index that exceeds the palette size.
 *
 * @param index - The out-of-range index that was supplied.
 * @param size - The number of colors in the active palette.
 * @returns User-facing error string.
 */
export function paletteIndexOutOfRangeError(index: number, size: number): string {
    return `The color number ${index} is too big for this palette. The palette has ${size} colors, so use a number from 0 to ${size - 1}.`;
}

/**
 * Error message when a palette effect or swap touches slot 0.
 */
export const PALETTE_EFFECT_SLOT_ZERO_MESSAGE =
    "Palette effects can't use color number 0, because slot 0 is always transparent. Start your range at 1.";

/**
 * Returns the error message when a palette effect range ends past the palette.
 *
 * @param end - The out-of-range end index that was supplied.
 * @param size - The number of colors in the active palette.
 * @returns User-facing error string.
 */
export function paletteEffectEndOutOfRangeError(end: number, size: number): string {
    return `The color number ${end} is too big for this palette. The palette has ${size} colors, so end your range at ${size - 1} or lower.`;
}

/**
 * Returns the error message when a palette fade range starts after it ends.
 *
 * @param start - The start index that was supplied.
 * @param end - The end index that was supplied.
 * @returns User-facing error string.
 */
export function paletteEffectRangeOrderError(start: number, end: number): string {
    return `The range start (${start}) must be a whole number that isn't greater than the range end (${end}).`;
}

/**
 * Returns the error message when `applyHUD` is called with `startSlot` less than 1.
 *
 * @param startSlot - The invalid start slot value that was supplied.
 * @returns User-facing error string.
 */
export function hudStartSlotError(startSlot: number): string {
    // The "0" below is Palette.ts's TRANSPARENT_PALETTE_INDEX, re-typed rather than imported:
    // Palette.ts already imports from this file, so importing back would create a cycle.
    return `HUD preset slots start from 1 (slot 0 is always transparent). Got ${startSlot}.`;
}

/**
 * Returns the error message when the HUD preset slots would exceed the palette size.
 *
 * @param startSlot - The requested start slot.
 * @param count - Number of HUD slots needed.
 * @param size - The palette size.
 * @returns User-facing error string.
 */
export function hudRangeError(startSlot: number, count: number, size: number): string {
    return (
        `HUD preset needs ${count} slots starting at ${startSlot}, ` +
        `but this palette only has ${size} entries (max slot: ${size - 1}).`
    );
}

/**
 * Returns the error message when a `fillBlock` call would exceed the palette size.
 *
 * @param start - The requested start slot.
 * @param count - Number of slots the block needs (`source.length`).
 * @param size - The palette size.
 * @returns User-facing error string.
 */
export function paletteBlockRangeError(start: number, count: number, size: number): string {
    return (
        `fillBlock needs ${count} slots starting at ${start}, ` +
        `but this palette only has ${size} entries (max slot: ${size - 1}).`
    );
}
