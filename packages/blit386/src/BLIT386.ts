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
import type {
    AudioClipLoadOptions,
    AudioClipLoadPhase,
    AudioClipProgress,
    AudioClipProgressCallback,
} from './assets/AudioClip';
import { AudioClip } from './assets/AudioClip';
import type { Glyph, TextSize } from './assets/BitmapFont';
import { BitmapFont } from './assets/BitmapFont';
import type { NineSliceMode, NineSliceOptions } from './assets/NineSlice';
import { NineSlice } from './assets/NineSlice';
import { Palette, type PaletteJSON } from './assets/Palette';
import type { ExposureFadeOptions } from './assets/PaletteEffect';
import type { IndexedSpriteLoadResult, SpriteSheetStatus, SpriteUV } from './assets/SpriteSheet';
import { SpriteSheet } from './assets/SpriteSheet';
import type {
    SynthEnvelope,
    SynthParams,
    SynthPitchSweep,
    SynthVibrato,
    SynthWaveform,
} from './assets/synth/SynthParams';
import type { MusicPlayOptions } from './audio/MusicPlayer';
import type { SoundParamSetOptions, SoundPlayOptions, SoundRef, SoundStopOptions } from './audio/VoicePool';
import { audio } from './bt/audio';
import { buttons } from './bt/buttons';
import { camera } from './bt/camera';
import { constants } from './bt/constants';
import { draw } from './bt/draw';
import { effects } from './bt/effects';
import { lifecycle } from './bt/lifecycle';
import { palette } from './bt/palette';
import { pointer } from './bt/pointer';
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
    type OutputUpscaleFilter,
    type OverlayAudioMeterStyle,
    type OverlayRow,
    type OverlayStyle,
    type OverlayTimingChartStyle,
    type PreferredOrientation,
    type RenderAtFrom,
    type RenderAtOptions,
    type TestStateSnapshot,
} from './core/IBTDemo';
import type { HotContext } from './hot/HotRuntime';
import { registerHotReload } from './hot/HotRuntime';
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
import type { SplashState } from './splash';
import type { BootstrapOptions, DemoConstructor } from './utils/Bootstrap';
import { bootstrap as bootstrapImpl } from './utils/Bootstrap';
import { displayError, type ErrorContent, getCanvas } from './utils/BootstrapHelpers';
import { clampCameraToWorld } from './utils/CameraUtils';
import { Color32 } from './utils/Color32';
import type { EasingFunction } from './utils/Easing';
import { applyEasing, interpolate } from './utils/Easing';
import type { FrameCaptureOptions, FrameCaptureSize } from './utils/FrameCapture';
import { exposeGlobal, exposeInputTrace } from './utils/globalExpose';
import { hash1, hash1i, hash2, hash2i, hash3, hash3i } from './utils/hash';
import { PerlinNoise } from './utils/PerlinNoise';
import { Random } from './utils/Random';
import { Rect2i } from './utils/Rect2i';
import { SimplexNoise } from './utils/SimplexNoise';
import { Timer } from './utils/Timer';
import { ValueNoise } from './utils/ValueNoise';
import { Vector2i } from './utils/Vector2i';

/**
 * Main BLIT386 API namespace used by runtime demos. Assembled from the parts in `src/bt/` with property descriptors, so
 * getters stay getters.
 */
export const BT = Object.defineProperties(
    {},
    {
        ...Object.getOwnPropertyDescriptors(constants),
        ...Object.getOwnPropertyDescriptors(lifecycle),
        ...Object.getOwnPropertyDescriptors(audio),
        ...Object.getOwnPropertyDescriptors(palette),
        ...Object.getOwnPropertyDescriptors(effects),
        ...Object.getOwnPropertyDescriptors(draw),
        ...Object.getOwnPropertyDescriptors(camera),
        ...Object.getOwnPropertyDescriptors(pointer),
        ...Object.getOwnPropertyDescriptors(buttons),
    },
) as typeof constants &
    typeof lifecycle &
    typeof audio &
    typeof palette &
    typeof effects &
    typeof draw &
    typeof camera &
    typeof pointer &
    typeof buttons;

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
 *   {@link BootstrapOptions.exposeGlobal} (default: {@link BT.isDevMode}). It is exposed on every path, a failed
 *   boot included, so the console can still inspect the engine; a harness that waits for a running game should
 *   poll `window.BT?.isReady`, not the presence of `window.BT`.
 * @changed 1.8.1 An `onSuccess` callback that throws is logged and no longer replaces the running game with an
 *   error panel, fires `onError`, or makes `bootstrap()` resolve `false`.
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
    exposeInputTrace(BTAPI.instance.inputTrace, options.exposeGlobal);

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
    NineSlice,
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
    AudioClipLoadOptions,
    AudioClipLoadPhase,
    AudioClipProgress,
    AudioClipProgressCallback,
    Backend,
    BootstrapOptions,
    DemoConstructor,
    EasingFunction,
    Effect,
    EffectTier,
    ErrorContent,
    ExposureFadeOptions,
    FrameCaptureOptions,
    FrameCaptureSize,
    Glyph,
    HardwareSettings,
    HotContext,
    HotReloadContext,
    IBTDemo,
    KeyboardLayout,
    MusicPlayOptions,
    NineSliceMode,
    NineSliceOptions,
    OutputUpscaleFilter,
    OverlayAudioMeterStyle,
    OverlayRow,
    OverlayStyle,
    OverlayTimingChartStyle,
    PaletteJSON,
    PreferredOrientation,
    RenderAtFrom,
    RenderAtOptions,
    SoundParamSetOptions,
    SoundPlayOptions,
    SoundRef,
    SoundStopOptions,
    SplashState,
    SpriteDrawParams,
    SpriteSheetStatus,
    SpriteUV,
    SynthEnvelope,
    SynthParams,
    SynthPitchSweep,
    SynthVibrato,
    SynthWaveform,
    TestStateSnapshot,
    TextSize,
};
export type { IndexedSpriteLoadResult };
