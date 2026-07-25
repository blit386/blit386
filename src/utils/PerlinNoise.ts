/**
 * Seedable Perlin (gradient) noise for smooth, pattern-based randomness.
 *
 * Lattice gradients are selected from {@link hash1i} / {@link hash2i} / {@link hash3i}.
 * Samples are scaled into approximately `[-1, 1]`. Distinct from the post-process
 * {@link Noise} display effect (GPU grain).
 *
 * Based on Ken Perlin's improved noise
 * ([SIGGRAPH 2002](https://mrl.cs.nyu.edu/~perlin/paper445.pdf)).
 *
 * @since 1.5.0
 */

import { hash1i, hash2i, hash3i } from './hash';
import {
    DEFAULT_LACUNARITY,
    DEFAULT_OCTAVES,
    DEFAULT_PERSISTENCE,
    fade,
    fbm1,
    fbm2,
    fbm3,
    grad2,
    grad3,
    lerp,
} from './noiseCommon';

/**
 * Scale so 1D Perlin (unit ±1 gradients) stays in approximately `[-1, 1]`.
 * Max of faded grads is 1 at cell edges in the classic formulation.
 */
const SCALE_1D = 1;

/**
 * Scale for 2D Perlin with the eight GRAD2 directions (including diagonals of length √2).
 * Empirically keeps samples in approximately `[-1, 1]`.
 */
const SCALE_2D = 0.6616;

/**
 * Scale for 3D Perlin with the twelve mid-edge GRAD3 directions.
 * Empirically keeps samples in approximately `[-1, 1]`.
 */
const SCALE_3D = 0.982;

/**
 * Deterministic Perlin noise. Same seed and coordinates always produce the same sample.
 *
 * @since 1.5.0
 */
export class PerlinNoise {
    /** World / stream seed (lower 32 bits). */
    private worldSeed: number;

    /**
     * Creates a Perlin-noise sampler. Omit `seed` to use `0` (same default as coordinate hashes).
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
     * Samples 1D Perlin noise at `x`.
     *
     * @param x - Continuous world coordinate.
     * @returns Smooth value in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public noise1D(x: number): number {
        const x0 = Math.floor(x);
        const x1 = x0 + 1;
        const xf = x - x0;
        const u = fade(xf);
        const s = this.worldSeed;
        const g0 = (hash1i(x0, s) & 1) === 0 ? 1 : -1;
        const g1 = (hash1i(x1, s) & 1) === 0 ? 1 : -1;
        const n0 = g0 * xf;
        const n1 = g1 * (xf - 1);

        return lerp(n0, n1, u) * SCALE_1D;
    }

    /**
     * Samples 2D Perlin noise at `(x, y)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @returns Smooth value in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public noise2D(x: number, y: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const xf = x - x0;
        const yf = y - y0;
        const u = fade(xf);
        const v = fade(yf);
        const s = this.worldSeed;

        const n00 = grad2(hash2i(x0, y0, s), xf, yf);
        const n10 = grad2(hash2i(x1, y0, s), xf - 1, yf);
        const n01 = grad2(hash2i(x0, y1, s), xf, yf - 1);
        const n11 = grad2(hash2i(x1, y1, s), xf - 1, yf - 1);

        return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * SCALE_2D;
    }

    /**
     * Samples 3D Perlin noise at `(x, y, z)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param z - Continuous world Z.
     * @returns Smooth value in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public noise3D(x: number, y: number, z: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const z1 = z0 + 1;
        const xf = x - x0;
        const yf = y - y0;
        const zf = z - z0;
        const u = fade(xf);
        const v = fade(yf);
        const w = fade(zf);
        const s = this.worldSeed;

        const n000 = grad3(hash3i(x0, y0, z0, s), xf, yf, zf);
        const n100 = grad3(hash3i(x1, y0, z0, s), xf - 1, yf, zf);
        const n010 = grad3(hash3i(x0, y1, z0, s), xf, yf - 1, zf);
        const n110 = grad3(hash3i(x1, y1, z0, s), xf - 1, yf - 1, zf);
        const n001 = grad3(hash3i(x0, y0, z1, s), xf, yf, zf - 1);
        const n101 = grad3(hash3i(x1, y0, z1, s), xf - 1, yf, zf - 1);
        const n011 = grad3(hash3i(x0, y1, z1, s), xf, yf - 1, zf - 1);
        const n111 = grad3(hash3i(x1, y1, z1, s), xf - 1, yf - 1, zf - 1);

        const x00 = lerp(n000, n100, u);
        const x10 = lerp(n010, n110, u);
        const x01 = lerp(n001, n101, u);
        const x11 = lerp(n011, n111, u);

        return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * SCALE_3D;
    }

    /**
     * Fractal Brownian motion over {@link noise1D}.
     *
     * @param x - Continuous world coordinate.
     * @param octaves - Octave count (default `4`; floored, at least 1).
     * @param persistence - Amplitude falloff per octave (default `0.5`).
     * @param lacunarity - Frequency scale per octave (default `2`).
     * @returns Normalized fBm in approximately `[-1, 1]`.
     * @since 1.5.0
     */
    public fbm1D(
        x: number,
        octaves = DEFAULT_OCTAVES,
        persistence = DEFAULT_PERSISTENCE,
        lacunarity = DEFAULT_LACUNARITY,
    ): number {
        return fbm1((sx) => this.noise1D(sx), x, octaves, persistence, lacunarity);
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
