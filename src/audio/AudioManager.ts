/**
 * Internal audio subsystem: Web Audio context, bus graph, browser autoplay-unlock
 * state machine, SFX voice pool, music player, and pre-unlock SFX/music drop counters.
 *
 * Owned by {@link BTAPI} (not itself a singleton) and never exposed to demo code. This class
 * manages the audio graph, bus volume/mute, unlock tracking, SFX voice playback via
 * {@link playSound}, and music playback via {@link musicPlay}.
 */

import type { AudioBus } from '../core/IBTDemo';
import { applyAudioParamRamp } from '../utils/AudioParamRamp';
import type { EasingFunction } from '../utils/Easing';
import { setAudioClipUnloadHandler, setAudioDecodeContext } from './audioDecodeContext';
import { MusicPlayer, type MusicPlayOptions } from './MusicPlayer';
import {
    DEFAULT_PAN,
    DEFAULT_PITCH,
    DEFAULT_VOLUME,
    INVALID_SOUND_REF,
    type SoundRef,
    type VoicePlayOptions,
    VoicePool,
} from './VoicePool';

/** Default (full) gain for a freshly created or reset bus. */
const DEFAULT_BUS_VOLUME = 1;

/** Minimum accepted bus volume. */
const MIN_BUS_VOLUME = 0;

/** Maximum accepted bus volume. */
const MAX_BUS_VOLUME = 1;

/** Per-bus value keyed the same way as the bus graph (`main`, `music`, `sfx`). */
type PerBus<T> = Record<AudioBus, T>;

/**
 * Owns the Web Audio context, the bus graph (`sfx` / `music` -> `main` -> `destination`),
 * the autoplay-unlock state machine, and pre-unlock SFX/music request counters.
 *
 * Construct, then call {@link attach} with the rendering canvas. Call {@link detach}
 * to remove listeners and close the audio context (engine restarts, tests).
 *
 * Exposes bus volume, mute, and unlock-state accessors, SFX voice playback via
 * {@link playSound}, and music playback via {@link musicPlay}.
 */
export class AudioManager {
    /** Live Web Audio context, or `null` before {@link attach} / after {@link detach}. */
    private context: AudioContext | null = null;

    /** Gain nodes for the bus graph, or `null` before {@link attach} / after {@link detach}. */
    private busNodes: PerBus<GainNode> | null = null;

    /** SFX voice pool, or `null` before {@link attach} / after {@link detach}. */
    private voicePool: VoicePool | null = null;

    /** Music player, or `null` before {@link attach} / after {@link detach}. */
    private musicPlayer: MusicPlayer | null = null;

    /** Canvas passed to {@link attach}; the unlock gesture listener target. */
    private target: HTMLCanvasElement | null = null;

    /** `true` once a user gesture has successfully resumed the audio context. */
    private unlocked = false;

    /** `true` while a {@link resumeAndUnlock} call is in flight, guarding against concurrent resume attempts. */
    private isUnlocking = false;

    /** Logical (pre-mute) volume per bus, reported by {@link volumeGet} regardless of mute state. */
    private logicalVolume: PerBus<number>;

    /** Mute flag per bus. */
    private mutedState: PerBus<boolean>;

    /** Raw gain value captured at mute time for each muted bus, restored verbatim by {@link muteSet}. */
    private mutedGainSnapshot: Partial<PerBus<number>> = {};

    /** Count of SFX play requests dropped while the audio context was locked. */
    private sfxDroppedCount = 0;

    /** Whether a music play request arrived while locked, remembered for later resumption. */
    private isMusicRequestRemembered = false;

    /** Buffer and options from the latest {@link musicPlay} call made while locked; overwritten by a newer pending call, consumed by {@link resumeAndUnlock}. */
    private pendingMusicRequest: { buffer: AudioBuffer; options: MusicPlayOptions | undefined } | null = null;

    /** Bound `pointerdown` unlock gesture handler; removed by reference in {@link removeUnlockListeners}. */
    private readonly onPointerDown: (event: Event) => void;

