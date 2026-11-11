/**
 * Default hardware settings and the merge that turns a game's `configure()` result into the
 * {@link HardwareSettings} the engine runs with, plus the overlay diagnostics switches derived from them.
 * The settings types themselves live in `IBTDemo.ts`.
 */

import { DEFAULT_MAX_CANVAS_SIZE } from '../utils/CanvasLayoutStyles';
import type { Color32 } from '../utils/Color32';
import { keyboardLayoutUnknownWarning } from '../utils/errorMessages';
import { Vector2i } from '../utils/Vector2i';
import { type HardwareSettings, KEYBOARD_LAYOUTS, type KeyboardLayout } from './IBTDemo';

/** Default SFX voice slot count; read by {@link defaultConfig} and the audio attach fallback in `BTAPI`. */
export const DEFAULT_AUDIO_VOICES = 16;

/** Most SFX voice slots `HardwareSettings.audioVoices` may ask for; `BT.init()` rejects more. */
export const MAX_AUDIO_VOICES = 64;

/**
 * Creates a fresh default hardware configuration for quick demos.
 *
 * Matches the most common setup across BLIT386 demos: `320x240` logical resolution,
 * `640x480` canvas output (2x nearest upscale), `60` FPS fixed updates, and the engine
 * overlay enabled.
 *
 * @since 1.0.3
 * @returns Default HardwareSettings configuration.
 */
export function defaultConfig(): HardwareSettings {
    return {
        displaySize: new Vector2i(320, 240),
        drawingBufferSize: new Vector2i(640, 480),
        maxCanvasSize: new Vector2i(DEFAULT_MAX_CANVAS_SIZE.x, DEFAULT_MAX_CANVAS_SIZE.y),
        targetFPS: 60,
        outputUpscaleFilter: 'nearest',
        backend: 'webgpu',
        audioVoices: DEFAULT_AUDIO_VOICES,
        isCapturingPointerScroll: false,
        isCapturingKeyboardScroll: false,
        isWakeLockEnabled: false,
        preferredOrientation: 'any',
        keyboardLayout: 'versus',
        isOverlayEnabled: true,
        isOverlayVisibleAtStart: false,
        isOverlayToggleHintVisible: true,
        isOverlayToggleEnabled: true,
        isOverlayToggleHitDebugVisible: false,
        isOverlayPaletteEnabled: false,
        isOverlayTimingChartEnabled: false,
        isOverlayAudioMetersEnabled: false,
    };
}

/**
 * Clones a {@link Vector2i} so merged settings do not share mutable references.
 *
 * @param size - Source vector.
 * @returns Fresh vector with the same components.
 */
function cloneVector2i(size: Vector2i): Vector2i {
    return new Vector2i(size.x, size.y);
}

/** Non-positive sentinel surfaced when configure() passes null vectors; rejected by {@link validateDimensions}. */
const INVALID_CONFIGURE_VECTOR_SIZE = new Vector2i(0, 0);

/** Legacy-to-current boolean field aliases accepted by configure() compatibility handling. */
const DEPRECATED_BOOLEAN_ALIASES = [
    { current: 'isDetectingDroppedFrames', legacy: 'detectDroppedFrames' },
    { current: 'isOverlayEnabled', legacy: 'overlayEnabled' },
    { current: 'isOverlayVisibleAtStart', legacy: 'overlayVisibleAtStart' },
    { current: 'isOverlayToggleHintVisible', legacy: 'overlayToggleHintVisible' },
    { current: 'isOverlayToggleEnabled', legacy: 'overlayToggleEnabled' },
    { current: 'isOverlayPaletteEnabled', legacy: 'overlayPaletteView' },
    { current: 'isOverlayTimingChartEnabled', legacy: 'overlayTimingChart' },
    { current: 'isOverlayRendererDiagnosticsBarEnabled', legacy: 'overlayRendererDiagnosticsBar' },
] as const;

