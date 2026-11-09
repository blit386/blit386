/**
 * Seedable value noise for smooth, pattern-based randomness (terrain, clouds, textures).
 *
 * Lattice corners are filled from {@link hash1i} / {@link hash2i} / {@link hash3i} and
 * interpolated with the Perlin fade curve. Every sample is in `[-1, 1]`. Distinct from the
 * post-process {@link Noise} display effect (GPU grain).
 *
 * @since 1.5.0
 */

import { hash1i, hash2i, hash3i } from './hash';
import { fade, hashToSigned, lerp } from './noiseCommon';
import { SeededNoise1D } from './SeededNoise';

/**
 * Deterministic value noise. Same seed and coordinates always produce the same sample.
 *
 * @since 1.5.0
 * @changed 1.8.1 Non-zero seeds no longer give an x-shifted copy of seed 0, except seed 2126943072 (see `hash2i`).
 *   Seed 0 is unchanged; every non-zero seed draws a different field than 1.5.0-1.8.0.
 * @changed 1.8.1 Throws a `RangeError` for a seed that is not a finite number (`NaN`, `undefined`, `Infinity`) instead of silently using seed 0.
 */
export class ValueNoise extends SeededNoise1D {
    /**
     * Creates a value-noise sampler. Omit `seed` to use `0` (same default as coordinate hashes).
     *
     * @param seed - Any finite number; only its lower 32 bits affect the field.
     * @throws RangeError if `seed` is not a finite number.
     * @since 1.5.0
     */
    public constructor(seed = 0) {
        super('ValueNoise', seed);
    }

    /**
     * Samples 1D value noise at `x`.
     *
     * @param x - Continuous world coordinate.
     * @returns Smooth value in `[-1, 1]`.
     * @since 1.5.0
     */
    public noise1D(x: number): number {
        const x0 = Math.floor(x);
        const x1 = x0 + 1;
        const tx = fade(x - x0);
        const n0 = hashToSigned(hash1i(x0, this.worldSeed));
        const n1 = hashToSigned(hash1i(x1, this.worldSeed));

        return lerp(n0, n1, tx);
    }

    /**
     * Samples 2D value noise at `(x, y)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @returns Smooth value in `[-1, 1]`.
     * @since 1.5.0
     */
    public noise2D(x: number, y: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const tx = fade(x - x0);
        const ty = fade(y - y0);
        const s = this.worldSeed;

        const n00 = hashToSigned(hash2i(x0, y0, s));
        const n10 = hashToSigned(hash2i(x1, y0, s));
        const n01 = hashToSigned(hash2i(x0, y1, s));
        const n11 = hashToSigned(hash2i(x1, y1, s));

        return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
    }

    /**
     * Samples 3D value noise at `(x, y, z)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param z - Continuous world Z.
     * @returns Smooth value in `[-1, 1]`.
     * @since 1.5.0
     */
    public noise3D(x: number, y: number, z: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const z1 = z0 + 1;
        const tx = fade(x - x0);
        const ty = fade(y - y0);
        const tz = fade(z - z0);
        const s = this.worldSeed;

        const n000 = hashToSigned(hash3i(x0, y0, z0, s));
        const n100 = hashToSigned(hash3i(x1, y0, z0, s));
        const n010 = hashToSigned(hash3i(x0, y1, z0, s));
        const n110 = hashToSigned(hash3i(x1, y1, z0, s));
        const n001 = hashToSigned(hash3i(x0, y0, z1, s));
        const n101 = hashToSigned(hash3i(x1, y0, z1, s));
        const n011 = hashToSigned(hash3i(x0, y1, z1, s));
        const n111 = hashToSigned(hash3i(x1, y1, z1, s));

        const x00 = lerp(n000, n100, tx);
        const x10 = lerp(n010, n110, tx);
        const x01 = lerp(n001, n101, tx);
        const x11 = lerp(n011, n111, tx);

        return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
    }
}
