/**
 * Unit tests for the preset sound library ({@link jump}, {@link pickup}, {@link explosion},
 * {@link laser}, {@link hit}, {@link blip}).
 *
 * Mirrors the "iterate over a named set" style used by `Easing.test.ts`: every preset is run
 * through the same shared assertions, plus a couple of preset-specific character checks.
 */

import { describe, expect, it } from 'vitest';

import type { SynthParams } from './SynthParams';
import { blip, explosion, hit, jump, laser, pickup } from './synthPresets';
import { renderSynthSamples } from './synthRender';
import { validateSynthParams } from './synthValidation';

/** Every preset factory under test, named for readable failure output. */
const ALL_PRESETS: Array<{ name: string; factory: (seed?: number) => SynthParams }> = [
    { name: 'jump', factory: jump },
    { name: 'pickup', factory: pickup },
    { name: 'explosion', factory: explosion },
    { name: 'laser', factory: laser },
    { name: 'hit', factory: hit },
    { name: 'blip', factory: blip },
];

const MOCK_SAMPLE_RATE = 8000;

describe('synth presets', () => {
    for (const { name, factory } of ALL_PRESETS) {
        describe(name, () => {
            it('returns a structurally valid SynthParams', () => {
                const params = factory(1);

                expect(['sine', 'square', 'triangle', 'sawtooth', 'noise']).toContain(params.waveform);
                expect(params.frequency).toBeGreaterThan(0);
                expect(params.duration).toBeGreaterThan(0);
                expect(typeof params.seed).toBe('number');
            });

            it('passes validateSynthParams without throwing', () => {
                expect(() => validateSynthParams(factory(1), MOCK_SAMPLE_RATE)).not.toThrow();
                expect(() => validateSynthParams(factory(), MOCK_SAMPLE_RATE)).not.toThrow();
            });

            it('round-trips through JSON without loss', () => {
                const params = factory(7);

                expect(JSON.parse(JSON.stringify(params))).toEqual(params);
            });

            it('is deterministic for the same seed', () => {
                expect(factory(42)).toEqual(factory(42));
            });

            it('produces different params for different seeds', () => {
                expect(factory(1)).not.toEqual(factory(2));
            });

            it('defaults to a fixed, reproducible variant when seed is omitted', () => {
                expect(factory()).toEqual(factory());
                expect(factory()).toEqual(factory(0));
            });

            it('keeps the same field structure across seeds (only values may change)', () => {
                const a = factory(1);
                const b = factory(2);

                expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
            });

            it('renders identical samples for the same seed', () => {
                const a = renderSynthSamples(factory(5), MOCK_SAMPLE_RATE);
                const b = renderSynthSamples(factory(5), MOCK_SAMPLE_RATE);

                expect(Array.from(a)).toEqual(Array.from(b));
            });

            it('renders different samples for different seeds', () => {
                const a = renderSynthSamples(factory(1), MOCK_SAMPLE_RATE);
                const b = renderSynthSamples(factory(2), MOCK_SAMPLE_RATE);

                expect(Array.from(a)).not.toEqual(Array.from(b));
            });
        });
    }

    describe('character', () => {
        it('explosion mixes noise into the tone', () => {
            expect(explosion().noiseMix).toBeGreaterThan(0);
        });

        it('blip is much shorter than explosion', () => {
            expect(blip().duration).toBeLessThan(explosion().duration);
        });

        it('laser sweeps pitch downward from its base frequency', () => {
            const params = laser();

            expect(params.pitchSweep).toBeDefined();
            expect(params.pitchSweep?.toFrequency).toBeLessThan(params.frequency);
        });

        it('jump sweeps pitch upward from its base frequency', () => {
            const params = jump();

            expect(params.pitchSweep).toBeDefined();
            expect(params.pitchSweep?.toFrequency).toBeGreaterThan(params.frequency);
        });
    });
});
