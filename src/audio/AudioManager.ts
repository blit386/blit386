/**
 * Internal audio subsystem: Web Audio context, bus graph, browser autoplay-unlock
 * state machine, and pre-unlock SFX/music drop counters.
 *
 * Owned by {@link BTAPI} (not itself a singleton) and never exposed to demo code.
 * Actual SFX/music playback methods are added in a later phase; this class only
 * manages the audio graph, bus volume/mute, and unlock tracking.
 */

import type { AudioBus } from '../core/IBTDemo';
import type { EasingFunction } from '../utils/Easing';
import { applyEasing } from '../utils/Easing';

/** Number of samples used to build an eased gain ramp curve for `setValueCurveAtTime`. */
const FADE_CURVE_SAMPLE_COUNT = 32;

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
 * Actual SFX/music playback methods are added in a later phase; this class only
 * exposes bus volume, mute, and unlock-state accessors.
 */
export class AudioManager {
    /** Live Web Audio context, or `null` before {@link attach} / after {@link detach}. */
    private context: AudioContext | null = null;

    /** Gain nodes for the bus graph, or `null` before {@link attach} / after {@link detach}. */
    private busNodes: PerBus<GainNode> | null = null;

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
     * `BTAPI.init()`.
     *
     * @param target - Canvas that receives the one-shot unlock gesture listeners.
     */
    public attach(target: HTMLCanvasElement): void {
        this.detach();

        try {
            this.context = new AudioContext();
            this.buildBusGraph(this.context);
        } catch (error) {
            console.error('[BT] Failed to create the audio context', error);

            this.context = null;
            this.busNodes = null;

            return;
        }

        this.target = target;

        target.addEventListener('pointerdown', this.onPointerDown);
        target.addEventListener('keydown', this.onKeyDown);
        target.addEventListener('touchstart', this.onTouchStart);
    }

    /**
     * Removes unlock gesture listeners, closes the audio context, and resets
     * all bus, mute, and drop-counter state. Safe to call repeatedly or before
     * {@link attach}.
     */
    public detach(): void {
        this.removeUnlockListeners();

        if (this.context !== null) {
            this.context.close().catch(() => {
                // Context may already be closed; close() rejects rather than throwing synchronously.
            });
        }

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

        this.applyBusGain(node, clamped, fadeMs, easing);
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
     * locked, so future playback can resume it once unlocked.
     *
     * Called by future music playback methods; only the flag is implemented here.
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
     * Called by future music playback methods once the remembered request has
     * been handled.
     */
    public clearRememberedMusicRequest(): void {
        this.isMusicRequestRemembered = false;
    }

    /**
     * Creates the `sfx` / `music` / `main` gain nodes and wires `sfx` and
     * `music` into `main`, which connects to `destination`.
     *
     * @param context - Audio context to build the graph on.
     */
    private buildBusGraph(context: AudioContext): void {
        const main = context.createGain();
        const music = context.createGain();
        const sfx = context.createGain();

        music.connect(main);
        sfx.connect(main);
        main.connect(context.destination);

        this.busNodes = { main, music, sfx };
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
     * @param context - Audio context to resume.
     */
    private async resumeAndUnlock(context: AudioContext): Promise<void> {
        try {
            await context.resume();

            this.unlocked = true;
            this.removeUnlockListeners();
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

    /**
     * Schedules or immediately applies a gain change on `node`.
     *
     * With no `fadeMs` (or a non-positive one), sets `node.gain.value` immediately.
     * With `fadeMs`, anchors the ramp to `context.currentTime`: `'linear'` easing uses
     * `linearRampToValueAtTime`; other easings sample {@link applyEasing} into a curve
     * fed to `setValueCurveAtTime`.
     *
     * @param node - Gain node to update.
     * @param targetValue - Target gain value.
     * @param fadeMs - Optional fade duration in milliseconds.
     * @param easing - Easing curve applied when `fadeMs` is a positive duration.
     */
    private applyBusGain(
        node: GainNode,
        targetValue: number,
        fadeMs: number | undefined,
        easing: EasingFunction,
    ): void {
        const context = this.context;

        if (context === null || fadeMs === undefined || fadeMs <= 0) {
            node.gain.value = targetValue;

            return;
        }

        const startValue = node.gain.value;
        const now = context.currentTime;
        const durationSeconds = fadeMs / 1000;

        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(startValue, now);

        if (easing === 'linear') {
            node.gain.linearRampToValueAtTime(targetValue, now + durationSeconds);

            return;
        }

        node.gain.setValueCurveAtTime(sampleEasingCurve(startValue, targetValue, easing), now, durationSeconds);
    }
}

/**
 * Samples an eased gain curve from `startValue` to `targetValue` for
 * `AudioParam.setValueCurveAtTime`.
 *
 * @param startValue - Gain value at the start of the fade.
 * @param targetValue - Gain value at the end of the fade.
 * @param easing - Easing curve to sample.
 * @returns Sampled curve of {@link FADE_CURVE_SAMPLE_COUNT} values.
 */
function sampleEasingCurve(startValue: number, targetValue: number, easing: EasingFunction): Float32Array {
    const curve = new Float32Array(FADE_CURVE_SAMPLE_COUNT);

    for (let i = 0; i < FADE_CURVE_SAMPLE_COUNT; i++) {
        const t = i / (FADE_CURVE_SAMPLE_COUNT - 1);
        const eased = applyEasing(t, easing);

        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
        curve[i] = startValue + (targetValue - startValue) * eased;
    }

    return curve;
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
