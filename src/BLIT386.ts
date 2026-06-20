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
import type { TextSize } from './assets/BitmapFont';
import { BitmapFont } from './assets/BitmapFont';
import { Palette } from './assets/Palette';
import type { IndexedSpriteLoadResult } from './assets/SpriteSheet';
import { SpriteSheet } from './assets/SpriteSheet';
import { BTAPI } from './core/BTAPI';
import {
    type Backend,
    defaultConfig,
    type HardwareSettings,
    type IBTDemo,
    mergeHardwareSettings,
    type OverlayRow,
    type OverlayStyle,
    type OverlayTimingChartStyle,
} from './core/IBTDemo';
import {
    createDefaultKeyboardRuntimeMaps,
    DEFAULT_KEYBOARD_PLAYER1,
    DEFAULT_KEYBOARD_PLAYER2,
    FACE_BUTTON_FLAGS,
    type FaceButtonCode,
} from './input/defaultKeyboardMap';
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
import type { BootstrapOptions } from './utils/Bootstrap';
import { bootstrap } from './utils/Bootstrap';
import { displayError, getCanvas } from './utils/BootstrapHelpers';
import { clampCameraToWorld } from './utils/CameraUtils';
import { Color32 } from './utils/Color32';
import type { EasingFunction } from './utils/Easing';
import { applyEasing } from './utils/Easing';
import { noActivePaletteError } from './utils/errorMessages';
import { Rect2i } from './utils/Rect2i';
import { Timer } from './utils/Timer';
import { Vector2i } from './utils/Vector2i';

/** Runtime face-button → key-code lists for keyboard player 0 (mutable via {@link BT.inputMap}). */
let keyboardFaceButtonKeysPlayer0: Map<number, string[]>;

/** Runtime face-button → key-code lists for keyboard player 1 (mutable via {@link BT.inputMap}). */
let keyboardFaceButtonKeysPlayer1: Map<number, string[]>;

/** Pointer button bit mask (`BTN_POINTER_A..D`). */
const POINTER_BUTTON_MASK = (1 << 12) | (1 << 13) | (1 << 14) | (1 << 15);
const POINTER_FLAGS = [1 << 12, 1 << 13, 1 << 14, 1 << 15] as const;

/** Face button bit mask (`BTN_UP..BTN_SELECT`). */
const FACE_BUTTON_MASK = (1 << 12) - 1;

/**
 * Replaces runtime keyboard maps with fresh copies of {@link DEFAULT_KEYBOARD_PLAYER1} /
 * {@link DEFAULT_KEYBOARD_PLAYER2}.
 */
function resetKeyboardFaceButtonMaps(): void {
    const [m0, m1] = createDefaultKeyboardRuntimeMaps();

    keyboardFaceButtonKeysPlayer0 = m0;
    keyboardFaceButtonKeysPlayer1 = m1;
}

resetKeyboardFaceButtonMaps();

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
 * Runs a draw call with readiness checks and beginner-friendly error handling.
 *
 * @param methodName - BT method name for contextual error text.
 * @param callback - Draw-call body to execute.
 */
