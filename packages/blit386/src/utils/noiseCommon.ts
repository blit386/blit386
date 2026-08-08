/**
 * Shared helpers for procedural pattern noise (value / Perlin / simplex).
 *
 * Not exported from the package – used only by {@link ValueNoise}, {@link PerlinNoise},
 * and {@link SimplexNoise}.
 */

/** Reciprocal of 2^32, used to map a uint32 into [0, 1). */
export const INV_2_32 = 1 / 4294967296;

/** Default octave count for fBm helpers. */
export const DEFAULT_OCTAVES = 4;

/** Default amplitude falloff per octave for fBm helpers. */
export const DEFAULT_PERSISTENCE = 0.5;

/** Default frequency multiplier per octave for fBm helpers. */
export const DEFAULT_LACUNARITY = 2;

/**
 * Remaps an unsigned 32-bit hash into `[-1, 1)`.
 *
 * @param u – Unsigned 32-bit value from `hash*i`.
 * @returns Float in `[-1, 1)`.
 */
export function hashToSigned(u: number): number {
    return u * INV_2_32 * 2 - 1;
}

/**
 * Perlin fade curve (smoothstep quintic): `6t^5 - 15t^4 + 10t^3`.
 *
 * @param t – Interpolation parameter in [0, 1].
 * @returns Smoothed weight in [0, 1].
 */
export function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation.
 *
 * @param a – Start value.
 * @param b – End value.
 * @param t – Blend factor.
 * @returns `a + t * (b - a)`.
 */
export function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

/**
 * Fractal Brownian motion over a 1D noise sample function.
 *
 * Amplitude sum is normalized so the result stays in approximately `[-1, 1]` when
 * each octave sample is in `[-1, 1]`.
 *
 * @param sample – Unit-frequency noise sampler returning approximately `[-1, 1]`.
 * @param x – Sample coordinate.
 * @param octaves – Number of octaves (floored; at least 1).
 * @param persistence – Amplitude multiplier per octave.
 * @param lacunarity – Frequency multiplier per octave.
 * @returns Normalized fBm sample.
 */
export function fbm1(
    sample: (x: number) => number,
    x: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let maxAmp = 0;
    const n = Math.max(1, octaves | 0);

    for (let i = 0; i < n; i++) {
        sum += sample(x * freq) * amp;
        maxAmp += amp;
        amp *= persistence;
        freq *= lacunarity;
    }

    return maxAmp > 0 ? sum / maxAmp : 0;
}

/**
 * Fractal Brownian motion over a 2D noise sample function.
 *
 * @param sample – Unit-frequency noise sampler returning approximately `[-1, 1]`.
 * @param x – X coordinate.
 * @param y – Y coordinate.
 * @param octaves – Number of octaves (floored; at least 1).
 * @param persistence – Amplitude multiplier per octave.
 * @param lacunarity – Frequency multiplier per octave.
 * @returns Normalized fBm sample.
 */
export function fbm2(
    sample: (x: number, y: number) => number,
    x: number,
    y: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let maxAmp = 0;
    const n = Math.max(1, octaves | 0);

    for (let i = 0; i < n; i++) {
        sum += sample(x * freq, y * freq) * amp;
        maxAmp += amp;
        amp *= persistence;
        freq *= lacunarity;
    }

    return maxAmp > 0 ? sum / maxAmp : 0;
}

/**
 * Fractal Brownian motion over a 3D noise sample function.
 *
 * @param sample – Unit-frequency noise sampler returning approximately `[-1, 1]`.
 * @param x – X coordinate.
 * @param y – Y coordinate.
 * @param z – Z coordinate.
 * @param octaves – Number of octaves (floored; at least 1).
 * @param persistence – Amplitude multiplier per octave.
 * @param lacunarity – Frequency multiplier per octave.
 * @returns Normalized fBm sample.
 */
export function fbm3(
    sample: (x: number, y: number, z: number) => number,
    x: number,
    y: number,
    z: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let maxAmp = 0;
    const n = Math.max(1, octaves | 0);

    for (let i = 0; i < n; i++) {
        sum += sample(x * freq, y * freq, z * freq) * amp;
        maxAmp += amp;
        amp *= persistence;
        freq *= lacunarity;
    }

    return maxAmp > 0 ? sum / maxAmp : 0;
}

/** Axis and diagonal unit-ish gradients for 2D Perlin / simplex (8 directions). */
export const GRAD2: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
];

/**
 * Twelve mid-edge unit gradients for 3D Perlin / simplex (classic Perlin set).
 *
 * Values are ±1 on two axes and 0 on the third.
 */
export const GRAD3: readonly (readonly [number, number, number])[] = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
];

/**
 * Dot product of a 2D gradient selected by hash bits.
 *
 * @param hash – Lattice hash (low bits select the gradient).
 * @param x – Offset from lattice point on X.
 * @param y – Offset from lattice point on Y.
 * @returns Gradient · (x, y).
 */
export function grad2(hash: number, x: number, y: number): number {
    const g = GRAD2[hash & 7] as readonly [number, number];

    return g[0] * x + g[1] * y;
}

/**
 * Dot product of a 3D gradient selected by hash bits.
 *
 * @param hash – Lattice hash (low bits select the gradient).
 * @param x – Offset from lattice point on X.
 * @param y – Offset from lattice point on Y.
 * @param z – Offset from lattice point on Z.
 * @returns Gradient · (x, y, z).
 */
export function grad3(hash: number, x: number, y: number, z: number): number {
    const g = GRAD3[hash % 12] as readonly [number, number, number];

    return g[0] * x + g[1] * y + g[2] * z;
}
