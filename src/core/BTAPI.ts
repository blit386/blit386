import type { AudioClip } from '../assets/AudioClip';
import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import {
    CycleEffect,
    FadeEffect,
    FadeRangeEffect,
    FlashEffect,
    PaletteEffectManager,
    paletteSwap,
} from '../assets/PaletteEffect';
import type { SpriteSheet } from '../assets/SpriteSheet';
import { createSystemFont } from '../assets/SystemFont';
import { AudioManager } from '../audio/AudioManager';
import type { MusicPlayOptions } from '../audio/MusicPlayer';
import { INVALID_SOUND_REF, type SoundPlayOptions, type SoundRef } from '../audio/VoicePool';
import { GamepadInput } from '../input/GamepadInput';
import { KeyboardInput } from '../input/KeyboardInput';
import { PointerInput } from '../input/PointerInput';
import type { OverlayAudioSnapshot, OverlayDrawTarget } from '../overlay';
import { createOverlayLayout, Overlay, OVERLAY_TOGGLE_KEY_CODE, resolveOverlayTopLeftLabel } from '../overlay';
import type { Effect } from '../render/effects/Effect';
import type { IRenderer } from '../render/IRenderer';
import { SoftwareRenderer } from '../render/SoftwareRenderer';
import { WebGPURenderer } from '../render/WebGPURenderer';
import { applyCanvasLayoutStyles, DEFAULT_MAX_CANVAS_SIZE } from '../utils/CanvasLayoutStyles';
import type { Color32 } from '../utils/Color32';
import type { EasingFunction } from '../utils/Easing';
import * as errorMessages from '../utils/errorMessages';
import {
    noActivePaletteError,
    paletteIndexNegativeError,
    paletteIndexOutOfRangeError,
    spriteNotIndexizedError,
} from '../utils/errorMessages';
import type { Rect2i } from '../utils/Rect2i';
import { RenderDimensionLimitError, validateDimensions } from '../utils/RenderLimits';
import { Vector2i } from '../utils/Vector2i';
import type { FrameDropCallback, FrameDropEvent } from './GameLoop';
import { GameLoop } from './GameLoop';
import type { AudioBus, Backend, HardwareSettings, IBTDemo } from './IBTDemo';
import {
    defaultConfig,
    mergeHardwareSettings,
    needsOverlayRendererDiagnostics,
    resolveOverlayTimingChartDiagnostics,
} from './IBTDemo';
import { markIndexUsed, resetUsage, USAGE_CAPACITY } from './RenderPaletteUsage';
import { initWebGPU } from './WebGPUContext';

/** Strips top-level `readonly` so a public snapshot type can be mutated in place internally. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Central runtime facade for BLIT386 engine services.
 *
 * `BTAPI` owns engine initialization, keeps references to the active renderer
 * and optional WebGPU device/context (null on the software backend), and exposes
 * the drawing/camera methods used by demos.
 * It is a singleton; access it through `BTAPI.instance`.
 */
export class BTAPI {
    /**
     * Major semantic-version component.
     */
    public static readonly VERSION_MAJOR = 1;

    /** Minor version number. */
    public static readonly VERSION_MINOR = 2;

    /** Patch version number. */
    public static readonly VERSION_PATCH = 1;

    /** Singleton instance of BTAPI. */
    private static _instance: BTAPI | null = null;

    /** Current demo instance implementing IBTDemo. */
    private demo: IBTDemo | null = null;

    /** Hardware configuration settings from the demo. */
    private hwSettings: HardwareSettings | null = null;

    /** WebGPU device for GPU operations. */
    private device: GPUDevice | null = null;

    /** WebGPU canvas context for presenting frames. */
    private context: GPUCanvasContext | null = null;

    /** HTML canvas element used for rendering. */
    private canvas: HTMLCanvasElement | null = null;

    /** Renderer subsystem for all drawing operations. */
    private renderer: (IRenderer & OverlayDrawTarget) | null = null;

    /** Backend that was successfully initialized, or null before init. */
    private activeBackend: Backend | null = null;

    /**
     * World camera offset last applied via {@link setCameraOffset}, persisted across frames.
     *
     * Re-applied at the start of every render pass, before the demo's `render()` runs (see
     * the `onRender` callback built in {@link init}). Without this, a render frame with zero
     * fixed-update steps (common once the render rate approaches or exceeds the fixed update
     * rate, for example at 120 Hz) would draw the world with whatever the *previous* frame's
     * `render()` left the live offset at after its own {@link resetCamera} call for
     * screen-space UI - which is always `(0, 0)` - producing a visible snap-to-origin flash
     * instead of holding the last correct scroll position.
     */
    private lastCameraOffset: Vector2i = Vector2i.zero();

    /**
     * Engine overlay; non-null when {@link HardwareSettings.isOverlayEnabled}
     * is not `false`. Layout is fixed at init; drawn after demo `render()` each frame.
     */
    private overlay: Overlay | null = null;

    /** Active engine palette used by palette-first rendering. */
    private palette: Palette | null = null;

    /** Registry of all sprite sheets that have been passed to drawSprite, for spritesRefresh. */
    private readonly spriteSheets: Set<SpriteSheet> = new Set();

    /** Game loop managing fixed-timestep updates and variable-rate rendering. */
    private loop: GameLoop | null = null;

    /** Manages animated palette effects (cycling, fading, flashing). */
    private readonly paletteEffects = new PaletteEffectManager();

    /** Built-in 6x14 system font for BT.systemPrint(). */
    private systemFont: BitmapFont | null = null;

    /** Accumulated fixed-step update time for the frame currently being rendered. */
    private pendingUpdateMs = 0;

    /** Number of fixed-step updates accumulated for the current render frame. */
    private pendingUpdateSteps = 0;

    /** Number of demo draw API calls issued since the last rendered frame. */
    private pendingDrawCalls = 0;

    /**
     * Overlay Backquote toggle press captured during a fixed-update tick, before
     * {@link KeyboardInput.endUpdate} clears that tick's press edge. Read and reset by
     * {@link beginRenderFrame} so the overlay (checked during the render phase, after every
     * update tick for the frame has already run) still observes a press that landed inside a tick.
     */
    private pendingOverlayTogglePress = false;

