/**
 * Unit tests for {@link PerlinNoise}.
 */

import { describe, expect, it } from 'vitest';

import { PerlinNoise } from './PerlinNoise';
import { Random } from './Random';

describe('PerlinNoise', () => {
    it('should return the same sample for the same seed and coordinates', () => {
        const a = new PerlinNoise(42);
        const b = new PerlinNoise(42);

        expect(a.noise1D(1.25)).toBe(b.noise1D(1.25));
        expect(a.noise2D(1.25, -3.5)).toBe(b.noise2D(1.25, -3.5));
        expect(a.noise3D(0.1, 0.2, 0.3)).toBe(b.noise3D(0.1, 0.2, 0.3));
    });

    it('should treat an omitted seed as 0', () => {
        const a = new PerlinNoise();
        const b = new PerlinNoise(0);

        expect(a.noise2D(3.1, 4.2)).toBe(b.noise2D(3.1, 4.2));
    });

    it('should change when the seed changes', () => {
        const a = new PerlinNoise(1);
        const b = new PerlinNoise(2);
        let differs = false;

        for (let i = 0; i < 64; i++) {
            if (a.noise2D(i * 0.37 + 0.1, i * 0.19 + 0.2) !== b.noise2D(i * 0.37 + 0.1, i * 0.19 + 0.2)) {
                differs = true;
                break;
            }
        }

        expect(differs).toBe(true);
    });

    it('should reseed via seed()', () => {
        const n = new PerlinNoise(1);
        const before: number[] = [];

        for (let i = 0; i < 32; i++) {
            before.push(n.noise2D(i * 0.31 + 0.15, i * -0.27 + 0.4));
        }

        n.seed(99);

        const after: number[] = [];

        for (let i = 0; i < 32; i++) {
            after.push(n.noise2D(i * 0.31 + 0.15, i * -0.27 + 0.4));
        }

        expect(after.some((v, i) => v !== before.at(i))).toBe(true);

        n.seed(1);

        for (let i = 0; i < 32; i++) {
            expect(n.noise2D(i * 0.31 + 0.15, i * -0.27 + 0.4)).toBe(before.at(i));
        }
    });

    it('should keep samples in [-1, 1]', () => {
        const n = new PerlinNoise(7);

        for (let x = -20; x < 20; x += 0.37) {
            const v1 = n.noise1D(x);

            expect(v1).toBeGreaterThanOrEqual(-1);
            expect(v1).toBeLessThanOrEqual(1);

            for (let y = -5; y < 5; y += 0.41) {
                const v2 = n.noise2D(x, y);

                expect(v2).toBeGreaterThanOrEqual(-1);
                expect(v2).toBeLessThanOrEqual(1);

                const v3 = n.noise3D(x, y, x * 0.1);

                expect(v3).toBeGreaterThanOrEqual(-1);
                expect(v3).toBeLessThanOrEqual(1);
            }
        }
    });

    it('should reach close to both ends of [-1, 1] in 1D and 2D', () => {
        const n = new PerlinNoise(1234);
        const coords = new Random(99);
        let min1 = Infinity;
        let max1 = -Infinity;
        let min2 = Infinity;
        let max2 = -Infinity;

        for (let i = 0; i < 100_000; i++) {
            const x = coords.float(-500, 500);
            const y = coords.float(-500, 500);
            const v1 = n.noise1D(x);
            const v2 = n.noise2D(x, y);

            min1 = Math.min(min1, v1);
            max1 = Math.max(max1, v1);
            min2 = Math.min(min2, v2);
            max2 = Math.max(max2, v2);
        }

        expect(max1).toBeGreaterThan(0.9);
        expect(min1).toBeLessThan(-0.9);
        expect(max2).toBeGreaterThan(0.9);
        expect(min2).toBeLessThan(-0.9);
    });

    it('should vary continuously for small steps', () => {
        const n = new PerlinNoise(11);
        const eps = 1e-3;
        const maxDelta = 0.05;

        for (let i = 0; i < 50; i++) {
            const x = i * 0.17;
            const y = i * -0.13;

            expect(Math.abs(n.noise1D(x + eps) - n.noise1D(x))).toBeLessThan(maxDelta);
            expect(Math.abs(n.noise2D(x + eps, y) - n.noise2D(x, y))).toBeLessThan(maxDelta);
            expect(Math.abs(n.noise3D(x, y + eps, 0.5) - n.noise3D(x, y, 0.5))).toBeLessThan(maxDelta);
        }
    });

    it('should keep fBm in [-1, 1] and change with more octaves', () => {
        const n = new PerlinNoise(3);
        const one = n.fbm2D(1.2, 3.4, 1);
        const many = n.fbm2D(1.2, 3.4, 6);

        expect(one).not.toBe(many);

        for (let x = 0; x < 10; x += 0.5) {
            for (let y = 0; y < 10; y += 0.5) {
                const v = n.fbm2D(x, y);
                const v1 = n.fbm1D(x);
                const v3 = n.fbm3D(x, y, 0.25);

                expect(v).toBeGreaterThanOrEqual(-1);
                expect(v).toBeLessThanOrEqual(1);
                expect(v1).toBeGreaterThanOrEqual(-1);
                expect(v1).toBeLessThanOrEqual(1);
                expect(v3).toBeGreaterThanOrEqual(-1);
                expect(v3).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe('PerlinNoise seed validation', () => {
    it('throws a RangeError for a non-finite seed', () => {
        const n = new PerlinNoise(1);

        expect(() => n.seed(undefined as unknown as number)).toThrow(RangeError);
        expect(() => n.seed(undefined as unknown as number)).toThrow(
            "Can't seed PerlinNoise with undefined: it must be a finite number",
        );
        expect(() => new PerlinNoise(Number.NaN)).toThrow(RangeError);
    });

    it('still treats an omitted seed as 0', () => {
        expect(() => new PerlinNoise()).not.toThrow();
    });
});

describe('PerlinNoise fBm sums', () => {
    // Three layers, persistence 0.4, lacunarity 3: weights 1, 0.4, 0.16 at 1x, 3x, 9x.
    const weightSum = 1 + 0.4 + 0.16;

    it('matches the hand-computed weighted sum of layers in 1D', () => {
        const n = new PerlinNoise(7);
        const x = 1.37;
        const expected = (n.noise1D(x) + 0.4 * n.noise1D(3 * x) + 0.16 * n.noise1D(9 * x)) / weightSum;

        expect(n.fbm1D(x, 3, 0.4, 3)).toBeCloseTo(expected, 12);
    });

    it('matches the hand-computed weighted sum of layers in 2D', () => {
        const n = new PerlinNoise(7);
        const [x, y] = [1.37, -2.71];
        const expected = (n.noise2D(x, y) + 0.4 * n.noise2D(3 * x, 3 * y) + 0.16 * n.noise2D(9 * x, 9 * y)) / weightSum;

        expect(n.fbm2D(x, y, 3, 0.4, 3)).toBeCloseTo(expected, 12);
    });

    it('matches the hand-computed weighted sum of layers in 3D', () => {
        const n = new PerlinNoise(7);
        const [x, y, z] = [1.37, -2.71, 0.53];
        const expected =
            (n.noise3D(x, y, z) + 0.4 * n.noise3D(3 * x, 3 * y, 3 * z) + 0.16 * n.noise3D(9 * x, 9 * y, 9 * z)) /
            weightSum;

        expect(n.fbm3D(x, y, z, 3, 0.4, 3)).toBeCloseTo(expected, 12);
    });

    it('uses the default 4 layers, persistence 0.5, lacunarity 2', () => {
        const n = new PerlinNoise(7);
        const x = 1.37;

        expect(n.fbm1D(x)).toBeCloseTo(n.fbm1D(x, 4, 0.5, 2), 12);
        expect(n.fbm1D(x)).not.toBeCloseTo(n.fbm1D(x, 3, 0.5, 2), 12);
    });
});
