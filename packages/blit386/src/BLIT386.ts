/**
 * Public BLIT386 entrypoint.
 *
 * This module re-exports the main runtime types and exposes the `BT` facade
 * used by demos for rendering, timing, bootstrap, and input (pointer, keyboard, gamepad).
 *
 * Rendering is palette-first: every color on screen is identified by a numeric
 * palette index rather than a direct RGBA value. Set an active palette with
 * `BT.paletteSet()` before drawing anything. For sprite setup, prefer
 * `SpriteSheet.loadIndexed(...)` as the one-call path (load colors, load image,
 * indexize); low-level `spriteSheet.indexize(palette)` remains available.
 */

import { AssetLoader } from './assets/AssetLoader';
import { AudioClip } from './assets/AudioClip';
import type { TextSize } from './assets/BitmapFont';
import { BitmapFont } from './assets/BitmapFont';
import { MAX_PALETTE_SIZE, Palette } from './assets/Palette';
import type { ExposureFadeOptions } from './assets/PaletteEffect';
import type { IndexedSpriteLoadResult } from './assets/SpriteSheet';
import { SpriteSheet } from './assets/SpriteSheet';
import type {
    SynthEnvelope,
    SynthParams,
    SynthPitchSweep,
    SynthVibrato,
    SynthWaveform,
} from './assets/synth/SynthParams';
import { blip, explosion, hit, jump, laser, pickup } from './assets/synth/synthPresets';
import type { MusicPlayOptions } from './audio/MusicPlayer';
import type { SoundParamSetOptions, SoundPlayOptions, SoundRef, SoundStopOptions } from './audio/VoicePool';
import { BTAPI } from './core/BTAPI';
import {
    type AudioBus,
    type Backend,
    defaultConfig,
    type HardwareSettings,
    type HotReloadContext,
    type IBTDemo,
    type KeyboardLayout,
    mergeHardwareSettings,
    type OverlayAudioMeterStyle,
    type OverlayRow,
    type OverlayStyle,
    type OverlayTimingChartStyle,
    type PreferredOrientation,
    type TestStateSnapshot,
} from './core/IBTDemo';
import type { HotContext } from './hot/HotRuntime';
import { registerHotReload } from './hot/HotRuntime';
import { clientToDisplayPos } from './input/clientToDisplayPos';
import {
    DEFAULT_KEYBOARD_PLAYER1,
    DEFAULT_KEYBOARD_PLAYER2,
    DEFAULT_KEYBOARD_SINGLE_PLAYER1,
    DEFAULT_KEYBOARD_SINGLE_PLAYER2,
    FACE_BUTTON_FLAGS,
    type FaceButtonCode,
} from './input/defaultKeyboardMap';
import {
    getKeyboardFaceButtonKeys,
    resetKeyboardFaceButtonMaps,
    setKeyboardFaceButtonKeys,
} from './input/keyboardRuntimeMaps';
import { BarrelDistortion } from './render/effects/display/BarrelDistortion';
import { Bloom } from './render/effects/display/Bloom';
import { ChromaticAberration } from './render/effects/display/ChromaticAberration';
import { Flicker } from './render/effects/display/Flicker';
import { Interference } from './render/effects/display/Interference';
import { Noise } from './render/effects/display/Noise';
import { RGBMask } from './render/effects/display/RGBMask';
import { RollLine } from './render/effects/display/RollLine';
import { Scanlines } from './render/effects/display/Scanlines';
import { Vignette } from './render/effects/display/Vignette';
import type { Effect, EffectTier } from './render/effects/Effect';
import { FullscreenEffect } from './render/effects/FullscreenEffect';
import { FullscreenPixelEffect } from './render/effects/FullscreenPixelEffect';
import { PixelGlitch } from './render/effects/pixel/PixelGlitch';
import { PixelMosaic } from './render/effects/pixel/PixelMosaic';
import { amber, crtPipBoy, green } from './render/effects/presets';
import type { SpriteDrawParams } from './render/SpriteOrientation';
import {
    SPRITE_FLIP_H,
    SPRITE_FLIP_V,
    SPRITE_ROT_90_CW,
    SPRITE_ROT_180_CW,
    SPRITE_ROT_270_CW,
} from './render/SpriteOrientation';
import type { SplashState } from './splash';
import type { BootstrapOptions, DemoConstructor } from './utils/Bootstrap';
import { bootstrap as bootstrapImpl } from './utils/Bootstrap';
import { displayError, getCanvas } from './utils/BootstrapHelpers';
import { clampCameraToWorld } from './utils/CameraUtils';
import { Color32 } from './utils/Color32';
import type { EasingFunction } from './utils/Easing';
import { applyEasing, interpolate } from './utils/Easing';
import { noActivePaletteError, systemFontNotReadyError } from './utils/errorMessages';
import { downloadBlob, type FrameCaptureOptions, type FrameCaptureSize } from './utils/FrameCapture';
import { exposeGlobal } from './utils/globalExpose';
import { hash1, hash1i, hash2, hash2i, hash3, hash3i } from './utils/hash';
import { PerlinNoise } from './utils/PerlinNoise';
import { Random } from './utils/Random';
import { Rect2i } from './utils/Rect2i';
import { SimplexNoise } from './utils/SimplexNoise';
import { Timer } from './utils/Timer';
import { ValueNoise } from './utils/ValueNoise';
import { Vector2i } from './utils/Vector2i';

/** Pointer button bit mask (`BTN_POINTER_A..D`). */
const POINTER_BUTTON_MASK = (1 << 12) | (1 << 13) | (1 << 14) | (1 << 15);
const POINTER_FLAGS = [1 << 12, 1 << 13, 1 << 14, 1 << 15] as const;

/** Face button bit mask (`BTN_UP..BTN_SELECT`). */
const FACE_BUTTON_MASK = (1 << 12) - 1;

/** Trigger button bit flags (`BTN_L2`, `BTN_R2`). Gamepad only, no keyboard fallback. */
const TRIGGER_BUTTON_FLAGS = [1 << 16, 1 << 17] as const;

/**
 * Shows a beginner-friendly runtime error in the canvas container and console.
 *
 * @param message - Human-readable guidance to display.
 * @param title - Short heading for the error panel.
 */
function showBeginnerRuntimeError(message: string, title: string = 'Demo Error'): void {
    displayError(title, message);
    console.error(`[BT] ${title}: ${message}`);
}

/**
 * Returns whether the renderer has been initialized and can accept draw calls.
 *
 * @returns True when drawing APIs are ready to run.
 */
function isRendererReady(): boolean {
    return BTAPI.instance.getRenderer() !== null;
}

/**
 * Shows a friendly error when a draw call is made before bootstrap finishes.
 *
 * @param methodName - BT method name that was called too early.
 */
function reportEngineNotReady(methodName: string): void {
    showBeginnerRuntimeError(
        `Can't use BT.${methodName}() yet because the engine is still starting.\n` +
            "The engine isn't ready yet. Make sure all drawing happens inside update() or render().",
        'Engine Not Ready',
    );
}

/**
 * Treats any non-null object argument as a `Vector2i` for `BT.drawTile` dispatch.
 *
 * A bare `typeof value === 'object'` also matches `null`, which would let an untyped
 * `null` argument reach `.x` / `.y` and surface a raw TypeError instead of the
 * wrong-arguments error. Still `typeof`-based, so the dispatch stays `instanceof`-free.
 *
 * @param value - Argument to classify.
 * @returns `true` for a non-null object.
 */
function isVectorArg(value: unknown): value is Vector2i {
    return typeof value === 'object' && value !== null;
}

/**
 * Converts an unknown runtime value into a concise display type label.
 *
 * @param value - Runtime value to inspect.
 * @returns A short readable type description.
 */