/** How {@link pickDefinedHardwareSettings} copies one `configure()` field into the merged settings. */
type PickKind = 'value' | 'vector' | 'color' | 'record' | 'keyboardLayout';

/** Deprecated {@link HardwareSettings} keys; {@link normalizeDeprecatedHardwareSettings} maps them onto current keys. */
type DeprecatedKey = (typeof DEPRECATED_BOOLEAN_ALIASES)[number]['legacy'];

/**
 * Every current {@link HardwareSettings} field, named once, with how its `configure()` value is copied.
 *
 * The `satisfies` clause makes a new field without an entry here a type error, so neither merge path can
 * silently drop it. Fields that {@link defaultConfig} leaves out (`isSplashEnabled`, the splash colors,
 * `isFrameCaptureShortcutEnabled`, ...) stay unset unless `configure()` sets them - the splash gating and the
 * dev-mode capture shortcut resolve an unset value themselves.
 */
const FIELD_PICK_KINDS = {
    displaySize: 'vector',
    drawingBufferSize: 'vector',
    maxCanvasSize: 'vector',
    outputUpscaleFilter: 'value',
    targetFPS: 'value',
    isDetectingDroppedFrames: 'value',
    isCapturingPointerScroll: 'value',
    isCapturingKeyboardScroll: 'value',
    isWakeLockEnabled: 'value',
    preferredOrientation: 'value',
    keyboardLayout: 'keyboardLayout',
    isSplashEnabled: 'value',
    splashColorDark: 'color',
    splashColorLight: 'color',
    isFrameCaptureShortcutEnabled: 'value',
    backend: 'value',
    audioVoices: 'value',
    isOverlayEnabled: 'value',
    isOverlayVisibleAtStart: 'value',
    isOverlayToggleHintVisible: 'value',
    isOverlayToggleEnabled: 'value',
    isOverlayToggleHitDebugVisible: 'value',
    isOverlayPaletteEnabled: 'value',
    overlayPaletteColumns: 'value',
    overlayPaletteRowsVisible: 'value',
    overlayStyle: 'record',
    isOverlayTimingChartEnabled: 'value',
    overlayTimingChartHeight: 'value',
    overlayTimingChartStyle: 'record',
    overlayTimingChartDiagnostics: 'value',
    isOverlayRendererDiagnosticsBarEnabled: 'value',
    isOverlayAudioMetersEnabled: 'value',
    overlayAudioMeterHeight: 'value',
    overlayAudioMeterStyle: 'record',
} as const satisfies Record<Exclude<keyof HardwareSettings, DeprecatedKey>, PickKind>;

/** Keys of {@link FIELD_PICK_KINDS}, in table order. */
const FIELD_KEYS = Object.keys(FIELD_PICK_KINDS) as (keyof typeof FIELD_PICK_KINDS)[];

/**
 * Validates a defined {@link HardwareSettings.keyboardLayout}: unknown values (possible from untyped JS
 * `configure()` code) log a warning and resolve to the `'versus'` fallback, on both merge paths.
 *
 * @param value - Raw `keyboardLayout` value from `configure()`.
 * @returns The layout when it is a known {@link KeyboardLayout}, otherwise `'versus'`.
 */
function pickKeyboardLayout(value: unknown): KeyboardLayout {
    if ((KEYBOARD_LAYOUTS as readonly unknown[]).includes(value)) {
        return value as KeyboardLayout;
    }

    console.warn(`[BT] ${keyboardLayoutUnknownWarning(value, KEYBOARD_LAYOUTS)}`);

    return KEYBOARD_LAYOUTS[0];
}

/**
 * Copies one defined `configure()` value, cloning vectors, colors and style records so merged settings do
 * not share mutable references with the demo's `configure()` return value.
 *
 * @param kind - How the field is copied, from {@link FIELD_PICK_KINDS}.
 * @param value - Defined, non-null raw value.
 * @returns The value to store in the merged settings.
 */
