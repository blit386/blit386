/**
 * Stateless integer coordinate hashes for chunked and procedural worlds.
 *
 * Given the same coordinates and seed, each function always returns the same
 * value across platforms (pure `Math.imul` / `>>> 0` ops; no stored state).
 * Complements {@link Random}: the class is a sequence generator; these are
 * spatial lookups (no need for an RNG instance per chunk).
 *
 * @since 1.5.0
 */

/** Reciprocal of 2^32, used to map a uint32 into [0, 1). */
const INV_2_32 = 1 / 4294967296;

/**
 * MurmurHash3 32-bit finalizer (avalanche). Input is treated as unsigned.
 *
 * @param h – Mixed state to finalize.
 * @returns Well-distributed unsigned 32-bit value.
 */
function finalize(h: number): number {
    let x = h >>> 0;

    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;

    return x >>> 0;
}

/**
 * Deterministic uint32 hash of a 1D integer coordinate.
 *
 * @param x – Coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Unsigned 32-bit value in `[0, 2^32)`.
 * @since 1.5.0
 */
export function hash1i(x: number, seed = 0): number {
    const xi = x | 0;
    let h = seed >>> 0;

    h = Math.imul(h ^ xi, 0x27d4eb2d);

    return finalize(h);
}

/**
 * Deterministic uint32 hash of a 2D integer coordinate.
 *
 * @param x – X coordinate (truncated toward zero with `| 0`).
 * @param y – Y coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Unsigned 32-bit value in `[0, 2^32)`.
 * @since 1.5.0
 */
export function hash2i(x: number, y: number, seed = 0): number {
    const xi = x | 0;
    const yi = y | 0;
    let h = seed >>> 0;

    h = Math.imul(h ^ xi, 0x27d4eb2d);
    h = Math.imul(h ^ yi, 0x165667b1);

    return finalize(h);
}

/**
 * Deterministic uint32 hash of a 3D integer coordinate.
 *
 * @param x – X coordinate (truncated toward zero with `| 0`).
 * @param y – Y coordinate (truncated toward zero with `| 0`).
 * @param z – Z coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Unsigned 32-bit value in `[0, 2^32)`.
 * @since 1.5.0
 */
export function hash3i(x: number, y: number, z: number, seed = 0): number {
    const xi = x | 0;
    const yi = y | 0;
    const zi = z | 0;
    let h = seed >>> 0;

    h = Math.imul(h ^ xi, 0x27d4eb2d);
    h = Math.imul(h ^ yi, 0x165667b1);
    h = Math.imul(h ^ zi, 0x1b873593);

    return finalize(h);
}

/**
 * Deterministic float hash of a 1D integer coordinate in `[0, 1)`.
 *
 * @param x – Coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Float in `[0, 1)`, derived from {@link hash1i}.
 * @since 1.5.0
 */
export function hash1(x: number, seed = 0): number {
    return hash1i(x, seed) * INV_2_32;
}

/**
 * Deterministic float hash of a 2D integer coordinate in `[0, 1)`.
 *
 * @param x – X coordinate (truncated toward zero with `| 0`).
 * @param y – Y coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Float in `[0, 1)`, derived from {@link hash2i}.
 * @since 1.5.0
 */
export function hash2(x: number, y: number, seed = 0): number {
    return hash2i(x, y, seed) * INV_2_32;
}

/**
 * Deterministic float hash of a 3D integer coordinate in `[0, 1)`.
 *
 * @param x – X coordinate (truncated toward zero with `| 0`).
 * @param y – Y coordinate (truncated toward zero with `| 0`).
 * @param z – Z coordinate (truncated toward zero with `| 0`).
 * @param seed – World / stream seed (default `0`; lower 32 bits used).
 * @returns Float in `[0, 1)`, derived from {@link hash3i}.
 * @since 1.5.0
 */
export function hash3(x: number, y: number, z: number, seed = 0): number {
    return hash3i(x, y, z, seed) * INV_2_32;
}
