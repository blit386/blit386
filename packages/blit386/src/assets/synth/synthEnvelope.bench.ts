import { bench, describe } from 'vitest';

import { envelopeValueAt } from './synthEnvelope';

const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

const SAMPLE_RATE = 44100;
const DURATION = 0.1;
const SAMPLES = Math.floor(SAMPLE_RATE * DURATION);

/** Attack plus release exceed the clip, so every sample takes the squeeze path. */
const SQUEEZED = { attack: 0.08, decay: 0.05, sustain: 0.5, release: 0.08 };
const FITTING = { attack: 0.01, decay: 0.02, sustain: 0.5, release: 0.02 };

/**
 * Sums the envelope over a whole clip, as the synth renderer does.
 *
 * @param envelope - Resolved envelope to sample.
 * @returns Sum of the gains, so the loop cannot be optimized away.
 */
function renderClip(envelope: typeof SQUEEZED): number {
    let sum = 0;

    for (let i = 0; i < SAMPLES; i++) {
        sum += envelopeValueAt(i / SAMPLE_RATE, DURATION, envelope);
    }

    return sum;
}

describe('envelopeValueAt', () => {
    bench('0.1s clip, attack + release squeezed', () => void renderClip(SQUEEZED), BENCH_OPTIONS);
    bench('0.1s clip, envelope fits', () => void renderClip(FITTING), BENCH_OPTIONS);
});
