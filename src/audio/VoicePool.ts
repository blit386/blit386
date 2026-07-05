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
import type { AudioManager } from './AudioManager';

/** Fallback voice count used when `HardwareSettings.audioVoices` is unavailable. Mirrors `defaultConfig()`. */
const DEFAULT_VOICE_COUNT = 16;

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
    // @ts-expect-error TS6133: 'audioManager' will be used in play/stop methods (Tasks 5+).
    private readonly audioManager: AudioManager;

    /** Fixed-size slot array, sized at construction from `HardwareSettings.audioVoices`. */
    // @ts-expect-error TS6133: 'slots' will be used in play/stop methods (Tasks 5+).
    private readonly slots: VoiceSlot[];

    /** Monotonic counter incremented on every `play()`; used for stealing age tiebreaks. */
    // @ts-expect-error TS6133: 'nextStartOrder' will be used in play/stop methods (Tasks 5+).
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
