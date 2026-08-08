/**
 * Preset sound library built on the deterministic synthesis engine.
 *
 * Each factory returns a fresh {@link SynthParams} object tuned for a common game-sound
 * archetype (jump, item pickup, explosion, laser, hit, UI blip). Every factory accepts an
 * optional `seed`: it seeds an {@link Rng} that applies small, bounded jitter to a few
 * hand-picked fields (frequency and/or duration and/or mix), so repeated plays of the same
 * sound (for example footsteps or repeated hits) don't sound robotic, while an identical seed
 * always reproduces the exact same variant. Omitting `seed` is equivalent to passing
 * {@link DEFAULT_PRESET_SEED} - still fully deterministic, just a fixed baseline variant.
 *
 * This is a single module rather than one file per preset (unlike
 * `render/effects/presets/`) – each factory is a few lines of parameter tuning, not a
 * multi-effect pipeline, so splitting further would not add clarity.
 */

import { Rng } from '../../utils/Rng';
import type { SynthParams } from './SynthParams';

/** Seed used when a preset factory's `seed` argument is omitted. */
const DEFAULT_PRESET_SEED = 0;

/** Standard jitter bound applied to frequency fields: +/-8%. */
const FREQUENCY_JITTER = 0.08;

/** Standard jitter bound applied to duration fields: +/-12%. */
const DURATION_JITTER = 0.12;

/** Jitter bound applied to `noiseMix`/`dutyCycle` fields, which must stay within [0, 1]. */
const MIX_JITTER = 0.1;

/**
 * Computes a deterministic multiplicative jitter factor in `[1 - amount, 1 + amount]`.
 *
 * @param rng – Seeded PRNG driving this preset's variation.
 * @param amount – Maximum fractional deviation from `1`.
 * @returns Multiplier to apply to a base value.
 */
function jitterMultiplier(rng: Rng, amount: number): number {
    return 1 + rng.nextRange(-amount, amount);
}

/**
 * Clamps a value into `[0, 1]`, used after jittering a `noiseMix`/`dutyCycle` field so a preset
 * can never render an out-of-range value that {@link validateSynthParams} would reject.
 *
 * @param value – Value to clamp.
 * @returns `value` clamped to `[0, 1]`.
 */
function clampUnit(value: number): number {
    return Math.min(Math.max(value, 0), 1);
}

/**
 * Platformer jump: a short square-wave tone that sweeps upward in pitch, like a classic
 * arcade jump cue.
 *
 * `seed` jitters the base frequency (+/-8%) and duration (+/-12%), so jumping repeatedly
 * doesn't sound identical every time. Omit `seed` (or pass {@link DEFAULT_PRESET_SEED}) for a
 * fixed baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for a jump sound effect.
 */
export function jump(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);
    const frequency = 300 * jitterMultiplier(rng, FREQUENCY_JITTER);

    return {
        waveform: 'square',
        frequency,
        duration: 0.22 * jitterMultiplier(rng, DURATION_JITTER),
        pitchSweep: { toFrequency: frequency * 2.2 },
        envelope: { attack: 0, decay: 0.05, sustain: 0.4, release: 0.15 },
        dutyCycle: 0.5,
        seed,
    };
}

/**
 * Item pickup / coin: a short, bright square-wave blip that sweeps upward an octave.
 *
 * `seed` jitters the base frequency (+/-8%) and duration (+/-12%). Omit `seed` for a fixed
 * baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for a pickup sound effect.
 */
export function pickup(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);
    const frequency = 880 * jitterMultiplier(rng, FREQUENCY_JITTER);

    return {
        waveform: 'square',
        frequency,
        duration: 0.12 * jitterMultiplier(rng, DURATION_JITTER),
        pitchSweep: { toFrequency: frequency * 2 },
        envelope: { attack: 0, decay: 0.02, sustain: 0.8, release: 0.05 },
        seed,
    };
}

/**
 * Explosion: a low sawtooth rumble mixed heavily with noise, with a slow decay and release for
 * a boom that lingers.
 *
 * `seed` jitters the base frequency (+/-8%), duration (+/-12%), and `noiseMix` (+/-10%,
 * clamped to `[0, 1]`) – the mix jitter alone gives every explosion a distinct noisy texture.
 * Omit `seed` for a fixed baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for an explosion sound effect.
 */
export function explosion(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);

    return {
        waveform: 'sawtooth',
        frequency: 90 * jitterMultiplier(rng, FREQUENCY_JITTER),
        duration: 0.6 * jitterMultiplier(rng, DURATION_JITTER),
        noiseMix: clampUnit(0.85 * jitterMultiplier(rng, MIX_JITTER)),
        envelope: { attack: 0, decay: 0.1, sustain: 0.3, release: 0.4 },
        seed,
    };
}

/**
 * Laser / sci-fi zap: a bright sawtooth tone that sweeps rapidly downward in pitch.
 *
 * `seed` jitters the base frequency (+/-8%) and duration (+/-12%). Omit `seed` for a fixed
 * baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for a laser sound effect.
 */
export function laser(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);
    const frequency = 1200 * jitterMultiplier(rng, FREQUENCY_JITTER);

    return {
        waveform: 'sawtooth',
        frequency,
        duration: 0.18 * jitterMultiplier(rng, DURATION_JITTER),
        pitchSweep: { toFrequency: frequency / 6 },
        envelope: { attack: 0, decay: 0.02, sustain: 0.6, release: 0.1 },
        seed,
    };
}

/**
 * Hit / damage taken: a short, low percussive tone mixed with noise for a punchy impact.
 *
 * `seed` jitters the base frequency (+/-8%) and `noiseMix` (+/-10%, clamped to `[0, 1]`). Omit
 * `seed` for a fixed baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for a hit sound effect.
 */
export function hit(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);

    return {
        waveform: 'square',
        frequency: 150 * jitterMultiplier(rng, FREQUENCY_JITTER),
        duration: 0.12,
        noiseMix: clampUnit(0.5 * jitterMultiplier(rng, MIX_JITTER)),
        envelope: { attack: 0, decay: 0.03, sustain: 0.2, release: 0.06 },
        seed,
    };
}

/**
 * UI blip / menu select: a very short, clean sine tone.
 *
 * `seed` jitters only the base frequency, and only slightly (+/-3%) – UI feedback should stay
 * recognizably consistent rather than vary as much as a gameplay sound effect. Omit `seed` for
 * a fixed baseline variant.
 *
 * @param seed – Seed for deterministic jitter. Defaults to {@link DEFAULT_PRESET_SEED}.
 * @returns A fresh `SynthParams` for a UI blip sound effect.
 */
export function blip(seed: number = DEFAULT_PRESET_SEED): SynthParams {
    const rng = new Rng(seed);

    return {
        waveform: 'sine',
        frequency: 660 * jitterMultiplier(rng, 0.03),
        duration: 0.06,
        envelope: { attack: 0, decay: 0.01, sustain: 0.9, release: 0.02 },
        seed,
    };
}
