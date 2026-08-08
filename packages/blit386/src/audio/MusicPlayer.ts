/**
 * Self-contained crossfading music player, owned and constructed by {@link AudioManager.attach}.
 *
 * Tracks at most two live voices: a "current" voice (the most recently started track) and a
 * "previous" voice (a track crossfading out because a new one just started). Every fade and
 * start/stop is scheduled as Web Audio automation anchored to `AudioContext.currentTime` -
 * there is no per-frame update dependency, so scheduled crossfades keep playing correctly even
 * if the engine's game loop stalls.
 */

import { applyAudioParamRamp } from '../utils/AudioParamRamp';
import type { EasingFunction } from '../utils/Easing';
import { musicLoopRangeError } from '../utils/errorMessages';

/** Default gain applied to an incoming track when {@link MusicPlayOptions.volume} is omitted. */
const DEFAULT_VOLUME = 1;

/** Default crossfade duration in milliseconds when {@link MusicPlayOptions.fadeMs} is omitted (immediate switch). */
const DEFAULT_FADE_MS = 0;

/** Default crossfade timing offset when {@link MusicPlayOptions.overlap} is omitted (simultaneous fade-in/fade-out). */
const DEFAULT_OVERLAP = 1;

/** Minimum accepted {@link MusicPlayOptions.overlap}. */
const MIN_OVERLAP = -1;

/** Maximum accepted {@link MusicPlayOptions.overlap}. */
const MAX_OVERLAP = 1;

/** Default loop flag applied when neither {@link MusicPlayOptions.loop} nor loop points are given. */
const DEFAULT_LOOP = true;

/** Default easing curve applied to a fade-in/fade-out ramp when omitted. */
const DEFAULT_EASING: EasingFunction = 'linear';

/**
 * Options accepted by {@link MusicPlayer.play}, {@link BTAPI.musicPlay}, and {@link BT.musicPlay}.
 *
 * @since 1.3.0
 */
export interface MusicPlayOptions {
    /** Target gain for the incoming track in `[0, 1]` (unclamped). Defaults to `1`. */
    volume?: number;

    /** Crossfade duration in milliseconds, applied to both the outgoing fade-out and the incoming fade-in. Defaults to `0` (immediate switch). */
    fadeMs?: number;

    /**
     * Crossfade timing offset in `[-1, 1]`. `1` fades the incoming track in and the outgoing
     * track out at the same time; `0` starts the fade-in exactly when the fade-out ends
     * (sequential); `-1` inserts a silence gap of `fadeMs` between the fade-out ending and the
     * fade-in starting. Intermediate values interpolate. Defaults to `1`.
     */
    overlap?: number;

    /** Easing curve for the incoming track's fade-in. Defaults to `'linear'`. */
    easeIn?: EasingFunction;

    /** Easing curve for the outgoing track's fade-out. Defaults to `'linear'`. */
    easeOut?: EasingFunction;

    /** Whether the whole track loops. Ignored when `loopStart`/`loopEnd` are given. Defaults to `true`. */
    loop?: boolean;

    /** Loop region start in seconds. Requires `loopEnd`; see {@link MusicPlayer.play}. */
    loopStart?: number;

    /** Loop region end in seconds. Requires `loopStart`; see {@link MusicPlayer.play}. */
    loopEnd?: number;
}

/**
 * A single crossfade-pair voice: one shared gain node feeding the music bus, and the source
 * node(s) carrying its audio. `sources` holds one entry today but is plural-ready for future
 * multi-stem tracks (for example separate loops layered under one fade envelope).
 */
interface Voice {
    /** Per-voice gain, connected once to the music bus at creation and never reconnected. */
    readonly gain: GainNode;

    /** Source nodes carrying this voice's audio. */
    readonly sources: AudioBufferSourceNode[];

    /** Count of `sources` that have not yet fired `onended`; the voice finalizes at `0`. */
    pendingSources: number;
}

/**
 * Crossfading music player owned by {@link AudioManager}. See the module doc comment above for
 * the crossfade model.
 */
export class MusicPlayer {
    /** Most recently started voice, or `null` when nothing is playing. */
    private current: Voice | null = null;

    /** Voice crossfading out because {@link current} replaced it, or `null` when none is fading. */
    private previous: Voice | null = null;

    /** Last requested target volume, reported by {@link volumeGet} regardless of fade state. */
    private volume = DEFAULT_VOLUME;

    /** Options from the most recent {@link play} call, replayed (with `fadeMs` forced to `0`) by {@link hotReplaceCurrentBuffer}. */
    private lastOptions: MusicPlayOptions = {};

