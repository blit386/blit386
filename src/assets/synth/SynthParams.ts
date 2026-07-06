/**
 * Parameter definitions for {@link AudioClip.synth}'s deterministic synthesis engine.
 *
 * Every field is a plain number, string, or nested object of the same, so a `SynthParams`
 * value round-trips through `JSON.stringify`/`JSON.parse` without loss - useful for storing
 * synth presets as data (level files, preset libraries) rather than code.
 */

/**
 * Oscillator waveform shapes accepted by {@link SynthParams.waveform} - the single source of
 * truth {@link SynthWaveform} is derived from, and that validation/error-message code reuses
 * (see `synthValidation.ts` and `errorMessages.ts`) so the accepted set can never drift out of
 * sync between the type, the validator, and the error text.
 */
export const SYNTH_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'noise'] as const;

/** Oscillator waveform shape; one of {@link SYNTH_WAVEFORMS}. */
export type SynthWaveform = (typeof SYNTH_WAVEFORMS)[number];

/**
 * Attack/decay/sustain/release envelope descriptor; see {@link SynthParams.envelope}.
 *
 * The release phase is always anchored to the end of the clip, so a note is fully released
 * by its last sample regardless of how `attack`/`decay`/`release` compare to the clip's total
 * `duration`.
 */
export interface SynthEnvelope {
    /**
     * Time in seconds to ramp from silence to full amplitude.
     * Defaults to {@link DEFAULT_ATTACK}.
     */
    attack?: number;

    /**
     * Time in seconds to fall from full amplitude to the `sustain` level.
     * Defaults to {@link DEFAULT_DECAY}.
     */
    decay?: number;

    /**
     * Gain level in [0, 1] held between the decay and release phases.
     * Defaults to {@link DEFAULT_SUSTAIN}.
     */
    sustain?: number;

    /**
     * Time in seconds to fall from the sustain level to silence at the end of the clip.
     * Defaults to {@link DEFAULT_RELEASE}.
     */
    release?: number;
}

/** Linear pitch sweep descriptor; see {@link SynthParams.pitchSweep}. */
export interface SynthPitchSweep {
    /** Frequency in Hz the carrier linearly reaches by the end of the clip. */
    toFrequency: number;
}

/** Sine-wave vibrato (periodic pitch wobble) descriptor; see {@link SynthParams.vibrato}. */
export interface SynthVibrato {
    /**
     * Vibrato rate in Hz (oscillations per second).
     * Defaults to {@link DEFAULT_VIBRATO_RATE}.
     */
    rate?: number;

    /**
     * Vibrato depth in Hz - the peak frequency deviation applied above and below the carrier.
     * Defaults to {@link DEFAULT_VIBRATO_DEPTH}.
     */
    depth?: number;
}

/**
 * Deterministic synthesis parameters accepted by {@link AudioClip.synth}.
 *
 * Fully JSON round-trippable: no functions, class instances, or `undefined`-only fields, so a
 * `SynthParams` value can be serialized as a preset and restored later byte-for-byte.
 */
export interface SynthParams {
    /** Oscillator waveform shape. */
    waveform: SynthWaveform;

    /** Base carrier frequency in Hz at the start of the clip (before any pitch sweep or vibrato). */
    frequency: number;

    /** Total clip duration in seconds. Must be greater than 0 and no more than {@link MAX_SYNTH_DURATION_SECONDS}. */
    duration: number;

    /**
     * Overall output amplitude in [0, 1] (unclamped on the high end; final output is always
     * clamped to avoid clipping).
     * Defaults to {@link DEFAULT_VOLUME}.
     */
    volume?: number;

    /** Optional attack/decay/sustain/release envelope. Defaults to a full ADSR envelope; see {@link SynthEnvelope}. */
    envelope?: SynthEnvelope;

    /** Optional linear pitch sweep from `frequency` to a target frequency across the clip. */
    pitchSweep?: SynthPitchSweep;

    /** Optional sine-wave vibrato applied on top of `frequency` (and any {@link pitchSweep}). */
    vibrato?: SynthVibrato;

    /**
     * Fraction of white noise mixed into the oscillator output, in [0, 1] (`0` is pure tone,
     * `1` is pure noise). Ignored when `waveform` is already `'noise'`.
     * Defaults to {@link DEFAULT_NOISE_MIX}.
     */
    noiseMix?: number;

    /**
     * Fraction of each cycle spent high, in [0, 1]. Only affects the `'square'` waveform.
     * Defaults to {@link DEFAULT_DUTY_CYCLE}.
     */
    dutyCycle?: number;

    /** Seed for the deterministic PRNG driving noise generation - identical seeds render identical output. */
    seed: number;
}

/** Default {@link SynthParams.volume} applied when omitted. */
export const DEFAULT_VOLUME = 1;

/** Default {@link SynthEnvelope.attack} applied when omitted. */
export const DEFAULT_ATTACK = 0.01;

/** Default {@link SynthEnvelope.decay} applied when omitted. */
export const DEFAULT_DECAY = 0.1;

/** Default {@link SynthEnvelope.sustain} applied when omitted. */
export const DEFAULT_SUSTAIN = 0.7;

/** Default {@link SynthEnvelope.release} applied when omitted. */
export const DEFAULT_RELEASE = 0.1;

/** Default {@link SynthVibrato.rate} applied when omitted. */
export const DEFAULT_VIBRATO_RATE = 5;

/** Default {@link SynthVibrato.depth} applied when omitted. */
export const DEFAULT_VIBRATO_DEPTH = 0;

/** Default {@link SynthParams.noiseMix} applied when omitted. */
export const DEFAULT_NOISE_MIX = 0;

/** Default {@link SynthParams.dutyCycle} applied when omitted. */
export const DEFAULT_DUTY_CYCLE = 0.5;

/**
 * Maximum accepted {@link SynthParams.duration}, in seconds. Rendering is synchronous CPU work
 * with no chunking, so an unbounded duration could block the caller for an unreasonable amount
 * of time; this cap is generous for sound effects and short stingers while keeping a single
 * `AudioClip.synth()` call bounded.
 */
export const MAX_SYNTH_DURATION_SECONDS = 60;
