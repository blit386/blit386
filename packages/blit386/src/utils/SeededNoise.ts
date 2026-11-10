/**
 * Seed handling and fBm loops shared by {@link ValueNoise}, {@link PerlinNoise}, and {@link SimplexNoise}.
 *
 * Not exported from the package. The fBm loops call `this.noise2D` / `this.noise3D` / `this.noise1D`
 * directly, so a terrain loop allocates nothing per sample.
 */

import { randomSeedNotFiniteError } from './errorMessages';
import { DEFAULT_LACUNARITY, DEFAULT_OCTAVES, DEFAULT_PERSISTENCE } from './noiseCommon';

/**
 * Base for the 2D / 3D noise classes: owns the world seed and the 2D and 3D fBm loops.
 */
export abstract class SeededNoise {
    /** World / stream seed (lower 32 bits). */
    protected worldSeed = 0;

    /** Public class name, used in the seed error (survives a consumer's minifier, unlike `constructor.name`). */
    private readonly owner: string;

    /**
     * Stores the class name and applies the initial seed.
     *
     * @param owner - Public class name for error messages.
     * @param seed - Initial seed; validated like {@link seed}.
     */
    protected constructor(owner: string, seed: number) {
        this.owner = owner;
        this.seed(seed);
    }

    /**
     * Reseeds the noise field. Same seed restarts the same spatial pattern.
     *
     * @param seed - Any finite number; only its lower 32 bits are used.
     * @throws RangeError if `seed` is not a finite number.
     * @since 1.5.0
     */
    public seed(seed: number): void {
        if (!Number.isFinite(seed)) {
            throw new RangeError(randomSeedNotFiniteError(this.owner, seed));
        }

        this.worldSeed = seed >>> 0;
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
        const n = Math.max(1, octaves | 0);
        let amp = 1;
        let freq = 1;
        let sum = 0;
        let maxAmp = 0;

        for (let i = 0; i < n; i++) {
            sum += this.noise2D(x * freq, y * freq) * amp;
            maxAmp += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        return maxAmp > 0 ? sum / maxAmp : 0;
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
        const n = Math.max(1, octaves | 0);
        let amp = 1;
        let freq = 1;
        let sum = 0;
        let maxAmp = 0;

        for (let i = 0; i < n; i++) {
            sum += this.noise3D(x * freq, y * freq, z * freq) * amp;
            maxAmp += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        return maxAmp > 0 ? sum / maxAmp : 0;
    }

    /**
     * Samples 2D noise at `(x, y)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @returns Smooth value in approximately `[-1, 1]`.
     */
    public abstract noise2D(x: number, y: number): number;

    /**
     * Samples 3D noise at `(x, y, z)`.
     *
     * @param x - Continuous world X.
     * @param y - Continuous world Y.
     * @param z - Continuous world Z.
     * @returns Smooth value in approximately `[-1, 1]`.
     */
    public abstract noise3D(x: number, y: number, z: number): number;
}

/**
 * Base for the noise classes that also sample 1D: adds the 1D fBm loop.
 */
export abstract class SeededNoise1D extends SeededNoise {
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
        const n = Math.max(1, octaves | 0);
        let amp = 1;
        let freq = 1;
        let sum = 0;
        let maxAmp = 0;

        for (let i = 0; i < n; i++) {
            sum += this.noise1D(x * freq) * amp;
            maxAmp += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        return maxAmp > 0 ? sum / maxAmp : 0;
    }

    /**
     * Samples 1D noise at `x`.
     *
     * @param x - Continuous world coordinate.
     * @returns Smooth value in approximately `[-1, 1]`.
     */
    public abstract noise1D(x: number): number;
}
