import { describe, expect, it } from 'vitest';

import { Color32 } from './Color32';
import type { EasingFunction } from './Easing';
import { applyEasing, interpolate } from './Easing';
import { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

const ALL_EASINGS: EasingFunction[] = [
    'linear',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'sine-in',
    'sine-out',
    'sine-in-out',
    'cubic-in',
    'cubic-out',
    'cubic-in-out',
    'quartic-in',
    'quartic-out',
    'quartic-in-out',
    'quintic-in',
    'quintic-out',
    'quintic-in-out',
    'expo-in',
    'expo-out',
    'expo-in-out',
    'circ-in',
    'circ-out',
    'circ-in-out',
    'back-in',
    'back-out',
    'back-in-out',
    'elastic-in',
    'elastic-out',
    'elastic-in-out',
    'bounce-in',
    'bounce-out',
    'bounce-in-out',
];

/** One mid-point sample per curve family (in variant). */
const FAMILY_MIDPOINTS: { easing: EasingFunction; expected: number }[] = [
    { easing: 'linear', expected: 0.5 },
    { easing: 'ease-in', expected: 0.25 },
    { easing: 'sine-in', expected: 1 - Math.SQRT1_2 },
    { easing: 'cubic-in', expected: 0.125 },
    { easing: 'quartic-in', expected: 0.0625 },
    { easing: 'quintic-in', expected: 0.03125 },
    { easing: 'expo-in', expected: 2 ** -5 },
    { easing: 'circ-in', expected: 1 - Math.sqrt(0.75) },
    { easing: 'back-in', expected: 0.125 - 0.5 },
    { easing: 'elastic-in', expected: Math.sin(13 * (Math.PI / 2) * 0.5) * 2 ** -5 },
    { easing: 'bounce-in', expected: 1 - ((363 / 40) * 0.25 - (99 / 10) * 0.5 + 17 / 5) },
];

describe('applyEasing', () => {
    describe('boundary values', () => {
        for (const easing of ALL_EASINGS) {
            it(`${easing}: f(0) === 0`, () => {
                expect(applyEasing(0, easing)).toBeCloseTo(0, 10);
            });

            it(`${easing}: f(1) === 1`, () => {
                expect(applyEasing(1, easing)).toBeCloseTo(1, 10);
            });
        }
    });

    describe('family mid-points', () => {
        for (const { easing, expected } of FAMILY_MIDPOINTS) {
            it(`${easing} at t=0.5`, () => {
                expect(applyEasing(0.5, easing)).toBeCloseTo(expected, 10);
            });
        }
    });

    describe('linear', () => {
        it('returns input unchanged', () => {
            expect(applyEasing(0.25, 'linear')).toBe(0.25);
            expect(applyEasing(0.5, 'linear')).toBe(0.5);
            expect(applyEasing(0.75, 'linear')).toBe(0.75);
        });
    });

    describe('ease-in (quadratic)', () => {
        it('starts slow (value below linear)', () => {
            expect(applyEasing(0.5, 'ease-in')).toBe(0.25);
        });

        it('is monotonically increasing', () => {
            let prev = 0;

            for (let t = 0.1; t <= 1.0; t += 0.1) {
                const val = applyEasing(t, 'ease-in');

                expect(val).toBeGreaterThan(prev);

                prev = val;
            }
        });
    });

    describe('ease-out (quadratic)', () => {
        it('starts fast (value above linear)', () => {
            expect(applyEasing(0.5, 'ease-out')).toBe(0.75);
        });

        it('is monotonically increasing', () => {
            let prev = 0;

            for (let t = 0.1; t <= 1.0; t += 0.1) {
                const val = applyEasing(t, 'ease-out');

                expect(val).toBeGreaterThan(prev);

                prev = val;
            }
        });
    });

    describe('ease-in-out', () => {
        it('passes through 0.5 at t=0.5', () => {
            expect(applyEasing(0.5, 'ease-in-out')).toBe(0.5);
        });

        it('is below linear in first half', () => {
            expect(applyEasing(0.25, 'ease-in-out')).toBeLessThan(0.25);
        });

        it('is above linear in second half', () => {
            expect(applyEasing(0.75, 'ease-in-out')).toBeGreaterThan(0.75);
        });

        it('is monotonically increasing', () => {
            let prev = 0;

            for (let t = 0.1; t <= 1.0; t += 0.1) {
                const val = applyEasing(t, 'ease-in-out');

                expect(val).toBeGreaterThan(prev);

                prev = val;
            }
        });
    });

    describe('overshoot families', () => {
        it('back-in dips below 0 before rising', () => {
            expect(applyEasing(0.5, 'back-in')).toBeLessThan(0);
        });

        it('back-out overshoots above 1 before settling', () => {
            expect(applyEasing(0.5, 'back-out')).toBeGreaterThan(1);
        });

        it('elastic-in oscillates below 0 near the start', () => {
            expect(applyEasing(0.25, 'elastic-in')).toBeLessThan(0);
        });
    });
});

describe('interpolate', () => {
    it('lerps numbers with the eased factor', () => {
        expect(interpolate('linear', 10, 20, 0.5)).toBe(15);
        expect(interpolate('ease-in', 0, 100, 0.5)).toBe(25);
    });

    it('returns start at t=0 and end at t=1 for every curve', () => {
        for (const easing of ALL_EASINGS) {
            expect(interpolate(easing, 3, 9, 0)).toBeCloseTo(3, 10);
            expect(interpolate(easing, 3, 9, 1)).toBeCloseTo(9, 10);
        }
    });

    it('rounds Vector2i components to nearest integer', () => {
        const result = interpolate('linear', new Vector2i(0, 0), new Vector2i(10, 10), 0.55);

        expect(result.x).toBe(6);
        expect(result.y).toBe(6);
    });

    it('returns Vector2i endpoints at boundaries', () => {
        const start = new Vector2i(1, 2);
        const end = new Vector2i(9, 8);

        expect(interpolate('bounce-out', start, end, 0).isEqual(start)).toBe(true);
        expect(interpolate('bounce-out', start, end, 1).isEqual(end)).toBe(true);
    });

    it('rounds and clamps Color32 channels to [0, 255]', () => {
        const start = new Color32(0, 0, 0, 0);
        const end = new Color32(255, 100, 50, 255);
        const mid = interpolate('linear', start, end, 0.5);

        expect(mid.r).toBe(128);
        expect(mid.g).toBe(50);
        expect(mid.b).toBe(25);
        expect(mid.a).toBe(128);
    });

    it('clamps Color32 overshoot from back curves', () => {
        const start = new Color32(200, 200, 200, 255);
        const end = new Color32(255, 255, 255, 255);
        const overshot = interpolate('back-out', start, end, 0.5);

        expect(overshot.r).toBeLessThanOrEqual(255);
        expect(overshot.g).toBeLessThanOrEqual(255);
        expect(overshot.b).toBeLessThanOrEqual(255);
        expect(overshot.a).toBe(255);
    });

    it('rounds Rect2i components to nearest integer', () => {
        const result = interpolate('linear', new Rect2i(0, 0, 0, 0), new Rect2i(10, 20, 30, 40), 0.55);

        expect(result.x).toBe(6);
        expect(result.y).toBe(11);
        expect(result.width).toBe(17);
        expect(result.height).toBe(22);
    });

    it('throws when start and end types differ', () => {
        expect(() => interpolate('linear', 0 as unknown as Vector2i, new Vector2i(1, 1), 0.5)).toThrow(/same type/);
    });
});