    /** Bitmask of palette indices referenced by demo draw calls this frame. */
    private readonly framePaletteUsageMask = new Uint8Array(USAGE_CAPACITY);

    /** Reused timing snapshot passed into the overlay each frame. */
    private readonly overlayTiming: {
        frameMs: number;
        updateMs: number;
        renderMs: number;
        updateSteps: number;
        drawCalls: number;
        droppedFrames: number;
        primitiveOverflowCount: number;
        spriteOverflowCount: number;
        primitiveSubmittedVertices: number;
        spriteSubmittedVertices: number;
    } = {
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
    };

    /** Reused audio snapshot passed into the overlay each frame; populated by {@link captureAudioDiagnostics}. */
    private readonly audioSnapshot: Writable<OverlayAudioSnapshot> = {
        levels: { main: 0, music: 0, sfx: 0 },
        activeVoices: 0,
        totalVoices: 0,
        voiceStealCount: 0,
        voiceDropCount: 0,
        preUnlockDropCount: 0,
    };

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

    /** When true, {@link captureRendererDiagnostics} reads renderer pipeline counters each frame. */
    private isCollectRendererDiagnosticsEnabled = false;

    /**
     * When true, {@link attachAudioSubsystem} enables bus metering and
     * {@link captureAudioDiagnostics} reads audio bus/voice counters each frame.
     */
    private isCollectAudioMetersEnabled = false;

    /** Pointer / mouse / touch input subsystem. Created during {@link init}. */
    private pointer: PointerInput | null = null;

    /** Keyboard input. Created during {@link init}. */
    private keyboard: KeyboardInput | null = null;

    /** Gamepad input. Created during {@link init}. */
    private gamepad: GamepadInput | null = null;

    /** Audio context, bus graph, and unlock state. Created during {@link init}. */
    private audio: AudioManager | null = null;

    // TODO: Additional subsystems for future implementation:
    // AssetManager

    /**
     * Private constructor to enforce singleton access via `BTAPI.instance`.
     */
    private constructor() {}

    /**
     * Gets the lazily created singleton instance.
     *
     * @returns The global BTAPI instance.
     */
    public static get instance(): BTAPI {
        if (!BTAPI._instance) {
            BTAPI._instance = new BTAPI();
        }

        return BTAPI._instance;
    }

    /**
     * Reads backend override from the current URL query string.
     *
     * @returns Supported backend override, or null when absent/invalid.
     */
    private static getBackendQueryOverride(): Backend | null {
        const search =
            typeof globalThis.location?.search === 'string'
                ? globalThis.location.search
                : typeof window === 'undefined'
                  ? ''
                  : window.location?.search;

        if (!search) {
            return null;
        }

        try {
            const backend = new URLSearchParams(search).get('backend');

            if (backend === 'software') {
                return 'software';
            }
        } catch (error) {
            console.warn('[BT] Failed to parse backend query override:', error);
        }

        return null;
    }

