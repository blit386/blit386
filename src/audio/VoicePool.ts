/**
 * Fixed-size SFX voice pool for {@link AudioManager}.
 *
 * Each voice is a per-play `AudioBufferSourceNode -> GainNode -> StereoPannerNode -> sfx bus`
 * chain, built fresh on every {@link VoicePool.play} call (source nodes are one-shot and cannot
 * be replayed). The pool is sized from `HardwareSettings.audioVoices` and never grows; when
 * every slot is in use, a new `play()` call steals the lowest-priority active voice at or below
 * the incoming priority (oldest start order breaks ties - see {@link VoiceSlot.startOrder}), or
 * drops the request when no slot qualifies. Callers identify a playing voice by an opaque,
 * generational {@link SoundRef} - every accessor validates the ref's generation against the
 * live slot and silently no-ops with inert defaults on a stale ref.
 */

import { BTAPI } from '../core/BTAPI';
import { applyAudioParamRamp } from '../utils/AudioParamRamp';
import type { AudioManager } from './AudioManager';

/** Fallback voice count used when `HardwareSettings.audioVoices` is unavailable. Mirrors `defaultConfig()`. */
const DEFAULT_VOICE_COUNT = 16;

/** Default per-voice gain applied when {@link VoicePlayOptions.volume} is omitted. */
const DEFAULT_VOLUME = 1;

/** Default playback rate applied when {@link VoicePlayOptions.pitch} is omitted. */
const DEFAULT_PITCH = 1;

/** Default stereo pan applied when {@link VoicePlayOptions.pan} is omitted. */
const DEFAULT_PAN = 0;

/** Default allocation priority applied when {@link VoicePlayOptions.priority} is omitted. */
const DEFAULT_PRIORITY = 0;

/** Default loop flag applied when {@link VoicePlayOptions.loop} is omitted. */
const DEFAULT_LOOP = false;

/**
 * Opaque generational handle identifying a single pool-allocated voice.
 *
 * `generation` increments every time the referenced slot is recycled (natural completion,
 * explicit {@link VoicePool.stop}, or being stolen by a later `play()`), so a ref captured
 * before a recycle silently fails every {@link VoicePool} accessor's generation check.
 */
export interface SoundRef {
    /** Index into the pool's fixed slot array. */
    readonly voiceIndex: number;

    /** Generation of the slot at the time this ref was issued. */
    readonly generation: number;
}

/** Inert handle returned when a voice could not be allocated (pool exhausted, or not yet attached). */
export const INVALID_SOUND_REF: SoundRef = { voiceIndex: -1, generation: -1 };

/** Options accepted by {@link VoicePool.play}. */
export interface VoicePlayOptions {
    /** Whether the buffer loops. Defaults to `false`. */
    loop?: boolean;

    /** Initial gain in `[0, 1]` (unclamped). Defaults to `1`. */
    volume?: number;

    /** Initial `playbackRate`. Defaults to `1`. */
    pitch?: number;

    /** Initial stereo pan in `[-1, 1]` (unclamped). Defaults to `0`. */
    pan?: number;

    /** Allocation priority; higher survives stealing longer. Defaults to `0`. */
    priority?: number;

    /** Optional linear fade-in duration in milliseconds, from silence to `volume`. */
    fadeInMs?: number;

    /** Audio-clock start time (`AudioContext.currentTime`-relative). Defaults to "now". */
    atTime?: number;
}

/** Per-slot playback state. Fields are `null`/inactive when the slot holds no live voice. */
interface VoiceSlot {
    /** Source node for the current voice, or `null` when inactive. */
    source: AudioBufferSourceNode | null;

    /** Gain node for the current voice, or `null` when inactive. */
    gain: GainNode | null;

    /** Panner node for the current voice, or `null` when inactive. */
    panner: StereoPannerNode | null;

    /** Buffer the current voice was started with, or `null` when inactive - used by {@link VoicePool.stopVoicesUsingBuffer}. */
    buffer: AudioBuffer | null;

    /** `true` while this slot holds a live voice. */
    isActive: boolean;

    /** Allocation priority of the current voice. */
    priority: number;

    /** Monotonic allocation counter; smaller means older. Breaks stealing ties. */
    startOrder: number;

    /** Current generation; bumped every time the slot is recycled. */
    generation: number;
}

/**
 * Fixed-size pool of SFX voices, owned and constructed by {@link AudioManager.attach}.
 */
export class VoicePool {
    /** Owning audio manager; source of the live context and `sfx` bus. */
    private readonly audioManager: AudioManager;