    /**
     * Creates a player with no live voices.
     *
     * @param context – Live audio context to schedule against.
     * @param musicBus - `music` bus gain node every voice connects to.
     */
    constructor(
        /** Live audio context to schedule against. */
        private readonly context: AudioContext,
        /** `music` bus gain node every voice connects to. */
        private readonly musicBus: GainNode,
    ) {}

    /**
     * Starts `buffer` as the new current track, crossfading out any track already playing.
     *
     * Promotes the existing current voice (if any) to "previous" and schedules its fade-out,
     * then starts a new current voice with a scheduled fade-in. When a previous voice is already
     * mid-fade (this is called again before the last crossfade finished), that stale previous
     * voice is stopped and released immediately so only one crossfade pair is ever live.
     *
     * Crossfade timing is derived from `options.fadeMs` and `options.overlap` and anchored to
     * `AudioContext.currentTime`: the outgoing fade-out always starts immediately; the incoming
     * fade-in starts `fadeMs * (1 - overlap)` seconds later, so `overlap = 1` fades both at once,
     * `overlap = 0` starts the fade-in exactly as the fade-out ends, and `overlap = -1` leaves a
     * silence gap of `fadeMs` between them.
     *
     * @param buffer – Decoded audio buffer to play.
     * @param options – Playback options; see {@link MusicPlayOptions}.
     * @throws Error if `loopStart`/`loopEnd` are given without each other, or describe an invalid
     *   region for `buffer`'s duration.
     */
    public play(buffer: AudioBuffer, options: MusicPlayOptions = {}): void {
        validateLoopRegion(options, buffer.duration);

        this.lastOptions = options;

        const now = this.context.currentTime;
        const fadeSeconds = Math.max(0, options.fadeMs ?? DEFAULT_FADE_MS) / 1000;
        const overlap = clampOverlap(options.overlap ?? DEFAULT_OVERLAP);

        // overlap only describes the offset between an outgoing and incoming fade – with no
        // current voice to crossfade against, there is nothing to offset from, so the new track
        // always starts at now regardless of overlap.
        const fadeInStart = this.current !== null ? now + fadeSeconds * (1 - overlap) : now;

        if (this.previous !== null) {
            this.forceStopVoice(this.previous);
            this.previous = null;
        }

        if (this.current !== null) {
            this.previous = this.current;
            this.current = null;
            this.scheduleFadeOutAndStop(this.previous, now, fadeSeconds, options.easeOut ?? DEFAULT_EASING);
        }

        this.volume = options.volume ?? DEFAULT_VOLUME;
        this.current = this.startVoice(
            buffer,
            options,
            this.volume,
            fadeInStart,
            fadeSeconds,
            options.easeIn ?? DEFAULT_EASING,
        );
    }

    /**
     * Stops playback, optionally fading out first.
     *
     * Immediately stops and releases any voice still crossfading out from a prior {@link play}
     * call, then demotes the current voice to "previous" and schedules its fade-out and stop the
     * same way {@link play} does for a replaced track – it stays tracked (not discarded) until
     * the fade actually completes, so a subsequent {@link play} or {@link stop} call can still
     * find and immediately silence it instead of leaving it to fade out on its own unmanaged.
     * {@link current} is cleared synchronously, so {@link isPlaying} reports `false` right away
     * even while the fade-out is still audible. No-op when nothing is playing.
     *
     * @param fadeMs – Optional linear fade-out duration in milliseconds; omit to stop immediately.
     */
    public stop(fadeMs?: number): void {
        const now = this.context.currentTime;
        const fadeSeconds = Math.max(0, fadeMs ?? 0) / 1000;

        if (this.previous !== null) {
            this.forceStopVoice(this.previous);
            this.previous = null;
        }

        if (this.current !== null) {
            this.previous = this.current;
            this.current = null;
            this.scheduleFadeOutAndStop(this.previous, now, fadeSeconds, DEFAULT_EASING);
        }
    }

    /**
     * Sets the current track's gain, optionally ramping to it, and remembers the value for
     * future {@link volumeGet} calls even before the next {@link play}.
     *
     * @param value – Target gain.
     * @param fadeMs – Optional fade duration in milliseconds; omit for an immediate change.
     */
    public volumeSet(value: number, fadeMs?: number): void {
        this.volume = value;

        if (this.current === null) {
            return;
        }

        applyAudioParamRamp(this.current.gain.gain, this.context.currentTime, value, fadeMs, DEFAULT_EASING);
    }

