/**
 * Attack/decay/sustain/release envelope gain computation for the deterministic synthesis
 * engine.
 */

import type { SynthEnvelope } from './SynthParams';
import { DEFAULT_ATTACK, DEFAULT_DECAY, DEFAULT_RELEASE, DEFAULT_SUSTAIN } from './SynthParams';

/** {@link SynthEnvelope} with every field resolved to a concrete number. */
export interface ResolvedEnvelope {
    /** Resolved {@link SynthEnvelope.attack}. */
    attack: number;

    /** Resolved {@link SynthEnvelope.decay}. */
    decay: number;

    /** Resolved {@link SynthEnvelope.sustain}. */
    sustain: number;

    /** Resolved {@link SynthEnvelope.release}. */
    release: number;
}

/**
 * Fills in every omitted {@link SynthEnvelope} field with its default.
 *
 * @param envelope - Envelope descriptor, or `undefined` for an envelope built entirely from
 *   defaults.
 * @returns Envelope with every field resolved to a concrete number.
 */
export function resolveEnvelope(envelope: SynthEnvelope | undefined): ResolvedEnvelope {
    return {
        attack: envelope?.attack ?? DEFAULT_ATTACK,
        decay: envelope?.decay ?? DEFAULT_DECAY,
        sustain: envelope?.sustain ?? DEFAULT_SUSTAIN,
        release: envelope?.release ?? DEFAULT_RELEASE,
    };
}

/**
 * Computes the ADSR gain multiplier for the attack and decay phases only, ignoring release.
 *
 * @param t - Time in seconds since the start of the clip.
 * @param envelope - Resolved envelope.
 * @returns Gain in [0, 1] following the attack ramp, then the decay ramp, then holding at
 *   `sustain`.
 */
function attackDecayGain(t: number, envelope: ResolvedEnvelope): number {
    const { attack, decay, sustain } = envelope;

    if (attack > 0 && t < attack) {
        return t / attack;
    }

    const decayEnd = attack + decay;

    if (decay > 0 && t < decayEnd) {
        return 1 - (1 - sustain) * ((t - attack) / decay);
    }

    return sustain;
}

/**
 * Computes the ADSR gain multiplier at time `t` seconds into a clip of `duration` seconds.
 *
 * The release phase is anchored to the end of the clip (`duration - release`), so the release
 * always finishes exactly at `duration` regardless of how the phase durations compare to the
 * clip's total length. When `attack + release` is longer than the clip, both are scaled by
 * `duration / (attack + release)` so the attack still reaches full gain before the release
 * starts. When the release still starts before decay would finish, it ramps down from whatever
 * gain the attack/decay curve had reached at that point, rather than from `sustain` - this keeps
 * short percussive clips free of a discontinuous jump.
 *
 * @param t - Time in seconds since the start of the clip.
 * @param duration - Total clip duration in seconds.
 * @param resolved - Resolved envelope.
 * @returns Gain multiplier in [0, 1].
 */
export function envelopeValueAt(t: number, duration: number, resolved: ResolvedEnvelope): number {
    // Squeeze attack and release proportionally when they do not both fit, so the attack still
    // reaches full gain before the release starts (otherwise the release would begin at t=0 from
    // a gain of 0 and the whole clip would be silent).
    const fit = resolved.attack + resolved.release;
    const envelope =
        fit > duration && resolved.release > 0
            ? { ...resolved, attack: (resolved.attack * duration) / fit, release: (resolved.release * duration) / fit }
            : resolved;
    const { release } = envelope;
    const releaseStart = Math.max(duration - release, 0);

    if (t < releaseStart) {
        return attackDecayGain(t, envelope);
    }

    if (release <= 0) {
        return 0;
    }

    // The squeeze above leaves `release <= duration`, so the ramp spans exactly `release` and
    // the last sample is exactly 0.
    const releaseT = Math.min((t - releaseStart) / release, 1);

    return attackDecayGain(releaseStart, envelope) * (1 - releaseT);
}
