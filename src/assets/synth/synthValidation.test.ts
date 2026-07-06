/**
 * Unit tests for {@link validateSynthParams}.
 */

import { describe, expect, it } from 'vitest';

import type { SynthParams } from './SynthParams';
import { validateSynthParams } from './synthValidation';

/**
 * Builds a valid baseline `SynthParams`, overridden per test.
 *
 * @param overrides - Fields to override on top of the baseline.
 * @returns A valid `SynthParams` value merged with `overrides`.
 */
function buildParams(overrides: Partial<SynthParams> = {}): SynthParams {
    return {
        waveform: 'sine',
        frequency: 440,
        duration: 1,
        seed: 1,
        ...overrides,
    };
}

describe('validateSynthParams', () => {
    it('should not throw for valid minimal params', () => {
        expect(() => validateSynthParams(buildParams(), 48000)).not.toThrow();
    });

    it('should not throw for valid fully specified params', () => {
        const params = buildParams({
            volume: 0.8,
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 },
            pitchSweep: { toFrequency: 880 },
            vibrato: { rate: 5, depth: 10 },
            noiseMix: 0.3,
            dutyCycle: 0.25,
        });

        expect(() => validateSynthParams(params, 48000)).not.toThrow();
    });

    it('should throw for an unsupported waveform', () => {
        const params = buildParams({ waveform: 'wobble' as SynthParams['waveform'] });

        expect(() => validateSynthParams(params, 48000)).toThrow(/waveform/);
    });

    it('should throw for a zero duration', () => {
        expect(() => validateSynthParams(buildParams({ duration: 0 }), 48000)).toThrow(/duration/);
    });

    it('should throw for a negative duration', () => {
        expect(() => validateSynthParams(buildParams({ duration: -1 }), 48000)).toThrow(/duration/);
    });

    it('should throw for a zero sample rate', () => {
        expect(() => validateSynthParams(buildParams(), 0)).toThrow(/sample rate/);
    });

    it('should throw for a zero frequency', () => {
        expect(() => validateSynthParams(buildParams({ frequency: 0 }), 48000)).toThrow(/frequency/);
    });

    it('should throw for a negative envelope attack', () => {
        const params = buildParams({ envelope: { attack: -1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.attack/);
    });

    it('should throw for a negative envelope decay', () => {
        const params = buildParams({ envelope: { decay: -1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.decay/);
    });

    it('should throw for a negative envelope release', () => {
        const params = buildParams({ envelope: { release: -1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.release/);
    });

    it('should throw for a sustain above 1', () => {
        const params = buildParams({ envelope: { sustain: 1.5 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/sustain/);
    });

    it('should throw for a negative sustain', () => {
        const params = buildParams({ envelope: { sustain: -0.1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/sustain/);
    });

    it('should throw for a non-positive pitch sweep target frequency', () => {
        const params = buildParams({ pitchSweep: { toFrequency: 0 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/pitch sweep/);
    });

    it('should throw for a negative vibrato rate', () => {
        const params = buildParams({ vibrato: { rate: -1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/vibrato\.rate/);
    });

    it('should throw for a negative vibrato depth', () => {
        const params = buildParams({ vibrato: { depth: -1 } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/vibrato\.depth/);
    });

    it('should throw for a noiseMix above 1', () => {
        expect(() => validateSynthParams(buildParams({ noiseMix: 1.5 }), 48000)).toThrow(/noiseMix/);
    });

    it('should throw for a negative noiseMix', () => {
        expect(() => validateSynthParams(buildParams({ noiseMix: -0.5 }), 48000)).toThrow(/noiseMix/);
    });

    it('should throw for a dutyCycle above 1', () => {
        expect(() => validateSynthParams(buildParams({ dutyCycle: 1.5 }), 48000)).toThrow(/dutyCycle/);
    });

    it('should throw for a negative dutyCycle', () => {
        expect(() => validateSynthParams(buildParams({ dutyCycle: -0.5 }), 48000)).toThrow(/dutyCycle/);
    });
});
