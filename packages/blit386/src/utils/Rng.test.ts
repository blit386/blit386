/**
 * Unit tests for {@link Rng}.
 */

import { describe, expect, it } from 'vitest';

import { Rng } from './Rng';

describe('Rng', () => {
    describe('next', () => {
        it('should return a value in [0, 1)', () => {
            const rng = new Rng(1);

            for (let i = 0; i < 1000; i++) {
                const value = rng.next();

                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(1);
            }
        });

        it('should produce the same sequence for the same seed', () => {
            const a = new Rng(1234);
            const b = new Rng(1234);

            const sequenceA = Array.from({ length: 10 }, () => a.next());
            const sequenceB = Array.from({ length: 10 }, () => b.next());

            expect(sequenceA).toEqual(sequenceB);
        });

        it('should produce different sequences for different seeds', () => {
            const a = new Rng(1);
            const b = new Rng(2);

            const sequenceA = Array.from({ length: 10 }, () => a.next());
            const sequenceB = Array.from({ length: 10 }, () => b.next());

            expect(sequenceA).not.toEqual(sequenceB);
        });

        it('should advance state on every call (not return a constant)', () => {
            const rng = new Rng(42);

            const first = rng.next();
            const second = rng.next();

            expect(first).not.toBe(second);
        });

        it('should accept a seed of 0', () => {
            const rng = new Rng(0);

            const value = rng.next();

            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        });
    });

    describe('nextRange', () => {
        it('should return a value within [min, max)', () => {
            const rng = new Rng(7);

            for (let i = 0; i < 500; i++) {
                const value = rng.nextRange(10, 20);

                expect(value).toBeGreaterThanOrEqual(10);
                expect(value).toBeLessThan(20);
            }
        });

        it('should be deterministic for the same seed', () => {
            const a = new Rng(99);
            const b = new Rng(99);

            expect(a.nextRange(-5, 5)).toBe(b.nextRange(-5, 5));
        });
    });

    describe('nextInt', () => {
        it('should return a whole number within [min, max] inclusive', () => {
            const rng = new Rng(3);

            for (let i = 0; i < 500; i++) {
                const value = rng.nextInt(1, 6);

                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(6);
            }
        });

        it('should be able to return the inclusive max bound', () => {
            const rng = new Rng(3);
            const values = new Set(Array.from({ length: 2000 }, () => rng.nextInt(0, 1)));

            expect(values.has(1)).toBe(true);
        });

        it('should be deterministic for the same seed', () => {
            const a = new Rng(55);
            const b = new Rng(55);

            expect(a.nextInt(0, 100)).toBe(b.nextInt(0, 100));
        });
    });
});
