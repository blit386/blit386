/**
 * Per-frame numbers the engine overlay shows: frame and update timing, dropped frames, renderer pipeline
 * counters, and audio bus and voice counters. Collected by {@link BTAPI}'s frame loop; not part of the BT API.
 */

import type { OverlayAudioSnapshot, OverlayTimingSnapshot } from '../../overlay';
import type { BTAPI } from '../BTAPI';
import type { FrameDropEvent } from '../GameLoop';

/** Strips top-level `readonly` so a public snapshot type can be mutated in place internally. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** All-zero overlay timing, copied into the reused snapshot at construction and on every init. */
const ZERO_OVERLAY_TIMING: OverlayTimingSnapshot = Object.freeze({
    frameMs: 0,
    updateMs: 0,
    renderMs: 0,
    updateSteps: 0,
    drawCalls: 0,
    droppedFrames: 0,
    primitiveOverflowCount: 0,
    spriteOverflowCount: 0,
    primitiveSubmittedVertices: 0,
    spriteSubmittedVertices: 0,
});

/** All-zero overlay audio snapshot; `levels` is replaced, never written through, so sharing it is safe. */
const ZERO_AUDIO_SNAPSHOT: OverlayAudioSnapshot = Object.freeze({
    levels: Object.freeze({ main: 0, music: 0, sfx: 0 }),
    activeVoices: 0,
    totalVoices: 0,
    voiceStealCount: 0,
    voiceDropCount: 0,
    preUnlockDropCount: 0,
});

/** Collects the timing, renderer and audio snapshots the overlay draws each frame. */
export class OverlayDiagnostics {
    /** Reused timing snapshot passed into the overlay each frame. */
    public readonly overlayTiming: Writable<OverlayTimingSnapshot> = { ...ZERO_OVERLAY_TIMING };

    /** Reused audio snapshot passed into the overlay each frame; populated by {@link captureAudioDiagnostics}. */
    public readonly audioSnapshot: Writable<OverlayAudioSnapshot> = { ...ZERO_AUDIO_SNAPSHOT };

    /** When true, {@link captureRendererDiagnostics} reads renderer pipeline counters each frame. */
    public isCollectRendererDiagnosticsEnabled = false;

    /**
     * When true, {@link Subsystems.attachAudioSubsystem} enables bus metering and
     * {@link captureAudioDiagnostics} reads audio bus/voice counters each frame.
     */
    public isCollectAudioMetersEnabled = false;

    /** Pending renderer diagnostics captured after overlay draws; copied into {@link overlayTiming} at frame end. */
    private readonly pendingRendererDiagnostics: {
        primitiveOverflowCount: number;
        spriteOverflowCount: number;
        primitiveSubmittedVertices: number;
        spriteSubmittedVertices: number;
    } = {
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
    };

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Zeroes every snapshot for a new run; called by `init()` before the loop starts.
     */
    public reset(): void {
        Object.assign(this.overlayTiming, ZERO_OVERLAY_TIMING);
        this.resetPendingRendererDiagnostics();
        Object.assign(this.audioSnapshot, ZERO_AUDIO_SNAPSHOT);
    }

    /**
     * Copies the finished frame's timing and the renderer counters captured after the overlay drew into
     * {@link overlayTiming}, then clears the pending counters. Called once at the end of every rendered frame.
     *
     * @param frameStartMs - `performance.now()` when the frame callback started.
     * @param renderMs - Wall time of the game's `render()` this frame.
     */
    public commitFrame(frameStartMs: number, renderMs: number): void {
        this.overlayTiming.frameMs = Math.max(0, performance.now() - frameStartMs);
        this.overlayTiming.updateMs = this.engine.pendingUpdateMs;
        this.overlayTiming.renderMs = renderMs;
        this.overlayTiming.updateSteps = this.engine.pendingUpdateSteps;
        this.overlayTiming.drawCalls = this.engine.pendingDrawCalls;
        this.overlayTiming.droppedFrames = 0;
        this.overlayTiming.primitiveOverflowCount = this.pendingRendererDiagnostics.primitiveOverflowCount;
        this.overlayTiming.spriteOverflowCount = this.pendingRendererDiagnostics.spriteOverflowCount;
        this.overlayTiming.primitiveSubmittedVertices = this.pendingRendererDiagnostics.primitiveSubmittedVertices;
        this.overlayTiming.spriteSubmittedVertices = this.pendingRendererDiagnostics.spriteSubmittedVertices;
        this.resetPendingRendererDiagnostics();
    }

    /**
     * Records dropped-frame severity for the timing chart and optionally logs a warning.
     *
     * The {@link GameLoop} auto-calibrates its baseline to the actual rAF cadence,
     * so sustained slowness re-baselines instead of generating sustained log spam.
     *
     * @param event - Dropped-frame event from {@link GameLoop}.
     * @param logToConsole - When true, emits a one-line console warning.
     */
    public handleFrameDrop(event: FrameDropEvent, logToConsole: boolean): void {
        this.overlayTiming.droppedFrames = event.droppedFrames;

        if (logToConsole) {
            console.warn(
                `[BT] Dropped ${event.droppedFrames} frame(s) ` +
                    `(frame time ${event.deltaTime.toFixed(1)}ms, expected ${event.expectedInterval.toFixed(1)}ms)`,
            );
        }
    }

    /**
     * Reads renderer pipeline diagnostic counters when overlay diagnostics collection is enabled.
     *
     * Must run after demo and overlay draws and before {@link IRenderer.endFrame}
     * resets pipeline batch state.
     */
    public captureRendererDiagnostics(): void {
        if (!this.isCollectRendererDiagnosticsEnabled || !this.engine.renderer) {
            return;
        }

        const diagnostics = this.engine.renderer.getFrameDiagnostics();

        this.pendingRendererDiagnostics.primitiveOverflowCount = diagnostics.primitiveOverflowCount;
        this.pendingRendererDiagnostics.spriteOverflowCount = diagnostics.spriteOverflowCount;
        this.pendingRendererDiagnostics.primitiveSubmittedVertices = diagnostics.primitiveSubmittedVertices;
        this.pendingRendererDiagnostics.spriteSubmittedVertices = diagnostics.spriteSubmittedVertices;
    }

    /**
     * Reads audio bus levels and voice counters when overlay audio metering is enabled.
     *
     * Must run after demo and overlay draws, mirroring {@link captureRendererDiagnostics}.
     */
    public captureAudioDiagnostics(): void {
        if (!this.isCollectAudioMetersEnabled || !this.engine.audio) {
            return;
        }

        this.audioSnapshot.levels = this.engine.audio.getBusLevels();
        this.audioSnapshot.activeVoices = this.engine.audio.voices?.getActiveVoiceCount() ?? 0;
        this.audioSnapshot.totalVoices = this.engine.audio.voices?.getVoiceCount() ?? 0;
        this.audioSnapshot.voiceStealCount = this.engine.audio.voices?.getStealCount() ?? 0;
        this.audioSnapshot.voiceDropCount = this.engine.audio.voices?.getDropCount() ?? 0;
        this.audioSnapshot.preUnlockDropCount = this.engine.audio.getDroppedSfxCount();
    }

    /**
     * Clears pending renderer diagnostics when collection is disabled or after frame rollover.
     */
    private resetPendingRendererDiagnostics(): void {
        this.pendingRendererDiagnostics.primitiveOverflowCount = 0;
        this.pendingRendererDiagnostics.spriteOverflowCount = 0;
        this.pendingRendererDiagnostics.primitiveSubmittedVertices = 0;
        this.pendingRendererDiagnostics.spriteSubmittedVertices = 0;
    }
}
