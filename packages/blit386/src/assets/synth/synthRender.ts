/**
 * Pure sample rendering for the deterministic synthesis engine.
 *
 * Computes a full `Float32Array` of PCM samples from a {@link SynthParams} and a sample rate
 * with no dependency on `AudioContext` or `OfflineAudioContext`, so the entire engine is
 * directly unit-testable and runs synchronously off the audio graph.
 */

import { Rng } from '../../utils/Rng';
import { envelopeValueAt, resolveEnvelope } from './synthEnvelope';
import type { SynthParams } from './SynthParams';
import { DEFAULT_DUTY_CYCLE, DEFAULT_NOISE_MIX, DEFAULT_VOLUME } from './SynthParams';
import { instantaneousFrequencyAt } from './synthPitch';
import { noiseSample, oscillatorSample } from './synthWaveforms';

/** Lower bound samples are clamped to, avoiding clipping regardless of mix/envelope. */
const CLIP_MIN = -1;

/** Upper bound samples are clamped to, avoiding clipping regardless of mix/envelope. */
const CLIP_MAX = 1;

/**
 * Renders `params` into a full-precision PCM sample buffer at `sampleRate`.
 *
 * Deterministic for identical `params` and `sampleRate` - the only source of randomness (the
 * `'noise'` waveform and `noiseMix` blending) is drawn from a {@link Rng} seeded with
 * `params.seed`. The carrier phase is accumulated sample by sample from the instantaneous
 * frequency (base frequency plus any pitch sweep and vibrato), so pitch modulation stays
 * continuous instead of producing phase discontinuities. Output is clamped to `[-1, 1]`
 * regardless of envelope, volume, or noise mix.
 *
 * @param params – Synthesis parameters. Assumed already validated by
 *   {@link validateSynthParams}.
 * @param sampleRate – Output sample rate in Hz.
 * @returns Rendered mono samples, `Math.round(params.duration * sampleRate)` long.
 */
export function renderSynthSamples(params: SynthParams, sampleRate: number): Float32Array<ArrayBuffer> {
    const sampleCount = Math.round(params.duration * sampleRate);
    const samples = new Float32Array(sampleCount);
    const envelope = resolveEnvelope(params.envelope);
    const volume = params.volume ?? DEFAULT_VOLUME;
    const noiseMix = params.noiseMix ?? DEFAULT_NOISE_MIX;
    const dutyCycle = params.dutyCycle ?? DEFAULT_DUTY_CYCLE;
    const rng = new Rng(params.seed);
    let phase = 0;

    for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleRate;
        const frequency = instantaneousFrequencyAt(
            t,
            params.duration,
            params.frequency,
            params.pitchSweep,
            params.vibrato,
        );

        phase += frequency / sampleRate;
        phase -= Math.floor(phase);

        const tone = renderTone(params.waveform, phase, dutyCycle, noiseMix, rng);
        const gain = envelopeValueAt(t, params.duration, envelope) * volume;

        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
        samples[i] = clamp(tone * gain, CLIP_MIN, CLIP_MAX);
    }

    return samples;
}

/**
 * Computes one waveform sample, blending in white noise when `noiseMix` is positive.
 *
 * @param waveform – Oscillator shape for this clip.
 * @param phase – Carrier phase in [0, 1) at this sample.
 * @param dutyCycle – Resolved duty cycle, used only by `'square'`.
 * @param noiseMix – Resolved noise mix in [0, 1]; ignored when `waveform` is already `'noise'`.
 * @param rng – Seeded PRNG shared across the whole render, advanced by this call whenever noise
 *   is drawn.
 * @returns Sample in [-1, 1] before envelope/volume are applied.
 */
function renderTone(
    waveform: SynthParams['waveform'],
    phase: number,
    dutyCycle: number,
    noiseMix: number,
    rng: Rng,
): number {
    if (waveform === 'noise') {
        return noiseSample(rng);
    }

    const oscillator = oscillatorSample(waveform, phase, dutyCycle);

    return noiseMix > 0 ? oscillator * (1 - noiseMix) + noiseSample(rng) * noiseMix : oscillator;
}

/**
 * Clamps `value` to `[min, max]`.
 *
 * @param value – Value to clamp.
 * @param min – Lower bound.
 * @param max – Upper bound.
 * @returns Clamped value.
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