    /** Bound `keydown` unlock gesture handler; removed by reference in {@link removeUnlockListeners}. */
    private readonly onKeyDown: (event: Event) => void;

    /** Bound `touchstart` unlock gesture handler; removed by reference in {@link removeUnlockListeners}. */
    private readonly onTouchStart: (event: Event) => void;

    /**
     * Creates an `AudioManager` with no context, bus graph, or listeners attached.
     *
     * Binds the one-shot unlock-gesture handler references so {@link detach} can
     * remove the same function instances that {@link attach} added, and
     * initializes every bus to full logical volume and unmuted.
     */
    constructor() {
        this.logicalVolume = { main: DEFAULT_BUS_VOLUME, music: DEFAULT_BUS_VOLUME, sfx: DEFAULT_BUS_VOLUME };
        this.mutedState = { main: false, music: false, sfx: false };

        this.onPointerDown = () => this.unlock();
        this.onKeyDown = () => this.unlock();
        this.onTouchStart = () => this.unlock();
    }

    /**
     * Creates the audio context and bus graph, and installs one-shot unlock
     * gesture listeners on `target`.
     *
     * Calls {@link detach} first so a repeated `attach()` (for example across
     * engine restarts) never leaks a previous context or listener set. Logs and
     * returns without installing listeners if constructing the audio context or
     * bus graph throws (for example a browser hitting its concurrent
     * `AudioContext` limit), so a failure here never rejects the caller's
     * `BTAPI.init()`. Registers the new context with `audioDecodeContext` on
     * success, so `AudioClip.load()` can later decode against the live context.
     *
     * @param target - Canvas that receives the one-shot unlock gesture listeners.
     */
    public attach(target: HTMLCanvasElement): void {
        this.detach();

        let busNodes: PerBus<GainNode>;

        try {
            this.context = new AudioContext();
            busNodes = this.buildBusGraph(this.context);
            this.busNodes = busNodes;
        } catch (error) {
            console.error('[BT] Failed to create the audio context', error);

            this.context = null;
            this.busNodes = null;

            return;
        }

        setAudioDecodeContext(this.context);

        this.voicePool = new VoicePool(this);
        setAudioClipUnloadHandler((buffer) => this.voicePool?.stopVoicesUsingBuffer(buffer));

        this.musicPlayer = new MusicPlayer(this.context, busNodes.music);

        this.target = target;

        target.addEventListener('pointerdown', this.onPointerDown);
        target.addEventListener('keydown', this.onKeyDown);
        target.addEventListener('touchstart', this.onTouchStart);
    }

    /**
     * Removes unlock gesture listeners, closes the audio context, and resets
     * all bus, mute, and drop-counter state. Clears the `audioDecodeContext`
     * registration so it never points at a closed context. Safe to call
     * repeatedly or before {@link attach}.
     */
    public detach(): void {
        this.removeUnlockListeners();

        this.voicePool?.stopAll();
        this.voicePool = null;
        setAudioClipUnloadHandler(() => {});

        this.musicPlayer?.stop();
        this.musicPlayer = null;

        if (this.context !== null) {
            this.context.close().catch(() => {
                // Context may already be closed; close() rejects rather than throwing synchronously.
            });
        }

        setAudioDecodeContext(null);

        this.context = null;
        this.busNodes = null;
        this.target = null;
        this.unlocked = false;
        this.isUnlocking = false;
        this.logicalVolume = { main: DEFAULT_BUS_VOLUME, music: DEFAULT_BUS_VOLUME, sfx: DEFAULT_BUS_VOLUME };
        this.mutedState = { main: false, music: false, sfx: false };
        this.mutedGainSnapshot = {};
        this.sfxDroppedCount = 0;
        this.isMusicRequestRemembered = false;
        this.pendingMusicRequest = null;
    }

    /**
     * Reports whether the audio context has been unlocked by a user gesture.
     *
     * @returns `true` once {@link AudioContext.resume} has resolved after a gesture.
     */
    public isUnlocked(): boolean {
        return this.unlocked;
    }

