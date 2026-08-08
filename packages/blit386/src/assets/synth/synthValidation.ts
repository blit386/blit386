/**
 * Parameter validation for {@link AudioClip.synth}, run before any sample is rendered.
 */

import {
    audioClipSynthDurationTooLongError,
    audioClipSynthInvalidWaveformError,
    audioClipSynthNonNegativeFieldError,
    audioClipSynthNonPositiveDurationError,
    audioClipSynthNonPositiveFrequencyError,
    audioClipSynthNonPositiveSampleRateError,
    audioClipSynthPitchSweepFrequencyError,
    audioClipSynthSustainRangeError,
    audioClipSynthUnitRangeFieldError,
} from '../../utils/errorMessages';
import type { SynthEnvelope, SynthParams, SynthVibrato } from './SynthParams';
import { MAX_SYNTH_DURATION_SECONDS, SYNTH_WAVEFORMS } from './SynthParams';

/** Waveform names accepted by {@link SynthParams.waveform}. */
const VALID_WAVEFORMS = new Set<string>(SYNTH_WAVEFORMS);

/**
 * Validates `params` and the target `sampleRate` before {@link renderSynthSamples} runs.
 *
 * @param params – Synthesis parameters supplied to {@link AudioClip.synth}.
 * @param sampleRate – Target sample rate, read from the live decode context.
 * @throws Error describing the first invalid field found.
 */
export function validateSynthParams(params: SynthParams, sampleRate: number): void {
    if (!VALID_WAVEFORMS.has(params.waveform)) {
        throw new Error(audioClipSynthInvalidWaveformError(params.waveform));
    }

    if (!(params.duration > 0)) {
        throw new Error(audioClipSynthNonPositiveDurationError(params.duration));
    }

    if (params.duration > MAX_SYNTH_DURATION_SECONDS) {
        throw new Error(audioClipSynthDurationTooLongError(params.duration, MAX_SYNTH_DURATION_SECONDS));
    }

    if (!(sampleRate > 0)) {
        throw new Error(audioClipSynthNonPositiveSampleRateError(sampleRate));
    }

    if (!(params.frequency > 0)) {
        throw new Error(audioClipSynthNonPositiveFrequencyError(params.frequency));
    }

    validateEnvelope(params.envelope);

    if (params.pitchSweep !== undefined && !(params.pitchSweep.toFrequency > 0)) {
        throw new Error(audioClipSynthPitchSweepFrequencyError(params.pitchSweep.toFrequency));
    }

    if (params.vibrato !== undefined) {
        validateVibrato(params.vibrato);
    }

    if (params.noiseMix !== undefined && (params.noiseMix < 0 || params.noiseMix > 1)) {
        throw new Error(audioClipSynthUnitRangeFieldError('noiseMix', params.noiseMix));
    }

    if (params.dutyCycle !== undefined && (params.dutyCycle < 0 || params.dutyCycle > 1)) {
        throw new Error(audioClipSynthUnitRangeFieldError('dutyCycle', params.dutyCycle));
    }
}

/**
 * Validates the optional envelope timing and sustain fields.
 *
 * @param envelope – Envelope descriptor to validate, or `undefined` to skip.
 * @throws Error describing the first invalid field found.
 */
function validateEnvelope(envelope: SynthEnvelope | undefined): void {
    if (envelope === undefined) {
        return;
    }

    if (envelope.attack !== undefined && envelope.attack < 0) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.attack', envelope.attack));
    }

    if (envelope.decay !== undefined && envelope.decay < 0) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.decay', envelope.decay));
    }

    if (envelope.release !== undefined && envelope.release < 0) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.release', envelope.release));
    }

    if (envelope.sustain !== undefined && (envelope.sustain < 0 || envelope.sustain > 1)) {
        throw new Error(audioClipSynthSustainRangeError(envelope.sustain));
    }
}

/**
 * Validates the optional vibrato rate and depth fields.
 *
 * @param vibrato – Vibrato descriptor to validate.
 * @throws Error describing the first invalid field found.
 */
function validateVibrato(vibrato: SynthVibrato): void {
    if (vibrato.rate !== undefined && vibrato.rate < 0) {
        throw new Error(audioClipSynthNonNegativeFieldError('vibrato.rate', vibrato.rate));
    }

    if (vibrato.depth !== undefined && vibrato.depth < 0) {
        throw new Error(audioClipSynthNonNegativeFieldError('vibrato.depth', vibrato.depth));
    }
}