function executeDrawCall(methodName: string, callback: () => void): void {
    if (!isRendererReady()) {
        reportEngineNotReady(methodName);
        return;
    }

    try {
        callback();
    } catch (error) {
        if (error instanceof Error) {
            showBeginnerRuntimeError(error.message);
        } else {
            showBeginnerRuntimeError(String(error));
        }
    }
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

    if (player === 0) {
        return keyboardFaceButtonKeysPlayer0.get(button as FaceButtonCode) ?? null;
    }

    if (player === 1) {
        return keyboardFaceButtonKeysPlayer1.get(button as FaceButtonCode) ?? null;
    }

    return null;
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
    /** Horizontal flip flag for sprite rendering. */
    FLIP_H: 1,

    /** Vertical flip flag for sprite rendering. */
    FLIP_V: 1 << 1,

    /** Rotate 90° clockwise flag for sprite rendering. */
    ROT_90_CW: 1 << 2,

    /** Rotate 180° flag for sprite rendering. */
    ROT_180_CW: 1 << 3,

    /** Rotate 270° clockwise flag for sprite rendering. */
    ROT_270_CW: 1 << 4,

    /** Up button bit flag. */
    BTN_UP: 1 << 0,

    /** Down button bit flag. */
    BTN_DOWN: 1 << 1,

    /** Left button bit flag. */
    BTN_LEFT: 1 << 2,

    /** Right button bit flag. */
    BTN_RIGHT: 1 << 3,

    /** A button bit flag. */
    BTN_A: 1 << 4,

    /** B button bit flag. */
    BTN_B: 1 << 5,

    /** X button bit flag. */
    BTN_X: 1 << 6,

    /** Y button bit flag. */
    BTN_Y: 1 << 7,

    /** Left shoulder button bit flag. */
    BTN_L: 1 << 8,

    /** Right shoulder button bit flag. */
    BTN_R: 1 << 9,

    /** Start button bit flag. */
    BTN_START: 1 << 10,

    /** Select button bit flag. */
    BTN_SELECT: 1 << 11,

    /**
     * Primary pointer button code.
     *
     * Maps to mouse left for slot 0; touch contact for slots 1-3.
     */
    BTN_POINTER_A: 1 << 12,

    /**
     * Secondary pointer button code.
     *
     * Maps to mouse right for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     */
    BTN_POINTER_B: 1 << 13,

    /**
     * Tertiary pointer button code.
     *
     * Maps to mouse middle for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     */
    BTN_POINTER_C: 1 << 14,

    /**
     * Auxiliary pointer button code.
     *
     * Maps to mouse back/forward extra buttons (DOM `PointerEvent.button`
     * 3 or 4) for slot 0. Always `false` for touch slots 1-3.
     */
    BTN_POINTER_D: 1 << 15,

    /** Player one index. */
    PLAYER_ONE: 0,

    /** Player two index. */
    PLAYER_TWO: 1,

    /** Player three index. */
    PLAYER_THREE: 2,

    /** Player four index. */
    PLAYER_FOUR: 3,

    /** Left stick horizontal axis index. */
    AXIS_LEFT_X: 0,

    /** Left stick vertical axis index. */
    AXIS_LEFT_Y: 1,

    /** Right stick horizontal axis index. */
    AXIS_RIGHT_X: 2,

    /** Right stick vertical axis index. */
    AXIS_RIGHT_Y: 3,

    /** Left trigger axis index (0.0 to 1.0). */
    AXIS_TRIGGER_L: 4,

    /** Right trigger axis index (0.0 to 1.0). */
    AXIS_TRIGGER_R: 5,

    /** All face buttons (A/B/X/Y). */
    BTN_ABXY: (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7),

    /** Both shoulder buttons. */
    BTN_SHOULDER: (1 << 8) | (1 << 9),

    /** Any pointer button (A/B/C/D). */
    BTN_POINTER_ANY: (1 << 12) | (1 << 13) | (1 << 14) | (1 << 15),

    /**
     * Default `KeyboardEvent.code` values for player index 0 (first keyboard player).
     */
    DEFAULT_KEYBOARD_PLAYER1,

    /**
     * Default `KeyboardEvent.code` values for player index 1 (second keyboard player).
     */
    DEFAULT_KEYBOARD_PLAYER2,

    /**
     * Initializes the engine against a demo instance and target canvas.
     *
     * The canvas element must be attached to the DOM before this call.
     * In Electron environments, wait for DOM-ready first.
     *
     * When not using {@link bootstrap}, set `canvas.tabIndex = 0` and call
     * `canvas.focus()` so keyboard events reach the canvas.
     *
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
     * @returns Current tick count since initialization or last reset.
     */
    get ticks(): number {
        return BTAPI.instance.getTicks();
    },

    /**
     * Resets the fixed-update tick counter back to zero.
     */
    ticksReset: (): void => {
        BTAPI.instance.resetTicks();
    },

    /**
     * Places a labeled marker on the overlay timing chart at the current tick.
     *
     * Requires `isOverlayTimingChartEnabled: true` in `configure()`. Tags scroll with the chart
     * history and are pruned when they leave the visible window. Empty labels become
     * `"Untitled"`. Chart width resets add an automatic `"Start"` tag.
     *
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
     * @returns `'webgpu'` or `'software'` after successful init; `null` before init or on failure.
     */
    get activeBackend(): Backend | null {
        return BTAPI.instance.getActiveBackend();
    },

    /**
     * Creates a standalone palette instance.
     *
     * @param size - Palette size. Defaults to 256 colors.
     * @returns New mutable palette.
     */
    paletteCreate: (size: number = 256): Palette => {
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
     * Starts rotating a range of palette entries at a constant speed.
     *
     * Classic water/fire/plasma animation technique. Runs indefinitely until
     * cancelled via {@link BT.paletteClearEffects}. Uses a fractional accumulator
     * for sub-frame precision.
     *
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
     * @param target - Target palette to fade toward.
     * @param durationMs - Fade duration in milliseconds.
     * @param easing - Easing curve. Defaults to `'linear'`.
     */
    paletteFade: (target: Palette, durationMs: number, easing?: EasingFunction): void => {
        BTAPI.instance.paletteFade(target, durationMs, easing);
    },

    /**
     * Fades only a subset of palette indices toward a target over time.
     *
     * Same as {@link BT.paletteFade} but restricted to the range `[start, end]`.
     * Indices outside the range are left untouched.
     *
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
     * @param indexA - First palette index.
     * @param indexB - Second palette index.
     */
    paletteSwap: (indexA: number, indexB: number): void => {
        BTAPI.instance.paletteSwap(indexA, indexB);
    },

    /**
     * Cancels all running palette effects immediately.
     *
     * The palette stays at whatever state it was in when cancelled.
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
     * @param effect - Effect instance to append.
     * When the engine is not ready, shows a canvas error instead of throwing.
     */
    effectAdd: (effect: Effect): void => {
        executeDrawCall('effectAdd', () => {
            BTAPI.instance.effectAdd(effect);
        });
    },

    /**
     * Removes a previously registered post-processing effect.
     *
     * Searches both tiers and disposes the effect from whichever chain holds
     * it. Removing an effect that was never added is a no-op.
     *
     * @param effect - Effect instance to remove.
     * When the engine is not ready, shows a canvas error instead of throwing.
     */
    effectRemove: (effect: Effect): void => {
        executeDrawCall('effectRemove', () => {
            BTAPI.instance.effectRemove(effect);
        });
    },

    /**
     * Removes every registered post-processing effect across both tiers.
     *
     * When the engine is not ready, shows a canvas error instead of throwing.
     */
    effectClear: (): void => {
        executeDrawCall('effectClear', () => {
            BTAPI.instance.effectClear();
        });
    },

    /**
     * Pre-configured display-tier effect stacks ("looks").
     *
     * Each function returns a fresh array of effects. Add them to the engine
     * via {@link BT.effectAdd}.
     *
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
     * @param paletteIndex - Palette index for the full-screen clear pass.
     */
    clear: (paletteIndex: number): void => {
        executeDrawCall('clear', () => {
            BTAPI.instance.setClearColor(paletteIndex);
        });
    },

    /**
     * Fills a rectangular display region with a palette-indexed color.
     *
     * @param rect - Rectangle in display pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    clearRect: (rect: Rect2i, paletteIndex: number): void => {
        executeDrawCall('clearRect', () => {
            BTAPI.instance.clearRect(rect, paletteIndex);
        });
    },

    /**
     * Draws a single pixel.
     *
     * Accepts either:
     * - `(posOrX: Vector2i, yOrColor: number)` where `yOrColor` is the palette index.
     * - `(posOrX: number, yOrColor: number, maybeColor: number)` for `(x, y, paletteIndex)`.
     *
     * @param posOrX - Pixel position as `Vector2i`, or x coordinate when using numeric overload.
     * @param yOrColor - Palette index for vector overload, or y coordinate for numeric overload.
     * @param maybeColor - Palette index when using numeric overload.
     */
    drawPixel: (posOrX: Vector2i | number, yOrColor: number, maybeColor?: number): void => {
        executeDrawCall('drawPixel', () => {
            if (posOrX instanceof Vector2i && maybeColor === undefined) {
                BTAPI.instance.drawPixel(new Vector2i(posOrX.x, posOrX.y), yOrColor);
                return;
            }

            if (typeof posOrX === 'number' && typeof maybeColor === 'number') {
                BTAPI.instance.drawPixel(new Vector2i(posOrX, yOrColor), maybeColor);
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
        });
    },

    /**
     * Draws a pixel-perfect line between two points.
     *
     * Uses rasterized line drawing without antialiasing.
     *
     * @param p0 - Start position in display coordinates.
     * @param p1 - End position in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawLine: (p0: Vector2i, p1: Vector2i, paletteIndex: number): void => {
        executeDrawCall('drawLine', () => {
            BTAPI.instance.drawLine(p0, p1, paletteIndex);
        });
    },

    /**
     * Draws an unfilled rectangle outline.
     *
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRect: (rect: Rect2i, paletteIndex: number): void => {
        executeDrawCall('drawRect', () => {
            BTAPI.instance.drawRect(rect, paletteIndex);
        });
    },

    /**
     * Draws a filled rectangle.
     *
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill: (rect: Rect2i, paletteIndex: number): void => {
        executeDrawCall('drawRectFill', () => {
            BTAPI.instance.drawRectFill(rect, paletteIndex);
        });
    },

    /**
     * Sets the global camera offset applied to subsequent draw calls.
     *
     * @param offset - Camera translation in display pixels.
     */
    cameraSet: (offset: Vector2i): void => {
        BTAPI.instance.setCameraOffset(offset);
    },

    /**
     * Current global camera offset (clone; safe to mutate without affecting the engine).
     *
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
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Pointer position in display coordinates.
     */
    pointerPos: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getPos(pointerIndex) ?? Vector2i.zero();
    },

    /**
     * Returns the position delta `(pos - prevPos)` for a pointer slot since the previous frame.
     *
     * Reflects movement accumulated between the previous and current frame.
     * Snapshotted and reset by the engine at `endFrame()`, which runs after
     * `update()` and `render()`. Returns `Vector2i.zero()` when the engine is
     * not initialized or `pointerIndex` is out of range.
     *
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns Per-frame movement in display coordinates.
     */
    pointerDelta: (pointerIndex: number = 0): Vector2i => {
        return BTAPI.instance.getPointer()?.getDelta(pointerIndex) ?? Vector2i.zero();
    },

    /**
     * Reports whether the given pointer slot has a live pointer.
     *
     * For slot 0 (mouse) this is true while the mouse is hovering inside the
     * canvas; cleared on `pointerleave`. For slots 1-3 (touch / pen) this is
     * true while the contact is down.
     *
     * @param pointerIndex - Pointer slot (defaults to 0 = mouse).
     * @returns `true` while the slot has live position data.
     */
    isPointerActive: (pointerIndex: number = 0): boolean => {
        return BTAPI.instance.getPointer()?.isActive(pointerIndex) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isPointerActive}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isPointerActive} instead.
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
     *
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
     */
    hideCursor: (): void => {
        BTAPI.instance.getPointer()?.hideCursor();
    },

    /**
     * Restores the native OS cursor over the canvas.
     *
     * Reverses a prior {@link hideCursor} call. No-op before the engine is
     * initialized.
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

        return false;
    },

    /**
     * Backward-compatible alias for {@link isDown}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isDown} instead.
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

        return false;
    },

    /**
     * Backward-compatible alias for {@link isPressed}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isPressed} instead.
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

        return false;
    },

    /**
     * Backward-compatible alias for {@link isReleased}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isReleased} instead.
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

        const codes = [...keys];

        if (player === 0) {
            keyboardFaceButtonKeysPlayer0.set(button, codes);
        } else {
            keyboardFaceButtonKeysPlayer1.set(button, codes);
        }
    },

    /**
     * Restores built-in default keyboard maps for players `0` and `1`.
     *
     * Same tables as `BT.DEFAULT_KEYBOARD_PLAYER1` and `BT.DEFAULT_KEYBOARD_PLAYER2`.
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
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    isGamepadConnected: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isConnected(player) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isGamepadConnected}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isGamepadConnected} instead.
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    gamepadConnected: (player: number = 0): boolean => {
        return BT.isGamepadConnected(player);
    },

    /**
     * Number of currently connected gamepads (max 4).
     *
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
     * @param key - DOM keyboard code string.
     * @returns `true` while the key remains pressed.
     */
    isKeyDown: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyDown(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyDown}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isKeyDown} instead.
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
     * @deprecated Deprecated since 2026-05-31. Use {@link isKeyPressed} instead.
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
     * @param key - DOM keyboard code string.
     * @returns `true` on the release edge.
     */
    isKeyReleased: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyReleased(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyReleased}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isKeyReleased} instead.
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
     * @returns Characters typed since the last fixed-update flush.
     */
    get inputString(): string {
        return BTAPI.instance.getKeyboard()?.getInputString() ?? '';
    },

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font covers printable ASCII (characters 32-126). For custom
     * bitmap fonts with proportional glyphs, use {@link BT.printFont} instead.
     *
     * @param pos - Text origin in display coordinates.
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to render.
     */
    systemPrint: (pos: Vector2i, paletteIndex: number, text: string): void => {
        executeDrawCall('systemPrint', () => {
            BTAPI.instance.drawSystemText(pos, paletteIndex, text);
        });
    },

    /**
     * Measures the pixel dimensions of a string rendered with the built-in
     * system font.
     *
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
     * @param font - Font asset used for rendering.
     * @param pos - Text origin in display coordinates.
     * @param text - String to render.
     * @param paletteOffset - Shift added to every stored glyph index before palette lookup (default 0).
     */
    printFont: (font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void => {
        executeDrawCall('printFont', () => {
            if (font instanceof Promise) {
                reportMissingAwait('BitmapFont.load()');
                return;
            }

            BTAPI.instance.drawBitmapText(font, pos, text, paletteOffset);
        });
    },

    /**
     * Captures the next rendered frame as a PNG blob.
     *
     * The returned promise resolves after the next render pass has completed.
     *
     * @returns PNG image data for the captured frame.
     *
     * @example
     * const blob = await BT.captureFrame();
     * const url = URL.createObjectURL(blob);
     * console.log('Captured frame:', url);
     */
    captureFrame: async (): Promise<Blob> => {
        return await BTAPI.instance.captureFrame();
    },

    /**
     * Captures the next rendered frame and downloads it from the browser.
     *
     * Convenience wrapper around {@link BT.captureFrame} that creates a temporary
     * object URL and clicks a synthetic anchor element.
     *
     * @param filename - Target download filename.
     *
     * @example
     * await BT.downloadFrame();
     * await BT.downloadFrame('screenshot-001.png');
     */
    downloadFrame: async (filename: string = 'blit386-capture.png'): Promise<void> => {
        const blob = await BTAPI.instance.captureFrame();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);
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
     * @param spriteSheet - Indexed sprite sheet.
     * @param srcRect - Source rectangle within the sprite sheet, in pixels.
     * @param destPos - Destination top-left position in display coordinates.
     * @param paletteOffset - Shift added to every stored pixel index before palette lookup (default 0).
     *
     * @example
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10));
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), 16); // blue team
     */
    drawSprite: (spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void => {
        executeDrawCall('drawSprite', () => {
            if (spriteSheet instanceof Promise) {
                reportMissingAwait('SpriteSheet.load()');
                return;
            }

            BTAPI.instance.drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
        });
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
     * @throws If no active palette has been set.
     */
    spritesRefresh: (): void => {
        BTAPI.instance.spritesRefresh();
    },
};

export {
    amber,
    applyEasing,
    AssetLoader,
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
    Interference,
    mergeHardwareSettings,
    Noise,
    Palette,
    PixelGlitch,
    PixelMosaic,
    Rect2i,
    RGBMask,
    RollLine,
    Scanlines,
    SpriteSheet,
    Timer,
    Vector2i,
    Vignette,
};
export type {
    Backend,
    BootstrapOptions,
    EasingFunction,
    Effect,
    EffectTier,
    HardwareSettings,
    IBTDemo,
    OverlayRow,
    OverlayStyle,
    OverlayTimingChartStyle,
    TextSize,
};
export type { IndexedSpriteLoadResult };
