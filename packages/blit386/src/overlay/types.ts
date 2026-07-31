import type { AudioBus } from '../core/IBTDemo';

/**
 * Per-frame WebGPU pipeline diagnostic counters for overlay timing/chart internals.
 *
 * Populated by {@link BTAPI} when timing-chart diagnostics mode or
 * {@link HardwareSettings.isOverlayRendererDiagnosticsBarEnabled} needs pipeline counters.
 * Overflow counts are WebGPU-only; software reports zero overflow with comparable vertex totals.
 */
export interface OverlayRendererDiagnostics {
    /** Primitive pipeline overflow events this frame (dropped pixels or vertices). */
    readonly primitiveOverflowCount: number;

    /** Sprite pipeline overflow events this frame (dropped quads). */
    readonly spriteOverflowCount: number;

    /** Primitive vertices batched for GPU submission this frame. */
    readonly primitiveSubmittedVertices: number;

    /** Sprite vertices batched for GPU submission this frame. */
    readonly spriteSubmittedVertices: number;
}

/**
 * Per-frame timing snapshot fed into {@link Overlay.updateAndRender}.
 *
 * Values are wall-clock CPU timings from `performance.now()` measured by
 * {@link BTAPI}. The overlay smooths `frameMs`, `updateMs`, and `renderMs`
 * via {@link TimingSampler} and FPS via {@link FpsSampler} before display.
 */
export interface OverlayTimingSnapshot {
    /** Total frame CPU time in milliseconds (update + render callback work). */
    readonly frameMs: number;

    /** Sum of all fixed `update()` calls that ran for this frame, in milliseconds. */
    readonly updateMs: number;

    /** Demo `render()` wall time for this frame, in milliseconds. */
    readonly renderMs: number;

    /** Number of fixed update steps processed for this frame (0..8). */
    readonly updateSteps: number;

    /** Number of draw API calls issued by the demo for this frame. */
    readonly drawCalls: number;

    /**
     * Estimated dropped refresh intervals detected at the start of this present frame.
     * Zero when none; set from {@link GameLoop} before the overlay samples the chart.
     */
    readonly droppedFrames: number;

    /** {@link OverlayRendererDiagnostics.primitiveOverflowCount} for this frame. */
    readonly primitiveOverflowCount: number;

    /** {@link OverlayRendererDiagnostics.spriteOverflowCount} for this frame. */
    readonly spriteOverflowCount: number;

    /** {@link OverlayRendererDiagnostics.primitiveSubmittedVertices} for this frame. */
    readonly primitiveSubmittedVertices: number;

    /** {@link OverlayRendererDiagnostics.spriteSubmittedVertices} for this frame. */
    readonly spriteSubmittedVertices: number;
}

/**
 * Per-frame audio snapshot fed into {@link Overlay.updateAndRender}.
 *
 * Populated from {@link AudioManager.getBusLevels} and the {@link VoicePool} counters.
 */
export interface OverlayAudioSnapshot {
    /** Normalized per-bus level (0..1), keyed the same way as the bus graph (`main`, `music`, `sfx`). */
    readonly levels: Readonly<Record<AudioBus, number>>;

    /** Number of currently active SFX voices. */
    readonly activeVoices: number;

    /** Fixed total number of SFX voice slots. */
    readonly totalVoices: number;

    /** Count of `playSound()` calls that stole an active voice slot. */
    readonly voiceStealCount: number;

    /** Count of `playSound()` calls dropped because no voice slot was free or stealable. */
    readonly voiceDropCount: number;

    /** Count of SFX play requests dropped before the audio context unlocked. */
    readonly preUnlockDropCount: number;
}

/** Computed palette swatch grid dimensions for the palette band. */
export interface PaletteGridLayout {
    /** Number of columns in the grid. */
    readonly cols: number;

    /** Number of rows in the full palette grid. */
    readonly rows: number;

    /** Number of rows visible in the viewport (<= {@link rows}). */
    readonly visibleRows: number;

    /** Side length of each swatch in pixels. */
    readonly swatchSize: number;

    /** Gap between swatches horizontally and vertically. */
    readonly gap: number;

    /** Total palette band height including padding (based on {@link visibleRows}). */
    readonly totalHeight: number;
}