    /** Fixed-size slot array, sized at construction from `HardwareSettings.audioVoices`. */
    private readonly slots: VoiceSlot[];

    /** Monotonic counter incremented on every `play()`; used for stealing age tiebreaks. */
    private nextStartOrder = 0;

    /** Count of `play()` calls that found no free or stealable slot. */
    private dropCount = 0;

    /** Count of `play()` calls that stole an active slot. */
    private stealCount = 0;

    /**
     * Creates a pool with a fixed number of voice slots.
     *
     * @param audioManager - Owning audio manager; used to reach the live context and `sfx` bus.
     */
    constructor(audioManager: AudioManager) {
        this.audioManager = audioManager;
        this.slots = Array.from({ length: resolveVoiceCount() }, () => createEmptySlot());
    }

    /**
     * Allocates a voice and starts playing `buffer` through it.
     *
     * Picks the first free slot, or steals the lowest-priority active slot at or below the
     * incoming priority (oldest {@link VoiceSlot.startOrder} breaks ties). Returns
     * {@link INVALID_SOUND_REF} without allocating when the audio manager has no live context
     * or `sfx` bus (not attached, or already detached), and increments {@link getDropCount} when
     * every active slot outranks the incoming priority.
     *
     * @param buffer - Decoded audio buffer to play.
     * @param options - Playback options; see {@link VoicePlayOptions}.
     * @returns A {@link SoundRef} identifying the new voice, or {@link INVALID_SOUND_REF}.
     */
    public play(buffer: AudioBuffer, options: VoicePlayOptions = {}): SoundRef {
        const context = this.audioManager.getContext();
        const sfxBus = this.audioManager.getSfxBus();

        if (context === null || sfxBus === null) {
            return INVALID_SOUND_REF;
        }

        const priority = options.priority ?? DEFAULT_PRIORITY;
        const slotIndex = this.allocateSlot(priority);

        if (slotIndex === null) {
            this.dropCount += 1;

            return INVALID_SOUND_REF;
        }

        const slot = this.slots.at(slotIndex);

        if (slot === undefined) {
            return INVALID_SOUND_REF;
        }

        if (slot.isActive) {
            this.stealCount += 1;
            this.disconnectVoice(slot);
        }

        this.startVoice(slot, slotIndex, buffer, options, priority, context, sfxBus);

        return { voiceIndex: slotIndex, generation: slot.generation };
    }

    /**
     * Stops a playing voice, immediately freeing its slot for reuse.
     *
     * When `fadeOutMs` is given, ramps gain to `0` over that duration and schedules the
     * underlying source to stop only once the ramp completes - the fade is still audible even
     * though the slot itself is already free and may be reused by the very next `play()` call
     * (the reused slot gets fresh nodes; the fading-out nodes keep playing independently until
     * their own scheduled stop fires and their `onended` closure disconnects them). Silently
     * no-ops when `ref` is stale, out of range, or already stopped.
     *
     * @param ref - Voice to stop.
     * @param fadeOutMs - Optional linear fade-out duration in milliseconds.
     */
    public stop(ref: SoundRef, fadeOutMs?: number): void {
        const slot = this.getActiveSlot(ref);

        if (slot === null) {
            return;
        }

        const currentTime = this.currentTime();

        if (fadeOutMs !== undefined && fadeOutMs > 0 && slot.gain !== null) {
            applyAudioParamRamp(slot.gain.gain, currentTime, 0, fadeOutMs, 'linear');
            slot.source?.stop(currentTime + fadeOutMs / 1000);
        } else {
            slot.source?.stop();
        }

        this.resetSlot(slot);
    }

    /**
     * Reports whether `ref` still identifies a live voice.
     *
     * @param ref - Voice to query.
     * @returns `true` when `ref`'s generation matches its slot's current generation.
     */
    public isPlaying(ref: SoundRef): boolean {
        return this.getActiveSlot(ref) !== null;
    }

    /**
     * Returns a voice's current gain.
     *
     * @param ref - Voice to query.
     * @returns Current gain, or {@link DEFAULT_VOLUME} on a stale/invalid ref.
     */
    public volumeGet(ref: SoundRef): number {
        return this.getActiveSlot(ref)?.gain?.gain.value ?? DEFAULT_VOLUME;
    }

