/**
 * Audio: unlock state, bus volume and mute, sound effects, music, and synth presets.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import type { AudioClip } from '../assets/AudioClip';
import { blip, explosion, hit, jump, laser, pickup } from '../assets/synth/synthPresets';
import type { MusicPlayOptions } from '../audio/MusicPlayer';
import type { SoundParamSetOptions, SoundPlayOptions, SoundRef, SoundStopOptions } from '../audio/VoicePool';
import { BTAPI } from '../core/BTAPI';
import type { AudioBus } from '../core/IBTDemo';
import type { EasingFunction } from '../utils/Easing';

/** Audio members of `BT`. */
export const audio = {
    /**
     * Whether the audio context has been unlocked by a user gesture.
     *
     * Browsers require a user gesture (pointer, key, or touch press) before
     * allowing audio playback. Starts `false`; flips to `true` for the rest of
     * the session after the first gesture successfully resumes the audio context.
     *
     * @since 1.3.0
     * @returns `true` once unlocked; `false` when locked or before initialization.
     */
    get isAudioUnlocked(): boolean {
        return BTAPI.instance.isAudioUnlocked();
    },

    /**
     * Sets the logical volume for an audio bus, optionally fading to it.
     *
     * @since 1.3.0
     * @param bus - Audio bus to update (`'main'`, `'music'`, or `'sfx'`).
     * @param value - Target volume, clamped to `[0, 1]`.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     * @param options.easing - Easing curve for the fade. Defaults to `'linear'`; ignored when `fadeMs` is omitted.
     */
    audioVolumeSet: (bus: AudioBus, value: number, options?: { fadeMs?: number; easing?: EasingFunction }): void => {
        BTAPI.instance.audioVolumeSet(bus, value, options?.fadeMs, options?.easing);
    },

    /**
     * Gets the logical (pre-mute) volume for an audio bus.
     *
     * Unaffected by {@link BT.audioMuteSet} - muting never overwrites the configured level.
     *
     * @since 1.3.0
     * @changed 1.8.1 Returns `1` (the default bus volume) before initialization instead of `0`.
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`, or `1` (every bus's default) before initialization.
     */
    audioVolumeGet: (bus: AudioBus): number => {
        return BTAPI.instance.audioVolumeGet(bus);
    },

    /**
     * Mutes or unmutes an audio bus.
     *
     * @since 1.3.0
     * @param bus - Audio bus to mute or unmute.
     * @param muted - `true` to mute, `false` to unmute.
     */
    audioMuteSet: (bus: AudioBus, muted: boolean): void => {
        BTAPI.instance.audioMuteSet(bus, muted);
    },

    /**
     * Reports whether an audio bus is currently muted.
     *
     * @since 1.3.0
     * @param bus - Audio bus to query.
     * @returns `true` when muted; `false` when unmuted or before initialization.
     */
    isAudioMuted: (bus: AudioBus): boolean => {
        return BTAPI.instance.isAudioMuted(bus);
    },

    /**
     * Plays a loaded audio clip through the SFX voice pool.
     *
     * Returns an inert {@link SoundRef} without allocating a voice when the clip hasn't finished
     * loading yet (or was already unloaded), when the pool has no free or stealable voice at this
     * priority, or before the engine has unlocked audio playback.
     *
     * @since 1.3.0
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options.
     * @returns A handle identifying the new voice; pass it to {@link BT.soundStop} and the other
     *   per-sound controls. Safe to use even when playback was silently dropped - every accessor
     *   on an inert handle is a no-op.
     */
    soundPlay: (clip: AudioClip, options?: SoundPlayOptions): SoundRef => {
        return BTAPI.instance.soundPlay(clip, options);
    },

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @since 1.3.0
     * @param ref - Sound to stop, from {@link BT.soundPlay}.
     * @param options - Optional fade behavior.
     * @param options.fadeOutMs - Fade-out duration in milliseconds. Omit to stop immediately.
     */
    soundStop: (ref: SoundRef, options?: SoundStopOptions): void => {
        BTAPI.instance.soundStop(ref, options?.fadeOutMs);
    },

    /**
     * Reports whether a sound is still playing.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` once it has stopped, been stolen, or completed.
     */
    isSoundPlaying: (ref: SoundRef): boolean => {
        return BTAPI.instance.isSoundPlaying(ref);
    },

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundVolumeSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundVolumeSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current gain.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current gain, or `1` once the sound has stopped.
     */
    soundVolumeGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundVolumeGet(ref);
    },

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundPitchSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundPitchSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current playback rate.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current playback rate, or `1` once the sound has stopped.
     */
    soundPitchGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundPitchGet(ref);
    },

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundPanSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundPanSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current stereo pan.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current pan, or `0` once the sound has stopped.
     */
    soundPanGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundPanGet(ref);
    },

    /**
     * Plays a loaded audio clip through the music player, crossfading out whatever is currently
     * playing.
     *
     * Silently does nothing when the clip hasn't finished loading yet (or was already unloaded
     * with `clip.unload()`), or before the engine has initialized. While the audio context is
     * still locked (before the first unlock gesture), the request is remembered instead of
     * dropped - it starts automatically the instant the context unlocks, unlike {@link BT.soundPlay}.
     *
     * @since 1.3.0
     * @changed 1.8.1 Validates `fadeMs`, `volume`, `overlap`, and the loop region before remembering or changing music.
     * @param clip - Loaded audio clip to play.
     * @param options - Crossfade, volume, and loop options; see {@link MusicPlayOptions}.
     * @throws Error when `options.fadeMs`, `options.volume`, or `options.overlap` is not a finite number, or
     *   `options.loopStart` and `options.loopEnd` are not a valid pair for the clip (also while the context is
     *   locked); the current track is left alone and nothing is remembered.
     */
    musicPlay: (clip: AudioClip, options?: MusicPlayOptions): void => {
        BTAPI.instance.musicPlay(clip, options);
    },

    /**
     * Stops the music player, optionally fading out first.
     *
     * @since 1.3.0
     * @changed 1.8.1 Also cancels a music request remembered while the audio context was still locked.
     * @changed 1.8.1 Validates `fadeMs` before canceling or stopping music.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade-out duration in milliseconds. Omit to stop immediately.
     * @throws Error when `options.fadeMs` is not a finite number; the current track keeps playing.
     */
    musicStop: (options?: { fadeMs?: number }): void => {
        BTAPI.instance.musicStop(options?.fadeMs);
    },

    /**
     * Whether music is currently playing.
     *
     * @since 1.3.0
     * @returns `true` when the music player has a live current track; `false` when stopped or
     *   not yet started.
     */
    get isMusicPlaying(): boolean {
        return BTAPI.instance.isMusicPlaying();
    },

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @since 1.3.0
     * @param value - Target gain.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    musicVolumeSet: (value: number, options?: { fadeMs?: number }): void => {
        BTAPI.instance.musicVolumeSet(value, options?.fadeMs);
    },

    /**
     * Gets the music player's current target volume.
     *
     * @since 1.3.0
     * @returns Current target gain, or `1` before initialization.
     */
    musicVolumeGet: (): number => {
        return BTAPI.instance.musicVolumeGet();
    },

    /**
     * Pre-configured `SynthParams` presets for common sound effects ("jump", "pickup",
     * "explosion", "laser", "hit", "blip").
     *
     * Each function returns a fresh {@link SynthParams} object; pass it to
     * {@link AudioClip.synth} to render a clip, then play the result via {@link BT.soundPlay}.
     * An optional `seed` argument applies small, bounded, deterministic jitter to a few
     * hand-picked fields per preset, so repeated plays vary without losing reproducibility -
     * the same seed always renders the exact same variant.
     *
     * @since 1.3.0
     * @changed 1.8.1 Each preset throws a `RangeError` naming itself for a seed that is not a finite number (`NaN`,
     *   `Infinity`) instead of silently using seed 0.
     * @example
     * const jumpClip = await AudioClip.synth(BT.synthPreset.jump());
     * BT.soundPlay(jumpClip);
     */
    synthPreset: { jump, pickup, explosion, laser, hit, blip },
};
