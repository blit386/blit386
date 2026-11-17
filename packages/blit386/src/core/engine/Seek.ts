/**
 * `BT.renderAt` and `BT.resume`: stop the loop, replay from the start on a fresh game instance (or step on from
 * the current tick), step to the target tick with no `requestAnimationFrame`, and restart the loop on resume.
 * Part of {@link BTAPI}; not part of the BT API.
 */

import * as errorMessages from '../../utils/errorMessages';
import { Vector2i } from '../../utils/Vector2i';
import type { BTAPI } from '../BTAPI';
import type { GameLoop } from '../GameLoop';
import type { IBTDemo, RenderAtFrom } from '../IBTDemo';

/** Seeking to an exact tick with `BT.renderAt`, and `BT.resume`. */
export class Seek {
    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Seeks the fixed-step clock and renders exactly the frame at `seconds`. See `BT.renderAt`.
     *
     * Calls are serialized: a second call waits for the first to finish.
     *
     * @param seconds - Target time; rounded to the nearest tick (`Math.round(seconds * targetFPS)`).
     * @param from - `'start'` (default) replays from tick 0; `'current'` steps forward only.
     * @returns Resolves after the target frame's `endFrame`; rejects on bad input, before init, or a failed `init()`.
     */
    public renderAt(seconds: number, from: RenderAtFrom = 'start'): Promise<void> {
        const run = this.engine.seekChain.then(() => this.seek(seconds, from));

        this.engine.seekChain = run.catch(() => undefined);

        return run;
    }

    /**
     * Restarts the game loop after {@link renderAt} left it stopped, from the seeked tick.
     *
     * Runs after every `renderAt` called before it has settled, and before any called after it, so it always
     * resumes from the seeked frame the caller asked for. A no-op when, by then, no seek holds the loop.
     *
     * @returns Resolves once the loop has restarted, or once the call turned out to be a no-op.
     */
    public resume(): Promise<void> {
        return this.engine.seekChain.then(() => this.restartParkedLoop());
    }

    /**
     * The body of {@link resume}, run once every earlier seek has settled: restarts the loop and resumes
     * parked audio when a seek still holds the loop stopped, otherwise does nothing.
     */
    private restartParkedLoop(): void {
        if (!this.engine.loop || !this.engine.isSeekParked) {
            return;
        }

        this.engine.isSeekParked = false;
        this.engine.audio?.unpark();
        // TODO(BT-513): realign music with BT.musicSeek(BT.timeSeconds) once music transport lands.
        // Until then a track started by a 'start' seek's init() re-run plays from 0 after resume.
        this.engine.loop.start();
    }

    /**
     * One serialized seek: validate, stop and park, optionally replay from tick 0, then step.
     *
     * @param seconds - Target time in seconds.
     * @param from - Seek origin.
     */
    private async seek(seconds: number, from: RenderAtFrom): Promise<void> {
        const loop = this.engine.loop;
        const demo = this.engine.demo;
        const hwSettings = this.engine.hwSettings;

        if (!loop || !demo || !hwSettings) {
            throw new Error(errorMessages.RENDER_AT_NOT_READY_MESSAGE);
        }

        // Rounded, not floored: 3.2 * 60 is 192.00000000000003 and 0.1 * 3 * 60 can land just under.
        const targetTicks = Math.round(seconds * hwSettings.targetFPS);

        // Number.isFinite also rejects non-numbers; the safe-integer check catches a finite time too large
        // to count in ticks (1e300), before anything is stopped or parked.
        if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(targetTicks)) {
            throw new Error(errorMessages.renderAtSecondsError(seconds));
        }

        if (from !== 'start' && from !== 'current') {
            throw new Error(errorMessages.renderAtFromError(from));
        }

        if (from === 'current' && targetTicks < loop.getTicks()) {
            throw new Error(errorMessages.renderAtPastError(targetTicks, loop.getTicks()));
        }

        loop.stop();
        this.engine.isSeekParked = true;
        // Wait for silence: the suspend resolves once the audio output has drained, so nothing from
        // before the seek is still playing while it replays.
        await this.engine.audio?.park();
        this.engine.isSeeking = true;