function pickValue(kind: PickKind, value: unknown): unknown {
    switch (kind) {
        case 'vector':
            return cloneVector2i(value as Vector2i);
        case 'color':
            return (value as Color32).clone();
        case 'record':
            return { ...(value as object) };
        case 'keyboardLayout':
            return pickKeyboardLayout(value);
        default:
            return value;
    }
}

/**
 * Copies only the set fields of a `configure()` return value.
 *
 * `undefined` and `null` both count as unset, except on a vector field: there `null` becomes
 * {@link INVALID_CONFIGURE_VECTOR_SIZE} so {@link validateDimensions} rejects it with a clear error.
 * Deprecated and unknown keys are never copied.
 *
 * @param partial - Normalized values returned by the demo's `configure()` hook.
 * @returns Partial settings containing only set entries, with vectors, colors and records cloned.
 */
function pickDefinedHardwareSettings(partial: Partial<HardwareSettings>): Partial<HardwareSettings> {
    const picked: Record<string, unknown> = {};

    for (const key of FIELD_KEYS) {
        // eslint-disable-next-line security/detect-object-injection -- key comes from FIELD_PICK_KINDS
        const kind = FIELD_PICK_KINDS[key];
        // eslint-disable-next-line security/detect-object-injection -- key comes from FIELD_PICK_KINDS
        const value: unknown = partial[key];

        if (value === null && kind === 'vector') {
            // eslint-disable-next-line security/detect-object-injection -- key comes from FIELD_PICK_KINDS
            picked[key] = INVALID_CONFIGURE_VECTOR_SIZE.clone();
        } else if (value !== undefined && value !== null) {
            // eslint-disable-next-line security/detect-object-injection -- key comes from FIELD_PICK_KINDS
            picked[key] = pickValue(kind, value);
        }
    }

    return picked as Partial<HardwareSettings>;
}

/**
 * Normalizes deprecated configure() keys onto current HardwareSettings fields.
 *
 * New names always win when both are provided in the same object.
 *
 * @param partial - Raw values returned by configure().
 * @returns Partial settings with legacy keys mapped to current keys.
 */
function normalizeDeprecatedHardwareSettings(partial: Partial<HardwareSettings>): Partial<HardwareSettings> {
    const normalized = { ...partial };

    for (const alias of DEPRECATED_BOOLEAN_ALIASES) {
        const currentValue = normalized[alias.current];

        const legacyValue = partial[alias.legacy];

        if (currentValue === undefined && legacyValue !== undefined) {
            normalized[alias.current] = legacyValue;
        }
    }

    return normalized;
}

/**
 * Optional {@link defaultConfig} fields the explicit-`displaySize` path still fills when `configure()` omits
 * them; every other optional (such as `drawingBufferSize`) stays unset on that path.
 */
const EXPLICIT_PROFILE_DEFAULT_KEYS = [
    'isOverlayEnabled',
    'isOverlayVisibleAtStart',
    'isOverlayToggleHintVisible',
    'isOverlayToggleEnabled',
    'isOverlayPaletteEnabled',
    'backend',
] as const satisfies readonly (keyof HardwareSettings)[];

/**
 * Baseline for the explicit-`displaySize` path: the required fields plus
 * {@link EXPLICIT_PROFILE_DEFAULT_KEYS}. `displaySize` is always replaced by the picked value on this path.
 *
 * @param defaults - Baseline hardware settings; {@link defaultConfig} sets every key copied here.
 * @returns Settings with only the fields the explicit path always fills.
 */
function explicitProfileBase(defaults: HardwareSettings): HardwareSettings {
    return {
        displaySize: defaults.displaySize,
        targetFPS: defaults.targetFPS,
        // eslint-disable-next-line security/detect-object-injection -- key comes from EXPLICIT_PROFILE_DEFAULT_KEYS
        ...Object.fromEntries(EXPLICIT_PROFILE_DEFAULT_KEYS.map((key) => [key, defaults[key]])),
    } as HardwareSettings;
}