    /**
     * Returns the live Web Audio context, internal only – never exposed via `BTAPI` or `BT`.
     *
     * Used by {@link VoicePool} to build each voice's node chain.
     *
     * @returns The live audio context, or `null` before {@link attach} / after {@link detach}.
     */
    public getContext(): AudioContext | null {
        return this.context;
    }

    /**
     * Returns the `sfx` bus gain node, internal only – never exposed via `BTAPI` or `BT`.
     *
     * Used by {@link VoicePool} to connect each per-voice node chain's terminal `StereoPannerNode`.
     *
     * @returns The `sfx` bus gain node, or `null` before {@link attach} / after {@link detach}.
     */
    public getSfxBus(): GainNode | null {
        return this.busNodes?.sfx ?? null;
    }

    /**
     * Returns the logical (pre-mute) volume for `bus`.
     *
     * Unaffected by {@link muteSet} - muting never overwrites the configured level.
     *
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`.
     */
    public volumeGet(bus: AudioBus): number {
        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        return this.logicalVolume[bus];
    }

    /**
     * Sets the logical volume for `bus` and applies it to the bus gain node,
     * unless the bus is currently muted (in which case only the logical value
     * updates; the audible gain stays at 0 until {@link muteSet} unmutes it).
     *
     * @param bus - Audio bus to update.
     * @param volume - Target volume, clamped to `[0, 1]`.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     * @param easing - Easing curve for the fade. Defaults to `'linear'`; ignored when `fadeMs` is omitted.
     */
    public volumeSet(bus: AudioBus, volume: number, fadeMs?: number, easing: EasingFunction = 'linear'): void {
        const clamped = clampVolume(volume);

        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        this.logicalVolume[bus] = clamped;

        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        if (this.mutedState[bus]) {
            return;
        }

        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        const node = this.busNodes?.[bus];

        if (node === undefined) {
            return;
        }

        applyAudioParamRamp(node.gain, this.context?.currentTime ?? 0, clamped, fadeMs, easing);
    }

    /**
     * Reports whether `bus` is currently muted.
     *
     * @param bus - Audio bus to query.
     * @returns `true` when the bus gain is held at 0 by {@link muteSet}.
     */
    public isMuted(bus: AudioBus): boolean {
        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        return this.mutedState[bus];
    }

    /**
     * Mutes or unmutes `bus`.
     *
     * Cancels any in-flight {@link volumeSet} fade before applying the mute so a
     * scheduled ramp or curve can never override the mute/unmute value afterward.
     * Muting snapshots the bus node's current gain value and zeroes the node
     * immediately (no fade). Unmuting restores the exact snapshotted value, so
     * a mute/unmute pair never destroys the level configured by {@link volumeSet}.
     *
     * @param bus - Audio bus to mute or unmute.
     * @param muted - `true` to mute, `false` to unmute.
     */
    public muteSet(bus: AudioBus, muted: boolean): void {
        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        const node = this.busNodes?.[bus];

        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        if (node === undefined || this.mutedState[bus] === muted) {
            return;
        }

        node.gain.cancelScheduledValues(this.context?.currentTime ?? 0);

        if (muted) {
            // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
            this.mutedGainSnapshot[bus] = node.gain.value;
            node.gain.value = 0;
        } else {
            // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
            node.gain.value = this.mutedGainSnapshot[bus] ?? this.logicalVolume[bus];
        }

        // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
        this.mutedState[bus] = muted;
    }

    /**
     * Records an SFX play request dropped while the audio context was locked.
     *
     * Called by future SFX playback methods; only the counter is implemented here.
     */
    public noteDroppedSfx(): void {
        this.sfxDroppedCount += 1;
    }

    /**
     * Returns the number of SFX play requests dropped before unlock.
     *
     * @returns Dropped SFX request count.
     */
    public getDroppedSfxCount(): number {
        return this.sfxDroppedCount;
    }

    /**
     * Remembers that a music play request arrived while the audio context was
     * locked, so {@link resumeAndUnlock} can resume it once unlocked.
     *
     * Called by {@link musicPlay}; carries no payload itself - see {@link pendingMusicRequest}
     * for the actual buffer and options.
     */
    public rememberMusicRequest(): void {
        this.isMusicRequestRemembered = true;
    }