        try {
            if (from === 'start') {
                await this.resetForSeek(demo, loop);
            }

            loop.step(targetTicks - loop.getTicks());
        } finally {
            this.engine.isSeeking = false;
        }
    }

    /**
     * Resets engine-owned state to how the boot run found it, then runs `init()` on a fresh game
     * instance.
     *
     * Engine-owned: the `BT.random` stream, palette effects, post-process effects, camera, pending
     * input edges, ticks, and the post-process clock. The game's own fields reset because the replay
     * runs on a new instance built from the game's class, exactly as the boot run did - so a counter,
     * a clock, or an array init() fills cannot carry over from the run being replaced. An object-literal
     * game has no class to build from, so its `init()` re-runs on the same object and resetting its
     * fields stays `init()`'s job. The splash and its handoff fade are not replayed, but what the
     * handoff did to palette effects is (see the end).
     *
     * Failure: the instance is built before anything is reset, so a throwing constructor changes
     * nothing. If `init()` fails, the previous instance is reinstalled and the ticks, the
     * `BT.random` stream position, the camera offset and the post-process clock are
     * restored, so `BT.resume()` continues the old game where it was (`BT.random.seedValue` reads
     * `undefined` afterwards unless nothing had drawn since the seed). Not restored: palette effects
     * and post-process effects (clearing disposes them), and pending input edges, all gone. An object-literal
     * game runs `init()` on the live object, so fields it wrote before failing stay changed.
     *
     * @param demo - Running game instance.
     * @param loop - Stopped game loop.
     * @throws {Error} When the constructor or `init()` fails.
     */
    private async resetForSeek(demo: IBTDemo, loop: GameLoop): Promise<void> {
        // Before any reset: a constructor throw leaves the engine untouched.
        const replay = this.buildReplayDemo(demo);

        const ticks = loop.getTicks();
        const randomState = this.engine.random.getState();
        const randomSeed = this.engine.random.seedValue;
        const cameraOffset = this.engine.getCameraOffset();
        const lastCameraOffset = this.engine.lastCameraOffset;
        const isCameraResetPending = this.engine.pendingCameraReset;
        const renderClockMs = this.engine.lastRenderClockMs;

        this.restoreRandom(this.engine.bootRandomState, this.engine.bootRandomSeed);
        this.engine.paletteEffects.clear();

        // Gate on activeBackend, like the splash dissolve: the software renderer throws on
        // post-process, and it has no effects to clear.
        if (this.engine.activeBackend === 'webgpu') {
            this.engine.renderer?.clearEffects();
        }

        this.engine.resetCamera();
        this.engine.lastCameraOffset = Vector2i.zero();
        this.engine.drainInputEdges(0);
        loop.resetTicks();
        this.engine.lastRenderClockMs = 0;

        // Install it before init() runs, so BT calls init() makes (palette, input maps, hooks) and the
        // loop's update/render callbacks all reach the instance being replayed.
        this.engine.installDemo(replay);

        let ok = false;

        try {
            ok = await replay.init();
        } catch (error) {
            console.error('[BT] renderAt: init() threw while replaying from the start:', error);
        }

        if (!ok) {
            this.engine.installDemo(demo);
            // The failed init() may have started effects; the restored game never asked for them.
            this.engine.paletteEffects.clear();
            loop.setTicks(ticks);
            this.restoreRandom(randomState, randomSeed);
            this.engine.setCameraOffset(cameraOffset);
            // setCameraOffset() commits the renderer's offset; put back the deferred-reset state it overwrites.
            this.engine.lastCameraOffset = lastCameraOffset;
            this.engine.pendingCameraReset = isCameraResetPending;
            this.engine.lastRenderClockMs = renderClockMs;

            throw new Error(errorMessages.RENDER_AT_INIT_FAILED_MESSAGE);
        }

        // Live, the splash handoff (endPaletteCapture) dropped every palette effect init() started
        // behind the splash. Replaying init() without the splash must drop them too, or the seek
        // shows a cycle the live run never ran. `splash` is set once at boot and never cleared, so
        // a restart, whose live init() ran without it and kept its effects, is excluded.
        if (this.engine.splash && !this.engine.isRestartAfterSplash) {
            this.engine.paletteEffects.clear();
        }
    }

    /**
     * Puts the `BT.random` stream back to a captured position. Uses `seed()` only when it reproduces
     * the state exactly (nothing drew between the seed and the capture), so `BT.random.seedValue`
     * keeps reporting the seed; `setState()` clears it.
     *
     * @param state - Value from `Random#getState`.
     * @param seed - `Random#seedValue` read at the same moment.
     */
    private restoreRandom(state: number, seed: number | undefined): void {
        if (seed !== undefined && seed === state) {
            this.engine.random.seed(seed);
        } else {
            this.engine.random.setState(state);
        }
    }

    /**
     * Builds the instance a `'start'` seek replays into: a new one from the game's class, or the same
     * object for an object-literal game, which has no class to build from.
     *
     * @param demo - Running game instance.
     * @returns The instance to run `init()` on.
     * @throws {Error} When the game's constructor throws (the error is logged first).
     */
    private buildReplayDemo(demo: IBTDemo): IBTDemo {
        const GameClass: unknown = demo.constructor;

        if (typeof GameClass !== 'function' || GameClass === Object) {
            return demo;
        }

        try {
            return new (GameClass as new () => IBTDemo)();
        } catch (error) {
            console.error('[BT] renderAt: the game constructor threw while replaying from the start:', error);

            throw new Error(errorMessages.RENDER_AT_CONSTRUCT_FAILED_MESSAGE, { cause: error });
        }
    }
}
