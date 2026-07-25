/**
 * Seedable simplex noise for smooth, pattern-based randomness with fewer directional artifacts
 * than classic Perlin on square lattices.
 *
 * Gradients are selected from {@link hash2i} / {@link hash3i}. Samples are scaled into
 * approximately `[-1, 1]`. Distinct from the post-process {@link Noise} display effect (GPU grain).
 *
 * Based on Stefan Gustavson's simplex formulation
 * ([Simplex noise demystified](https://weber.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf)).
 *
 * @since 1.5.0
 */

import { hash2i, hash3i } from './hash';
import { DEFAULT_LACUNARITY, DEFAULT_OCTAVES, DEFAULT_PERSISTENCE, fbm2, fbm3, grad2, grad3 } from './noiseCommon';

/** Skew factor for 2D simplex: `(√3 - 1) / 2`. */
const F2 = 0.5 * (Math.sqrt(3) - 1);

/** Unskew factor for 2D simplex: `(3 - √3) / 6`. */
const G2 = (3 - Math.sqrt(3)) / 6;

/** Skew factor for 3D simplex: `1/3`. */
const F3 = 1 / 3;

/** Unskew factor for 3D simplex: `1/6`. */
const G3 = 1 / 6;

/**
 * Scale so 2D simplex contributions map to approximately `[-1, 1]`
 * (Gustavson-style constant for this kernel).
 */
const SCALE_2D = 70;

/**
 * Scale so 3D simplex contributions map to approximately `[-1, 1]`.
 */
const SCALE_3D = 32;

/**
 * Deterministic simplex noise (2D / 3D). Same seed and coordinates always produce the same sample.
 *
 * @since 1.5.0
 */
export class SimplexNoise {
    /** World / stream seed (lower 32 bits). */
    private worldSeed: number;

    /**
     * Creates a simplex-noise sampler. Omit `seed` to use `0` (same default as coordinate hashes).
     *
     * @param seed - Any finite number; only its lower 32 bits affect the field.
     * @since 1.5.0
     */
    public constructor(seed = 0) {
        this.worldSeed = seed >>> 0;
    }

    /**
     * Reseeds the noise field. Same seed restarts the same spatial pattern.
     *
     * @param seed - Any finite number; only its lower 32 bits are used.
     * @since 1.5.0
     */
    public seed(seed: number): void {
        this.worldSeed = seed >>> 0;
    }

    /**
     * Samples 2D simplex noise at `(x, y)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @returns Smooth value in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public noise2D(x: number, y: number): number {
        const s = this.worldSeed;
        const skew = (x + y) * F2;
        const i = Math.floor(x + skew);
        const j = Math.floor(y + skew);
        const t = (i + j) * G2;
        const x0 = x - (i - t);
        const y0 = y - (j - t);

        let i1: number;
        let j1: number;

        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        } else {
            i1 = 0;
            j1 = 1;
        }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        let n0 = 0;
        let n1 = 0;
        let n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;

        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * grad2(hash2i(i, j, s), x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;

        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * grad2(hash2i(i + i1, j + j1, s), x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;

        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * grad2(hash2i(i + 1, j + 1, s), x2, y2);
        }

        return (n0 + n1 + n2) * SCALE_2D;
    }

    /**
     * Samples 3D simplex noise at `(x, y, z)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param z - Continuous world Z.
     * @returns Smooth value in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public noise3D(x: number, y: number, z: number): number {
        const seed = this.worldSeed;
        const skew = (x + y + z) * F3;
        const i = Math.floor(x + skew);
        const j = Math.floor(y + skew);
        const k = Math.floor(z + skew);
        const t = (i + j + k) * G3;
        const x0 = x - (i - t);
        const y0 = y - (j - t);
        const z0 = z - (k - t);

        let i1: number;
        let j1: number;
        let k1: number;
        let i2: number;
        let j2: number;
        let k2: number;

        if (x0 >= y0) {
            if (y0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 1;
                k2 = 0;
            } else if (x0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            } else {
                i1 = 0;
                j1 = 0;
                k1 = 1;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            }
        } else if (y0 < z0) {
            i1 = 0;
            j1 = 0;
            k1 = 1;
            i2 = 0;
            j2 = 1;
            k2 = 1;
        } else if (x0 < z0) {
            i1 = 0;
            j1 = 1;
            k1 = 0;
            i2 = 0;
            j2 = 1;
            k2 = 1;
        } else {
            i1 = 0;
            j1 = 1;
            k1 = 0;
            i2 = 1;
            j2 = 1;
            k2 = 0;
        }

        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2 * G3;
        const y2 = y0 - j2 + 2 * G3;
        const z2 = z0 - k2 + 2 * G3;
        const x3 = x0 - 1 + 3 * G3;
        const y3 = y0 - 1 + 3 * G3;
        const z3 = z0 - 1 + 3 * G3;

        let n0 = 0;
        let n1 = 0;
        let n2 = 0;
        let n3 = 0;

        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;

        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * grad3(hash3i(i, j, k, seed), x0, y0, z0);
        }

        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;

        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * grad3(hash3i(i + i1, j + j1, k + k1, seed), x1, y1, z1);
        }

        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;

        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * grad3(hash3i(i + i2, j + j2, k + k2, seed), x2, y2, z2);
        }

        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;

        if (t3 >= 0) {
            t3 *= t3;
            n3 = t3 * t3 * grad3(hash3i(i + 1, j + 1, k + 1, seed), x3, y3, z3);
        }

        return (n0 + n1 + n2 + n3) * SCALE_3D;
    }

    /**
     * Fractal Brownian motion over {@link noise2D}.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param octaves - Octave count (default `4`; floored, at least 1).
     * @param persistence - Amplitude falloff per octave (default `0.5`).
     * @param lacunarity - Frequency scale per octave (default `2`).
     * @returns Normalized fBm in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public fbm2D(
        x: number,
        y: number,
        octaves = DEFAULT_OCTAVES,
        persistence = DEFAULT_PERSISTENCE,
        lacunarity = DEFAULT_LACUNARITY,
    ): number {
        return fbm2((sx, sy) => this.noise2D(sx, sy), x, y, octaves, persistence, lacunarity);
    }

    /**
     * Fractal Brownian motion over {@link noise3D}.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param z - Continuous world Z.
     * @param octaves - Octave count (default `4`; floored, at least 1).
     * @param persistence - Amplitude falloff per octave (default `0.5`).
     * @param lacunarity - Frequency scale per octave (default `2`).
     * @returns Normalized fBm in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public fbm3D(
        x: number,
        y: number,
        z: number,
        octaves = DEFAULT_OCTAVES,
        persistence = DEFAULT_PERSISTENCE,
        lacunarity = DEFAULT_LACUNARITY,
    ): number {
        return fbm3((sx, sy, sz) => this.noise3D(sx, sy, sz), x, y, z, octaves, persistence, lacunarity);
    }
}