    /**
     * Reports whether a music play request is remembered from before unlock.
     *
     * @returns `true` when a pre-unlock music request is pending resumption.
     */
    public hasRememberedMusicRequest(): boolean {
        return this.isMusicRequestRemembered;
    }

    /**
     * Clears the remembered pre-unlock music request.
     *
     * Called by {@link resumeAndUnlock} once the remembered request has been started.
     */
    public clearRememberedMusicRequest(): void {
        this.isMusicRequestRemembered = false;
    }

    /**
     * Plays `buffer` through the SFX voice pool.
     *
     * Drops the request (counted via {@link noteDroppedSfx}) and returns
     * {@link INVALID_SOUND_REF} without allocating a voice while the context is locked
     * (pre-unlock), so the pool's slots are never spent on sound that would be inaudible anyway.
     *
     * {@link getDroppedSfxCount} only counts these pre-unlock drops; pool-exhaustion drops (no
     * free or stealable slot) are tracked separately by the pool's own `getDropCount()`, which is
     * internal-only and not yet exposed through `AudioManager`.
     *
     * @param buffer - Decoded audio buffer to play.
     * @param options - Playback options; see {@link VoicePlayOptions}.
     * @returns A {@link SoundRef} identifying the new voice, or {@link INVALID_SOUND_REF}.
     */
    public playSound(buffer: AudioBuffer, options?: VoicePlayOptions): SoundRef {
        if (!this.unlocked) {
            this.noteDroppedSfx();

            return INVALID_SOUND_REF;
        }

        return this.voicePool?.play(buffer, options) ?? INVALID_SOUND_REF;
    }

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @param ref - Sound to stop.
     * @param fadeOutMs - Optional linear fade-out duration in milliseconds.
     */
    public soundStop(ref: SoundRef, fadeOutMs?: number): void {
        this.voicePool?.stop(ref, fadeOutMs);
    }

    /**
     * Reports whether a sound is still playing.
     *
     * @param ref - Sound to query.
     * @returns `true` when `ref` still identifies a live voice; `false` on a stale ref or before {@link attach}.
     */
    public isSoundPlaying(ref: SoundRef): boolean {
        return this.voicePool?.isPlaying(ref) ?? false;
    }

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundVolumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.voicePool?.volumeSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current gain.
     *
     * @param ref - Sound to query.
     * @returns Current gain, or {@link DEFAULT_VOLUME} on a stale ref or before {@link attach}.
     */
    public soundVolumeGet(ref: SoundRef): number {
        return this.voicePool?.volumeGet(ref) ?? DEFAULT_VOLUME;
    }

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.voicePool?.pitchSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current playback rate.
     *
     * @param ref - Sound to query.
     * @returns Current playback rate, or {@link DEFAULT_PITCH} on a stale ref or before {@link attach}.
     */
    public soundPitchGet(ref: SoundRef): number {
        return this.voicePool?.pitchGet(ref) ?? DEFAULT_PITCH;
    }

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPanSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.voicePool?.panSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current stereo pan.
     *
     * @param ref - Sound to query.
     * @returns Current pan, or {@link DEFAULT_PAN} on a stale ref or before {@link attach}.
     */
    public soundPanGet(ref: SoundRef): number {
        return this.voicePool?.panGet(ref) ?? DEFAULT_PAN;
    }

    /**
     * Plays `buffer` through the music player, crossfading out whatever is currently playing.
     *
     * While the context is locked (pre-unlock), the request is not dropped like {@link playSound}
     * - it is stored as the pending music request and remembered via {@link rememberMusicRequest},
     * so {@link resumeAndUnlock} can start it the moment the context unlocks. A newer call while
     * still locked overwrites the previously stored request; only the latest survives to unlock.
     *
     * @param buffer - Decoded audio buffer to play.
     * @param options - Playback options; see {@link MusicPlayOptions}.
     */
    public musicPlay(buffer: AudioBuffer, options?: MusicPlayOptions): void {
        if (!this.unlocked) {
            this.pendingMusicRequest = { buffer, options };
            this.rememberMusicRequest();

            return;
        }

        this.musicPlayer?.play(buffer, options);
    }