    /**
     * Sets a voice's gain, optionally ramping to it.
     *
     * @param ref - Voice to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public volumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        const slot = this.getActiveSlot(ref);

        if (slot === null || slot.gain === null) {
            return;
        }

        applyAudioParamRamp(slot.gain.gain, this.currentTime(), value, fadeMs, 'linear');
    }

    /**
     * Returns a voice's current playback rate.
     *
     * @param ref - Voice to query.
     * @returns Current playback rate, or {@link DEFAULT_PITCH} on a stale/invalid ref.
     */
    public pitchGet(ref: SoundRef): number {
        return this.getActiveSlot(ref)?.source?.playbackRate.value ?? DEFAULT_PITCH;
    }

    /**
     * Sets a voice's playback rate, optionally ramping to it.
     *
     * @param ref - Voice to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public pitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        const slot = this.getActiveSlot(ref);

        if (slot === null || slot.source === null) {
            return;
        }

        applyAudioParamRamp(slot.source.playbackRate, this.currentTime(), value, fadeMs, 'linear');
    }

    /**
     * Returns a voice's current stereo pan.
     *
     * @param ref - Voice to query.
     * @returns Current pan, or {@link DEFAULT_PAN} on a stale/invalid ref.
     */
    public panGet(ref: SoundRef): number {
        return this.getActiveSlot(ref)?.panner?.pan.value ?? DEFAULT_PAN;
    }

    /**
     * Sets a voice's stereo pan, optionally ramping to it.
     *
     * @param ref - Voice to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public panSet(ref: SoundRef, value: number, fadeMs?: number): void {
        const slot = this.getActiveSlot(ref);

        if (slot === null || slot.panner === null) {
            return;
        }

        applyAudioParamRamp(slot.panner.pan, this.currentTime(), value, fadeMs, 'linear');
    }

    /**
     * Returns the number of `play()` calls dropped because no slot was free or stealable.
     *
     * @returns Drop count.
     */
    public getDropCount(): number {
        return this.dropCount;
    }

    /**
     * Returns the number of `play()` calls that stole an active slot.
     *
     * @returns Steal count.
     */
    public getStealCount(): number {
        return this.stealCount;
    }

    /**
     * Picks a slot for a new voice: the first free slot, or the best steal candidate.
     *
     * @param priority - Allocation priority of the incoming voice.
     * @returns Slot index to use, or `null` when no free or stealable slot exists.
     */
    private allocateSlot(priority: number): number | null {
        const freeIndex = this.slots.findIndex((slot) => !slot.isActive);

        if (freeIndex !== -1) {
            return freeIndex;
        }

        return this.findStealCandidate(priority);
    }

    /**
     * Finds the best active slot to steal for an incoming voice: the lowest-priority active
     * slot at or below `incomingPriority`, breaking ties by oldest {@link VoiceSlot.startOrder}.
     *
     * @param incomingPriority - Allocation priority of the incoming voice.
     * @returns Slot index to steal, or `null` when every active slot outranks `incomingPriority`.
     */
    private findStealCandidate(incomingPriority: number): number | null {
        let candidateIndex: number | null = null;
        let candidatePriority = Number.POSITIVE_INFINITY;
        let candidateStartOrder = Number.POSITIVE_INFINITY;

        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots.at(i);

            if (slot === undefined || !slot.isActive || slot.priority > incomingPriority) {
                continue;
            }

            const isLowerPriority = slot.priority < candidatePriority;
            const isOlderAtSamePriority = slot.priority === candidatePriority && slot.startOrder < candidateStartOrder;

            if (candidateIndex === null || isLowerPriority || isOlderAtSamePriority) {
                candidateIndex = i;
                candidatePriority = slot.priority;
                candidateStartOrder = slot.startOrder;
            }
        }