    /**
     * Returns the last requested target volume.
     *
     * @returns Current target gain, defaulting to {@link DEFAULT_VOLUME} before the first {@link play}.
     */
    public volumeGet(): number {
        return this.volume;
    }

    /**
     * Reports whether a current track is playing.
     *
     * @returns `true` while a current voice exists (starting, fading in, or fully audible);
     *   `false` once it is stopped or naturally finishes.
     */
    public isPlaying(): boolean {
        return this.current !== null;
    }

    /**
     * Hot-reload seam: if `oldBuffer` is the buffer of the currently playing track,
     * restarts playback with `newBuffer` using the last {@link play} options but no
     * crossfade (`fadeMs: 0`) so a hot-reloaded track picks up immediately. Same-
     * position resume is out of scope – playback restarts from the beginning.
     *
     * @param oldBuffer – Buffer identity to match against the current track.
     * @param newBuffer – Replacement buffer to play when `oldBuffer` matches.
     * @returns `true` if the current track was restarted; `false` if it didn't
     *   match, or nothing is currently playing.
     */
    public hotReplaceCurrentBuffer(oldBuffer: AudioBuffer, newBuffer: AudioBuffer): boolean {
        if (this.currentBuffer() !== oldBuffer) {
            return false;
        }

        const options = sanitizeLoopRegion(this.lastOptions, newBuffer.duration);

        this.play(newBuffer, { ...options, fadeMs: 0 });

        return true;
    }

    /**
     * Builds a fresh `source -> gain -> music bus` chain and starts playback with a scheduled
     * fade-in.
     *
     * @param buffer – Decoded audio buffer to play.
     * @param options – Playback options; see {@link MusicPlayOptions}.
     * @param targetVolume – Resolved target gain (already defaulted by the caller).
     * @param fadeInStart – Audio-clock time the fade-in (and playback) starts at.
     * @param fadeSeconds – Fade-in duration in seconds; `0` starts at `targetVolume` immediately.
     * @param easeIn – Easing curve for the fade-in ramp.
     * @returns The newly started voice.
     */
    private startVoice(
        buffer: AudioBuffer,
        options: MusicPlayOptions,
        targetVolume: number,
        fadeInStart: number,
        fadeSeconds: number,
        easeIn: EasingFunction,
    ): Voice {
        const gain = this.context.createGain();

        gain.connect(this.musicBus);

        const source = this.context.createBufferSource();

        source.buffer = buffer;
        applyLoopOptions(source, options);

        source.connect(gain);

        const fadeMs = fadeSeconds > 0 ? fadeSeconds * 1000 : undefined;

        if (fadeMs !== undefined) {
            gain.gain.value = 0;
        }

        applyAudioParamRamp(gain.gain, fadeInStart, targetVolume, fadeMs, easeIn);

        const voice: Voice = { gain, sources: [source], pendingSources: 1 };

        source.onended = () => {
            source.disconnect();
            this.handleVoiceSourceEnded(voice);
        };

        source.start(fadeInStart);

        return voice;
    }

    /**
     * Schedules `voice`'s gain to fade to `0` and its source(s) to stop once the fade completes.
     *
     * Does not disconnect anything synchronously – the node chain keeps playing until the
     * scheduled stop time, and each source's `onended` handler (installed in {@link startVoice})
     * disconnects it when that actually fires.
     *
     * @param voice – Voice to fade out and stop.
     * @param startTime – Audio-clock time the fade-out starts at.
     * @param fadeSeconds – Fade-out duration in seconds; `0` stops immediately.
     * @param easeOut – Easing curve for the fade-out ramp.
     */
    private scheduleFadeOutAndStop(
        voice: Voice,
        startTime: number,
        fadeSeconds: number,
        easeOut: EasingFunction,
    ): void {
        const fadeMs = fadeSeconds > 0 ? fadeSeconds * 1000 : undefined;

        applyAudioParamRamp(voice.gain.gain, startTime, 0, fadeMs, easeOut);

        const stopAt = startTime + fadeSeconds;

        for (const source of voice.sources) {
            source.stop(stopAt);
        }
    }

    /**
     * Immediately stops and disconnects `voice`'s entire node chain, with no fade.
     *
     * Used to release a stale previous voice when {@link play} or {@link stop} is called again
     * before its crossfade finished, so only one crossfade pair is ever live.
     *
     * @param voice – Voice to force-stop.
     */
    private forceStopVoice(voice: Voice): void {
        for (const source of voice.sources) {
            source.stop();
            source.disconnect();
        }

        voice.gain.disconnect();
    }