    /**
     * Stops the music player, optionally fading out first.
     *
     * @param fadeMs - Optional linear fade-out duration in milliseconds; omit to stop immediately.
     */
    public musicStop(fadeMs?: number): void {
        this.musicPlayer?.stop(fadeMs);
    }

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public musicVolumeSet(value: number, fadeMs?: number): void {
        this.musicPlayer?.volumeSet(value, fadeMs);
    }

    /**
     * Gets the music player's current target volume.
     *
     * @returns Current target gain, or {@link DEFAULT_VOLUME} before {@link attach}.
     */
    public musicVolumeGet(): number {
        return this.musicPlayer?.volumeGet() ?? DEFAULT_VOLUME;
    }

    /**
     * Reports whether music is currently playing.
     *
     * @returns `true` when the music player has a live current track.
     */
    public isMusicPlaying(): boolean {
        return this.musicPlayer?.isPlaying() ?? false;
    }

    /**
     * Creates the `sfx` / `music` / `main` gain nodes and wires `sfx` and
     * `music` into `main`, which connects to `destination`.
     *
     * @param context - Audio context to build the graph on.
     * @returns The newly created bus gain nodes.
     */
    private buildBusGraph(context: AudioContext): PerBus<GainNode> {
        const main = context.createGain();
        const music = context.createGain();
        const sfx = context.createGain();

        music.connect(main);
        sfx.connect(main);
        main.connect(context.destination);

        return { main, music, sfx };
    }

    /**
     * Resumes the audio context on the first successful unlock gesture and
     * removes the gesture listeners. Left attached (to retry on the next
     * gesture) when `resume()` rejects.
     *
     * Guarded by {@link isUnlocking} so rapid-fire gestures (for example a
     * pointerdown and a keydown in the same frame) only trigger one concurrent
     * `resume()` attempt.
     */
    private unlock(): void {
        if (this.unlocked || this.isUnlocking || this.context === null) {
            return;
        }

        this.isUnlocking = true;

        void this.resumeAndUnlock(this.context);
    }

    /**
     * Awaits `context.resume()` and flips {@link unlocked} on success. Always
     * clears {@link isUnlocking} so a failed attempt can retry on the next gesture.
     *
     * On success, starts any music request remembered from before unlock (see
     * {@link musicPlay}) and clears it via {@link clearRememberedMusicRequest} so it never
     * replays on a later unlock attempt.
     *
     * @param context - Audio context to resume.
     */
    private async resumeAndUnlock(context: AudioContext): Promise<void> {
        try {
            await context.resume();

            this.unlocked = true;
            this.removeUnlockListeners();

            if (this.hasRememberedMusicRequest() && this.pendingMusicRequest !== null) {
                const { buffer, options } = this.pendingMusicRequest;

                this.musicPlayer?.play(buffer, options);
                this.clearRememberedMusicRequest();
                this.pendingMusicRequest = null;
            }
        } catch (error) {
            console.error('[BT] Failed to resume the audio context', error);
        } finally {
            this.isUnlocking = false;
        }
    }

    /**
     * Removes the pointerdown/keydown/touchstart unlock gesture listeners from
     * {@link target}. Safe to call when not attached or already removed.
     */
    private removeUnlockListeners(): void {
        if (this.target === null) {
            return;
        }

        this.target.removeEventListener('pointerdown', this.onPointerDown);
        this.target.removeEventListener('keydown', this.onKeyDown);
        this.target.removeEventListener('touchstart', this.onTouchStart);
    }
}

/**
 * Clamps a bus volume to `[0, 1]`.
 *
 * @param volume - Raw volume value.
 * @returns Volume clamped to `[MIN_BUS_VOLUME, MAX_BUS_VOLUME]`.
 */
function clampVolume(volume: number): number {
    return Math.min(MAX_BUS_VOLUME, Math.max(MIN_BUS_VOLUME, volume));
}
