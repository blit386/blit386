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
 * clip's total length. When the clip is short enough that the release phase starts before the
 * attack/decay phases would otherwise finish, the release ramps down from whatever gain the
 * attack/decay curve had reached at that point, rather than from `sustain` - this keeps very
 * short percussive clips free of a discontinuous jump.
 *
 * @param t - Time in seconds since the start of the clip.
 * @param duration - Total clip duration in seconds.
 * @param envelope - Resolved envelope.
 * @returns Gain multiplier in [0, 1].
 */
export function envelopeValueAt(t: number, duration: number, envelope: ResolvedEnvelope): number {
    const { release } = envelope;
    const releaseStart = Math.max(duration - release, 0);

    if (t < releaseStart) {
        return attackDecayGain(t, envelope);
    }

    if (release <= 0) {
        return 0;
    }

    const startGain = attackDecayGain(releaseStart, envelope);
    const releaseT = Math.min((t - releaseStart) / release, 1);

    return startGain * (1 - releaseT);
}
