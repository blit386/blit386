/**
 * Unit tests for {@link oscillatorSample} and {@link noiseSample}.
 */

import { describe, expect, it } from 'vitest';

import { Rng } from '../../utils/Rng';
import { noiseSample, oscillatorSample } from './synthWaveforms';

describe('oscillatorSample', () => {
    describe('sine', () => {
        it('should be 0 at phase 0', () => {
            expect(oscillatorSample('sine', 0, 0.5)).toBeCloseTo(0, 5);
        });

        it('should peak at 1 a quarter through the cycle', () => {
            expect(oscillatorSample('sine', 0.25, 0.5)).toBeCloseTo(1, 5);
        });

        it('should trough at -1 three quarters through the cycle', () => {
            expect(oscillatorSample('sine', 0.75, 0.5)).toBeCloseTo(-1, 5);
        });
    });

    describe('square', () => {
        it('should be 1 while phase is below the duty cycle', () => {
            expect(oscillatorSample('square', 0.1, 0.5)).toBe(1);
        });

        it('should be -1 once phase reaches the duty cycle', () => {
            expect(oscillatorSample('square', 0.6, 0.5)).toBe(-1);
        });

        it('should respect a narrow duty cycle', () => {
            expect(oscillatorSample('square', 0.1, 0.25)).toBe(1);
            expect(oscillatorSample('square', 0.3, 0.25)).toBe(-1);
        });
    });

    describe('triangle', () => {
        it('should be -1 at phase 0', () => {
            expect(oscillatorSample('triangle', 0, 0.5)).toBeCloseTo(-1, 5);
        });

        it('should cross 0 a quarter through the cycle', () => {
            expect(oscillatorSample('triangle', 0.25, 0.5)).toBeCloseTo(0, 5);
        });

        it('should peak at 1 halfway through the cycle', () => {
            expect(oscillatorSample('triangle', 0.5, 0.5)).toBeCloseTo(1, 5);
        });

        it('should cross 0 again three quarters through the cycle', () => {
            expect(oscillatorSample('triangle', 0.75, 0.5)).toBeCloseTo(0, 5);
        });
    });

    describe('sawtooth', () => {
        it('should be -1 at phase 0', () => {
            expect(oscillatorSample('sawtooth', 0, 0.5)).toBeCloseTo(-1, 5);
        });

        it('should be 0 halfway through the cycle', () => {
            expect(oscillatorSample('sawtooth', 0.5, 0.5)).toBeCloseTo(0, 5);
        });

        it('should approach 1 near the end of the cycle', () => {
            expect(oscillatorSample('sawtooth', 0.999, 0.5)).toBeCloseTo(1, 2);
        });
    });
});

describe('noiseSample', () => {
    it('should return a value in [-1, 1]', () => {
        const rng = new Rng(1);

        for (let i = 0; i < 500; i++) {
            const value = noiseSample(rng);

            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThan(1);
        }
    });

    it('should be deterministic for the same seed', () => {
        const a = new Rng(42);
        const b = new Rng(42);

        expect(noiseSample(a)).toBe(noiseSample(b));
    });

    it('should advance the RNG on every call', () => {
        const rng = new Rng(42);

        const first = noiseSample(rng);
        const second = noiseSample(rng);

        expect(first).not.toBe(second);
    });
});
