/**
 * Per-sample pitch modulation – linear frequency sweep and sine vibrato – for the
 * deterministic synthesis engine.
 */

import type { SynthPitchSweep, SynthVibrato } from './SynthParams';
import { DEFAULT_VIBRATO_DEPTH, DEFAULT_VIBRATO_RATE } from './SynthParams';

/**
 * Linearly interpolates from `baseFrequency` to `pitchSweep.toFrequency` across `duration`
 * seconds.
 *
 * @param t – Time in seconds since the start of the clip.
 * @param duration – Total clip duration in seconds.
 * @param baseFrequency – Frequency at `t = 0`.
 * @param pitchSweep – Sweep target, or `undefined` for no sweep.
 * @returns Swept frequency in Hz at time `t`. Returns `baseFrequency` unchanged when
 *   `pitchSweep` is `undefined` or `duration` is 0.
 */
export function sweepFrequencyAt(
    t: number,
    duration: number,
    baseFrequency: number,
    pitchSweep: SynthPitchSweep | undefined,
): number {
    if (pitchSweep === undefined || duration <= 0) {
        return baseFrequency;
    }

    const ratio = Math.min(Math.max(t / duration, 0), 1);

    return baseFrequency + (pitchSweep.toFrequency - baseFrequency) * ratio;
}

/**
 * Computes the sine-wave vibrato frequency offset at time `t`.
 *
 * @param t – Time in seconds since the start of the clip.
 * @param vibrato – Vibrato descriptor, or `undefined` for no vibrato.
 * @returns Frequency deviation in Hz to add to the carrier frequency. Returns `0` when
 *   `vibrato` is `undefined`.
 */
export function vibratoOffsetAt(t: number, vibrato: SynthVibrato | undefined): number {
    if (vibrato === undefined) {
        return 0;
    }

    const rate = vibrato.rate ?? DEFAULT_VIBRATO_RATE;
    const depth = vibrato.depth ?? DEFAULT_VIBRATO_DEPTH;

    return depth * Math.sin(2 * Math.PI * rate * t);
}

/**
 * Computes the instantaneous carrier frequency at time `t`, combining the base frequency,
 * linear pitch sweep, and sine vibrato.
 *
 * @param t – Time in seconds since the start of the clip.
 * @param duration – Total clip duration in seconds.
 * @param baseFrequency – Frequency at `t = 0` with no sweep or vibrato applied.
 * @param pitchSweep – Optional linear sweep target.
 * @param vibrato – Optional vibrato descriptor.
 * @returns Instantaneous frequency in Hz, floored at 0 to avoid a negative frequency reversing
 *   the oscillator's direction.
 */
export function instantaneousFrequencyAt(
    t: number,
    duration: number,
    baseFrequency: number,
    pitchSweep: SynthPitchSweep | undefined,
    vibrato: SynthVibrato | undefined,
): number {
    const swept = sweepFrequencyAt(t, duration, baseFrequency, pitchSweep);

    return Math.max(swept + vibratoOffsetAt(t, vibrato), 0);
}
