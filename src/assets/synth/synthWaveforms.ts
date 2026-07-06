/**
 * Per-waveform oscillator sample generation for the deterministic synthesis engine.
 */

import type { Rng } from '../../utils/Rng';
import type { SynthWaveform } from './SynthParams';

/**
 * Computes an oscillator sample for a tonal waveform at a normalized phase.
 *
 * @param waveform - Oscillator shape. `'noise'` is generated separately by {@link noiseSample}
 *   and must never reach this function.
 * @param phase - Phase in [0, 1), already wrapped by the caller.
 * @param dutyCycle - Fraction of the cycle spent high. Only affects `'square'`.
 * @returns Sample in [-1, 1].
 */
export function oscillatorSample(waveform: Exclude<SynthWaveform, 'noise'>, phase: number, dutyCycle: number): number {
    switch (waveform) {
        case 'sine':
            return Math.sin(2 * Math.PI * phase);
        case 'square':
            return phase < dutyCycle ? 1 : -1;
        case 'triangle':
            return 1 - 4 * Math.abs(phase - 0.5);
        case 'sawtooth':
            return 2 * phase - 1;
        default:
            throw new Error(`Unsupported synth waveform: ${waveform as string}`);
    }
}

/**
 * Draws a single white-noise sample from a seeded PRNG.
 *
 * @param rng - Deterministic PRNG to draw from; advances its state by one call.
 * @returns Sample in [-1, 1).
 */
export function noiseSample(rng: Rng): number {
    return rng.next() * 2 - 1;
}
