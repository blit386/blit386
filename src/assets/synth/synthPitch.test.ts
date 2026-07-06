/**
 * Unit tests for {@link sweepFrequencyAt}, {@link vibratoOffsetAt}, and
 * {@link instantaneousFrequencyAt}.
 */

import { describe, expect, it } from 'vitest';

import { instantaneousFrequencyAt, sweepFrequencyAt, vibratoOffsetAt } from './synthPitch';

describe('sweepFrequencyAt', () => {
    it('should return the base frequency unchanged when pitchSweep is undefined', () => {
        expect(sweepFrequencyAt(0.5, 1, 440, undefined)).toBe(440);
    });

    it('should return the base frequency at t=0', () => {
        expect(sweepFrequencyAt(0, 1, 440, { toFrequency: 880 })).toBeCloseTo(440, 5);
    });

    it('should return the target frequency at t=duration', () => {
        expect(sweepFrequencyAt(1, 1, 440, { toFrequency: 880 })).toBeCloseTo(880, 5);
    });

    it('should interpolate linearly at the midpoint', () => {
        expect(sweepFrequencyAt(0.5, 1, 440, { toFrequency: 880 })).toBeCloseTo(660, 5);
    });

    it('should sweep downward when the target is lower than the base', () => {
        expect(sweepFrequencyAt(0.5, 1, 880, { toFrequency: 440 })).toBeCloseTo(660, 5);
    });

    it('should return the base frequency when duration is 0', () => {
        expect(sweepFrequencyAt(0, 0, 440, { toFrequency: 880 })).toBe(440);
    });
});

describe('vibratoOffsetAt', () => {
    it('should return 0 when vibrato is undefined', () => {
        expect(vibratoOffsetAt(0.5, undefined)).toBe(0);
    });

    it('should return 0 at t=0 regardless of depth', () => {
        expect(vibratoOffsetAt(0, { rate: 5, depth: 10 })).toBeCloseTo(0, 5);
    });

    it('should return 0 when depth is 0', () => {
        expect(vibratoOffsetAt(0.25, { rate: 5, depth: 0 })).toBeCloseTo(0, 5);
    });

    it('should reach the positive peak a quarter cycle in', () => {
        // rate=1 Hz -> full cycle over 1 second -> quarter cycle at t=0.25
        expect(vibratoOffsetAt(0.25, { rate: 1, depth: 10 })).toBeCloseTo(10, 5);
    });

    it('should reach the negative peak three quarters of a cycle in', () => {
        expect(vibratoOffsetAt(0.75, { rate: 1, depth: 10 })).toBeCloseTo(-10, 5);
    });
});

describe('instantaneousFrequencyAt', () => {
    it('should return the base frequency with no sweep or vibrato', () => {
        expect(instantaneousFrequencyAt(0.5, 1, 440, undefined, undefined)).toBeCloseTo(440, 5);
    });

    it('should combine sweep and vibrato', () => {
        const value = instantaneousFrequencyAt(0.25, 1, 440, { toFrequency: 880 }, { rate: 1, depth: 10 });

        // sweep at t=0.25 -> 440 + (880-440)*0.25 = 550; vibrato peak at t=0.25 with rate=1 -> +10
        expect(value).toBeCloseTo(560, 5);
    });

    it('should never return a negative frequency', () => {
        const value = instantaneousFrequencyAt(0.25, 1, 5, undefined, { rate: 1, depth: 100 });

        expect(value).toBeGreaterThanOrEqual(0);
    });
});