    /**
     * Initializes the engine for a demo and starts the main loop on success.
     *
     * The initialization sequence is:
     * - read hardware settings from the demo (`configure()` or defaults)
     * - initialize WebGPU (or software fallback) and create the renderer
     * - create the built-in system font and optional {@link Overlay}
     * - run the demo's async `init()`
     * - start the fixed-timestep game loop
     *
     * @param demo - Demo implementing the IBTDemo interface.
     * @param canvas - Render target canvas (WebGPU or software backend).
     * @returns `true` when initialization succeeds; otherwise `false`.
     */
    public async init(demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> {
        console.log(`[BT] Initializing engine v${BTAPI.VERSION_MAJOR}.${BTAPI.VERSION_MINOR}.${BTAPI.VERSION_PATCH}`);

        this.demo = demo;
        this.canvas = canvas;

        // Hardware settings: demo hook or defaults from defaultConfig() (320x240 logical, 640x480 buffer, 60 FPS).
        console.log('[BT] Reading hardware configuration');

        if (!this.loadHardwareSettings(demo)) {
            return false;
        }

        const hwSettings = this.hwSettings;
        if (!hwSettings) {
            return false;
        }

        const updateInterval = 1000 / hwSettings.targetFPS;

        this.isCollectAudioMetersEnabled =
            hwSettings.isOverlayEnabled !== false && hwSettings.isOverlayAudioMetersEnabled === true;

        console.log('[BT] Hardware settings:', {
            displaySize: `${hwSettings.displaySize.x}x${hwSettings.displaySize.y}`,
            targetFPS: hwSettings.targetFPS,
        });

        if (!(await this.initRenderer(canvas, hwSettings))) {
            return false;
        }

        // Create the built-in system font (synchronous, no GPU needed yet).
        this.systemFont = createSystemFont();
        this.setupOverlay();
        this.attachInputSubsystems(canvas);
        this.attachAudioSubsystem(canvas);

        console.log('[BT] Initializing demo');

        if (!(await this.runDemoInit(demo))) {
            return false;
        }

        // Start the loop. The GameLoop's double-RAF delay ensures the canvas is
        // fully ready before the first tick.
        const isFrameDropCallbackNeeded =
            hwSettings.isDetectingDroppedFrames === true || hwSettings.isOverlayTimingChartEnabled === true;
        const onFrameDrop: FrameDropCallback | undefined = isFrameDropCallbackNeeded
            ? (event) => this.handleFrameDrop(event, hwSettings.isDetectingDroppedFrames === true)
            : undefined;

        this.isCollectRendererDiagnosticsEnabled = needsOverlayRendererDiagnostics(hwSettings);

        this.pendingUpdateMs = 0;
        this.pendingUpdateSteps = 0;
        this.pendingDrawCalls = 0;
        this.lastCameraOffset = Vector2i.zero();
        this.overlayTiming.frameMs = 0;
        this.overlayTiming.updateMs = 0;
        this.overlayTiming.renderMs = 0;
        this.overlayTiming.updateSteps = 0;
        this.overlayTiming.drawCalls = 0;
        this.overlayTiming.droppedFrames = 0;
        this.overlayTiming.primitiveOverflowCount = 0;
        this.overlayTiming.spriteOverflowCount = 0;
        this.overlayTiming.primitiveSubmittedVertices = 0;
        this.overlayTiming.spriteSubmittedVertices = 0;
        this.resetPendingRendererDiagnostics();

        this.audioSnapshot.levels = { main: 0, music: 0, sfx: 0 };
        this.audioSnapshot.activeVoices = 0;
        this.audioSnapshot.totalVoices = 0;
        this.audioSnapshot.voiceStealCount = 0;
        this.audioSnapshot.voiceDropCount = 0;
        this.audioSnapshot.preUnlockDropCount = 0;

        this.loop = new GameLoop(
            updateInterval,
            () => {
                const updateStartMs = performance.now();
                this.demo?.update();
                this.pendingUpdateMs += Math.max(0, performance.now() - updateStartMs);
                this.pendingUpdateSteps++;

                const tick = this.loop?.getTicks() ?? 0;

                // Sample the overlay toggle key's press edge before endUpdate clears it below.
                // The overlay itself is only checked later, during the render phase (beginRenderFrame),
                // by which point this tick's edge would otherwise already be gone.
                if (this.keyboard?.isKeyPressed(OVERLAY_TOGGLE_KEY_CODE, undefined, tick)) {
                    this.pendingOverlayTogglePress = true;
                }

                // Keyboard edges and text buffer align with fixed update rate, not display
                // refresh rate (render may run 2x update on 120 Hz / 60 FPS setups).
                this.keyboard?.endUpdate(tick);
            },
            () => {
                const frameStartMs = performance.now();
                let renderMs = 0;

                if (this.renderer) {
                    this.beginRenderFrame();

                    this.renderer.beginFrame();

                    // Re-prime the world camera before the demo draws, in case this render
                    // frame has zero fixed-update steps (see lastCameraOffset doc comment).
                    this.renderer.setCameraOffset(this.lastCameraOffset);

                    const renderStartMs = performance.now();

                    this.demo?.render();

                    renderMs = Math.max(0, performance.now() - renderStartMs);

                    // Palette effects run after demo render (so user's explicit palette
                    // changes in render() are respected) but before endFrame (so effects
                    // are visible this frame via the dirty-flag GPU upload).
                    if (this.palette && this.paletteEffects.activeCount > 0) {
                        this.paletteEffects.update(this.palette);
                    }

                    // Overlay: screen-space HUD after demo content (top/bottom bars).
                    if (this.overlay && this.systemFont) {
                        this.overlay.updateAndRender(
                            this.renderer,
                            this.systemFont,
                            this.pointer,
                            this.keyboard,
                            this.loop?.getTicks() ?? 0,
                            () => this.demo?.overlayRows?.(),
                            this.overlayTiming,
                            this.palette,
                            this.framePaletteUsageMask,
                            this.audioSnapshot,
                        );
                    }

                    this.captureRendererDiagnostics();
                    this.captureAudioDiagnostics();

                    this.renderer.endFrame();
                }

                // Snapshot pointer state for next frame's edge detection / delta.
                // Must run AFTER demo.update + demo.render have read the current
                // state, so prev = "state when update last looked", letting any
                // event that arrives before the next tick be visible as a transition.
                this.pointer?.endFrame();

                const tick = this.loop?.getTicks() ?? 0;

                this.gamepad?.endFrame(tick);

                this.overlayTiming.frameMs = Math.max(0, performance.now() - frameStartMs);
                this.overlayTiming.updateMs = this.pendingUpdateMs;
                this.overlayTiming.renderMs = renderMs;
                this.overlayTiming.updateSteps = this.pendingUpdateSteps;
                this.overlayTiming.drawCalls = this.pendingDrawCalls;
                this.overlayTiming.droppedFrames = 0;
                this.overlayTiming.primitiveOverflowCount = this.pendingRendererDiagnostics.primitiveOverflowCount;
                this.overlayTiming.spriteOverflowCount = this.pendingRendererDiagnostics.spriteOverflowCount;
                this.overlayTiming.primitiveSubmittedVertices =
                    this.pendingRendererDiagnostics.primitiveSubmittedVertices;
                this.overlayTiming.spriteSubmittedVertices = this.pendingRendererDiagnostics.spriteSubmittedVertices;

                this.pendingUpdateMs = 0;
                this.pendingUpdateSteps = 0;
                this.pendingDrawCalls = 0;
                this.resetPendingRendererDiagnostics();
            },
            onFrameDrop,
        );

        this.loop.start();

        console.log('[BT] Initialization complete');

        return true;
    }

    /**
     * Stops the active game loop and detaches input and audio subsystems.
     *
     * Pointer, keyboard, gamepad, and audio subsystems are detached so listeners,
     * polling state, and the audio context do not leak across engine restarts
     * (relevant in tests where the same DOM persists).
     */
    public stop(): void {
        this.loop?.stop();
        this.clearInputSubsystems();
    }

    /**
     * Gets the current tick count.
     * Ticks increment once per fixed update step (target rate set by `targetFPS`).
     *
     * @returns Number of update ticks since initialization or last reset.
     */
    public getTicks(): number {
        return this.loop?.getTicks() ?? 0;
    }

    /**
     * Resets the tick counter to zero.
     * Useful for timing-based demo events and animations.
     */
    public resetTicks(): void {
        this.loop?.resetTicks();
    }

    /**
     * Gets the fractional progress between the last completed fixed update and the next.
     *
     * @returns Interpolation alpha in `[0, 1)`; `0` before initialization.
     */
    public getRenderAlpha(): number {
        return this.loop?.getRenderAlpha() ?? 0;
    }

    /**
     * Assigns an event tag on the stats overlay timing chart.
     *
     * No-op when the overlay or timing chart is disabled.
     *
     * @param label - Tag text; empty becomes `"Untitled"`.
     */
    public assignTag(label?: string): void {
        this.overlay?.assignTag(label, this.getTicks());
    }

    /**
     * Gets the hardware settings used for the active demo (from `configure()` or
     * {@link defaultConfig}).
     *
     * @returns Hardware configuration, or null if not initialized.
     */
    public getHardwareSettings(): HardwareSettings | null {
        return this.hwSettings;
    }

    /**
     * Gets the initialized WebGPU device, or `null` on the software backend.
     *
     * @returns GPU device, or null if not initialized.
     */
    public getDevice(): GPUDevice | null {
        return this.device;
    }

    /**
     * Gets the configured WebGPU canvas context, or `null` on the software backend.
     *
     * @returns Canvas context, or null if not initialized.
     */
    public getContext(): GPUCanvasContext | null {
        return this.context;
    }

    /**
     * Gets the canvas bound during initialization.
     *
     * @returns HTML canvas element, or null if not initialized.
     */
    public getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * Gets the audio subsystem, internal only; never exposed via the `BT` namespace.
     *
     * @returns Audio manager, or null if not initialized.
     */
    public getAudio(): AudioManager | null {
        return this.audio;
    }

    /**
     * Reports whether the audio context has been unlocked by a user gesture.
     *
     * @returns `true` once unlocked; `false` when locked or not initialized.
     */
    public isAudioUnlocked(): boolean {
        return this.audio?.isUnlocked() ?? false;
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
        this.audio?.volumeSet(bus, volume, fadeMs, easing);
    }

    /**
     * Gets the logical (pre-mute) volume for an audio bus.
     *
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`, or `0` when the audio subsystem is not initialized.
     */
    public audioVolumeGet(bus: AudioBus): number {
        return this.audio?.volumeGet(bus) ?? 0;
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
        this.audio?.muteSet(bus, muted);
    }

    /**
     * Reports whether an audio bus is currently muted.
     *
     * @param bus - Audio bus to query.
     * @returns `true` when muted; `false` when unmuted or not initialized.
     */
    public isAudioMuted(bus: AudioBus): boolean {
        return this.audio?.isMuted(bus) ?? false;
    }

    /**
     * Plays a loaded audio clip through the SFX voice pool.
     *
     * Returns {@link INVALID_SOUND_REF} without allocating a voice when the clip's buffer isn't
     * available (not finished loading yet, or already unloaded) or when the audio subsystem is
     * not initialized.
     *
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options; see {@link SoundPlayOptions}.
     * @returns A {@link SoundRef} identifying the new voice, or {@link INVALID_SOUND_REF}.
     */
    public soundPlay(clip: AudioClip, options?: SoundPlayOptions): SoundRef {
        if (clip.buffer === null) {
            return INVALID_SOUND_REF;
        }

        return this.audio?.playSound(clip.buffer, options) ?? INVALID_SOUND_REF;
    }

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @param ref - Sound to stop.
     * @param fadeOutMs - Optional linear fade-out duration in milliseconds.
     */
    public soundStop(ref: SoundRef, fadeOutMs?: number): void {
        this.audio?.soundStop(ref, fadeOutMs);
    }

    /**
     * Reports whether a sound is still playing.
     *
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` on a stale ref or when the audio subsystem is not initialized.
     */
    public isSoundPlaying(ref: SoundRef): boolean {
        return this.audio?.isSoundPlaying(ref) ?? false;
    }

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundVolumeSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundVolumeSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current gain.
     *
     * @param ref - Sound to query.
     * @returns Current gain in `[0, 1]`, or `1` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundVolumeGet(ref: SoundRef): number {
        return this.audio?.soundVolumeGet(ref) ?? 1;
    }

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPitchSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundPitchSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current playback rate.
     *
     * @param ref - Sound to query.
     * @returns Current playback rate, or `1` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPitchGet(ref: SoundRef): number {
        return this.audio?.soundPitchGet(ref) ?? 1;
    }

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public soundPanSet(ref: SoundRef, value: number, fadeMs?: number): void {
        this.audio?.soundPanSet(ref, value, fadeMs);
    }

    /**
     * Gets a sound's current stereo pan.
     *
     * @param ref - Sound to query.
     * @returns Current pan, or `0` on a stale ref or when the audio subsystem is not initialized.
     */
    public soundPanGet(ref: SoundRef): number {
        return this.audio?.soundPanGet(ref) ?? 0;
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
        if (clip.buffer === null) {
            return;
        }

        this.audio?.musicPlay(clip.buffer, options);
    }

    /**
     * Stops the music player, optionally fading out first.
     *
     * @param fadeMs - Optional linear fade-out duration in milliseconds; omit to stop immediately.
     */
    public musicStop(fadeMs?: number): void {
        this.audio?.musicStop(fadeMs);
    }

    /**
     * Reports whether music is currently playing.
     *
     * @returns `true` when the music player has a live current track; `false` when stopped, not
     *   yet started, or when the audio subsystem is not initialized.
     */
    public isMusicPlaying(): boolean {
        return this.audio?.isMusicPlaying() ?? false;
    }

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @param value - Target gain.
     * @param fadeMs - Optional fade duration in milliseconds; omit for an immediate change.
     */
    public musicVolumeSet(value: number, fadeMs?: number): void {
        this.audio?.musicVolumeSet(value, fadeMs);
    }

    /**
     * Gets the music player's current target volume.
     *
     * @returns Current target gain, or `1` when the audio subsystem is not initialized.
     */
    public musicVolumeGet(): number {
        return this.audio?.musicVolumeGet() ?? 1;
    }

    /**
     * Gets the renderer created during initialization.
     *
     * @returns Renderer instance, or null if not initialized.
     */
    public getRenderer(): IRenderer | null {
        return this.renderer;
    }

    /**
     * Returns the rendering backend requested for initialization.
     *
     * Mirrors resolved {@link HardwareSettings.backend} after `configure()` merge and
     * any `?backend=software` URL override. Defaults to `'webgpu'` when omitted.
     * Does not reflect WebGPU-to-software fallback; use {@link getActiveBackend} for that.
     *
     * @returns `'webgpu'` or `'software'` once hardware settings are loaded; `null` before that.
     */
    public getRequestedBackend(): Backend | null {
        if (!this.hwSettings) {
            return null;
        }

        return this.hwSettings.backend ?? 'webgpu';
    }

    /**
     * Returns the rendering backend that was actually initialized.
     *
     * @returns `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     */
    public getActiveBackend(): Backend | null {
        return this.activeBackend;
    }

    /**
     * Gets the pointer input subsystem created during initialization.
     *
     * @returns Pointer input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getPointer(): PointerInput | null {
        return this.pointer;
    }

    /**
     * Gets the keyboard input subsystem created during initialization.
     *
     * @returns Keyboard input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getKeyboard(): KeyboardInput | null {
        return this.keyboard;
    }

    /**
     * Gets the gamepad input subsystem created during initialization.
     *
     * @returns Gamepad input instance, or null when the engine has not been
     *          initialized yet (or has been stopped).
     */
    public getGamepad(): GamepadInput | null {
        return this.gamepad;
    }

    /**
     * Gets the active engine palette.
     *
     * @returns Active palette, or null if none has been set.
     */
    public getPalette(): Palette | null {
        return this.palette;
    }

    /**
     * Sets the active engine palette and propagates it to the renderer.
     *
     * If sprite sheets have already been indexized, emits a warning when
     * **replacing** the palette object (layout/index remapping may require
     * {@link BTAPI.spritesRefresh}). In-place slot value changes on the active
     * palette do not go through this method and need no refresh.
     *
     * @param palette - Palette to store as the active engine palette.
     */
    public setPalette(palette: Palette): void {
        if (this.spriteSheets.size > 0) {
            console.warn('[BT] Active palette structure changed. Call BT.spritesRefresh() to update loaded sprites.');
        }

        // In-flight effects hold snapshots of the old palette. Drop them so they
        // don't apply stale colors to the new palette.
        this.paletteEffects.clear();

        this.palette = palette;
        this.renderer?.setPalette(palette);
    }

    /**
     * Sets the background clear color for each frame using a palette index.
     *
     * @param paletteIndex - Palette index for the clear color.
     */
    public setClearColor(paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.renderer?.setClearColor(paletteIndex);
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public clearRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.clearRect(rect, paletteIndex);
    }

    /**
     * Draws a single pixel at the specified position.
     *
     * @param pos - Pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawPixel(pos, paletteIndex);
    }

    /**
     * Draws a line between two points using Bresenham's algorithm.
     * Produces pixel-perfect lines without antialiasing.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    public drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawLine(p0, p1, paletteIndex);
    }

    /**
     * Draws a rectangle outline (unfilled).
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawRect(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.renderer?.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font stores foreground pixels as palette index 1. The
     * `paletteIndex` parameter is converted to a sprite pipeline palette
     * offset so that each foreground pixel maps to `palette[paletteIndex]`.
     *
     * @param pos - Text position (top-left corner).
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to display.
     */
    public drawSystemText(pos: Vector2i, paletteIndex: number, text: string): void {
        this.assertPaletteIndex(paletteIndex);

        // Palette index 0 is transparent - nothing to draw.
        if (paletteIndex === 0) {
            return;
        }

        if (this.systemFont) {
            this.trackPaletteIndexUsed(paletteIndex);
            this.markDrawCall();

            // Offset math: font stores foreground as index 1.
            // Shader computes 1 + (paletteIndex - 1) = paletteIndex.
            this.renderer?.drawBitmapText(this.systemFont, pos, text, paletteIndex - 1);
        }
    }

    /**
     * Returns the built-in system font, or null if not yet initialized.
     *
     * @returns The system BitmapFont instance.
     */
    public getSystemFont(): BitmapFont | null {
        return this.systemFont;
    }

    /**
     * Draws a sprite region from an indexed sprite sheet.
     * The renderer batches compatible sprite draws internally.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized via spriteSheet.indexize()).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw in (the top-left corner).
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the sprite sheet has not been indexized.
     */
    public drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(spriteSheet);

        if (this.renderer && this.isTrackingFramePaletteUsage()) {
            spriteSheet.markPaletteIndicesInRect(srcRect, paletteOffset, this.framePaletteUsageMask);
        }

        this.markDrawCall();

        this.renderer?.drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
    }