/**
 * Turns on keyboard scroll capture for the `'single'` {@link KeyboardLayout} when
 * `configure()` left {@link HardwareSettings.isCapturingKeyboardScroll} unset - the arrow
 * keys then steer player 0, so they should not also scroll the host page.
 *
 * @param merged - Resolved settings from either merge path.
 * @param picked - Defined fields from `configure()`.
 * @returns `merged`, with `isCapturingKeyboardScroll` forced on when the rule applies.
 */
function applyKeyboardLayoutScrollCapture(
    merged: HardwareSettings,
    picked: Partial<HardwareSettings>,
): HardwareSettings {
    if (merged.keyboardLayout === 'single' && picked.isCapturingKeyboardScroll === undefined) {
        merged.isCapturingKeyboardScroll = true;
    }

    return merged;
}

/**
 * Resolves demo `configure()` output into complete {@link HardwareSettings}.
 *
 * When `displaySize` is omitted from `partial`, unset fields inherit from
 * {@link defaultConfig} (including `drawingBufferSize` and `isOverlayEnabled`).
 * When `displaySize` is provided, only fields present in `partial` are applied;
 * omitted optionals such as `drawingBufferSize` remain unset so the drawing buffer
 * can match logical resolution. `isOverlayEnabled` defaults to `true` when omitted.
 *
 * @since 1.0.5
 * @param partial - Optional partial settings from `configure()`.
 * @returns Resolved hardware settings for initialization.
 */
export function mergeHardwareSettings(partial?: Partial<HardwareSettings>): HardwareSettings {
    const defaults = defaultConfig();

    if (partial === undefined) {
        return defaults;
    }

    const normalized = normalizeDeprecatedHardwareSettings(partial);
    const picked = pickDefinedHardwareSettings(normalized);
    const base = normalized.displaySize === undefined ? defaults : explicitProfileBase(defaults);

    return applyKeyboardLayoutScrollCapture({ ...base, ...picked }, picked);
}

/** Resolved timing-chart renderer diagnostic visualization mode. */
export type OverlayTimingChartDiagnosticsMode = false | 'minimal' | 'rich';

/** The two {@link HardwareSettings} fields {@link resolveOverlayTimingChartDiagnostics} reads. */
type TimingChartDiagnosticsSettings = {
    readonly overlayTimingChartDiagnostics?: OverlayTimingChartDiagnosticsMode | undefined;
    readonly isOverlayTimingChartEnabled?: boolean | undefined;
};

/**
 * Resolves {@link HardwareSettings.overlayTimingChartDiagnostics} for runtime overlay/chart code.
 *
 * Defaults to `'minimal'` when the timing chart is enabled and the field is omitted; `false` otherwise.
 *
 * @param settings - Resolved hardware settings, or the overlay's subset of them.
 * @returns Chart diagnostic visualization mode.
 */
export function resolveOverlayTimingChartDiagnostics(
    settings: TimingChartDiagnosticsSettings,
): OverlayTimingChartDiagnosticsMode {
    if (settings.overlayTimingChartDiagnostics !== undefined) {
        return settings.overlayTimingChartDiagnostics;
    }

    return settings.isOverlayTimingChartEnabled === true ? 'minimal' : false;
}

/**
 * Whether BTAPI should collect WebGPU renderer diagnostic counters this frame.
 *
 * @param settings - Resolved hardware settings.
 * @returns `true` when chart diagnostics or the renderer diagnostics bar needs data.
 */
export function needsOverlayRendererDiagnostics(settings: HardwareSettings): boolean {
    return (
        resolveOverlayTimingChartDiagnostics(settings) !== false ||
        settings.isOverlayRendererDiagnosticsBarEnabled === true
    );
}
