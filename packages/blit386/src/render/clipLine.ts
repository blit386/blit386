/**
 * Integer viewport clipping for Bresenham lines, shared by {@link SoftwareRenderer} and {@link PrimitivePipeline}.
 *
 * Clipping advances the start point along the Bresenham error term instead of computing a new line, so the
 * pixels inside the viewport are identical to an un-clipped line.
 */

/** Result of {@link clipBresenhamLine}: where to resume stepping and how many pixels remain. */
export interface ClippedLine {
    /** X of the first in-viewport pixel. */
    x: number;
    /** Y of the first in-viewport pixel. */
    y: number;
    /** Bresenham error term at that pixel (`dx - dy` at the un-clipped start). */
    err: number;
    /** Number of pixels to visit from the start pixel, inclusive. */
    steps: number;
}

/**
 * Clips a Bresenham line to an inclusive pixel rectangle without stepping through it.
 *
 * The caller then steps exactly `out.steps` pixels from `(out.x, out.y)` with `out.err`, using the usual
 * `e2 = 2 * err; if (e2 > -dy) {...} if (e2 < dx) {...}` kernel and no end-point test.
 *
 * The arithmetic is exact for any 32-bit coordinates: it uses plain numbers while products stay below 2^53 and
 * `BigInt` for the rare longer lines.
 *
 * @param x0 - Start X.
 * @param y0 - Start Y.
 * @param x1 - End X.
 * @param y1 - End Y.
 * @param minX - Left edge of the rectangle, inclusive.
 * @param minY - Top edge of the rectangle, inclusive.
 * @param maxX - Right edge of the rectangle, inclusive.
 * @param maxY - Bottom edge of the rectangle, inclusive.
 * @param out - Caller-owned result, written only when this returns `true`.
 * @returns `false` when no pixel of the line falls inside the rectangle.
 */
export function clipBresenhamLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: ClippedLine,
): boolean {
    // The kernel is symmetric in x and y, so clip along the longer axis ("major") and derive the other ("minor").
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
        return clipMajorMinor(x0, y0, x1, y1, minX, maxX, minY, maxY, out);
    }

    if (!clipMajorMinor(y0, x0, y1, x1, minY, maxY, minX, maxX, out)) {
        return false;
    }

    const x = out.y;

    out.y = out.x;
    out.x = x;
    out.err = -out.err;

    return true;
}

/**
 * Clips with `x` as the longer axis; on return `out.x` / `out.y` are the major / minor coordinates.
 * The caller swaps them back (and negates `err`) when the real line is y-major.
 *
 * @param majorStart - Start coordinate on the longer axis.
 * @param minorStart - Start coordinate on the shorter axis.
 * @param majorEnd - End coordinate on the longer axis.
 * @param minorEnd - End coordinate on the shorter axis.
 * @param majorLo - Lower bound on the longer axis, inclusive.
 * @param majorHi - Upper bound on the longer axis, inclusive.
 * @param minorLo - Lower bound on the shorter axis, inclusive.
 * @param minorHi - Upper bound on the shorter axis, inclusive.
 * @param out - Caller-owned result.
 * @returns `false` when no pixel of the line falls inside the bounds.
 */
function clipMajorMinor(
    majorStart: number,
    minorStart: number,
    majorEnd: number,
    minorEnd: number,
    majorLo: number,
    majorHi: number,
    minorLo: number,
    minorHi: number,
    out: ClippedLine,
): boolean {
    const major = Math.abs(majorEnd - majorStart);
    const minor = Math.abs(minorEnd - minorStart);
    const majorSign = majorStart < majorEnd ? 1 : -1;
    const minorSign = minorStart < minorEnd ? 1 : -1;

    // Major steps j whose major coordinate is inside: majorStart + majorSign * j in [majorLo, majorHi].
    const first0 = majorSign > 0 ? majorLo - majorStart : majorStart - majorHi;
    const last0 = majorSign > 0 ? majorHi - majorStart : majorStart - majorLo;
    let first = Math.max(first0, 0);
    let last = Math.min(last0, major);

    // After j major steps the minor axis has moved n(j) = floor((2 * minor * j + major - 1) / (2 * major)).
    // Restrict j to the steps whose minor offset n(j) is inside the minor bounds.
    const nLo = minorSign > 0 ? minorLo - minorStart : minorStart - minorHi;
    const nHi = minorSign > 0 ? minorHi - minorStart : minorStart - minorLo;

    if (minor === 0) {
        if (nLo > 0 || nHi < 0) {
            return false;
        }
    } else {
        if (nLo > 0) {
            first = Math.max(first, floorDiv(2 * major, nLo, 2 * minor - major, 2 * minor));
        }

        // An unbounded viewport (nHi is Infinity) never limits the line.
        if (Number.isFinite(nHi)) {
            last = Math.min(last, floorDiv(2 * major, nHi + 1, -major, 2 * minor));
        }
    }

    if (first > last) {
        return false;
    }

    const n = minor === 0 ? 0 : floorDiv(2 * minor, first, major - 1, 2 * major);

    out.x = majorStart + majorSign * first;
    out.y = minorStart + minorSign * n;
    out.err = errorAt(major, minor, first, n);
    out.steps = last - first + 1;

    return true;
}

/**
 * Computes `floor((x * y + add) / den)` for a positive `den`, exactly.
 * Plain numbers are exact while `x * y + add` stays within 2^53; `BigInt` takes over past that.
 *
 * @param x - First factor.
 * @param y - Second factor.
 * @param add - Value added to the product.
 * @param den - Positive divisor.
 * @returns The floored quotient, as a number.
 */
function floorDiv(x: number, y: number, add: number, den: number): number {
    const numerator = x * y + add;

    if (Math.abs(numerator) <= Number.MAX_SAFE_INTEGER) {
        return Math.floor(numerator / den);
    }

    const big = BigInt(x) * BigInt(y) + BigInt(add);
    const bigDen = BigInt(den);
    const quotient = big / bigDen;

    // BigInt division truncates toward zero; floor needs one less for a negative, inexact result.
    return Number(big < 0n && big % bigDen !== 0n ? quotient - 1n : quotient);
}

/**
 * Computes the Bresenham error term `major - minor - j * minor + n * major` at major step `j`, exactly.
 *
 * @param major - Longer axis span.
 * @param minor - Shorter axis span.
 * @param j - Major steps taken.
 * @param n - Minor steps taken after `j` major steps.
 * @returns The error term, as a number.
 */
function errorAt(major: number, minor: number, j: number, n: number): number {
    const err = major - minor - j * minor + n * major;

    if (Math.abs(err) <= Number.MAX_SAFE_INTEGER && Math.max(j * minor, n * major) <= Number.MAX_SAFE_INTEGER) {
        return err;
    }

    return Number(BigInt(major) - BigInt(minor) - BigInt(j) * BigInt(minor) + BigInt(n) * BigInt(major));
}
