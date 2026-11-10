/**
 * Byte, sRGB and hex helpers behind {@link Color32}. Module-level so renderer and audio code can reuse them
 * without going through the class.
 */

/** Reciprocal of 255 used for fast byte-to-float normalization. */
export const INV_255 = 1 / 255;

/** Encoded-value breakpoint below which the sRGB transfer function is a straight line. */
const SRGB_ENCODED_BREAKPOINT = 0.04045;

/** Linear-light breakpoint below which the inverse sRGB transfer function is a straight line. */
const SRGB_LINEAR_BREAKPOINT = 0.0031308;

/** Slope of the straight toe segment of the sRGB transfer function. */
const SRGB_TOE_SLOPE = 12.92;

/** Offset applied to the power segment of the sRGB transfer function. */
const SRGB_OFFSET = 0.055;

/** Scale applied to the power segment of the sRGB transfer function. */
const SRGB_SCALE = 1.055;

/** Exponent of the power segment of the sRGB transfer function. */
const SRGB_GAMMA = 2.4;

/** Precomputed lookup table for byte-to-hex conversion. */
export const HEX_TABLE: string[] = new Array(256);

/** Strict hex token validator used for exact substring checks in fromHex parsing. */
const HEX_TOKEN_PATTERN = /^[0-9A-Fa-f]+$/;

for (let i = 0; i < 256; i++) {
    // eslint-disable-next-line security/detect-object-injection
    HEX_TABLE[i] = i.toString(16).padStart(2, '0');
}

/**
 * Clamps a number to the 0-255 byte range and truncates to integer.
 * Optimized for the common case of color channel clamping.
 * Exported for use in other utilities that work with byte values.
 *
 * @param n - Value to clamp.
 * @returns Integer in range 0-255.
 */
export function clampByte(n: number): number {
    // Bitwise operations: if n < 0, use 0; if n > 255, use 255; else truncate n.
    // This is faster than Math.max(0, Math.min(255, n)) | 0.
    return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

/**
 * Clamps a unit interpolation factor to the closed interval [0, 1].
 *
 * @param t - Raw interpolation factor.
 * @returns Clamped factor in range 0-1.
 */
export function clampUnit(t: number): number {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Converts one encoded sRGB channel to linear light.
 *
 * The real IEC 61966-2-1 piecewise curve: a straight toe below the 0.04045
 * breakpoint, an offset power curve above it. A bare 2.2 power is roughly right
 * in the midtones and an order of magnitude wrong near black, which is exactly
 * where a fade spends its most visible frames.
 *
 * Exported for other utilities that need linear-light math; not part of the
 * public `blit386` surface.
 *
 * @param channel - Encoded channel value in range 0-1.
 * @returns Linear-light value in range 0-1.
 */
export function srgbToLinear(channel: number): number {
    return channel <= SRGB_ENCODED_BREAKPOINT
        ? channel / SRGB_TOE_SLOPE
        : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

/**
 * Converts one linear-light channel to encoded sRGB.
 *
 * Inverse of {@link srgbToLinear}, sharing its breakpoint and constants.
 *
 * Exported for other utilities that need linear-light math; not part of the
 * public `blit386` surface.
 *
 * @param linear - Linear-light value in range 0-1.
 * @returns Encoded channel value in range 0-1.
 */
export function linearToSrgb(linear: number): number {
    return linear <= SRGB_LINEAR_BREAKPOINT
        ? linear * SRGB_TOE_SLOPE
        : SRGB_SCALE * linear ** (1 / SRGB_GAMMA) - SRGB_OFFSET;
}

/**
 * Converts one encoded sRGB byte to a linear-light byte.
 *
 * Rounds to nearest so a {@link linearizeByte} / {@link encodeByte} round trip
 * does not drift downward one level at a time.
 *
 * @param value - Encoded channel byte in range 0-255.
 * @returns Linear-light channel byte in range 0-255.
 */
export function linearizeByte(value: number): number {
    return clampByte(Math.round(srgbToLinear(value * INV_255) * 255));
}

/**
 * Converts one linear-light byte to an encoded sRGB byte.
 *
 * @param value - Linear-light channel byte in range 0-255.
 * @returns Encoded channel byte in range 0-255.
 */
export function encodeByte(value: number): number {
    return clampByte(Math.round(linearToSrgb(value * INV_255) * 255));
}

/**
 * Throws a standardized beginner-friendly error for invalid hex colors.
 *
 * @param hex - Original input string.
 */
export function throwInvalidHex(hex: string): never {
    throw new Error(
        `The color '${hex}' isn't a valid hex color. Use a format like '#FF0000' (red), '#00FF00' (green), or '#0000FF' (blue). You can also use short form like '#F00'.`,
    );
}

/**
 * Parses an exact-length hex substring and rejects partial/invalid tokens.
 *
 * @param hex - Original full hex string.
 * @param start - Token start index in the full string.
 * @param length - Expected token length.
 * @returns Parsed base-16 number.
 */
export function parseHexToken(hex: string, start: number, length: number): number {
    const token = hex.substring(start, start + length);

    if (token.length !== length || !HEX_TOKEN_PATTERN.test(token)) {
        throwInvalidHex(hex);
    }

    return parseInt(token, 16);
}

/**
 * One HSL-to-RGB channel step of the standard conversion.
 *
 * @param p - Lower bound derived from lightness and saturation.
 * @param q - Upper bound derived from lightness and saturation.
 * @param t - Hue offset for this channel (wraps into 0-1).
 * @returns Channel value in range 0-1.
 */
export function hue2rgb(p: number, q: number, t: number): number {
    let tc = t;
    if (tc < 0) {
        tc += 1;
    }

    if (tc > 1) {
        tc -= 1;
    }

    if (tc < 1 / 6) {
        return p + (q - p) * 6 * tc;
    }

    if (tc < 1 / 2) {
        return q;
    }

    if (tc < 2 / 3) {
        return p + (q - p) * (2 / 3 - tc) * 6;
    }

    return p;
}