    /**
     * Recycles `voice` once every one of its sources has fired `onended`.
     *
     * Guards against a stale callback from a voice already replaced or force-stopped by
     * comparing object identity against {@link current} and {@link previous} - unlike
     * {@link VoicePool}'s fixed, reused slots, `Voice` objects here are never recycled (each
     * {@link startVoice} call allocates a fresh one), so identity alone disambiguates without
     * needing a generation counter.
     *
     * @param voice – Voice one of whose sources just ended.
     */
    private handleVoiceSourceEnded(voice: Voice): void {
        voice.pendingSources -= 1;

        if (voice.pendingSources > 0) {
            return;
        }

        voice.gain.disconnect();

        if (this.current === voice) {
            this.current = null;
        }

        if (this.previous === voice) {
            this.previous = null;
        }
    }

    /**
     * Returns the `AudioBuffer` backing the current track's sole source node.
     *
     * @returns The current track's buffer, or `null` when nothing is playing.
     */
    private currentBuffer(): AudioBuffer | null {
        return this.current?.sources[0]?.buffer ?? null;
    }
}

/**
 * Clamps a crossfade overlap value to `[-1, 1]`.
 *
 * @param overlap – Raw overlap value.
 * @returns Overlap clamped to `[MIN_OVERLAP, MAX_OVERLAP]`.
 */
function clampOverlap(overlap: number): number {
    return Math.min(MAX_OVERLAP, Math.max(MIN_OVERLAP, overlap));
}

/**
 * Applies `options.loop` / `options.loopStart` / `options.loopEnd` to a freshly created source
 * node. Assumes {@link validateLoopRegion} already passed.
 *
 * @param source – Source node to configure.
 * @param options – Playback options; see {@link MusicPlayOptions}.
 */
function applyLoopOptions(source: AudioBufferSourceNode, options: MusicPlayOptions): void {
    const { loopStart, loopEnd } = options;

    if (loopStart !== undefined && loopEnd !== undefined) {
        source.loop = true;
        source.loopStart = loopStart;
        source.loopEnd = loopEnd;

        return;
    }

    source.loop = options.loop ?? DEFAULT_LOOP;
}

/**
 * Drops `loopStart`/`loopEnd` from `options` when they no longer describe a valid region for
 * `duration`, instead of letting an invalid region reach {@link validateLoopRegion} and throw.
 *
 * Used by {@link MusicPlayer.hotReplaceCurrentBuffer}: `lastOptions` was captured for the
 * previous buffer's duration, and a hot-reloaded replacement can be shorter, so its old loop
 * points may no longer fit. Falls back to whole-buffer looping via `options.loop` in that case,
 * so a valid buffer replacement always restarts successfully instead of throwing.
 *
 * @param options – Options to sanitize.
 * @param duration – Duration in seconds of the buffer these options are about to be replayed against.
 * @returns `options` unchanged when its loop region already fits `duration`; otherwise `options`
 *   with `loopStart`/`loopEnd` removed.
 */
function sanitizeLoopRegion(options: MusicPlayOptions, duration: number): MusicPlayOptions {
    const { loopStart, loopEnd, ...rest } = options;

    const isValidRegion =
        loopStart !== undefined &&
        loopEnd !== undefined &&
        loopStart >= 0 &&
        loopStart < loopEnd &&
        loopEnd <= duration;

    return isValidRegion ? options : rest;
}

/**
 * Validates `options.loopStart` / `options.loopEnd` against a buffer's duration before any
 * playback state changes, so an invalid call to {@link MusicPlayer.play} never leaves the
 * player mid-mutated.
 *
 * This is the one deliberate throw in the music playback path – clearly-invalid programmer
 * input, the same way {@link AudioClip.synth} and {@link VoicePool} validate their own
 * boundary values.
 *
 * @param options – Playback options; see {@link MusicPlayOptions}.
 * @param duration – Duration in seconds of the buffer about to be played.
 * @throws Error if only one of `loopStart`/`loopEnd` is given, or the pair does not satisfy
 *   `0 <= loopStart < loopEnd <= duration`.
 */
function validateLoopRegion(options: MusicPlayOptions, duration: number): void {
    const { loopStart, loopEnd } = options;

    if (loopStart === undefined && loopEnd === undefined) {
        return;
    }

    if (
        loopStart === undefined ||
        loopEnd === undefined ||
        !(loopStart >= 0 && loopStart < loopEnd && loopEnd <= duration)
    ) {
        throw new Error(musicLoopRangeError(loopStart, loopEnd, duration));
    }
}
