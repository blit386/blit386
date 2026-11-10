/**
 * `AudioClip.synth()` parameter validation messages.
 */

import { SYNTH_WAVEFORMS } from '../../assets/synth/SynthParams';

/** Waveform names listed in {@link audioClipSynthInvalidWaveformError}, derived from {@link SYNTH_WAVEFORMS}. */
const SYNTH_WAVEFORM_NAMES = SYNTH_WAVEFORMS.join(', ');

/**
 * Returns the error message for a `SynthParams.waveform` that is not a supported waveform name.
 *
 * @param waveform - Invalid waveform value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthInvalidWaveformError(waveform: string): string {
    return `AudioClip.synth() got an unsupported waveform '${waveform}'. Use one of: ${SYNTH_WAVEFORM_NAMES}`;
}

/**
 * Returns the error message for a `SynthParams.duration` that is not a positive number.
 *
 * @param duration - Invalid duration value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveDurationError(duration: number): string {
    return `AudioClip.synth() needs duration greater than 0 seconds (got ${duration}). Set duration to a finite, positive number.`;
}

/**
 * Returns the error message for a `SynthParams.duration` too short to hold one sample at the decode context's rate.
 *
 * @param duration - The rejected duration in seconds.
 * @param sampleRate - Sample rate in Hz the duration was rounded against.
 * @returns A message suggesting a one-sample duration and naming the half-sample acceptance threshold.
 */
export function audioClipSynthDurationRoundsToZeroError(duration: number, sampleRate: number): string {
    return (
        `AudioClip.synth() duration is too short (got ${duration}s, which rounds to 0 samples at ${sampleRate} Hz). ` +
        `Use at least one full sample (${(1 / sampleRate).toPrecision(3)} seconds); the shortest accepted duration is half of that.`
    );
}

/**
 * Returns the error message for a `SynthParams.duration` that exceeds the supported maximum.
 *
 * @param duration - Invalid duration value that was supplied, in seconds.
 * @param maxDuration - Maximum accepted duration, in seconds.
 * @returns User-facing error string.
 */
export function audioClipSynthDurationTooLongError(duration: number, maxDuration: number): string {
    return (
        `AudioClip.synth() duration is too long (got ${duration}s). ` +
        `Use ${maxDuration} seconds or fewer, or split the clip into shorter synthesized pieces.`
    );
}

/**
 * Returns the error message for a target sample rate that is not a positive number.
 *
 * Surfaces only if the registered decode context reports an invalid sample rate - this should
 * never happen with a real `AudioContext`, but is validated the same way any other boundary
 * value is.
 *
 * @param sampleRate - Invalid sample rate value that was read from the decode context.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveSampleRateError(sampleRate: number): string {
    return (
        `AudioClip.synth() needs a finite, positive sample rate (got ${sampleRate}). ` +
        'Make sure the engine has finished starting before calling AudioClip.synth().'
    );
}

/**
 * Returns the error message for a `SynthParams.frequency` that is not a positive number.
 *
 * @param frequency - Invalid frequency value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveFrequencyError(frequency: number): string {
    return `AudioClip.synth() needs frequency greater than 0 Hz (got ${frequency}). Set frequency to a finite, positive number.`;
}

/**
 * Returns the error message for a `SynthParams` numeric field that must be 0 or greater.
 *
 * Shared by envelope timings (`envelope.attack`, `envelope.decay`, `envelope.release`) and
 * vibrato parameters (`vibrato.rate`, `vibrato.depth`).
 *
 * @param field - Dotted field path that failed validation (for example `'envelope.attack'`).
 * @param value - Invalid negative value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonNegativeFieldError(field: string, value: number): string {
    return `AudioClip.synth() needs ${field} to be 0 or greater (got ${value}). Use a finite, non-negative number.`;
}

/**
 * Returns the error message for a `SynthEnvelope.sustain` outside the [0, 1] range.
 *
 * @param sustain - Invalid sustain value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthSustainRangeError(sustain: number): string {
    return `AudioClip.synth() needs envelope.sustain between 0 and 1 (got ${sustain}). Use a finite value in that range.`;
}

/**
 * Returns the error message for a `SynthParams` numeric field that must fall within [0, 1].
 *
 * Shared by `noiseMix` and `dutyCycle`.
 *
 * @param field - Field name that failed validation (for example `'noiseMix'`).
 * @param value - Invalid value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthUnitRangeFieldError(field: string, value: number): string {
    return `AudioClip.synth() needs ${field} between 0 and 1 (got ${value}). Use a finite value in that range.`;
}

/**
 * Returns the error message for a missing or non-finite synth seed.
 *
 * @param seed - Invalid seed value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthInvalidSeedError(seed: unknown): string {
    return (
        `AudioClip.synth() needs a finite number for seed (got ${String(seed)}). ` +
        'Set seed to a finite number; the same seed always renders the same sound.'
    );
}

/**
 * Returns the error message for a `SynthPitchSweep.toFrequency` that is not a positive number.
 *
 * @param toFrequency - Invalid target frequency value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthPitchSweepFrequencyError(toFrequency: number): string {
    return (
        `AudioClip.synth() needs pitch sweep toFrequency greater than 0 Hz (got ${toFrequency}). ` +
        'Set pitchSweep.toFrequency to a finite, positive number.'
    );
}
