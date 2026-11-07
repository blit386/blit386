/**
 * Parameter validation for {@link AudioClip.synth}, run before any sample is rendered.
 */

import {
    audioClipSynthDurationRoundsToZeroError,
    audioClipSynthDurationTooLongError,
    audioClipSynthInvalidSeedError,
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
import { synthSampleCount } from './synthRender';

/** Waveform names accepted by {@link SynthParams.waveform}. */
const VALID_WAVEFORMS = new Set<string>(SYNTH_WAVEFORMS);

/**
 * Returns whether `value` is a finite number of 0 or more. NaN and Infinity fail, unlike a bare `value < 0` test.
 *
 * @param value - Number to test.
 * @returns `true` when `value` is finite and not negative.
 */
function isNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}

/**
 * Returns whether `value` is a finite number within [0, 1].
 *
 * @param value - Number to test.
 * @returns `true` when `value` is finite and between 0 and 1 inclusive.
 */
function isUnitRange(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validates `params` and the target `sampleRate` before {@link renderSynthSamples} runs.
 *
 * @param params - Synthesis parameters supplied to {@link AudioClip.synth}.
 * @param sampleRate - Target sample rate, read from the live decode context.
 * @throws Error describing the first invalid field found.
 */
export function validateSynthParams(params: SynthParams, sampleRate: number): void {
    if (!VALID_WAVEFORMS.has(params.waveform)) {
        throw new Error(audioClipSynthInvalidWaveformError(params.waveform));
    }

    validateTiming(params.duration, sampleRate);

    if (!(Number.isFinite(params.frequency) && params.frequency > 0)) {
        throw new Error(audioClipSynthNonPositiveFrequencyError(params.frequency));
    }

    if (!Number.isFinite(params.seed)) {
        throw new Error(audioClipSynthInvalidSeedError(params.seed));
    }

    if (params.volume !== undefined && !isNonNegative(params.volume)) {
        throw new Error(audioClipSynthNonNegativeFieldError('volume', params.volume));
    }

    validateEnvelope(params.envelope);

    if (
        params.pitchSweep !== undefined &&
        !(Number.isFinite(params.pitchSweep.toFrequency) && params.pitchSweep.toFrequency > 0)
    ) {
        throw new Error(audioClipSynthPitchSweepFrequencyError(params.pitchSweep.toFrequency));
    }

    if (params.vibrato !== undefined) {
        validateVibrato(params.vibrato);
    }

    validateUnitRangeFields(params);
}

/**
 * Validates the clip `duration` and the `sampleRate` it is rounded against.
 *
 * @param duration - Requested clip length in seconds.
 * @param sampleRate - Target sample rate in Hz.
 * @throws Error describing the first invalid value found.
 */
function validateTiming(duration: number, sampleRate: number): void {
    if (!(duration > 0)) {
        throw new Error(audioClipSynthNonPositiveDurationError(duration));
    }

    if (duration > MAX_SYNTH_DURATION_SECONDS) {
        throw new Error(audioClipSynthDurationTooLongError(duration, MAX_SYNTH_DURATION_SECONDS));
    }

    if (!(Number.isFinite(sampleRate) && sampleRate > 0)) {
        throw new Error(audioClipSynthNonPositiveSampleRateError(sampleRate));
    }

    if (synthSampleCount(duration, sampleRate) < 1) {
        throw new Error(audioClipSynthDurationRoundsToZeroError(duration, sampleRate));
    }
}

/**
 * Validates the optional `noiseMix` and `dutyCycle` fields, which must lie in [0, 1].
 *
 * @param params - Synthesis parameters to check.
 * @throws Error describing the first invalid field found.
 */
function validateUnitRangeFields(params: SynthParams): void {
    if (params.noiseMix !== undefined && !isUnitRange(params.noiseMix)) {
        throw new Error(audioClipSynthUnitRangeFieldError('noiseMix', params.noiseMix));
    }

    if (params.dutyCycle !== undefined && !isUnitRange(params.dutyCycle)) {
        throw new Error(audioClipSynthUnitRangeFieldError('dutyCycle', params.dutyCycle));
    }
}

/**
 * Validates the optional envelope timing and sustain fields.
 *
 * @param envelope - Envelope descriptor to validate, or `undefined` to skip.
 * @throws Error describing the first invalid field found.
 */
function validateEnvelope(envelope: SynthEnvelope | undefined): void {
    if (envelope === undefined) {
        return;
    }

    if (envelope.attack !== undefined && !isNonNegative(envelope.attack)) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.attack', envelope.attack));
    }

    if (envelope.decay !== undefined && !isNonNegative(envelope.decay)) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.decay', envelope.decay));
    }

    if (envelope.release !== undefined && !isNonNegative(envelope.release)) {
        throw new Error(audioClipSynthNonNegativeFieldError('envelope.release', envelope.release));
    }

    if (envelope.sustain !== undefined && !isUnitRange(envelope.sustain)) {
        throw new Error(audioClipSynthSustainRangeError(envelope.sustain));
    }
}

/**
 * Validates the optional vibrato rate and depth fields.
 *
 * @param vibrato - Vibrato descriptor to validate.
 * @throws Error describing the first invalid field found.
 */
function validateVibrato(vibrato: SynthVibrato): void {
    if (vibrato.rate !== undefined && !isNonNegative(vibrato.rate)) {
        throw new Error(audioClipSynthNonNegativeFieldError('vibrato.rate', vibrato.rate));
    }

    if (vibrato.depth !== undefined && !isNonNegative(vibrato.depth)) {
        throw new Error(audioClipSynthNonNegativeFieldError('vibrato.depth', vibrato.depth));
    }
}
