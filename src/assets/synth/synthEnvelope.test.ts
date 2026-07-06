/**
 * Unit tests for {@link resolveEnvelope} and {@link envelopeValueAt}.
 */

import { describe, expect, it } from 'vitest';

import { envelopeValueAt, resolveEnvelope } from './synthEnvelope';
import { DEFAULT_ATTACK, DEFAULT_DECAY, DEFAULT_RELEASE, DEFAULT_SUSTAIN } from './SynthParams';

describe('resolveEnvelope', () => {
    it('should fill in every default when envelope is undefined', () => {
        expect(resolveEnvelope(undefined)).toEqual({
            attack: DEFAULT_ATTACK,
            decay: DEFAULT_DECAY,
            sustain: DEFAULT_SUSTAIN,
            release: DEFAULT_RELEASE,
        });
    });

    it('should fill in defaults only for omitted fields', () => {
        expect(resolveEnvelope({ attack: 0.5 })).toEqual({
            attack: 0.5,
            decay: DEFAULT_DECAY,
            sustain: DEFAULT_SUSTAIN,
            release: DEFAULT_RELEASE,
        });
    });

    it('should keep every explicit field', () => {
        expect(resolveEnvelope({ attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.4 })).toEqual({
            attack: 0.1,
            decay: 0.2,
            sustain: 0.3,
            release: 0.4,
        });
    });
});

describe('envelopeValueAt', () => {
    const envelope = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 };
    const duration = 1;

    it('should ramp from 0 to 1 across the attack phase', () => {
        expect(envelopeValueAt(0, duration, envelope)).toBeCloseTo(0, 5);
        expect(envelopeValueAt(0.05, duration, envelope)).toBeCloseTo(0.5, 5);
        expect(envelopeValueAt(0.1, duration, envelope)).toBeCloseTo(1, 5);
    });

    it('should fall from 1 to sustain across the decay phase', () => {
        expect(envelopeValueAt(0.1, duration, envelope)).toBeCloseTo(1, 5);
        expect(envelopeValueAt(0.2, duration, envelope)).toBeCloseTo(0.75, 5);
        expect(envelopeValueAt(0.3, duration, envelope)).toBeCloseTo(0.5, 5);
    });

    it('should hold at sustain until the release phase begins', () => {
        expect(envelopeValueAt(0.5, duration, envelope)).toBeCloseTo(0.5, 5);
        expect(envelopeValueAt(0.69, duration, envelope)).toBeCloseTo(0.5, 5);
    });

    it('should fall from sustain to 0 across the release phase, ending exactly at duration', () => {
        // releaseStart = duration - release = 0.7
        expect(envelopeValueAt(0.7, duration, envelope)).toBeCloseTo(0.5, 5);
        expect(envelopeValueAt(0.85, duration, envelope)).toBeCloseTo(0.25, 5);
        expect(envelopeValueAt(1, duration, envelope)).toBeCloseTo(0, 5);
    });

    it('should return 0 immediately when release is 0 and duration is reached', () => {
        const noRelease = { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0 };

        expect(envelopeValueAt(1, duration, noRelease)).toBe(0);
    });

    it('should return 1 immediately at t=0 when attack is 0', () => {
        const noAttack = { attack: 0, decay: 0.1, sustain: 0.5, release: 0.1 };

        expect(envelopeValueAt(0, duration, noAttack)).toBeCloseTo(1, 5);
    });

    it('should release correctly from mid-attack/decay when duration is shorter than attack+decay+release', () => {
        // A very short percussive hit: attack+decay+release all compressed by a short duration.
        const shortEnvelope = { attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.5 };
        const shortDuration = 0.2;

        // releaseStart = max(0.2 - 0.5, 0) = 0, so the entire clip is release, starting from
        // whatever gain the attack phase had reached at t=0 (which is 0).
        expect(envelopeValueAt(0, shortDuration, shortEnvelope)).toBeCloseTo(0, 5);
        expect(envelopeValueAt(shortDuration, shortDuration, shortEnvelope)).toBeCloseTo(0, 5);
    });

    it('should never return a negative gain', () => {
        for (let t = 0; t <= duration; t += 0.01) {
            expect(envelopeValueAt(t, duration, envelope)).toBeGreaterThanOrEqual(0);
        }
    });

    it('should never return a gain greater than 1', () => {
        for (let t = 0; t <= duration; t += 0.01) {
            expect(envelopeValueAt(t, duration, envelope)).toBeLessThanOrEqual(1);
        }
    });
});
