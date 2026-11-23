/**
 * The audio calls behind `BT`'s bus volume and mute, sound effect and music members.
 * Part of {@link BTAPI}; not part of the BT API.
 */

import type { AudioClip } from '../../assets/AudioClip';
import { DEFAULT_BUS_VOLUME } from '../../audio/AudioManager';
import { type MusicPlayOptions, validateFinite } from '../../audio/MusicPlayer';
import {
    DEFAULT_PAN,
    DEFAULT_PITCH,
    DEFAULT_VOLUME,
    INVALID_SOUND_REF,
    type SoundPlayOptions,
    type SoundRef,
} from '../../audio/VoicePool';
import type { EasingFunction } from '../../utils/Easing';
import type { BTAPI } from '../BTAPI';
import type { AudioBus } from '../IBTDemo';

/** Bus volume and mute, sound effects and music, forwarded to the engine's audio subsystem. */
export class AudioCommands {
    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Reports whether the audio context has been unlocked by a user gesture.
     *
     * @returns `true` once unlocked; `false` when locked or not initialized.
     */
    public isAudioUnlocked(): boolean {
        return this.engine.audio?.isUnlocked() ?? false;
    }

    /**
     * Sets the logical volume for an audio bus, optionally fading to it.
     *
     * No-op when the audio subsystem is not initialized.
     *
     * @param bus - Audio bus to update.
     * @param volume - Target volume, clamped to `[0, 1]`.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     * @param easing - Easing curve for the fade. Defaults to `'linear'`; ignored when `fadeMs` is omitted.
     */
    public audioVolumeSet(bus: AudioBus, volume: number, fadeMs?: number, easing?: EasingFunction): void {
        this.engine.audio?.volumeSet(bus, volume, fadeMs, easing);
    }

    /**
     * Gets the logical (pre-mute) volume for an audio bus.
     *
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`, or {@link DEFAULT_BUS_VOLUME} when the audio subsystem is not initialized.
     */
    public audioVolumeGet(bus: AudioBus): number {
        return this.engine.audio?.volumeGet(bus) ?? DEFAULT_BUS_VOLUME;
    }

    /**
     * Mutes or unmutes an audio bus.
     *
     * No-op when the audio subsystem is not initialized.
     *
     * @param bus - Audio bus to mute or unmute.
     * @param muted - `true` to mute, `false` to unmute.
     */
    public audioMuteSet(bus: AudioBus, muted: boolean): void {
        this.engine.audio?.muteSet(bus, muted);
    }

    /**
     * Reports whether an audio bus is currently muted.
     *
     * @param bus - Audio bus to query.
     * @returns `true` when muted; `false` when unmuted or not initialized.
     */
    public isAudioMuted(bus: AudioBus): boolean {
        return this.engine.audio?.isMuted(bus) ?? false;
    }

    /**
     * Plays a loaded audio clip through the SFX voice pool.
     *
     * Returns {@link INVALID_SOUND_REF} without allocating a voice when the clip's buffer isn't
     * available (not finished loading yet, or already unloaded) or when the audio subsystem is
     * not initialized, or while BT.renderAt is stepping through a seek, so a long seek never queues a burst of
     * sounds.
     *
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options; see {@link SoundPlayOptions}.
     * @returns A {@link SoundRef} identifying the new voice, or {@link INVALID_SOUND_REF}.
     */
    public soundPlay(clip: AudioClip, options?: SoundPlayOptions): SoundRef {
        // musicPlay deliberately has no isSeeking gate; see the note there.
        if (clip.buffer === null || this.engine.isSeeking) {
            return INVALID_SOUND_REF;
        }

        return this.engine.audio?.playSound(clip.buffer, options) ?? INVALID_SOUND_REF;
    }

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @param ref - Sound to stop.
     * @param fadeOutMs - Optional linear fade-out duration in milliseconds.
     */
    public soundStop(ref: SoundRef, fadeOutMs?: number): void {
        this.engine.audio?.voices?.stop(ref, fadeOutMs);
    }

    /**
     * Reports whether a sound is still playing.
     *
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` on a stale ref or when the audio subsystem is not initialized.
     */
    public isSoundPlaying(ref: SoundRef): boolean {
        return this.engine.audio?.voices?.isPlaying(ref) ?? false;
    }

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundVolumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.engine.audio?.voices?.volumeSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current gain.
     *
     * @param ref - Sound to query.
     * @returns Current gain in `[0, 1]`, or {@link DEFAULT_VOLUME} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundVolumeGet(ref: SoundRef): number {
        return this.engine.audio?.voices?.volumeGet(ref) ?? DEFAULT_VOLUME;
    }

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.engine.audio?.voices?.pitchSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current playback rate.
     *
     * @param ref - Sound to query.
     * @returns Current playback rate, or {@link DEFAULT_PITCH} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPitchGet(ref: SoundRef): number {
        return this.engine.audio?.voices?.pitchGet(ref) ?? DEFAULT_PITCH;
    }

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPanSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.engine.audio?.voices?.panSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current stereo pan.
     *
     * @param ref - Sound to query.
     * @returns Current pan, or {@link DEFAULT_PAN} on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPanGet(ref: SoundRef): number {
        return this.engine.audio?.voices?.panGet(ref) ?? DEFAULT_PAN;
    }

    /**
     * Plays a loaded audio clip through the music player, crossfading out whatever is currently
     * playing.
     *
     * No-ops when the clip's buffer isn't available (not finished loading yet, or already
     * unloaded), mirroring {@link soundPlay}, or when the audio subsystem is not initialized.
     *
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options; see {@link MusicPlayOptions}.
     */
    public musicPlay(clip: AudioClip, options?: MusicPlayOptions): void {
        // Unlike soundPlay, not dropped while seeking: one track is never a burst, and a replayed
        // musicPlay leaves the seeked frame's track queued in the parked context for BT.resume().
        // Validate before the early returns, so a bad option fails the same way before init or before the clip loads.
        validateFinite(options?.fadeMs, options?.volume, 'BT.musicPlay', options?.overlap);

        if (clip.buffer === null) {
            return;
        }

        this.engine.audio?.musicPlay(clip.buffer, options);
    }

    /**
     * Stops the music player, optionally fading out first.
     *
     * @param fadeMs - Optional linear fade-out duration in milliseconds; omit to stop immediately.
     */
    public musicStop(fadeMs?: number): void {
        validateFinite(fadeMs, undefined, 'BT.musicStop');
        this.engine.audio?.musicStop(fadeMs);
    }

    /**
     * Reports whether music is currently playing.
     *
     * @returns `true` when the music player has a live current track; `false` when stopped, not
     *   yet started, or when the audio subsystem is not initialized.
     */
    public isMusicPlaying(): boolean {
        return this.engine.audio?.music?.isPlaying() ?? false;
    }

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public musicVolumeSet(value: number, fadeMs?: number): void {
        this.engine.audio?.music?.volumeSet(value, fadeMs);
    }

    /**
     * Gets the music player's current target volume.
     *
     * @returns Current target gain, or {@link DEFAULT_VOLUME} when the audio subsystem is not initialized.
     */
    public musicVolumeGet(): number {
        return this.engine.audio?.music?.volumeGet() ?? DEFAULT_VOLUME;
    }
}
