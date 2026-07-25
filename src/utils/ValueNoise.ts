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
import {
    DEFAULT_LACUNARITY,
    DEFAULT_OCTAVES,
    DEFAULT_PERSISTENCE,
    fade,
    fbm1,
    fbm2,
    fbm3,
    hashToSigned,
    lerp,
} from './noiseCommon';

/**
 * Deterministic value noise. Same seed and coordinates always produce the same sample.
 *
 * @since 1.5.0
 */
export class ValueNoise {
    /** World / stream seed (lower 32 bits). */
    private worldSeed: number;

    /**
     * Creates a value-noise sampler. Omit `seed` to use `0` (same default as coordinate hashes).
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