function describeRuntimeType(value: unknown): string {
    if (value === null) {
        return 'null';
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (value instanceof Vector2i) {
        return 'Vector2i';
    }

    if (value instanceof Rect2i) {
        return 'Rect2i';
    }

    if (value instanceof Color32) {
        return 'Color32';
    }

    if (value instanceof Promise) {
        return 'Promise (missing await?)';
    }

    if (typeof value === 'object') {
        const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
        return ctor && ctor.length > 0 ? ctor : 'object';
    }

    return typeof value;
}

/**
 * Shows a friendly hint when a Promise was passed instead of an awaited asset.
 *
 * @param loadCall - Asset loader call name to reference in the message.
 */
function reportMissingAwait(loadCall: string): void {
    showBeginnerRuntimeError(`Did you forget to use 'await' before ${loadCall}?`, 'Missing await');
}

/**
 * Shows a beginner-friendly error for a value thrown out of a draw call's body.
 *
 * Shared by every `BT` draw method's own `catch` block - kept as a plain function
 * taking the caught value (not a callback) so no per-call closure is needed on
 * the hot draw-call path.
 *
 * @param error - Value caught from a draw call's try block.
 */
function reportDrawError(error: unknown): void {
    if (error instanceof Error) {
        showBeginnerRuntimeError(error.message);
    } else {
        showBeginnerRuntimeError(String(error));
    }
}

/** `BT.testState()`'s `error` when the thrown value yields no readable message. */
const TEST_STATE_UNREADABLE_ERROR = 'testState() threw a value with no readable message';

/**
 * Turns whatever a `testState()` hook (or its serialization) threw into an error message,
 * without ever throwing itself: no `String(err)` (a null-prototype object has no primitive
 * conversion), and the `message` read is guarded (a getter can throw).
 *
 * @param err - Value caught from the hook call or the JSON round-trip.
 * @returns The `Error` message or thrown string, else {@link TEST_STATE_UNREADABLE_ERROR}.
 */
function describeTestStateError(err: unknown): string {
    if (typeof err === 'string') {
        return err;
    }

    try {
        if (err instanceof Error) {
            // Read once: a `message` getter could return a string on one read and not the next.
            const message: unknown = err.message;

            if (typeof message === 'string') {
                return message;
            }
        }
    } catch {
        // Fall through: a throwing `message` getter or `instanceof` check.
    }

    return TEST_STATE_UNREADABLE_ERROR;
}

/**
 * Returns runtime keyboard `KeyboardEvent.code` list for a face button and player,
 * or `null` when there is no keyboard fallback (e.g. players 2-3 for face buttons).
 *
 * @param button - Face button constant (`BT.BTN_UP` … `BT.BTN_SELECT`).
 * @param player - Zero-based player index.
 * @returns Key codes for that mapping, or `null` if unsupported.
 */
function faceButtonKeys(button: number, player: number): readonly string[] | null {
    if (!FACE_BUTTON_FLAGS.includes(button as FaceButtonCode)) {
        return null;
    }

    return getKeyboardFaceButtonKeys(player, button);
}

/**
 * Maps a single pointer button bit flag to the pointer subsystem button code.
 *
 * @param pointerFlag - One pointer button bit from `BTN_POINTER_A..D`.
 * @returns Pointer subsystem button code (`20..23`) or `null` if not a pointer button.
 */
function pointerFlagToPointerCode(pointerFlag: number): number | null {
    switch (pointerFlag) {
        case 1 << 12:
            return 20;
        case 1 << 13:
            return 21;
        case 1 << 14:
            return 22;
        case 1 << 15:
            return 23;
        default:
            return null;
    }
}

/** Main BLIT386 API namespace used by runtime demos. */
export const BT = {
    /**
     * Horizontal flip flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    FLIP_H: SPRITE_FLIP_H,

    /**
     * Vertical flip flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    FLIP_V: SPRITE_FLIP_V,

    /**
     * Rotate 90° clockwise flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_90_CW: SPRITE_ROT_90_CW,

    /**
     * Rotate 180° flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_180_CW: SPRITE_ROT_180_CW,

    /**
     * Rotate 270° clockwise flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_270_CW: SPRITE_ROT_270_CW,

    /**
     * Up button bit flag.
     *
     * @since 0.1.0
     */
    BTN_UP: 1 << 0,

    /**
     * Down button bit flag.
     *
     * @since 0.1.0
     */
    BTN_DOWN: 1 << 1,

    /**
     * Left button bit flag.
     *
     * @since 0.1.0
     */
    BTN_LEFT: 1 << 2,

    /**
     * Right button bit flag.
     *
     * @since 0.1.0
     */
    BTN_RIGHT: 1 << 3,

    /**
     * A button bit flag.
     *
     * @since 0.1.0
     */
    BTN_A: 1 << 4,

    /**
     * B button bit flag.
     *
     * @since 0.1.0
     */
    BTN_B: 1 << 5,

    /**
     * X button bit flag.
     *
     * @since 0.1.0
     */
    BTN_X: 1 << 6,

    /**
     * Y button bit flag.
     *
     * @since 0.1.0
     */
    BTN_Y: 1 << 7,

    /**
     * Left shoulder button bit flag.
     *
     * @since 0.1.0
     */
    BTN_L: 1 << 8,

    /**
     * Right shoulder button bit flag.
     *
     * @since 0.1.0
     */
    BTN_R: 1 << 9,

    /**
     * Start button bit flag.
     *
     * @since 0.1.0
     */
    BTN_START: 1 << 10,

    /**
     * Select button bit flag.
     *
     * @since 0.1.0
     */
    BTN_SELECT: 1 << 11,

    /**
     * Primary pointer button code.
     *
     * Maps to mouse left for slot 0; touch contact for slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_A: 1 << 12,

    /**
     * Secondary pointer button code.
     *
     * Maps to mouse right for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_B: 1 << 13,

    /**
     * Tertiary pointer button code.
     *
     * Maps to mouse middle for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_C: 1 << 14,

    /**
     * Auxiliary pointer button code.
     *
     * Maps to mouse back/forward extra buttons (DOM `PointerEvent.button`
     * 3 or 4) for slot 0. Always `false` for touch slots 1-3.
     *
     * @since 1.0.3
     */
    BTN_POINTER_D: 1 << 15,

    /**
     * Player one index.
     *
     * @since 1.0.3
     */
    PLAYER_ONE: 0,

    /**
     * Player two index.
     *
     * @since 1.0.3
     */
    PLAYER_TWO: 1,

    /**
     * Player three index.
     *
     * @since 1.0.3
     */
    PLAYER_THREE: 2,

    /**
     * Player four index.
     *
     * @since 1.0.3
     */
    PLAYER_FOUR: 3,

    /**
     * Left stick horizontal axis index.
     *
     * @since 1.0.3
     */
    AXIS_LEFT_X: 0,

    /**
     * Left stick vertical axis index.
     *
     * @since 1.0.3
     */
    AXIS_LEFT_Y: 1,

    /**
     * Right stick horizontal axis index.
     *
     * @since 1.0.3
     */
    AXIS_RIGHT_X: 2,

    /**
     * Right stick vertical axis index.
     *
     * @since 1.0.3
     */
    AXIS_RIGHT_Y: 3,

    /**
     * Left trigger axis index (0.0 to 1.0).
     *
     * @since 1.0.3
     */
    AXIS_TRIGGER_L: 4,

    /**
     * Right trigger axis index (0.0 to 1.0).
     *
     * @since 1.0.3
     */
    AXIS_TRIGGER_R: 5,

    /**
     * All face buttons (A/B/X/Y).
     *
     * @since 1.0.3
     */
    BTN_ABXY: (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7),

    /**
     * Both shoulder buttons.
     *
     * @since 1.0.3
     */
    BTN_SHOULDER: (1 << 8) | (1 << 9),

    /**
     * Left trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_L)`.
     *
     * @since 1.8.0
     */
    BTN_L2: 1 << 16,

    /**
     * Right trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_R)`.
     *
     * @since 1.8.0
     */
    BTN_R2: 1 << 17,

    /**
     * Either trigger as a digital button (`BTN_L2 | BTN_R2`).
     *
     * @since 1.8.0
     */
    BTN_TRIGGER: (1 << 16) | (1 << 17),

    /**
     * Any pointer button (A/B/C/D).
     *
     * @since 1.0.3
     */
    BTN_POINTER_ANY: (1 << 12) | (1 << 13) | (1 << 14) | (1 << 15),

    /**
     * Default `KeyboardEvent.code` values for player index 0 (first keyboard player).
     *
     * @since 1.0.3
     * @changed 1.8.0 Now the `'versus'` `keyboardLayout` table (the default); see
     *   `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1` for `'single'`.
     */
    DEFAULT_KEYBOARD_PLAYER1,

    /**
     * Default `KeyboardEvent.code` values for player index 1 (second keyboard player).
     *
     * @since 1.0.3
     * @changed 1.8.0 Now the `'versus'` `keyboardLayout` table (the default); see
     *   `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER2` for `'single'`.
     */
    DEFAULT_KEYBOARD_PLAYER2,

    /**
     * Default `KeyboardEvent.code` values for player index 0 under
     * `keyboardLayout: 'single'`: WASD plus the arrow keys on the D-pad.
     *
     * @since 1.8.0
     */
    DEFAULT_KEYBOARD_SINGLE_PLAYER1,

    /**
     * Default `KeyboardEvent.code` values for player index 1 under
     * `keyboardLayout: 'single'`: IJKL on the D-pad.
     *
     * @since 1.8.0
     */
    DEFAULT_KEYBOARD_SINGLE_PLAYER2,

    /**
     * Initializes the engine against a demo instance and target canvas.
     *
     * The canvas element must be attached to the DOM before this call.
     * In Electron environments, wait for DOM-ready first.
     *
     * When not using {@link bootstrap}, set `canvas.tabIndex = 0` and call
     * `canvas.focus()` so keyboard events reach the canvas.
     *
     * @since 0.1.0
     * @param demo - Demo implementation that provides lifecycle hooks.
     * @param canvas - Canvas used as the engine render target.
     * @returns `true` when initialization succeeds; otherwise `false`.
     */
    init: async (demo: IBTDemo, canvas: HTMLCanvasElement): Promise<boolean> => {
        return await BTAPI.instance.init(demo, canvas);
    },

    /**
     * Active logical render resolution in pixels.
     *
     * This is the game/simulation coordinate space configured by the demo, not
     * the canvas element's CSS size. Each read returns a clone.
     *
     * @since 1.0.4
     * @returns Configured logical size, or `Vector2i.zero()` before initialization.
     */
    get displaySize(): Vector2i {
        const settings = BTAPI.instance.getHardwareSettings();

        return settings ? settings.displaySize.clone() : Vector2i.zero();
    },

    /**
     * Configured output drawing-buffer size in pixels, when set in `configure()`.
     *
     * `null` when `drawingBufferSize` was omitted (logical resolution only; no
     * display-tier post-process). Each read returns a clone when non-null.
     *
     * @since 1.1.0
     * @returns Configured drawing-buffer size, or `null` when not set.
     */
    get drawingBufferSize(): Vector2i | null {
        const settings = BTAPI.instance.getHardwareSettings();
        const size = settings?.drawingBufferSize;

        return size ? size.clone() : null;
    },

    /**
     * Effective drawing-buffer size in pixels (`drawingBufferSize ?? displaySize`).
     *
     * Each read returns a clone.
     *
     * @since 1.0.4
     * @returns Effective output buffer size, or `Vector2i.zero()` before initialization.
     */
    get outputSize(): Vector2i {
        const settings = BTAPI.instance.getHardwareSettings();

        if (!settings) {
            return Vector2i.zero();
        }

        return (settings.drawingBufferSize ?? settings.displaySize).clone();
    },

    /**
     * Target fixed-update rate in frames per second.
     *
     * Mirrors {@link HardwareSettings.targetFPS} from `configure()`.
     * `update()` runs at this frequency; rendering may occur at a different cadence.
     *
     * @since 1.0.4
     * @returns Target updates per second, or `60` before initialization.
     */
    get targetFPS(): number {
        const settings = BTAPI.instance.getHardwareSettings();

        return settings ? settings.targetFPS : 60;
    },

    /**
     * Backend requested for initialization (`configure().backend` after merge).
     *
     * Includes `?backend=software` URL overrides applied before the renderer starts.
     * Defaults to `'webgpu'` when `backend` is omitted. Does **not** change when WebGPU
     * falls back to software; use {@link BT.activeBackend} for the backend that actually started.
     *
     * @since 1.1.0
     * @returns `'webgpu'` or `'software'` once hardware settings are loaded; `null` before `BT.init()`.
     */
    get requestedBackend(): Backend | null {
        return BTAPI.instance.getRequestedBackend();
    },

    /**
     * Fixed-step seconds per update tick.
     *
     * Equivalent to `1 / BT.targetFPS` when `BT.targetFPS` is finite and positive.
     * Falls back to `1 / 60` when target FPS is non-finite or non-positive.
     *
     * @since 1.0.4
     * @returns Seconds advanced by one fixed update tick.
     */
    get deltaSeconds(): number {
        const fps = BT.targetFPS;
        const validatedFps = Number.isFinite(fps) && fps > 0 ? fps : 60;

        return 1 / validatedFps;
    },

    /**
     * Fixed-step elapsed time in seconds (`BT.ticks * BT.deltaSeconds`).
     *
     * @since 1.0.4
     * @returns Elapsed fixed-step time in seconds since initialization.
     */
    get timeSeconds(): number {
        return BT.ticks * BT.deltaSeconds;
    },

    /**
     * Current fixed-update tick counter.
     *
     * Increments once per engine update. Reset via {@link BT.ticksReset}.
     *
     * @since 1.0.4
     * @returns Current tick count since initialization or last reset.
     */
    get ticks(): number {
        return BTAPI.instance.getTicks();
    },

    /**
     * Resets the fixed-update tick counter back to zero.
     *
     * @since 0.1.0
     */
    ticksReset: (): void => {
        BTAPI.instance.resetTicks();
    },

    /**
     * Fractional progress between the last completed fixed update and the next.
     *
     * Intended for interpolating render state between fixed-update steps.
     *
     * @since 1.3.0
     * @returns Interpolation alpha in `[0, 1)`.
     */
    get renderAlpha(): number {
        return BTAPI.instance.getRenderAlpha();
    },

    /**
     * Places a labeled marker on the overlay timing chart at the current tick.
     *
     * Requires `isOverlayTimingChartEnabled: true` in `configure()`. Tags scroll with the chart
     * history and are pruned when they leave the visible window. Empty labels become
     * `"Untitled"`. Chart width resets add an automatic `"Start"` tag.
     *
     * @since 1.1.0
     * @param label - Short event name (for example `'Round start'`).
     */
    assignTag: (label?: string): void => {
        BTAPI.instance.assignTag(label);
    },

    /**
     * Rendering backend that is currently active.
     *
     * `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     * May differ from {@link BT.requestedBackend} when WebGPU was requested but unavailable
     * (automatic software fallback). Use this getter for runtime behavior - for example,
     * skipping post-process effects that only work under WebGPU:
     *
     * ```ts
     * if (BT.activeBackend === 'webgpu') {
     *   for (const fx of BT.preset.crtPipBoy()) {
     *     BT.effectAdd(fx);
     *   }
     * }
     * ```
     *
     * @since 1.0.4
     * @returns `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     */
    get activeBackend(): Backend | null {
        return BTAPI.instance.getActiveBackend();
    },

    /**
     * Whether this is a development build, not a release build.
     *
     * Resolves from the `blit386/vite` plugin's injected runtime marker, falling back to a live
     * Vite HMR context, otherwise release. (The underlying resolver also accepts an explicit
     * override that always wins over both; nothing in the public `BT` surface supplies one today.)
     * This is UX/DX gating, not DRM - any consumer can flip the underlying global by hand.
     *
     * @since 1.5.0
     * @returns `true` for a dev build, `false` for release.
     */
    get isDevMode(): boolean {
        return BTAPI.instance.isDevMode();
    },

    /**
     * JSON readout of the running game for automated play-testing.
     *
     * Returns the current tick and active backend plus a deep copy of the game's optional
     * {@link IBTDemo.testState} result (`null` when the game has no hook). In dev builds `BT`
     * is exposed as `window.BT`, so a browser-driving agent or a CDP script reads it with
     * `window.BT.testState()` - no per-game global needed.
     *
     * The hook is looked up on the active demo instance on every call, so it keeps working
     * after a `'reinit'` hot reload replaces that instance. The result is snapshotted through
     * `JSON.parse(JSON.stringify(...))`: callers get plain data they cannot use to mutate live
     * game objects. Never throws - a throwing hook or an unserializable result (a cycle or a
     * `BigInt`) is logged as `[BT] testState() threw:` and reported as `state: null` with the
     * message in `error`.
     *
     * Available in release builds too; it only reads state and does nothing until called.
     *
     * @since 1.8.0
     * @returns `{ ticks, backend, state }`, plus `error` when the readout failed.
     */
    testState: (): TestStateSnapshot => {
        const ticks = BT.ticks;
        const backend = BT.activeBackend;
        const demo = BTAPI.instance.getDemo();

        if (typeof demo?.testState !== 'function') {
            return { ticks, backend, state: null };
        }

        try {
            // `JSON.stringify` returns `undefined` (despite its lib typing) for `undefined` or a function.
            const json = JSON.stringify(demo.testState()) as string | undefined;
            const state: unknown = json === undefined ? null : JSON.parse(json);

            return { ticks, backend, state };
        } catch (err) {
            console.error('[BT] testState() threw:', err);

            return { ticks, backend, state: null, error: describeTestStateError(err) };
        }
    },

    /**
     * Current BLIT386 splash lifecycle state.
     *
     * `'disabled'` when the splash was gated off, `'done'` once it has finished.
     * Both mean "not on screen, never will be again" - prefer
     * {@link BT.isSplashVisible} in game code, and reach for this only when the
     * distinction genuinely matters (debugging, the engine overlay).
     *
     * With the splash disabled this always reads `'disabled'`. With it enabled, an
     * `init()` observes `'fadingIn'` and, if it lives long enough, `'shown'`; the
     * first `update()` after handoff reads `'done'`. `'fadingOut'` is never visible
     * outside the engine, because `update()` and `render()` are suspended while the
     * splash is on screen.
     *
     * @since 1.5.0
     * @returns The splash's state.
     */
    get splashState(): SplashState {
        return BTAPI.instance.getSplashState();
    },

    /**
     * Whether the BLIT386 splash is on screen right now.
     *
     * The useful thing this buys a game: `init()` can ask whether something is
     * covering for it and preload extra assets while the splash holds.
     *
     * @since 1.5.0
     * @returns `true` while the splash is fading in, holding, or fading out.
     */
    get isSplashVisible(): boolean {
        return BTAPI.instance.isSplashVisible();
    },

    /**
     * Total number of asset loads currently in flight (images and audio clips combined).
     *
     * Useful for a loading-screen progress indicator: poll this each frame and show a
     * spinner or bar until it drops back to `0`.
     *
     * @since 1.4.0
     * @returns Combined count of in-flight `AssetLoader` and `AudioClip` loads.
     */
    get loadingAssetsCount(): number {
        return BTAPI.instance.getLoadingAssetsCount();
    },

    /**
     * Current screen orientation type from the Screen Orientation API.
     *
     * Examples: `'landscape-primary'`, `'portrait-secondary'`. Returns `null` when
     * `screen.orientation` is unavailable. Pair with
     * {@link HardwareSettings.preferredOrientation} to request a lock after init, and
     * with {@link IBTDemo.onOrientationChange} to react when the user rotates the device.
     *
     * Named `screenOrientation` (not `orientation`) to leave room for a future
     * device-orientation (alpha/beta/gamma) getter.
     *
     * @since 1.3.1
     * @returns Orientation type string, or `null` when the API is unavailable.
     */
    get screenOrientation(): string | null {
        return BTAPI.instance.getScreenOrientation();
    },

    /**
     * Whether reduced motion is currently preferred.
     *
     * Resolves `window.matchMedia('(prefers-reduced-motion: reduce)')`, or the
     * `?reducedmotion` / `?noreducedmotion` URL flags when either is present. Pair with
     * {@link IBTDemo.onReducedMotionChange} to react when the preference changes at runtime -
     * it is not fixed for the session, the same way {@link BT.screenOrientation} is not.
     *
     * @since 1.7.0
     * @returns `true` when reduced motion should be preferred.
     */
    get isReducedMotionPreferred(): boolean {
        return BTAPI.instance.isReducedMotionPreferred();
    },

    /**
     * Whether the audio context has been unlocked by a user gesture.
     *
     * Browsers require a user gesture (pointer, key, or touch press) before
     * allowing audio playback. Starts `false`; flips to `true` for the rest of
     * the session after the first gesture successfully resumes the audio context.
     *
     * @since 1.3.0
     * @returns `true` once unlocked; `false` when locked or before initialization.
     */
    get isAudioUnlocked(): boolean {
        return BTAPI.instance.isAudioUnlocked();
    },

    /**
     * Sets the logical volume for an audio bus, optionally fading to it.
     *
     * @since 1.3.0
     * @param bus - Audio bus to update (`'main'`, `'music'`, or `'sfx'`).
     * @param value - Target volume, clamped to `[0, 1]`.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     * @param options.easing - Easing curve for the fade. Defaults to `'linear'`; ignored when `fadeMs` is omitted.
     */
    audioVolumeSet: (bus: AudioBus, value: number, options?: { fadeMs?: number; easing?: EasingFunction }): void => {
        BTAPI.instance.audioVolumeSet(bus, value, options?.fadeMs, options?.easing);
    },

    /**
     * Gets the logical (pre-mute) volume for an audio bus.
     *
     * Unaffected by {@link BT.audioMuteSet} - muting never overwrites the configured level.
     *
     * @since 1.3.0
     * @param bus - Audio bus to query.
     * @returns Volume in `[0, 1]`, or `0` before initialization.
     */
    audioVolumeGet: (bus: AudioBus): number => {
        return BTAPI.instance.audioVolumeGet(bus);
    },

    /**
     * Mutes or unmutes an audio bus.
     *
     * @since 1.3.0
     * @param bus - Audio bus to mute or unmute.
     * @param muted - `true` to mute, `false` to unmute.
     */
    audioMuteSet: (bus: AudioBus, muted: boolean): void => {
        BTAPI.instance.audioMuteSet(bus, muted);
    },

    /**
     * Reports whether an audio bus is currently muted.
     *
     * @since 1.3.0
     * @param bus - Audio bus to query.
     * @returns `true` when muted; `false` when unmuted or before initialization.
     */
    isAudioMuted: (bus: AudioBus): boolean => {
        return BTAPI.instance.isAudioMuted(bus);
    },

    /**
     * Plays a loaded audio clip through the SFX voice pool.
     *
     * Returns an inert {@link SoundRef} without allocating a voice when the clip hasn't finished
     * loading yet (or was already unloaded), when the pool has no free or stealable voice at this
     * priority, or before the engine has unlocked audio playback.
     *
     * @since 1.3.0
     * @param clip - Loaded audio clip to play.
     * @param options - Playback options.
     * @returns A handle identifying the new voice; pass it to {@link BT.soundStop} and the other
     *   per-sound controls. Safe to use even when playback was silently dropped - every accessor
     *   on an inert handle is a no-op.
     */
    soundPlay: (clip: AudioClip, options?: SoundPlayOptions): SoundRef => {
        return BTAPI.instance.soundPlay(clip, options);
    },

    /**
     * Stops a playing sound, optionally fading it out.
     *
     * @since 1.3.0
     * @param ref - Sound to stop, from {@link BT.soundPlay}.
     * @param options - Optional fade behavior.
     * @param options.fadeOutMs - Fade-out duration in milliseconds. Omit to stop immediately.
     */
    soundStop: (ref: SoundRef, options?: SoundStopOptions): void => {
        BTAPI.instance.soundStop(ref, options?.fadeOutMs);
    },

    /**
     * Reports whether a sound is still playing.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns `true` when still playing; `false` once it has stopped, been stolen, or completed.
     */
    isSoundPlaying: (ref: SoundRef): boolean => {
        return BTAPI.instance.isSoundPlaying(ref);
    },

    /**
     * Sets a sound's gain, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target gain.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundVolumeSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundVolumeSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current gain.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current gain, or `1` once the sound has stopped.
     */
    soundVolumeGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundVolumeGet(ref);
    },

    /**
     * Sets a sound's playback rate, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target playback rate.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundPitchSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundPitchSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current playback rate.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current playback rate, or `1` once the sound has stopped.
     */
    soundPitchGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundPitchGet(ref);
    },

    /**
     * Sets a sound's stereo pan, optionally fading to it.
     *
     * @since 1.3.0
     * @param ref - Sound to update.
     * @param value - Target pan.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    soundPanSet: (ref: SoundRef, value: number, options?: SoundParamSetOptions): void => {
        BTAPI.instance.soundPanSet(ref, value, options?.fadeMs);
    },

    /**
     * Gets a sound's current stereo pan.
     *
     * @since 1.3.0
     * @param ref - Sound to query.
     * @returns Current pan, or `0` once the sound has stopped.
     */
    soundPanGet: (ref: SoundRef): number => {
        return BTAPI.instance.soundPanGet(ref);
    },

    /**
     * Plays a loaded audio clip through the music player, crossfading out whatever is currently
     * playing.
     *
     * Silently does nothing when the clip hasn't finished loading yet (or was already unloaded
     * with `clip.unload()`), or before the engine has initialized. While the audio context is
     * still locked (before the first unlock gesture), the request is remembered instead of
     * dropped - it starts automatically the instant the context unlocks, unlike {@link BT.soundPlay}.
     *
     * @since 1.3.0
     * @param clip - Loaded audio clip to play.
     * @param options - Crossfade, volume, and loop options; see {@link MusicPlayOptions}.
     */
    musicPlay: (clip: AudioClip, options?: MusicPlayOptions): void => {
        BTAPI.instance.musicPlay(clip, options);
    },

    /**
     * Stops the music player, optionally fading out first.
     *
     * @since 1.3.0
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade-out duration in milliseconds. Omit to stop immediately.
     */
    musicStop: (options?: { fadeMs?: number }): void => {
        BTAPI.instance.musicStop(options?.fadeMs);
    },

    /**
     * Whether music is currently playing.
     *
     * @since 1.3.0
     * @returns `true` when the music player has a live current track; `false` when stopped or
     *   not yet started.
     */
    get isMusicPlaying(): boolean {
        return BTAPI.instance.isMusicPlaying();
    },

    /**
     * Sets the music player's volume, optionally fading to it.
     *
     * @since 1.3.0
     * @param value - Target gain.
     * @param options - Optional fade behavior.
     * @param options.fadeMs - Fade duration in milliseconds. Omit for an immediate change.
     */
    musicVolumeSet: (value: number, options?: { fadeMs?: number }): void => {
        BTAPI.instance.musicVolumeSet(value, options?.fadeMs);
    },

    /**
     * Gets the music player's current target volume.
     *
     * @since 1.3.0
     * @returns Current target gain, or `1` before initialization.
     */
    musicVolumeGet: (): number => {
        return BTAPI.instance.musicVolumeGet();
    },

    /**
     * Pre-configured `SynthParams` presets for common sound effects ("jump", "pickup",
     * "explosion", "laser", "hit", "blip").
     *
     * Each function returns a fresh {@link SynthParams} object; pass it to
     * {@link AudioClip.synth} to render a clip, then play the result via {@link BT.soundPlay}.
     * An optional `seed` argument applies small, bounded, deterministic jitter to a few
     * hand-picked fields per preset, so repeated plays vary without losing reproducibility -
     * the same seed always renders the exact same variant.
     *
     * @since 1.3.0
     * @example
     * const jumpClip = await AudioClip.synth(BT.synthPreset.jump());
     * BT.soundPlay(jumpClip);
     */
    synthPreset: { jump, pickup, explosion, laser, hit, blip },

    /**
     * Creates a standalone palette instance.
     *
     * @since 1.0.3
     * @param size - Palette size. Defaults to 256 colors.
     * @returns New mutable palette.
     */
    paletteCreate: (size: number = MAX_PALETTE_SIZE): Palette => {
        return new Palette(size);
    },

    /**
     * Stores the active engine palette.
     *
     * Use this to swap the **entire palette** (e.g. switch between a day and night
     * theme). After this call the renderer uploads the new palette uniform on the
     * next frame.
     *
     * **Palette-value swap (change what a slot looks like):** mutate the live
     * {@link BT.palette} in place with `palette.set(slot, newColor)`. The renderer
     * uploads dirty slots on the next frame; no `paletteSet()` or
     * {@link BT.spritesRefresh} needed.
     *
     * **Palette-layout swap (same colors, different slot positions):** build a new
     * palette with the same colors at new indices, call `paletteSet()`, then call
     * {@link BT.spritesRefresh} so every sprite sheet re-maps its original RGBA
     * pixels against the new slot layout.
     *
     * @since 1.0.3
     * @param palette - Palette to make active.
     */
    paletteSet: (palette: Palette): void => {
        if (!(palette instanceof Palette)) {
            showBeginnerRuntimeError(
                'BT.paletteSet expects a Palette. Did you forget to create one with BT.paletteCreate() or a preset like Palette.vga()?',
                'Palette Error',
            );
            return;
        }

        BTAPI.instance.setPalette(palette);
    },

    /**
     * Active engine palette (live reference - not a copy).
     *
     * Mutating slots updates colors on the next frame without {@link BT.paletteSet}.
     *
     * @since 1.0.4
     * @returns The active palette instance.
     * @throws Error if no palette has been set.
     */
    get palette(): Palette {
        const palette = BTAPI.instance.getPalette();

        if (!palette) {
            throw new Error(noActivePaletteError());
        }

        return palette;
    },

    /**
     * Default engine PRNG (live reference - not a copy).
     *
     * Time-seeded when the engine singleton is created. Call {@link BT.randomSeed}
     * for a reproducible run, or open the page with `?seed=N` - applied in `BT.init()`
     * just before the demo's own `init()`, so a `randomSeed` call there still wins.
     * Mutating the instance (for example `BT.random.int(10)`) advances the shared stream.
     *
     * @since 1.5.0
     * @changed 1.7.1 `?seed=N` URL parameter seeds the shared generator before the demo's `init()`.
     * @returns The shared {@link Random} instance.
     * @example
     * BT.randomSeed(42);
     * BT.random.int(150, 420);
     * BT.random.pick(['a', 'b', 'c']);
     */
    get random(): Random {
        return BTAPI.instance.getRandom();
    },

    /**
     * Reseeds the default engine PRNG so subsequent draws are reproducible.
     *
     * Calling this from the demo's `init()` overrides a `?seed=N` URL parameter, which
     * `BT.init()` applies just before the demo's `init()`.
     *
     * @since 1.5.0
     * @changed 1.7.1 Documented precedence over the `?seed=N` URL parameter.
     * @param seed - Any finite number; only its lower 32 bits are used.
     * @example
     * BT.randomSeed(1234);
     * const a = BT.random.next();
     * BT.randomSeed(1234);
     * const b = BT.random.next(); // a === b
     */
    randomSeed: (seed: number): void => {
        BTAPI.instance.randomSeed(seed);
    },

    /**
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation technique. Runs indefinitely until
     * canceled via {@link BT.paletteClearEffects}. Uses a fractional accumulator
     * for sub-frame precision.
     *
     * @since 1.0.3
     * @param start - First palette index in the cycling range (inclusive).
     * @param end - Last palette index in the cycling range (inclusive).
     * @param speed - Steps per second. Positive = forward, negative = backward.
     */
    paletteCycle: (start: number, end: number, speed: number): void => {
        BTAPI.instance.paletteCycle(start, end, speed);
    },

    /**
     * Smoothly interpolates all palette entries toward a target over time.
     *
     * Snapshots the current palette at the moment this is called. Each frame the
     * entries are lerped between the snapshot and target using the easing curve.
     * Auto-removes when the fade completes.
     *
     * Common patterns:
     * - Fade to black: `BT.paletteFade(blackPalette, 1000)`
     * - Fade to white: `BT.paletteFade(whitePalette, 500)`
     * - Cross-fade: `BT.paletteFade(nightPalette, 2000, 'ease-in-out')`
     *
     * @since 1.0.3
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    paletteFade: (target: Palette, durationMs: number, easing?: EasingFunction): void => {
        BTAPI.instance.paletteFade(target, durationMs, easing);
    },

    /**
     * Fades all palette entries toward a target the way an iris pull does.
     *
     * {@link BT.paletteFade} interpolates encoded color values, which is a
     * post-production crossfade: every entry drops by the same proportion for the
     * whole fade and the image sags uniformly into gray. This one interpolates
     * each RGB channel in linear light instead, and offsets each entry's schedule
     * by its luminance, so bright entries come up first and hold on longest while
     * dark entries arrive late and crush early. The fade still lands exactly on
     * the target at completion.
     *
     * Fading up from black or down to black, which is the usual case, that
     * interpolation is exactly scaling light the way an iris does.
     *
     * `highlightLead` is the knob: `0` is a plain linear-light fade with every
     * entry on one schedule, higher values push the highlights further ahead.
     * Defaults to `0.5`.
     *
     * This is a per-index effect, not a per-pixel one - a dark object in a bright
     * scene fades on the dark schedule regardless of what surrounds it, because
     * the engine only knows its palette slot.
     *
     * Slots past the end of `target` are left alone, so passing a smaller target
     * palette scopes the fade to its own slots.
     *
     * Common patterns:
     * - Cinematic fade up from black: `BT.paletteFadeExposure(gamePalette, 1500)`
     * - Subtle version: `BT.paletteFadeExposure(gamePalette, 1500, { highlightLead: 0.2 })`
     * - Fade out: `BT.paletteFadeExposure(blackPalette, 1000)`
     *
     * @since 1.5.0
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param options - Highlight lead and easing curve.
     */
    paletteFadeExposure: (target: Palette, durationMs: number, options?: ExposureFadeOptions): void => {
        BTAPI.instance.paletteFadeExposure(target, durationMs, options);
    },

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * Same as {@link BT.paletteFade} but restricted to the range `[start, end]`.
     * Indices outside the range are left untouched.
     *
     * @since 1.0.3
     * @param start - First palette index to fade (inclusive).
     * @param end - Last palette index to fade (inclusive).
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    paletteFadeRange: (
        start: number,
        end: number,
        target: Palette,
        durationMs: number,
        easing?: EasingFunction,
    ): void => {
        BTAPI.instance.paletteFadeRange(start, end, target, durationMs, easing);
    },

    /**
     * Temporarily sets all non-zero palette entries to a single color, then restores.
     *
     * Index 0 (transparent) is preserved. The original palette is saved internally
     * and restored after the duration elapses. Auto-removes when complete.
     *
     * @since 1.0.3
     * @param color - Flash color applied to all non-zero entries.
     * @param durationMs - How long the flash lasts in milliseconds.
     */
    paletteFlash: (color: Color32, durationMs: number): void => {
        BTAPI.instance.paletteFlash(color, durationMs);
    },

    /**
     * Instantly exchanges two palette entries.
     *
     * This is an immediate operation, not an animated effect. The visual change
     * takes effect on the next frame.
     *
     * @since 1.0.3
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     */
    paletteSwap: (indexA: number, indexB: number): void => {
        BTAPI.instance.paletteSwap(indexA, indexB);
    },

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when canceled.
     *
     * @since 1.0.3
     */
    paletteClearEffects: (): void => {
        BTAPI.instance.paletteClearEffects();
    },

    /**
     * Appends a fullscreen post-processing effect to whichever chain matches
     * its declared {@link Effect.tier}.
     *
     * - `tier='pixel'` -> pixel chain (logical resolution).
     * - `tier='display'` -> display chain (output resolution); requires
     *   `drawingBufferSize` in effective hardware settings (`configure()` or
     *   `defaultConfig()`).
     *
     * Effects run in registration order within each tier. The pixel chain runs
     * first, followed by the upscale pass, followed by the display chain. Each
     * {@link Effect} instance owns its own GPU resources and may be mutated
     * each frame from demo code.
     *
     * @since 1.0.3
     * @param effect - Effect instance to append.
     * When the engine is not ready, shows a canvas error instead of throwing.
     */
    effectAdd: (effect: Effect): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('effectAdd');
            return;
        }

        try {
            BTAPI.instance.effectAdd(effect);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Removes a previously registered post-processing effect.
     *
     * Searches both tiers and disposes the effect from whichever chain holds
     * it. Removing an effect that was never added is a no-op.
     *
     * @since 1.0.3
     * @param effect - Effect instance to remove.
     * When the engine is not ready, shows a canvas error instead of throwing.
     */
    effectRemove: (effect: Effect): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('effectRemove');
            return;
        }

        try {
            BTAPI.instance.effectRemove(effect);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Removes every registered post-processing effect across both tiers.
     *
     * When the engine is not ready, shows a canvas error instead of throwing.
     *
     * @since 1.0.3
     */
    effectClear: (): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('effectClear');
            return;
        }

        try {
            BTAPI.instance.effectClear();
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Pre-configured display-tier effect stacks ("looks").
     *
     * Each function returns a fresh array of effects. Add them to the engine
     * via {@link BT.effectAdd}.
     *
     * @since 1.0.3
     * @example
     * for (const fx of BT.preset.crtPipBoy()) {
     *     BT.effectAdd(fx);
     * }
     */
    preset: { crtPipBoy, amber, green },

    /**
     * Sets the frame clear color using a palette index.
     *
     * The renderer uses this color when clearing the full display at the start
     * of the next frame.
     *
     * @since 0.1.0
     * @param paletteIndex - Palette index for the full-screen clear pass.
     */
    clear: (paletteIndex: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('clear');
            return;
        }

        try {
            BTAPI.instance.setClearColor(paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Fills a rectangular display region with a palette-indexed color.
     *
     * @since 0.1.0
     * @param rect - Rectangle in display pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    clearRect: (rect: Rect2i, paletteIndex: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('clearRect');
            return;
        }

        try {
            BTAPI.instance.clearRect(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a single pixel.
     *
     * Accepts either:
     * - `(posOrX: Vector2i, yOrColor: number)` where `yOrColor` is the palette index.
     * - `(posOrX: number, yOrColor: number, maybeColor: number)` for `(x, y, paletteIndex)`.
     *
     * @since 0.1.0
     * @param posOrX - Pixel position as `Vector2i`, or x coordinate when using numeric overload.
     * @param yOrColor - Palette index for vector overload, or y coordinate for numeric overload.
     * @param maybeColor - Palette index when using numeric overload.
     */
    drawPixel: (posOrX: Vector2i | number, yOrColor: number, maybeColor?: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawPixel');
            return;
        }

        try {
            if (posOrX instanceof Vector2i && maybeColor === undefined) {
                BTAPI.instance.drawPixel(new Vector2i(posOrX.x, posOrX.y), yOrColor);
                return;
            }

            if (typeof posOrX === 'number' && typeof maybeColor === 'number') {
                BTAPI.instance.drawPixelXY(posOrX, yOrColor, maybeColor);
                return;
            }

            const typeDetails = [
                describeRuntimeType(posOrX),
                describeRuntimeType(yOrColor),
                describeRuntimeType(maybeColor),
            ]
                .filter((part) => part !== 'undefined')
                .join(', ');
            showBeginnerRuntimeError(
                `drawPixel expects (x, y, paletteIndex) or (Vector2i, paletteIndex). Got: [${typeDetails}]`,
                'Wrong drawPixel Arguments',
            );
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a pixel-perfect line between two points.
     *
     * Uses rasterized line drawing without antialiasing.
     *
     * @since 0.1.0
     * @param p0 - Start position in display coordinates.
     * @param p1 - End position in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawLine: (p0: Vector2i, p1: Vector2i, paletteIndex: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawLine');
            return;
        }

        try {
            BTAPI.instance.drawLine(p0, p1, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws an unfilled rectangle outline.
     *
     * @since 0.1.0
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRect: (rect: Rect2i, paletteIndex: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawRect');
            return;
        }

        try {
            BTAPI.instance.drawRect(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a filled rectangle.
     *
     * @since 0.1.0
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill: (rect: Rect2i, paletteIndex: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawRectFill');
            return;
        }

        try {
            BTAPI.instance.drawRectFill(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Sets the global camera offset applied to subsequent draw calls.
     *
     * @since 0.1.0
     * @param offset - Camera translation in display pixels.
     */
    cameraSet: (offset: Vector2i): void => {
        BTAPI.instance.setCameraOffset(offset);
    },

    /**
     * Current global camera offset (clone; safe to mutate without affecting the engine).
     *
     * @since 1.0.4
     * @returns Camera translation in display pixels.
     */
    get camera(): Vector2i {
        return BTAPI.instance.getCameraOffset();
    },

    /**
     * Clamps a camera origin so the viewport stays within world bounds.
     *
     * Uses integer clamping per axis: `[0, worldSize - viewSize]`.
     * If `viewSize` is omitted, the active {@link BT.displaySize} is used.
     *
     * @since 1.0.3
     * @param camera - Desired camera origin in world coordinates.
     * @param worldSize - Full world size in pixels.
     * @param viewSize - Viewport size in pixels (defaults to {@link BT.displaySize}).
     * @returns Clamped camera origin.
     */
    cameraClamp: (camera: Vector2i, worldSize: Vector2i, viewSize?: Vector2i): Vector2i => {
        return clampCameraToWorld(camera, worldSize, viewSize ?? BT.displaySize);
    },

    /**
     * Resets the global camera offset to `(0, 0)`.
     *
     * @since 0.1.0
     * @changed 1.7.1 Now persists once nothing sets the camera again: previously, the offset
     *   the engine re-applies at frame start stayed at its pre-reset value forever, so a
     *   later frame that never calls `cameraSet` again still saw the old offset leak back in.
     */
    cameraReset: (): void => {
        BTAPI.instance.resetCamera();
    },

    /**
     * Returns the position of the pointer in the given slot, in display coordinates.
     *
     * Slot 0 is the mouse; slots 1 through 3 are touch / pen contacts assigned
     * in arrival order. Returns `Vector2i.zero()` when the engine has not been
     * initialized, the slot index is out of `[0, 3]`, or the slot has no live
     * pointer.
     *
     * @since 1.0.3
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Pointer position in display coordinates.
     */
    pointerPos: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getPos(pointerIndex) ?? Vector2i.zero();
    },

    /**
     * Converts viewport coordinates, such as a DOM event's `clientX` / `clientY`, to display
     * coordinates, using the same conversion as pointer input.
     *
     * Use it for DOM events the engine does not wrap, for example a file dropped onto the canvas.
     * Each axis is `floor((client - canvasRect.start) / canvasRect.size * displaySize)`, clamped to
     * `[0, displaySize - 1]`, so a point outside the canvas lands on the nearest edge pixel. Reads the
     * canvas rect on every call, so the result is correct after a resize or scroll.
     *
     * @since 1.8.0
     * @param clientX - Viewport X, such as DOM `clientX`.
     * @param clientY - Viewport Y, such as DOM `clientY`.
     * @returns A new display-space position, or `null` when the engine has not been initialized,
     *   the canvas has zero width or height, or a coordinate is not finite.
     */
    nativeScreenToDisplayPos: (clientX: number, clientY: number): Vector2i | null => {
        const canvas = BTAPI.instance.getCanvas();
        const displaySize = BTAPI.instance.getHardwareSettings()?.displaySize;

        if (!canvas || !displaySize) {
            return null;
        }

        return clientToDisplayPos(clientX, clientY, canvas.getBoundingClientRect(), displaySize, new Vector2i());
    },

    /**
     * Writes the position of the pointer in the given slot, in display coordinates, into `out`.
     *
     * Zero-allocation counterpart to {@link pointerPos}. Slot 0 is the mouse; slots 1 through 3 are
     * touch / pen contacts assigned in arrival order. Writes `(0, 0)` into `out` when the engine has
     * not been initialized, the slot index is out of `[0, 3]`, or the slot has no live pointer.
     *
     * @since 1.7.0
     * @param out - Vector2i to write the pointer position into.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns The `out` vector, for chaining.
     */
    pointerPosTo: (out: Vector2i, pointerIndex: number = 0): Vector2i => {
        const pointer = BTAPI.instance.getPointer();

        if (!pointer) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        return pointer.getPosTo(pointerIndex, out);
    },

    /**
     * Returns the position delta `(pos - prevPos)` for a pointer slot since the previous frame.
     *
     * Reflects movement accumulated between the previous and current frame.
     * Snapshotted and reset by the engine at `endFrame()`, which runs after
     * `update()` and `render()`. Returns `Vector2i.zero()` when the engine is
     * not initialized or `pointerIndex` is out of range.
     *
     * @since 1.0.3
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Per-frame movement in display coordinates.
     */
    pointerDelta: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getDelta(pointerIndex) ?? Vector2i.zero();
    },

    /**
     * Writes the position delta `(pos - prevPos)` for a pointer slot since the previous frame into
     * `out`.
     *
     * Zero-allocation counterpart to {@link pointerDelta}. Reflects movement accumulated between
     * the previous and current frame. Snapshotted and reset by the engine at `endFrame()`, which
     * runs after `update()` and `render()`. Writes `(0, 0)` into `out` when the engine is not
     * initialized or `pointerIndex` is out of range.
     *
     * @since 1.7.0
     * @param out - Vector2i to write the per-frame movement into.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns The `out` vector, for chaining.
     */
    pointerDeltaTo: (out: Vector2i, pointerIndex: number = 0): Vector2i => {
        const pointer = BTAPI.instance.getPointer();

        if (!pointer) {
            out.x = 0;
            out.y = 0;

            return out;
        }

        return pointer.getDeltaTo(pointerIndex, out);
    },

    /**
     * Reports whether the given pointer slot has a live pointer.
     *
     * For slot 0 (mouse) this is true while the mouse is hovering inside the
     * canvas; cleared on `pointerleave`. For slots 1-3 (touch / pen) this is
     * true while the contact is down.
     *
     * @since 1.1.1
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns `true` while the slot has live position data.
     */
    isPointerActive: (pointerIndex: number = 0): boolean => {
        return BTAPI.instance.getPointer()?.isActive(pointerIndex) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isPointerActive}.
     *
     * @since 1.0.3
     * @deprecated Deprecated since 1.0.3 (2026-05-31). Use {@link isPointerActive} instead.
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns `true` while the slot has live position data.
     */
    pointerPosValid: (pointerIndex: number = 0): boolean => {
        return BT.isPointerActive(pointerIndex);
    },

    /**
     * Wheel scroll delta accumulated during the current frame, in pixels.
     *
     * Aggregates `WheelEvent.deltaY` across all wheel events received since
     * the last frame, normalizing line and page delta modes to pixels.
     * Requires {@link HardwareSettings.isCapturingPointerScroll} (or overlay
     * palette-band force capture); otherwise this stays `0` and the host page
     * scrolls normally.
     *
     * @since 1.0.4
     * @changed 1.3.1 Requires `HardwareSettings.isCapturingPointerScroll` (or overlay force); opt-in now, not default.
     * @returns Vertical scroll delta in pixels for the current frame, or `0` when not initialized.
     */
    get pointerScrollDelta(): number {
        return BTAPI.instance.getPointer()?.getScrollDelta() ?? 0;
    },

    /**
     * Hides the native OS cursor while the pointer is over the canvas.
     *
     * Call once from `init()` when the demo draws its own crosshair or
     * cursor sprite in place of the system arrow. The cursor is restored
     * automatically when the engine shuts down.
     *
     * No-op before the engine is initialized.
     *
     * @since 1.0.3
     */
    hideCursor: (): void => {
        BTAPI.instance.getPointer()?.hideCursor();
    },

    /**
     * Restores the native OS cursor over the canvas.
     *
     * Reverses a prior {@link hideCursor} call. No-op before the engine is
     * initialized.
     *
     * @since 1.0.3
     */
    showCursor: (): void => {
        BTAPI.instance.getPointer()?.showCursor();
    },

    /**
     * Checks whether a button is currently held.
     *
     * For pointer buttons (`BTN_POINTER_A..D`), the second parameter is the
     * pointer slot index (0 = mouse, 1-3 = touch / pen). For mouse slot 0:
     * `A` is left, `B` is right, `C` is middle, `D` is back / forward
     * (matches RetroBlit canonical, not DOM `PointerEvent.button` index).
     * Touch / pen slots only support `A`; B/C/D return `false`.
     *
     * `button` accepts one or more bit flags from the `BTN_*` set (for example
     * `BT.BTN_A | BT.BTN_B`). Matching uses ANY semantics: returns `true` when
     * any selected button is held.
     *
     * For face buttons (`BTN_UP`…`BTN_SELECT`), players `0` and `1` merge keyboard
     * and gamepad input (logical OR). Players `2` and `3` use gamepad only.
     * Pointer flags (`BTN_POINTER_*`) use the `player` argument as pointer slot.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads / keyboard, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @returns `true` while the button remains pressed.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isDown: (button: number, player: number = 0): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & POINTER_BUTTON_MASK;

        if (pointerMask !== 0) {
            for (const pointerFlag of POINTER_FLAGS) {
                if ((pointerMask & pointerFlag) === 0) {
                    continue;
                }

                const pointerCode = pointerFlagToPointerCode(pointerFlag);

                if (pointerCode !== null && (BTAPI.instance.getPointer()?.isButtonDown(pointerCode, player) ?? false)) {
                    return true;
                }
            }
        }

        const faceMask = button & FACE_BUTTON_MASK;

        for (const faceButton of FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const isKeyboardDown =
                BTAPI.instance.getKeyboard()?.isButtonDown(faceButtonKeys(faceButton, player) ?? []) ?? false;
            const isGamepadDown = BTAPI.instance.getGamepad()?.isButtonDown(faceButton, player) ?? false;

            if (isKeyboardDown || isGamepadDown) {
                return true;
            }
        }

        for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonDown(triggerButton, player) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isDown}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isDown} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads / keyboard, or pointer slot.
     * @returns `true` while the button remains pressed.
     */
    buttonDown: (button: number, player: number = 0): boolean => {
        return BT.isDown(button, player);
    },

    /**
     * Checks whether a button was pressed on the current frame.
     *
     * Same parameter semantics as {@link isDown}; returns `true` only on
     * the frame the button transitions from up to down.
     *
     * Call from `update()`, not `render()`, for reliable detection: for keyboard-mapped
     * face buttons (players 0 and 1), the press edge clears once per fixed-update tick,
     * which always runs before that frame's `render()`.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @param repeatRate - Optional repeat interval in fixed ticks (`0`/omitted = edge only).
     * @returns `true` on the transition frame.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isPressed: (button: number, player: number = 0, repeatRate?: number): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & POINTER_BUTTON_MASK;

        if (pointerMask !== 0) {
            for (const pointerFlag of POINTER_FLAGS) {
                if ((pointerMask & pointerFlag) === 0) {
                    continue;
                }

                const pointerCode = pointerFlagToPointerCode(pointerFlag);

                if (
                    pointerCode !== null &&
                    (BTAPI.instance.getPointer()?.isButtonPressed(pointerCode, player) ?? false)
                ) {
                    return true;
                }
            }
        }

        const faceMask = button & FACE_BUTTON_MASK;
        const tick = BTAPI.instance.getTicks();

        for (const faceButton of FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const keyboard = BTAPI.instance.getKeyboard();
            const gamepad = BTAPI.instance.getGamepad();
            const keyboardCodes = faceButtonKeys(faceButton, player) ?? [];
            const isKeyboardDown = keyboard?.isButtonDown(keyboardCodes) ?? false;
            const isGamepadDown = gamepad?.isButtonDown(faceButton, player) ?? false;
            const keyboardIsPressed = keyboard?.isButtonPressed(keyboardCodes, repeatRate, tick) ?? false;
            const gamepadIsPressed = gamepad?.isButtonPressed(faceButton, player, repeatRate, tick) ?? false;
            const isRepeatEnabled = repeatRate !== undefined && repeatRate > 0;
            const mergedIsPressed = isRepeatEnabled
                ? keyboardIsPressed || gamepadIsPressed
                : (keyboardIsPressed && !(isGamepadDown && !gamepadIsPressed)) ||
                  (gamepadIsPressed && !(isKeyboardDown && !keyboardIsPressed));

            if (mergedIsPressed) {
                return true;
            }
        }

        for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonPressed(triggerButton, player, repeatRate, tick) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isPressed}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isPressed} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot.
     * @param repeatRate - Optional repeat interval in fixed ticks (`0`/omitted = edge only).
     * @returns `true` on the transition frame.
     */
    buttonPressed: (button: number, player: number = 0, repeatRate?: number): boolean => {
        return BT.isPressed(button, player, repeatRate);
    },

    /**
     * Checks whether a button was released on the current frame.
     *
     * Same parameter semantics as {@link isDown}; returns `true` only on
     * the frame the button transitions from down to up.
     *
     * Call from `update()`, not `render()`, for reliable detection: for keyboard-mapped
     * face buttons (players 0 and 1), the release edge clears once per fixed-update tick,
     * which always runs before that frame's `render()`.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @returns `true` on the release frame.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isReleased: (button: number, player: number = 0): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & POINTER_BUTTON_MASK;

        if (pointerMask !== 0) {
            for (const pointerFlag of POINTER_FLAGS) {
                if ((pointerMask & pointerFlag) === 0) {
                    continue;
                }

                const pointerCode = pointerFlagToPointerCode(pointerFlag);

                if (
                    pointerCode !== null &&
                    (BTAPI.instance.getPointer()?.isButtonReleased(pointerCode, player) ?? false)
                ) {
                    return true;
                }
            }
        }

        const faceMask = button & FACE_BUTTON_MASK;

        for (const faceButton of FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const keyboard = BTAPI.instance.getKeyboard();
            const gamepad = BTAPI.instance.getGamepad();
            const keyboardCodes = faceButtonKeys(faceButton, player) ?? [];
            const isKeyboardDown = keyboard?.isButtonDown(keyboardCodes) ?? false;
            const isGamepadDown = gamepad?.isButtonDown(faceButton, player) ?? false;
            const keyboardIsReleased = keyboard?.isButtonReleased(keyboardCodes) ?? false;
            const gamepadIsReleased = gamepad?.isButtonReleased(faceButton, player) ?? false;
            const mergedIsReleased =
                (keyboardIsReleased && !(isGamepadDown && !gamepadIsReleased)) ||
                (gamepadIsReleased && !(isKeyboardDown && !keyboardIsReleased));

            if (mergedIsReleased) {
                return true;
            }
        }

        for (const triggerButton of TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonReleased(triggerButton, player) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isReleased}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isReleased} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot.
     * @returns `true` on the release frame.
     */
    buttonReleased: (button: number, player: number = 0): boolean => {
        return BT.isReleased(button, player);
    },

    /**
     * Assigns one or more `KeyboardEvent.code` values to a face button for a keyboard player.
     *
     * Logical button state is the OR of all listed keys. Only players `0` and `1`
     * support keyboard; other indices no-op. `button` must be one face-button
     * bit flag (`BT.BTN_UP` … `BT.BTN_SELECT`). Pass an empty key list
     * to clear keyboard bindings for that button until remapped again.
     *
     * @since 1.0.3
     * @param player - Zero-based player index (`0` or `1`).
     * @param button - Face button constant.
     * @param keys - DOM key codes (for example `'Space'`, `'KeyW'`).
     */
    inputMap: (player: number, button: number, ...keys: string[]): void => {
        if (player !== 0 && player !== 1) {
            return;
        }

        if (!FACE_BUTTON_FLAGS.includes(button as FaceButtonCode)) {
            return;
        }

        setKeyboardFaceButtonKeys(player, button, [...keys]);
    },

    /**
     * Restores built-in default keyboard maps for players `0` and `1`.
     *
     * Uses the tables for the active `keyboardLayout` from `configure()`:
     * `BT.DEFAULT_KEYBOARD_PLAYER1` / `BT.DEFAULT_KEYBOARD_PLAYER2` for `'versus'` (the
     * default), `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1` / `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER2`
     * for `'single'`.
     *
     * @since 1.0.3
     * @changed 1.8.0 Restores the defaults of the active `HardwareSettings.keyboardLayout`
     *   instead of always the `'versus'` tables.
     */
    inputMapReset: (): void => {
        resetKeyboardFaceButtonMaps();
    },

    /**
     * Reads a gamepad axis value for a player.
     *
     * Stick axes return values in `[-1.0, 1.0]` with dead-zone filtering.
     * Trigger axes return values in `[0.0, 1.0]`.
     *
     * @since 1.0.3
     * @param axis - Axis constant (`AXIS_LEFT_X` .. `AXIS_TRIGGER_R`).
     * @param player - Zero-based player index (`0`..`3`).
     * @returns Axis value, or `0` when unavailable.
     */
    getAxis: (axis: number, player: number = 0): number => {
        return BTAPI.instance.getGamepad()?.getAxis(axis, player) ?? 0;
    },

    /**
     * Reports whether a player's gamepad is connected.
     *
     * @since 1.1.1
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    isGamepadConnected: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isConnected(player) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isGamepadConnected}.
     *
     * @since 1.0.3
     * @deprecated Deprecated since 1.0.3 (2026-05-31). Use {@link isGamepadConnected} instead.
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    gamepadConnected: (player: number = 0): boolean => {
        return BT.isGamepadConnected(player);
    },

    /**
     * Number of currently connected gamepads (max 4).
     *
     * @since 1.0.4
     * @returns Connected gamepad count (0..4).
     */
    get gamepadCount(): number {
        return BTAPI.instance.getGamepad()?.connectedCount() ?? 0;
    },

    /**
     * Checks whether a keyboard key is currently held.
     *
     * Uses `KeyboardEvent.code` (for example `"KeyW"`, `"Space"`, `"ArrowUp"`).
     *
     * @since 1.1.1
     * @param key - DOM keyboard code string.
     * @returns `true` while the key remains pressed.
     */
    isKeyDown: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyDown(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyDown}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isKeyDown} instead.
     * @param key - DOM keyboard code string.
     * @returns `true` while the key remains pressed.
     */
    keyDown: (key: string): boolean => {
        return BT.isKeyDown(key);
    },

    /**
     * Checks whether a keyboard key was pressed on the current fixed-update tick.
     *
     * Optional `repeatRate` is in fixed ticks between repeats (`0` or omitted =
     * edge only). When `repeatRate > 0`, repeats fire while held per
     * `(ticks - firstPressTick) > 0 && (ticks - firstPressTick) % repeatRate === 0`.
     *
     * Call from `update()`, not `render()`: the press edge clears once per fixed-update
     * tick, which always runs before that frame's `render()`, so a press read from
     * `render()` can be intermittently missed under rapid input.
     *
     * @since 1.1.1
     * @param key - DOM keyboard code string.
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on the press edge (and on repeat ticks when configured).
     */
    isKeyPressed: (key: string, repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getKeyboard()?.isKeyPressed(key, repeatRate, tick) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyPressed}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isKeyPressed} instead.
     * @param key - DOM keyboard code string.
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on the press edge (and on repeat ticks when configured).
     */
    keyPressed: (key: string, repeatRate?: number): boolean => {
        return BT.isKeyPressed(key, repeatRate);
    },

    /**
     * Checks whether a keyboard key was released on the current frame.
     *
     * Call from `update()`, not `render()`: the release edge clears once per fixed-update
     * tick, which always runs before that frame's `render()`, so a release read from
     * `render()` can be intermittently missed under rapid input.
     *
     * @since 1.1.1
     * @param key - DOM keyboard code string.
     * @returns `true` on the release edge.
     */
    isKeyReleased: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyReleased(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyReleased}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isKeyReleased} instead.
     * @param key - DOM keyboard code string.
     * @returns `true` on the release edge.
     */
    keyReleased: (key: string): boolean => {
        return BT.isKeyReleased(key);
    },

    /**
     * Text accumulated since the last fixed-update flush from filtered `beforeinput`
     * (and Tab / Escape where `beforeinput` is unreliable). Read during `update()`;
     * the buffer clears at the end of each fixed update step.
     *
     * @since 1.0.4
     * @returns Characters typed since the last fixed-update flush.
     */
    get inputString(): string {
        return BTAPI.instance.getKeyboard()?.getInputString() ?? '';
    },

    /**
     * Checks whether at least one keyboard key is currently held.
     *
     * @since 1.8.0
     * @returns `true` while any key is down.
     */
    isAnyKeyDown: (): boolean => {
        return BTAPI.instance.getKeyboard()?.isAnyKeyDown() ?? false;
    },

    /**
     * Checks whether any keyboard key was pressed on the current fixed-update tick.
     *
     * Fires when a key goes down, even if other keys are already held. With `repeatRate > 0` it
     * also fires every `repeatRate` ticks while keys stay held, counted from the earliest-pressed
     * key that is still down. Call from `update()`, not `render()`, like {@link isKeyPressed}.
     *
     * @since 1.8.0
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on a press edge (and on repeat ticks when configured).
     */
    isAnyKeyPressed: (repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getKeyboard()?.isAnyKeyPressed(repeatRate, tick) ?? false;
    },

    /**
     * Checks whether every keyboard key has just been released.
     *
     * Matches RetroBlit: `true` only on the tick where no key is held any more and at least one
     * was held before. Releasing one key while another stays down does not count; use
     * {@link isKeyReleased} for per-key edges. Call from `update()`, not `render()`.
     *
     * @since 1.8.0
     * @returns `true` on the tick the last held key comes up.
     */
    isAnyKeyReleased: (): boolean => {
        return BTAPI.instance.getKeyboard()?.isAnyKeyReleased() ?? false;
    },

    /**
     * Checks whether at least one gamepad button is held for a player.
     *
     * Covers the `BTN_UP` to `BTN_SELECT` buttons of a connected gamepad. Sticks, triggers
     * (analog or `BTN_L2` / `BTN_R2`), the keyboard, and pointers are not included; use {@link isAnyKeyDown} for the keyboard.
     *
     * @since 1.8.0
     * @param player - Zero-based gamepad index (0-3).
     * @returns `true` while any of the player's gamepad buttons is down.
     */
    isAnyButtonDown: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isAnyButtonDown(player) ?? false;
    },

    /**
     * Checks whether any gamepad button was pressed since the last rendered frame.
     *
     * Same press and repeat semantics as {@link isAnyKeyPressed}, for one player's gamepad. Call from `update()`.
     * Like {@link isPressed}, the gamepad edge rolls over once per rendered frame, not once per fixed update: a
     * frame that runs no update can miss it, and a frame that runs several updates reports it to each.
     *
     * @since 1.8.0
     * @param player - Zero-based gamepad index (0-3).
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on a press edge (and on repeat ticks when configured).
     */
    isAnyButtonPressed: (player: number = 0, repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getGamepad()?.isAnyButtonPressed(player, repeatRate, tick) ?? false;
    },

    /**
     * Checks whether every gamepad button has just been released for a player.
     *
     * Same "everything is up" meaning as {@link isAnyKeyReleased}: `true` only on the frame where no button
     * is held any more and at least one was held before. A gamepad disconnecting while buttons were held
     * also counts. Call from `update()`. Like {@link isReleased}, the edge rolls over once per rendered frame,
     * not once per fixed update.
     *
     * @since 1.8.0
     * @param player - Zero-based gamepad index (0-3).
     * @returns `true` on the frame the last held button comes up.
     */
    isAnyButtonReleased: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isAnyButtonReleased(player) ?? false;
    },

    /**
     * Built-in 6x14 system font used by {@link BT.systemPrint} (live reference, not a copy).
     *
     * Read `codePoints` on the returned font to see every Unicode code point it covers, or
     * `hasGlyph(char)` to test one character. Pass it to {@link BT.printFont} to draw with the
     * exact glyphs and metrics {@link BT.systemPrint} uses internally.
     *
     * @since 1.7.0
     * @throws Error if read before {@link BT.init} finishes creating the system font.
     * @returns The engine's built-in system font.
     */
    get systemFont(): BitmapFont {
        const font = BTAPI.instance.getSystemFont();

        if (!font) {
            throw new Error(systemFontNotReadyError());
        }

        return font;
    },

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font covers printable ASCII (characters 32-126). For custom
     * bitmap fonts with proportional glyphs, use {@link BT.printFont} instead.
     *
     * @since 1.0.3
     * @param pos - Text origin in display coordinates.
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to render.
     */
    systemPrint: (pos: Vector2i, paletteIndex: number, text: string): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('systemPrint');
            return;
        }

        try {
            BTAPI.instance.drawSystemText(pos, paletteIndex, text);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Measures the pixel dimensions of a string rendered with the built-in
     * system font.
     *
     * @since 1.0.3
     * @param text - Text string to measure.
     * @returns Width and height in pixels, or `Vector2i.zero()` before engine initialization.
     */
    systemPrintMeasure: (text: string): Vector2i => {
        const font = BTAPI.instance.getSystemFont();

        if (!font) {
            return Vector2i.zero();
        }

        const size = font.measureTextSize(text);

        return new Vector2i(size.width, size.height);
    },

    /**
     * Draws text with a bitmap font through the indexed sprite pipeline.
     *
     * Supports proportional glyph widths and glyph-level offsets defined by the
     * supplied {@link BitmapFont}. The font's underlying sprite sheet must have
     * been indexized before calling this.
     *
     * Palette offset semantics and out-of-range behavior are identical to
     * {@link BT.drawSprite}.
     *
     * @since 0.1.0
     * @param font - Font asset used for rendering.
     * @param pos - Text origin in display coordinates.
     * @param text - String to render.
     * @param paletteOffset - Shift added to every stored glyph index before palette lookup (default 0).
     */
    printFont: (font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('printFont');
            return;
        }

        try {
            if (font instanceof Promise) {
                reportMissingAwait('BitmapFont.load()');
                return;
            }

            BTAPI.instance.drawBitmapText(font, pos, text, paletteOffset);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Captures the next rendered frame as a PNG blob.
     *
     * The returned promise resolves after the next render pass has completed. By default
     * the PNG matches {@link BT.outputSize} (`drawingBufferSize ?? displaySize`), including
     * display-tier post-process effects. Pass `{ size: 'display' }` for an exact 1:1 frame
     * at logical {@link BT.displaySize}, resolved straight from the palette-indexed scene
     * buffer - no upscale and no display-tier effects (scanlines, vignette, bloom) - which
     * is what tests and agents want for pixel comparisons. The display-size capture has
     * its own pending slot, so it never contends with the F9 / Shift+F9 dev shortcuts.
     *
     * @since 1.0.3
     * @changed 1.7.1 Accepts `{ size: 'display' }` to capture at logical `BT.displaySize`.
     * @param options - Capture options; `size` defaults to `'output'`.
     * @returns PNG image data for the captured frame.
     *
     * @example
     * const blob = await BT.captureFrame();
     * const url = URL.createObjectURL(blob);
     * console.log('Captured frame:', url);
     *
     * // Exact game pixels, one PNG pixel per logical pixel:
     * const exact = await BT.captureFrame({ size: 'display' });
     */
    captureFrame: async (options: FrameCaptureOptions = {}): Promise<Blob> => {
        return await BTAPI.instance.captureFrame(options.size);
    },

    /**
     * Captures the next rendered frame and downloads it from the browser.
     *
     * Convenience wrapper around {@link BT.captureFrame} that creates a temporary
     * object URL and clicks a synthetic anchor element. Takes the same `options` as
     * {@link BT.captureFrame}.
     *
     * @since 1.0.3
     * @changed 1.7.1 Accepts `{ size: 'display' }` to download at logical `BT.displaySize`.
     * @param filename - Target download filename.
     * @param options - Capture options; `size` defaults to `'output'`.
     *
     * @example
     * await BT.downloadFrame();
     * await BT.downloadFrame('screenshot-001.png');
     * await BT.downloadFrame('exact.png', { size: 'display' });
     */
    downloadFrame: async (
        filename: string = 'blit386-capture.png',
        options: FrameCaptureOptions = {},
    ): Promise<void> => {
        const blob = await BTAPI.instance.captureFrame(options.size);

        downloadBlob(blob, filename);
    },

    /**
     * Draws a sprite region from an indexed sprite sheet.
     *
     * Sprite draws are batched internally. Grouping draws from the same
     * {@link SpriteSheet} minimizes batch flushes and reduces GPU state changes.
     *
     * The sprite sheet must have been converted to palette indices via
     * `spriteSheet.indexize(palette)` before the first draw call. Prefer
     * `SpriteSheet.loadIndexed(...)` for one-call setup.
     *
     * **Palette offset semantics:** Sprite pixels are stored as palette indices starting at 1.
     * Index 0 is always transparent and is discarded by the fragment shader. The final palette
     * lookup is `storedIndex + paletteOffset`, so:
     *
     * - `paletteOffset = 0` (default): a sprite pixel stored at index 1 renders as `palette[1]`.
     *   `palette[0]` is never reachable because stored indices start at 1.
     * - `paletteOffset = N`: shifts the entire sprite's color range up by N slots. A pixel stored
     *   at index 1 renders as `palette[1 + N]`, a pixel at index 2 renders as `palette[2 + N]`,
     *   and so on. Use this for palette-swap effects such as team colors or damage flashes.
     *
     * **Out-of-range behavior:** No CPU-side validation is performed. `paletteOffset` is passed to
     * the GPU as a `u32`. If `storedIndex + paletteOffset` exceeds the last palette index, WebGPU's
     * robust buffer access returns 0 for every component; because the fragment shader forces alpha
     * to 1.0, the affected pixels render as opaque black. Negative values are forbidden - a negative
     * JS number written into a `u32` vertex attribute wraps to a large unsigned integer, which also
     * produces out-of-bounds black pixels.
     *
     * **Flip and quarter turns (since 1.8.0):** pass a {@link SpriteDrawParams} object as the 4th argument
     * instead of a number. `params.flags` takes any combination of `BT.FLIP_H`, `BT.FLIP_V`,
     * `BT.ROT_90_CW`, `BT.ROT_180_CW`, and `BT.ROT_270_CW`, composed as FLIP_H, then FLIP_V, then the
     * clockwise quarter turns summed modulo 4. `destPos` is the top-left of the post-flags footprint, so a
     * 16x32 sprite with `ROT_90_CW` covers 32x16. `params.paletteOffset` means the same as the number form.
     * The object is read, never mutated or retained: allocate it once and rewrite its fields between draws.
     *
     * **Scale and stretch (since 1.8.0):** `params.scale` takes a positive integer or a `Vector2i` of
     * positive integers and multiplies the post-flags footprint in screen axes (`scale.x` is on-screen width
     * even after a 90-degree turn). For an uneven size, pass a `Rect2i` as `destPos` instead: the sprite is
     * stretched into it with nearest-neighbor sampling at pixel centers, the same on both backends. A
     * `Rect2i` needs the params form - write `BT.drawSprite(sheet, src, destRect, {})` - and accepts only
     * `scale: 1`, `new Vector2i(1, 1)`, or no scale.
     *
     * **Pivot (since 1.8.0):** `params.pivot` is a point in source pixels, relative to `srcRect`'s top-left,
     * that lands on a `Vector2i` `destPos` instead of the footprint's top-left. It goes through the flags,
     * then the scale. An explicit `(0, 0)` is the source origin and moves under flips, unlike no pivot;
     * assign `params.pivot = undefined` to reset. A `Rect2i` `destPos` takes no pivot.
     *
     * @since 0.1.0
     * @changed 1.8.0 Added the `SpriteDrawParams` 4th-argument form for flips, quarter turns, integer scale, pivot placement, and Rect2i stretch destinations.
     * @param spriteSheet - Indexed sprite sheet.
     * @param srcRect - Source rectangle within the sprite sheet, in pixels.
     * @param destPos - Destination top-left in display coordinates (or where `params.pivot` lands), or (params
     *   form only) a Rect2i to stretch into.
     * @param paletteOffsetOrParams - Shift added to every stored pixel index before palette lookup (default
     *   0), or a {@link SpriteDrawParams} object.
     *
     * @example
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10));
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), 16); // blue team
     *
     * const params: SpriteDrawParams = { flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 }; // allocate once
     * params.flags = facingLeft ? BT.FLIP_H : 0;
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), params);
     * params.scale = 2; // double size
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), params);
     * params.scale = 1;
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Rect2i(10, 40, 48, 12), params); // stretch
     */
    drawSprite: ((
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i | Rect2i,
        paletteOffsetOrParams?: number | SpriteDrawParams,
    ): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawSprite');
            return;
        }

        try {
            if (spriteSheet instanceof Promise) {
                reportMissingAwait('SpriteSheet.load()');
                return;
            }

            // Dispatch reads argument 2, then argument 4: two typeof checks, no instanceof, no
            // allocation on the fast path. Later overloads slot into the non-object branch.
            if (typeof srcRect === 'object') {
                if (typeof paletteOffsetOrParams === 'object') {
                    BTAPI.instance.drawSpriteWithParams(spriteSheet, srcRect, destPos, paletteOffsetOrParams);
                } else {
                    // Typed callers cannot reach here with a Rect2i; untyped ones hit BTAPI's dev-mode guard.
                    BTAPI.instance.drawSprite(spriteSheet, srcRect, destPos as Vector2i, paletteOffsetOrParams);
                }

                return;
            }

            const srcType = typeof srcRect;
            throw new Error(
                srcType === 'string'
                    ? 'drawSprite does not accept a frame name yet; pass a Rect2i source rectangle'
                    : srcType === 'number'
                      ? 'drawSprite does not accept raw source numbers yet; pass a Rect2i source rectangle'
                      : `drawSprite expects a Rect2i source rectangle, got ${describeRuntimeType(srcRect)}`,
            );
        } catch (error) {
            reportDrawError(error);
        }
        // Object literals cannot declare overloads; the cast gives callers the typed forms. The
        // shipped fast path is declared first. gen-api-history.mjs unwraps the `as`.
    }) as {
        (spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void;
        (spriteSheet: SpriteSheet, src: Rect2i, dest: Vector2i | Rect2i, params: SpriteDrawParams): void;
    },

    /**
     * Draws one tile from a sprite sheet laid out as a grid of equal cells.
     *
     * Three forms:
     *
     * - `BT.drawTile(sheet, index, destPos, paletteOffset?)` - row-major index into the sheet's grid.
     * - `BT.drawTile(sheet, col, row, destPos, paletteOffset?)` - column and row in the sheet's grid.
     * - `BT.drawTile(sheet, col, row, tileSize, destPos, paletteOffset?)` - tile size given here, for sheets with no
     *   grid. `tileSize` is a number for square tiles or a `Vector2i` for width x height.
     *
     * The first two need a grid on the sheet: `SpriteSheet.load(url, { tileSize: 16 })`,
     * `SpriteSheet.loadIndexed(url, palette, slot, { tileSize: 16 })`, or `sheet.tileSize = 16`. Tiles are whole
     * cells counted from the top-left; a partial cell at the right or bottom edge is not a tile, and a tile outside
     * the grid is an error. `paletteOffset` works exactly as in {@link BT.drawSprite}.
     *
     * Allocation-free: the engine reuses one internal source rectangle. To flip, rotate, or scale a tile, pass
     * `sheet.tileRect(...)` to `BT.drawSprite` with a {@link SpriteDrawParams} object instead.
     *
     * @since 1.8.0
     * @param spriteSheet - Indexized sprite sheet.
     * @param colOrIndex - Tile index (first form) or column (other forms).
     * @param rowOrDestPos - Destination position (first form) or row (other forms).
     * @param arg4 - Palette offset (first form), destination position (second form), or tile size (third form).
     * @param arg5 - Palette offset (second form) or destination position (third form).
     * @param arg6 - Palette offset (third form).
     *
     * @example
     * const sheet = await SpriteSheet.load('/sprites/hero.png', { tileSize: 16 });
     * // ...after sheet.indexize(palette):
     * BT.drawTile(sheet, frame, new Vector2i(40, 60)); // by index
     * BT.drawTile(sheet, 2, 1, new Vector2i(40, 60)); // by column and row
     * BT.drawTile(otherSheet, 2, 1, 8, new Vector2i(40, 60)); // explicit 8x8 tiles
     */
    drawTile: ((
        spriteSheet: SpriteSheet,
        colOrIndex: number,
        rowOrDestPos: number | Vector2i,
        arg4?: number | Vector2i,
        arg5?: number | Vector2i,
        arg6?: number,
    ): void => {
        if (!isRendererReady()) {
            reportEngineNotReady('drawTile');
            return;
        }

        try {
            if (spriteSheet instanceof Promise) {
                reportMissingAwait('SpriteSheet.load()');
                return;
            }

            // Each form accepts exactly its own argument shapes; anything else falls through to the
            // wrong-arguments error below rather than being coerced.
            if (isVectorArg(rowOrDestPos)) {
                // (sheet, index, destPos, paletteOffset?)
                if (!isVectorArg(arg4)) {
                    BTAPI.instance.drawTile(spriteSheet, colOrIndex, undefined, rowOrDestPos, arg4);
                    return;
                }
            } else if (isVectorArg(arg5)) {
                // (sheet, col, row, tileSize, destPos, paletteOffset?)
                if (typeof arg4 === 'number' || isVectorArg(arg4)) {
                    const tileW = typeof arg4 === 'number' ? arg4 : arg4.x;
                    const tileH = typeof arg4 === 'number' ? arg4 : arg4.y;

                    BTAPI.instance.drawTileSized(spriteSheet, colOrIndex, rowOrDestPos, tileW, tileH, arg5, arg6);
                    return;
                }
            } else if (isVectorArg(arg4)) {
                // (sheet, col, row, destPos, paletteOffset?)
                BTAPI.instance.drawTile(spriteSheet, colOrIndex, rowOrDestPos, arg4, arg5);
                return;
            }

            const typeDetails = [colOrIndex, rowOrDestPos, arg4, arg5, arg6]
                .map(describeRuntimeType)
                .filter((part) => part !== 'undefined')
                .join(', ');
            showBeginnerRuntimeError(
                'drawTile expects (sheet, index, destPos), (sheet, col, row, destPos), or ' +
                    `(sheet, col, row, tileSize, destPos), each with an optional paletteOffset. Got: [sheet, ${typeDetails}]`,
                'Wrong drawTile Arguments',
            );
        } catch (error) {
            reportDrawError(error);
        }
        // Object literals cannot declare overloads; the cast gives callers the three typed forms.
        // gen-api-history.mjs unwraps the `as` and still classifies this member as a method.
    }) as {
        (spriteSheet: SpriteSheet, index: number, destPos: Vector2i, paletteOffset?: number): void;
        (spriteSheet: SpriteSheet, col: number, row: number, destPos: Vector2i, paletteOffset?: number): void;
        (
            spriteSheet: SpriteSheet,
            col: number,
            row: number,
            tileSize: number | Vector2i,
            destPos: Vector2i,
            paletteOffset?: number,
        ): void;
    },

    /**
     * Re-indexizes all tracked sprite sheets against the current active palette.
     *
     * Only call this after a **palette-layout swap** - when the same colors have
     * moved to different slot positions and existing sprite indices now point to
     * the wrong slots. Each sheet re-runs exact RGBA-to-index matching against the
     * active palette via `SpriteSheet.reindexize()`. If any opaque pixel's original
     * color is missing from the new palette, `reindexize()` throws, and
     * `spritesRefresh()` catches that error and removes the affected sheet from the
     * registry (it will no longer render).
     *
     * **Do not call this after a palette-value swap.** If you changed what color a
     * slot holds (e.g. palette animation, theme tinting), the stored indices are
     * still correct - the fragment shader picks up the new color automatically.
     * Calling `spritesRefresh()` in that case is wasteful at best; at worst, if the
     * original RGBA values are gone from the palette, sheets with missing colors
     * will fail reindexing and be removed from the registry.
     *
     * Typical usage after a layout swap:
     * ```ts
     * BT.paletteSet(newLayoutPalette);
     * BT.spritesRefresh(); // re-map all sheets to the new slot positions
     * ```
     *
     * @since 1.0.3
     * @throws If no active palette has been set.
     */
    spritesRefresh: (): void => {
        BTAPI.instance.spritesRefresh();
    },
};

/**
 * One-liner bootstrap function for BLIT386 demos.
 * Handles canvas retrieval and engine initialization. Backend selection
 * (WebGPU or software fallback) is managed internally by BTAPI.
 *
 * This function provides a streamlined way to start a demo with sensible defaults
 * while allowing customization through options.
 *
 * @since 0.2.0
 * @changed 1.4.0 Calling `bootstrap()` again while already initialized now routes to a hot
 *   swap (via {@link registerHotReload}) when a Vite HMR context is registered, or logs a
 *   double-bootstrap guard and returns `false` otherwise - previously it silently started a
 *   second, unstoppable `GameLoop`.
 * @changed 1.7.0 Exposes `BT` on `window.BT` after bootstrap finishes, gated by
 *   {@link BootstrapOptions.exposeGlobal} (default: {@link BT.isDevMode}).
 * @param DemoClass - Demo class constructor implementing `IBTDemo` (optional `configure()` for hardware settings).
 * @param options - Optional configuration for IDs and callbacks.
 * @returns `true` when the demo boots successfully; otherwise `false`.
 *
 * @example
 * // Simplest usage - uses default IDs.
 * bootstrap(MyDemo);
 *
 * @example
 * // With custom options.
 * bootstrap(MyDemo, {
 *     canvasID: 'custom-canvas',
 *     containerID: 'custom-container',
 *     onSuccess: () => console.log('Demo started!'),
 *     onError: (err) => analytics.trackError(err),
 * });
 *
 * @example
 * // Await the result.
 * const success = await bootstrap(MyDemo);
 * if (success) {
 *     console.log('Demo is running');
 * }
 */
async function bootstrap(DemoClass: DemoConstructor, options: BootstrapOptions = {}): Promise<boolean> {
    const success = await bootstrapImpl(DemoClass, options);

    exposeGlobal(BT, options.exposeGlobal);

    return success;
}

export {
    amber,
    applyEasing,
    AssetLoader,
    AudioClip,
    BarrelDistortion,
    BitmapFont,
    Bloom,
    bootstrap,
    ChromaticAberration,
    clampCameraToWorld,
    Color32,
    crtPipBoy,
    defaultConfig,
    displayError,
    Flicker,
    FullscreenEffect,
    FullscreenPixelEffect,
    getCanvas,
    green,
    hash1,
    hash1i,
    hash2,
    hash2i,
    hash3,
    hash3i,
    Interference,
    interpolate,
    mergeHardwareSettings,
    Noise,
    Palette,
    PerlinNoise,
    PixelGlitch,
    PixelMosaic,
    Random,
    Rect2i,
    registerHotReload,
    RGBMask,
    RollLine,
    Scanlines,
    SimplexNoise,
    SpriteSheet,
    Timer,
    ValueNoise,
    Vector2i,
    Vignette,
};
export type {
    AudioBus,
    Backend,
    BootstrapOptions,
    EasingFunction,
    Effect,
    EffectTier,
    ExposureFadeOptions,
    FrameCaptureOptions,
    FrameCaptureSize,
    HardwareSettings,
    HotContext,
    HotReloadContext,
    IBTDemo,
    KeyboardLayout,
    MusicPlayOptions,
    OverlayAudioMeterStyle,
    OverlayRow,
    OverlayStyle,
    OverlayTimingChartStyle,
    PreferredOrientation,
    SoundParamSetOptions,
    SoundPlayOptions,
    SoundRef,
    SoundStopOptions,
    SplashState,
    SpriteDrawParams,
    SynthEnvelope,
    SynthParams,
    SynthPitchSweep,
    SynthVibrato,
    SynthWaveform,
    TestStateSnapshot,
    TextSize,
};
export type { IndexedSpriteLoadResult };
