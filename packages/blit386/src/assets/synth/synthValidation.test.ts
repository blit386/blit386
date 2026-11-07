/**
 * Unit tests for {@link validateSynthParams}.
 */

import { describe, expect, it } from 'vitest';

import type { SynthParams } from './SynthParams';
import { MAX_SYNTH_DURATION_SECONDS } from './SynthParams';
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

    it('should not throw for a duration exactly at the maximum', () => {
        const params = buildParams({ duration: MAX_SYNTH_DURATION_SECONDS });

        expect(() => validateSynthParams(params, 48000)).not.toThrow();
    });

    it('should throw for a duration exceeding the maximum', () => {
        const params = buildParams({ duration: MAX_SYNTH_DURATION_SECONDS + 1 });

        expect(() => validateSynthParams(params, 48000)).toThrow(/duration/);
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

describe('validateSynthParams seed', () => {
    it('should throw for a missing seed instead of time-seeding the noise', () => {
        const params = { waveform: 'noise', frequency: 440, duration: 1 } as unknown as SynthParams;

        expect(() => validateSynthParams(params, 48000)).toThrow(/seed/);
    });

    it('should throw for a non-finite seed', () => {
        expect(() => validateSynthParams(buildParams({ seed: Number.NaN }), 48000)).toThrow(/seed/);
    });
});

describe('validateSynthParams non-finite numbers', () => {
    it('should throw for a NaN volume', () => {
        expect(() => validateSynthParams(buildParams({ volume: Number.NaN }), 48000)).toThrow(/volume/);
    });

    it('should throw for an infinite volume', () => {
        expect(() => validateSynthParams(buildParams({ volume: Number.POSITIVE_INFINITY }), 48000)).toThrow(/volume/);
    });

    it('should throw for a negative volume', () => {
        expect(() => validateSynthParams(buildParams({ volume: -0.5 }), 48000)).toThrow(/volume/);
    });

    it('should accept a volume above 1, since the output is clamped', () => {
        expect(() => validateSynthParams(buildParams({ volume: 2 }), 48000)).not.toThrow();
    });

    it('should throw for a NaN dutyCycle', () => {
        expect(() => validateSynthParams(buildParams({ dutyCycle: Number.NaN }), 48000)).toThrow(/dutyCycle/);
    });

    it('should throw for a NaN noiseMix', () => {
        expect(() => validateSynthParams(buildParams({ noiseMix: Number.NaN }), 48000)).toThrow(/noiseMix/);
    });

    it('should throw for a NaN envelope.attack', () => {
        const params = buildParams({ envelope: { attack: Number.NaN } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.attack/);
    });

    it('should throw for an infinite envelope.decay', () => {
        const params = buildParams({ envelope: { decay: Number.POSITIVE_INFINITY } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.decay/);
    });

    it('should throw for a NaN envelope.release', () => {
        const params = buildParams({ envelope: { release: Number.NaN } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/envelope\.release/);
    });

    it('should throw for a NaN envelope.sustain', () => {
        const params = buildParams({ envelope: { sustain: Number.NaN } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/sustain/);
    });

    it('should throw for a NaN vibrato.rate', () => {
        const params = buildParams({ vibrato: { rate: Number.NaN } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/vibrato\.rate/);
    });

    it('should throw for a NaN vibrato.depth', () => {
        const params = buildParams({ vibrato: { depth: Number.NaN } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/vibrato\.depth/);
    });

    it('should throw for an infinite frequency', () => {
        const params = buildParams({ frequency: Number.POSITIVE_INFINITY });

        expect(() => validateSynthParams(params, 48000)).toThrow(/frequency/);
    });

    it('should throw for an infinite pitchSweep.toFrequency', () => {
        const params = buildParams({ pitchSweep: { toFrequency: Number.POSITIVE_INFINITY } });

        expect(() => validateSynthParams(params, 48000)).toThrow(/pitch sweep/);
    });

    it('should throw for an infinite sample rate', () => {
        expect(() => validateSynthParams(buildParams(), Number.POSITIVE_INFINITY)).toThrow(/sample rate/);
    });

    it('should throw for an infinite duration', () => {
        const params = buildParams({ duration: Number.POSITIVE_INFINITY });

        expect(() => validateSynthParams(params, 48000)).toThrow(/duration/);
    });
});
