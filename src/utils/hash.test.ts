/**
 * Unit tests for {@link hash1i}, {@link hash2i}, {@link hash3i} and float forms.
 */

import { describe, expect, it } from 'vitest';

import { hash1, hash1i, hash2, hash2i, hash3, hash3i } from './hash';

const INV_2_32 = 1 / 4294967296;
const UINT32_MAX_EXCLUSIVE = 4294967296;

describe('hash1i / hash1', () => {
    it('should return the same uint32 for the same inputs', () => {
        expect(hash1i(12, 99)).toBe(hash1i(12, 99));
        expect(hash1(12, 99)).toBe(hash1(12, 99));
    });

    it('should treat an omitted seed as 0', () => {
        expect(hash1i(5)).toBe(hash1i(5, 0));
        expect(hash1(5)).toBe(hash1(5, 0));
    });

    it('should change when x or seed changes', () => {
        const base = hash1i(10, 1);

        expect(hash1i(11, 1)).not.toBe(base);
        expect(hash1i(10, 2)).not.toBe(base);
        expect(hash1i(10, 0)).not.toBe(base);
    });

    it('should truncate fractional coordinates toward zero', () => {
        expect(hash1i(1.9, 0)).toBe(hash1i(1, 0));
        expect(hash1i(-1.9, 0)).toBe(hash1i(-1, 0));
    });

    it('should keep hash1i in [0, 2^32) and hash1 in [0, 1)', () => {
        for (let i = -50; i < 50; i++) {
            const u = hash1i(i, i + 7);
            const f = hash1(i, i + 7);

            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(UINT32_MAX_EXCLUSIVE);
            expect(Number.isInteger(u)).toBe(true);
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThan(1);
            expect(f).toBe(u * INV_2_32);
        }
    });
});

describe('hash2i / hash2', () => {
    it('should return the same uint32 for the same inputs', () => {
        expect(hash2i(3, 4, 5)).toBe(hash2i(3, 4, 5));
        expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    });

    it('should treat an omitted seed as 0', () => {
        expect(hash2i(1, 2)).toBe(hash2i(1, 2, 0));
        expect(hash2(1, 2)).toBe(hash2(1, 2, 0));
    });

    it('should change when any of x, y, or seed changes', () => {
        const base = hash2i(8, 9, 10);

        expect(hash2i(9, 9, 10)).not.toBe(base);
        expect(hash2i(8, 10, 10)).not.toBe(base);
        expect(hash2i(8, 9, 11)).not.toBe(base);
        expect(hash2i(8, 9, 9)).not.toBe(base);
    });

    it('should truncate fractional coordinates toward zero', () => {
        expect(hash2i(1.9, 2.7, 0)).toBe(hash2i(1, 2, 0));
        expect(hash2i(-1.2, -2.8, 3)).toBe(hash2i(-1, -2, 3));
    });

    it('should keep hash2i in [0, 2^32) and hash2 in [0, 1)', () => {
        for (let x = -20; x < 20; x++) {
            for (let y = -5; y < 5; y++) {
                const u = hash2i(x, y, 42);
                const f = hash2(x, y, 42);

                expect(u).toBeGreaterThanOrEqual(0);
                expect(u).toBeLessThan(UINT32_MAX_EXCLUSIVE);
                expect(Number.isInteger(u)).toBe(true);
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThan(1);
                expect(f).toBe(u * INV_2_32);
            }
        }
    });

    it('should cover both high and low halves of the uint32 range', () => {
        let sawLow = false;
        let sawHigh = false;
        const mid = UINT32_MAX_EXCLUSIVE / 2;

        for (let i = 0; i < 256; i++) {
            const u = hash2i(i, 0, 12345);

            if (u < mid) {
                sawLow = true;
            } else {
                sawHigh = true;
            }
        }

        expect(sawLow).toBe(true);
        expect(sawHigh).toBe(true);
    });
});

describe('hash3i / hash3', () => {
    it('should return the same uint32 for the same inputs', () => {
        expect(hash3i(1, 2, 3, 4)).toBe(hash3i(1, 2, 3, 4));
        expect(hash3(1, 2, 3, 4)).toBe(hash3(1, 2, 3, 4));
    });

    it('should treat an omitted seed as 0', () => {
        expect(hash3i(1, 2, 3)).toBe(hash3i(1, 2, 3, 0));
        expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3, 0));
    });

    it('should change when any of x, y, z, or seed changes', () => {
        const base = hash3i(1, 2, 3, 4);

        expect(hash3i(2, 2, 3, 4)).not.toBe(base);
        expect(hash3i(1, 3, 3, 4)).not.toBe(base);
        expect(hash3i(1, 2, 4, 4)).not.toBe(base);
        expect(hash3i(1, 2, 3, 5)).not.toBe(base);
    });

    it('should truncate fractional coordinates toward zero', () => {
        expect(hash3i(1.9, 2.7, 3.1, 0)).toBe(hash3i(1, 2, 3, 0));
    });

    it('should keep hash3i in [0, 2^32) and hash3 in [0, 1)', () => {
        for (let i = 0; i < 40; i++) {
            const u = hash3i(i, i + 1, i + 2, 7);
            const f = hash3(i, i + 1, i + 2, 7);

            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(UINT32_MAX_EXCLUSIVE);
            expect(Number.isInteger(u)).toBe(true);
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThan(1);
            expect(f).toBe(u * INV_2_32);
        }
    });
});
