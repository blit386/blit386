/**
 * Unit tests for {@link renderSynthSamples}.
 */

import { describe, expect, it } from 'vitest';

import type { SynthParams } from './SynthParams';
import { renderSynthSamples } from './synthRender';

/**
 * Builds a valid baseline `SynthParams`, overridden per test.
 *
 * @param overrides – Fields to override on top of the baseline.
 * @returns A valid `SynthParams` value merged with `overrides`.
 */
function buildParams(overrides: Partial<SynthParams> = {}): SynthParams {
    return {
        waveform: 'sine',
        frequency: 440,
        // Comfortably longer than the default envelope's attack + decay + release (0.21s), so
        // the sustain phase actually plays and tests aren't accidentally silenced by envelope
        // gain hitting 0 across the whole clip.
        duration: 0.3,
        seed: 1,
        ...overrides,
    };
}

describe('renderSynthSamples', () => {
    it('should return a buffer of duration * sampleRate samples', () => {
        const samples = renderSynthSamples(buildParams({ duration: 0.5 }), 1000);

        expect(samples.length).toBe(500);
    });

    it('should return a Float32Array', () => {
        const samples = renderSynthSamples(buildParams(), 8000);

        expect(samples).toBeInstanceOf(Float32Array);
    });

    it('should be deterministic for identical params and seed', () => {
        const a = renderSynthSamples(buildParams({ waveform: 'noise' }), 8000);
        const b = renderSynthSamples(buildParams({ waveform: 'noise' }), 8000);

        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('should produce different noise output for a different seed', () => {
        const a = renderSynthSamples(buildParams({ waveform: 'noise', seed: 1 }), 8000);
        const b = renderSynthSamples(buildParams({ waveform: 'noise', seed: 2 }), 8000);

        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('should keep every sample within [-1, 1]', () => {
        const samples = renderSynthSamples(
            buildParams({ waveform: 'noise', volume: 5, noiseMix: 1, duration: 0.05 }),
            8000,
        );

        for (const sample of samples) {
            expect(sample).toBeGreaterThanOrEqual(-1);
            expect(sample).toBeLessThanOrEqual(1);
        }
    });

    it('should silence the very first sample when the envelope has a positive attack', () => {
        const samples = renderSynthSamples(buildParams({ envelope: { attack: 0.05 } }), 8000);

        expect(samples[0]).toBeCloseTo(0, 5);
    });

    it('should reach full amplitude (scaled by volume) once the attack completes for a sine tone', () => {
        // sine at t just after a 0-length attack should be near its unscaled waveform value.
        const params = buildParams({ waveform: 'sine', frequency: 100, envelope: { attack: 0, decay: 0, sustain: 1 } });
        const sampleRate = 8000;
        const samples = renderSynthSamples(params, sampleRate);

        // Quarter cycle of a 100 Hz tone at 8000 Hz sample rate: 8000 / 100 / 4 = 20 samples in.
        expect(samples[20]).toBeCloseTo(1, 1);
    });

    it('should scale output by volume', () => {
        const loud = renderSynthSamples(
            buildParams({ frequency: 100, envelope: { attack: 0, decay: 0, sustain: 1 }, volume: 1 }),
            8000,
        );
        const quiet = renderSynthSamples(
            buildParams({ frequency: 100, envelope: { attack: 0, decay: 0, sustain: 1 }, volume: 0.5 }),
            8000,
        );

        expect(quiet[20]).toBeCloseTo((loud[20] ?? 0) * 0.5, 5);
    });

    it('should mix noise into a tonal waveform when noiseMix is between 0 and 1', () => {
        const pureTone = renderSynthSamples(buildParams({ waveform: 'square', noiseMix: 0 }), 8000);
        const mixed = renderSynthSamples(buildParams({ waveform: 'square', noiseMix: 0.5 }), 8000);

        expect(Array.from(mixed)).not.toEqual(Array.from(pureTone));
    });

    it('should ignore noiseMix when waveform is already noise', () => {
        const withMix = renderSynthSamples(buildParams({ waveform: 'noise', noiseMix: 0.9, seed: 7 }), 8000);
        const withoutMix = renderSynthSamples(buildParams({ waveform: 'noise', noiseMix: 0, seed: 7 }), 8000);

        expect(Array.from(withMix)).toEqual(Array.from(withoutMix));
    });
});