        return candidateIndex;
    }

    /**
     * Builds a fresh `source -> gain -> panner -> sfx bus` chain in `slot` and starts playback.
     *
     * Bumps `slot.generation` so the returned {@link SoundRef} (built by the caller from the
     * post-call `slot.generation`) is unique even when reusing a stolen slot.
     *
     * @param slot - Slot to populate (already disconnected from any prior voice by the caller).
     * @param slotIndex - Index of `slot`, captured for the `onended` recycle callback.
     * @param buffer - Decoded audio buffer to play.
     * @param options - Playback options; see {@link VoicePlayOptions}.
     * @param priority - Resolved allocation priority (already defaulted by the caller).
     * @param context - Live audio context (already validated non-null by the caller).
     * @param sfxBus - Live `sfx` bus gain node (already validated non-null by the caller).
     */
    private startVoice(
        slot: VoiceSlot,
        slotIndex: number,
        buffer: AudioBuffer,
        options: VoicePlayOptions,
        priority: number,
        context: AudioContext,
        sfxBus: GainNode,
    ): void {
        const source = context.createBufferSource();
        const gain = context.createGain();
        const panner = context.createStereoPanner();

        source.buffer = buffer;
        source.loop = options.loop ?? DEFAULT_LOOP;
        source.playbackRate.value = options.pitch ?? DEFAULT_PITCH;
        panner.pan.value = options.pan ?? DEFAULT_PAN;

        source.connect(gain);
        gain.connect(panner);
        panner.connect(sfxBus);

        const generation = slot.generation + 1;
        const startOrder = this.nextStartOrder++;

        slot.source = source;
        slot.gain = gain;
        slot.panner = panner;
        slot.buffer = buffer;
        slot.isActive = true;
        slot.priority = priority;
        slot.startOrder = startOrder;
        slot.generation = generation;

        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
            this.handleVoiceEnded(slotIndex, generation);
        };

        const targetVolume = options.volume ?? DEFAULT_VOLUME;
        const atTime = options.atTime ?? context.currentTime;

        if (options.fadeInMs !== undefined && options.fadeInMs > 0) {
            gain.gain.value = 0;
            applyAudioParamRamp(gain.gain, atTime, targetVolume, options.fadeInMs, 'linear');
        } else {
            gain.gain.value = targetVolume;
        }

        source.start(atTime);
    }

    /**
     * Immediately stops and disconnects `slot`'s current node chain, if any.
     *
     * Clears `onended` first so the about-to-be-superseded voice's natural-completion callback
     * never fires (its cleanup - disconnect and generation-guarded slot reset - is handled here
     * instead, synchronously, since the caller is about to overwrite or reset this slot).
     *
     * @param slot - Slot whose current node chain should be torn down.
     */
    private disconnectVoice(slot: VoiceSlot): void {
        if (slot.source !== null) {
            slot.source.onended = null;
            slot.source.stop();
            slot.source.disconnect();
        }

        slot.gain?.disconnect();
        slot.panner?.disconnect();
    }

    /**
     * Returns `ref`'s slot when `ref` still identifies a live voice, or `null` when the index is
     * out of range or the generation no longer matches (stale ref).
     *
     * @param ref - Voice reference to validate.
     * @returns The live slot, or `null` on a stale/invalid ref.
     */
    private getActiveSlot(ref: SoundRef): VoiceSlot | null {
        if (ref.voiceIndex < 0 || ref.voiceIndex >= this.slots.length) {
            return null;
        }

        const slot = this.slots.at(ref.voiceIndex);

        if (slot === undefined || slot.generation !== ref.generation) {
            return null;
        }

        return slot;
    }

    /**
     * Returns the live audio-clock time, or `0` when the manager has no live context.
     *
     * @returns `AudioContext.currentTime`, or `0` when not attached.
     */
    private currentTime(): number {
        return this.audioManager.getContext()?.currentTime ?? 0;
    }

    /**
     * Clears a slot's node references and marks it inactive, bumping its generation so any
     * outstanding {@link SoundRef} pointing at it becomes stale.
     *
     * @param slot - Slot to reset.
     */
    private resetSlot(slot: VoiceSlot): void {
        slot.source = null;
        slot.gain = null;
        slot.panner = null;
        slot.buffer = null;
        slot.isActive = false;
        slot.generation += 1;
    }

    /**
     * Recycles `slotIndex` when its generation still matches `expectedGeneration` (a no-op when
     * the slot has already been reused - see {@link disconnectVoice}).
     *
     * @param slotIndex - Index of the slot whose voice just ended.
     * @param expectedGeneration - Generation captured when the ended voice was started.
     */
    private handleVoiceEnded(slotIndex: number, expectedGeneration: number): void {
        const slot = this.slots.at(slotIndex);

        if (slot === undefined || slot.generation !== expectedGeneration) {
            return;
        }

        this.resetSlot(slot);
    }
}

/**
 * Reads the configured voice count from hardware settings, falling back to
 * {@link DEFAULT_VOICE_COUNT}.
 *
 * @returns Resolved voice slot count.
 */
function resolveVoiceCount(): number {
    return BTAPI.instance.getHardwareSettings()?.audioVoices ?? DEFAULT_VOICE_COUNT;
}

/**
 * Creates an inactive slot with no live nodes.
 *
 * @returns Fresh, inactive {@link VoiceSlot}.
 */
function createEmptySlot(): VoiceSlot {
    return {
        source: null,
        gain: null,
        panner: null,
        buffer: null,
        isActive: false,
        priority: 0,
        startOrder: 0,
        generation: 0,
    };
}