    /**
     * Draws text using a bitmap font with variable-width glyphs.
     * Supports Unicode characters and per-glyph render offsets.
     *
     * @param font - Bitmap font containing character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     * @throws If the font's sprite sheet has not been indexized.
     */
    public drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(font.getSpriteSheet());

        if (this.renderer) {
            this.markBitmapTextPaletteUsage(font, text, paletteOffset);
        }

        this.markDrawCall();

        this.renderer?.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Re-indexizes all tracked sprite sheets against the current active palette.
     *
     * Call this after a **palette-layout swap** (same colors at new slot indices)
     * so every sprite sheet re-maps its original RGBA pixels against the new
     * layout. Not needed for in-place palette value changes.
     *
     * @throws If no active palette has been set.
     */
    public spritesRefresh(): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        let refreshed = 0;

        for (const sheet of this.spriteSheets) {
            if (!sheet.isIndexed()) {
                this.spriteSheets.delete(sheet);
                continue;
            }

            try {
                sheet.reindexize(this.palette);
                refreshed++;
            } catch (e) {
                console.error('[BT] spritesRefresh: failed to reindexize sheet, removing from registry:', e);
                this.spriteSheets.delete(sheet);
            }
        }

        console.log(`[BT] Refreshed ${refreshed} sprite sheet(s) against current palette`);
    }

    /**
     * Captures the next rendered frame as a PNG blob.
     * The capture occurs on the next completed render cycle.
     *
     * @returns Promise resolving to a PNG Blob.
     * @throws Error if the renderer is not initialized.
     */
    public captureFrame(): Promise<Blob> {
        if (!this.renderer) {
            return Promise.reject(new Error("Can't capture frame: renderer not initialized"));
        }

        return this.renderer.captureFrame();
    }

    /**
     * Sets the camera offset for scrolling effects.
     * The offset is applied to subsequent renderer draw calls.
     *
     * @param offset - Camera position offset in pixels.
     */
    public setCameraOffset(offset: Vector2i): void {
        this.lastCameraOffset = offset.clone();
        this.renderer?.setCameraOffset(offset);
    }

    /**
     * Gets the current camera offset.
     *
     * @returns Current camera position offset.
     */
    public getCameraOffset(): Vector2i {
        return this.renderer?.getCameraOffset() ?? Vector2i.zero();
    }

    /**
     * Resets the camera offset to (0, 0).
     */
    public resetCamera(): void {
        this.renderer?.resetCamera();
    }

    /**
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation. Runs indefinitely until canceled
     * via {@link paletteClearEffects}.
     *
     * @param start - First palette index in the cycling range (inclusive).
     * @param end - Last palette index in the cycling range (inclusive).
     * @param speed - Steps per second. Positive = forward, negative = backward.
     */
    public paletteCycle(start: number, end: number, speed: number): void {
        if (!Number.isFinite(speed)) {
            throw new Error(`paletteCycle: 'speed' should be a number (got ${speed}).`);
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
            throw new Error(`paletteCycle: start must be an integer less than end, got [${start}, ${end}].`);
        }

        this.paletteEffects.add(new CycleEffect(start, end, speed));
    }

    /**
     * Smoothly interpolates all palette entries toward a target over time.
     *
     * Snapshots the current palette at start. Auto-removes when complete.
     *
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    public paletteFade(target: Palette, durationMs: number, easing?: EasingFunction): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFade', durationMs);
        this.paletteEffects.add(new FadeEffect(this.palette, target, durationMs, easing));
    }

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * @param start - First palette index to fade (inclusive).
     * @param end - Last palette index to fade (inclusive).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    public paletteFadeRange(
        start: number,
        end: number,
        target: Palette,
        durationMs: number,
        easing?: EasingFunction,
    ): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFadeRange', durationMs);
        this.paletteEffects.add(new FadeRangeEffect(start, end, this.palette, target, durationMs, easing));
    }

    /**
     * Temporarily sets all non-zero palette entries to a single color, then restores.
     *
     * Index 0 (transparent) is preserved. Auto-removes after duration.
     *
     * @param color - Flash color applied to all non-zero entries.
     * @param durationMs - How long the flash lasts in milliseconds.
     */
    public paletteFlash(color: Color32, durationMs: number): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        this.assertFiniteDuration('paletteFlash', durationMs);
        this.paletteEffects.add(new FlashEffect(color, durationMs));
    }

    /**
     * Instantly exchanges two palette entries.
     *
     * This is an immediate operation, not an animated effect.
     *
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     */
    public paletteSwap(indexA: number, indexB: number): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        paletteSwap(this.palette, indexA, indexB);
    }

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when canceled.
     */
    public paletteClearEffects(): void {
        this.paletteEffects.clear();
    }

    /**
     * Appends a fullscreen post-processing effect to the appropriate tier chain.
     *
     * `'pixel'` effects run on the logical `r8uint` index buffer at
     * `displaySize`. `'display'` effects run on the RGBA upscale output and
     * require `drawingBufferSize` in hardware settings. Effects run in
     * registration order within each tier.
     *
     * @param effect - Effect instance to append.
     * @throws Error if the renderer has not been initialized.
     */
    public effectAdd(effect: Effect): void {
        if (!this.renderer) {
            throw new Error('Cannot add effect: renderer not initialized.');
        }

        this.renderer.addEffect(effect);
    }

    /**
     * Removes a previously registered post-processing effect.
     *
     * Calls the effect's optional dispose hook. Removing an effect that was
     * never added is a no-op. When the last effect is removed the renderer
     * reverts to drawing directly to the swap chain on the next frame.
     *
     * @param effect - Effect instance to remove.
     * @throws Error if the renderer has not been initialized.
     */
    public effectRemove(effect: Effect): void {
        if (!this.renderer) {
            throw new Error('Cannot remove effect: renderer not initialized.');
        }

        this.renderer.removeEffect(effect);
    }

    /**
     * Removes every registered post-processing effect.
     *
     * @throws Error if the renderer has not been initialized.
     */
    public effectClear(): void {
        if (!this.renderer) {
            throw new Error('Cannot clear effects: renderer not initialized.');
        }

        this.renderer.clearEffects();
    }

    /**
     * Reads and validates demo `configure()` output into resolved hardware settings.
     *
     * @param demo - Demo implementing {@link IBTDemo}.
     * @returns `false` when hardware settings are invalid (bad dimensions, targetFPS, or audioVoices).
     */
    private loadHardwareSettings(demo: IBTDemo): boolean {
        try {
            this.hwSettings = mergeHardwareSettings(demo.configure?.());
        } catch (error) {
            console.error('[BT] demo.configure() threw; falling back to defaultConfig()', error);

            this.hwSettings = defaultConfig();
        }

        this.applyBackendQueryOverride();

        const renderDimensionError = validateDimensions(this.hwSettings);

        if (renderDimensionError) {
            console.error(`[BT] ${renderDimensionError}`);

            return false;
        }

        const { targetFPS } = this.hwSettings;

        if (!Number.isFinite(targetFPS) || targetFPS <= 0) {
            console.error(`[BT] Invalid targetFPS: ${targetFPS}. Must be a finite number > 0.`);

            return false;
        }

        const { audioVoices } = this.hwSettings;

        if (audioVoices !== undefined && (!Number.isInteger(audioVoices) || audioVoices < 1 || audioVoices > 64)) {
            console.error(`[BT] ${errorMessages.audioVoicesRangeError(audioVoices)}`);

            return false;
        }

        return true;
    }

    /**
     * Creates the engine overlay when enabled in hardware settings.
     */
    private setupOverlay(): void {
        this.overlay = null;

        const hw = this.hwSettings;

        if (!hw || hw.isOverlayEnabled === false || !this.systemFont) {
            return;
        }

        const lineHeight = this.systemFont.measureTextSize('A').height;
        const layout = createOverlayLayout(hw.displaySize.x, hw.displaySize.y, lineHeight);
        const pageTitle = typeof globalThis.document === 'undefined' ? undefined : globalThis.document.title;

        if (!this.activeBackend) {
            throw new Error(errorMessages.OVERLAY_NO_BACKEND);
        }

        this.overlay = new Overlay(
            layout,
            resolveOverlayTopLeftLabel(pageTitle),
            hw.targetFPS,
            this.activeBackend,
            hw.overlayStyle,
            hw.isOverlayPaletteEnabled === true,
            hw.overlayPaletteColumns,
            hw.overlayPaletteRowsVisible,
            hw.isOverlayTimingChartEnabled === true,
            hw.overlayTimingChartStyle,
            hw.overlayTimingChartHeight,
            resolveOverlayTimingChartDiagnostics(hw),
            hw.isOverlayRendererDiagnosticsBarEnabled === true,
            hw.isOverlayVisibleAtStart === true,
            hw.isOverlayToggleHintVisible !== false,
            hw.isOverlayToggleEnabled !== false,
            hw.isOverlayAudioMetersEnabled === true,
            hw.overlayAudioMeterStyle,
            hw.overlayAudioMeterHeight,
        );
    }

    /**
     * Attaches pointer, keyboard, and gamepad input to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    private attachInputSubsystems(canvas: HTMLCanvasElement): void {
        const hw = this.hwSettings;

        if (!hw) {
            return;
        }

        this.pointer?.detach();
        this.pointer = new PointerInput();
        this.pointer.attach(canvas, hw.displaySize);

        this.keyboard?.detach();
        this.keyboard = new KeyboardInput();
        this.keyboard.attach(canvas, {
            getTicks: () => this.loop?.getTicks() ?? 0,
        });

        this.gamepad?.detach();
        this.gamepad = new GamepadInput();
        this.gamepad.attach();
    }

    /**
     * Attaches the audio context, bus graph, and unlock listeners to the canvas.
     *
     * @param canvas - Render target canvas.
     */
    private attachAudioSubsystem(canvas: HTMLCanvasElement): void {
        const hw = this.hwSettings;

        if (!hw) {
            return;
        }

        this.audio?.detach();
        this.audio = new AudioManager();
        this.audio.attach(canvas);

        if (this.isCollectAudioMetersEnabled) {
            this.audio.enableBusMetering();
        }
    }

    /**
     * Constructs and initializes the renderer for the active hardware settings.
     *
     * Logs the selected backend name, constructs the matching {@link IRenderer},
     * calls {@link IRenderer.init}, and reports success or failure.
     *
     * @param canvas - Render target canvas.
     * @param hw - Active hardware settings.
     * @returns `true` when the renderer is ready; `false` on failure.
     */
    private async initRenderer(canvas: HTMLCanvasElement, hw: HardwareSettings): Promise<boolean> {
        applyCanvasLayoutStyles(canvas, {
            displaySize: hw.displaySize,
            maxCanvasSize: hw.maxCanvasSize ?? new Vector2i(DEFAULT_MAX_CANVAS_SIZE.x, DEFAULT_MAX_CANVAS_SIZE.y),
            ...(hw.drawingBufferSize === undefined ? {} : { drawingBufferSize: hw.drawingBufferSize }),
        });

        const requestedBackend = hw.backend ?? 'webgpu';

        if (requestedBackend !== 'software') {
            // Try WebGPU. initWebGPU returns null when navigator.gpu is absent and
            // throws when the adapter or device cannot be created. Both cases fall
            // through to the software renderer below.
            let webGPUResult: Awaited<ReturnType<typeof initWebGPU>> = null;

            try {
                webGPUResult = await initWebGPU(canvas, hw.displaySize, hw.drawingBufferSize);
            } catch (error) {
                if (error instanceof RenderDimensionLimitError) {
                    return false;
                }

                // Adapter/device unavailable; fall through to software.
            }

            if (webGPUResult) {
                this.device = webGPUResult.device;
                this.context = webGPUResult.context;

                console.log('[BT] Initializing renderer (backend: webgpu)');

                this.renderer = new WebGPURenderer(
                    webGPUResult.device,
                    webGPUResult.context,
                    hw.displaySize,

                    // Only forward an explicit outputSize when drawingBufferSize was
                    // provided; that is the signal that unlocks the display tier.
                    hw.drawingBufferSize === undefined ? undefined : webGPUResult.drawingBufferSize,
                    hw.outputUpscaleFilter ?? 'nearest',
                );

                if (!(await this.renderer.init())) {
                    console.error('[BT] Failed to initialize renderer');

                    return false;
                }

                this.activeBackend = 'webgpu';
                console.log('[BT] Renderer initialized');

                return true;
            }

            console.warn('[BT] WebGPU unavailable, falling back to software renderer');
        }

        // Software renderer path: explicit selection or automatic fallback.
        this.device = null;
        this.context = null;

        console.log('[BT] Initializing renderer (backend: software)');

        this.renderer = new SoftwareRenderer(canvas, hw.displaySize, hw.drawingBufferSize);

        if (!(await this.renderer.init())) {
            console.error('[BT] Failed to initialize renderer');

            return false;
        }

        this.activeBackend = 'software';
        console.log('[BT] Renderer initialized');

        return true;
    }

    /**
     * Applies URL backend override from `?backend=...` when present.
     *
     * Supported values:
     * - `software`
     *
     * Unknown values are ignored so accidental query typos do not break startup.
     */
    private applyBackendQueryOverride(): void {
        if (!this.hwSettings) {
            return;
        }

        const override = BTAPI.getBackendQueryOverride();

        if (!override) {
            return;
        }

        this.hwSettings.backend = override;

        console.info(`[BT] URL override selected backend: ${override}`);
    }

    /**
     * Removes pointer, keyboard, gamepad, and audio subsystems.
     *
     * Pointer/keyboard detach DOM listeners; gamepad detaches polling state; audio
     * detaches unlock listeners and closes the audio context. All subsystem
     * references are cleared so listeners/contexts do not leak across restarts.
     */
    private clearInputSubsystems(): void {
        this.pointer?.detach();
        this.pointer = null;

        this.keyboard?.detach();
        this.keyboard = null;

        this.gamepad?.detach();
        this.gamepad = null;

        this.audio?.detach();
        this.audio = null;
    }

    /**
     * Runs the demo's async {@link IBTDemo.init}. On throw or
     * `false`, clears input and audio subsystems that were attached earlier in
     * the init sequence.
     *
     * @param demo - Active demo instance.
     * @returns `true` when the demo reports success.
     */
    private async runDemoInit(demo: IBTDemo): Promise<boolean> {
        try {
            const ok = await demo.init();

            if (!ok) {
                console.error('[BT] Demo initialization failed');

                this.clearInputSubsystems();

                return false;
            }

            return true;
        } catch (err) {
            console.error('[BT] Demo initialization threw', err);

            this.clearInputSubsystems();

            return false;
        }
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
    private handleFrameDrop(event: FrameDropEvent, logToConsole: boolean): void {
        this.overlayTiming.droppedFrames = event.droppedFrames;

        if (logToConsole) {
            console.warn(
                `[BT] Dropped ${event.droppedFrames} frame(s) ` +
                    `(frame time ${event.deltaTime.toFixed(1)}ms, expected ${event.expectedInterval.toFixed(1)}ms)`,
            );
        }
    }

    /**
     * Validates that a sprite sheet has been indexized and registers it for refresh tracking.
     *
     * @param sheet - Sprite sheet to validate.
     * @throws If the sprite sheet has not been indexized.
     */
    private requireIndexizedSheet(sheet: SpriteSheet): void {
        if (!sheet.isIndexed()) {
            throw new Error(spriteNotIndexizedError());
        }

        this.spriteSheets.add(sheet);
    }

    /**
     * Validates that a duration is a finite, non-negative number.
     *
     * @param method - Calling method name for the error message.
     * @param durationMs - Duration to validate.
     * @throws Error if the duration is not finite or is negative.
     */
    private assertFiniteDuration(method: string, durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            throw new Error(`${method}: the time should be a non-negative number of milliseconds (got ${durationMs}).`);
        }
    }

    /**
     * Tracks one demo-issued draw API call for the current frame snapshot.
     */
    private markDrawCall(): void {
        this.pendingDrawCalls++;
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

    /**
     * Reads renderer pipeline diagnostic counters when overlay diagnostics collection is enabled.
     *
     * Must run after demo and overlay draws and before {@link IRenderer.endFrame}
     * resets pipeline batch state.
     */
    private captureRendererDiagnostics(): void {
        if (!this.isCollectRendererDiagnosticsEnabled || !this.renderer) {
            return;
        }

        const diagnostics = this.renderer.getFrameDiagnostics();

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
    private captureAudioDiagnostics(): void {
        if (!this.isCollectAudioMetersEnabled || !this.audio) {
            return;
        }

        this.audioSnapshot.levels = this.audio.getBusLevels();
        this.audioSnapshot.activeVoices = this.audio.getActiveVoiceCount();
        this.audioSnapshot.totalVoices = this.audio.getVoiceCount();
        this.audioSnapshot.voiceStealCount = this.audio.getVoiceStealCount();
        this.audioSnapshot.voiceDropCount = this.audio.getVoiceDropCount();
        this.audioSnapshot.preUnlockDropCount = this.audio.getDroppedSfxCount();
    }

    /**
     * Applies overlay input (palette swatch copy, then body toggle) and clears per-frame palette usage.
     *
     * Input runs here (not in {@link Overlay.updateAndRender}) so visibility is current
     * when deciding whether to track palette usage during `demo.render()`.
     */
    private beginRenderFrame(): void {
        if (this.overlay) {
            this.overlay.handleFrameInput(
                this.pointer,
                this.pendingOverlayTogglePress,
                this.loop?.getTicks() ?? 0,
                () => this.demo?.overlayRows?.(),
                this.palette,
            );
        }

        this.pendingOverlayTogglePress = false;

        resetUsage(this.framePaletteUsageMask);
    }

    /**
     * Whether demo draw calls should populate {@link framePaletteUsageMask} this frame.
     *
     * @returns `true` when the overlay palette grid is active and visible.
     */
    private isTrackingFramePaletteUsage(): boolean {
        return this.overlay?.isTrackingPaletteUsage ?? false;
    }

    /**
     * Marks a palette index as used for the current frame.
     *
     * @param index - Palette index to track.
     */
    private trackPaletteIndexUsed(index: number): void {
        if (!this.isTrackingFramePaletteUsage() || !this.renderer) {
            return;
        }

        markIndexUsed(this.framePaletteUsageMask, index);
    }

    /**
     * Marks palette indices referenced by bitmap text glyphs in a string.
     *
     * @param font - Bitmap font whose glyph atlas is scanned.
     * @param text - Text about to be drawn.
     * @param paletteOffset - Palette offset applied at draw time.
     */
    private markBitmapTextPaletteUsage(font: BitmapFont, text: string, paletteOffset: number): void {
        if (!this.isTrackingFramePaletteUsage()) {
            return;
        }

        const sheet = font.getSpriteSheet();

        for (const char of text) {
            const glyph = font.getGlyph(char);

            if (glyph !== null) {
                sheet.markPaletteIndicesInRect(glyph.rect, paletteOffset, this.framePaletteUsageMask);
            }
        }
    }

    /**
     * Validates that a palette index is a non-negative integer and, when a palette
     * is active, that the index is within its range.
     *
     * The non-integer/negative check always runs regardless of palette state.
     * The range check only runs when a palette has been set.
     *
     * @param index - Palette index to validate.
     * @throws Error if the index is not a non-negative integer.
     * @throws Error if a palette is active and the index is out of its range.
     */
    private assertPaletteIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(paletteIndexNegativeError(index));
        }

        if (this.palette && index >= this.palette.size) {
            throw new Error(paletteIndexOutOfRangeError(index, this.palette.size));
        }
    }
}
