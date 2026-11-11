/**
 * Characterization tests for {@link mergeHardwareSettings}: pin the exact output of both
 * merge paths (no `displaySize` -> full defaults; explicit `displaySize` -> only the
 * fields `configure()` set plus the required defaults), including which keys stay unset.
 *
 * `toStrictEqual` fails on an extra key, a missing key, or a key present as `undefined`,
 * so any change to which keys either path sets shows up here. `hasHardReloadDiff` in
 * `src/hot/HotSwap.ts` diffs these merged objects, so a newly appearing key matters.
 */

import { describe, expect, it } from 'vitest';

import { Color32 } from '../utils/Color32';
import { Vector2i } from '../utils/Vector2i';
import type { HardwareSettings } from './IBTDemo';
import { defaultConfig, mergeHardwareSettings } from './mergeHardwareSettings';

const NULL_VECTOR = null as unknown as Vector2i;

/** Every current (non-deprecated) field, each set to a non-default value. */
function everyFieldSet(): Partial<HardwareSettings> {
    return {
        drawingBufferSize: new Vector2i(400, 300),
        maxCanvasSize: new Vector2i(800, 600),
        outputUpscaleFilter: 'linear',
        targetFPS: 30,
        isDetectingDroppedFrames: true,
        isCapturingPointerScroll: true,
        isCapturingKeyboardScroll: false,
        isWakeLockEnabled: true,
        preferredOrientation: 'landscape',
        keyboardLayout: 'single',
        isSplashEnabled: false,
        splashColorDark: new Color32(1, 2, 3, 255),
        splashColorLight: new Color32(250, 251, 252, 255),
        isFrameCaptureShortcutEnabled: true,
        backend: 'software',
        audioVoices: 8,
        isOverlayEnabled: false,
        isOverlayVisibleAtStart: true,
        isOverlayToggleHintVisible: false,
        isOverlayToggleEnabled: false,
        isOverlayToggleHitDebugVisible: true,
        isOverlayPaletteEnabled: true,
        overlayPaletteColumns: 16,
        overlayPaletteRowsVisible: 4,
        overlayStyle: { barPaletteIndex: 1, textPaletteIndex: 2 },
        isOverlayTimingChartEnabled: true,
        overlayTimingChartHeight: 24,
        overlayTimingChartStyle: { updateBarPaletteIndex: 3 },
        overlayTimingChartDiagnostics: 'rich',
        isOverlayRendererDiagnosticsBarEnabled: true,
        isOverlayAudioMetersEnabled: true,
        overlayAudioMeterHeight: 12,
        overlayAudioMeterStyle: { levelBarPaletteIndex: 5 },
    };
}

/** Defaults the explicit-`displaySize` path fills even when `configure()` omits them. */
function explicitPathDefaults(displaySize: Vector2i): HardwareSettings {
    return {
        displaySize,
        targetFPS: 60,
        isOverlayEnabled: true,
        isOverlayVisibleAtStart: false,
        isOverlayToggleHintVisible: true,
        isOverlayToggleEnabled: true,
        isOverlayPaletteEnabled: false,
        backend: 'webgpu',
    };
}

const LEGACY_ONLY = {
    detectDroppedFrames: true,
    overlayEnabled: false,
    overlayVisibleAtStart: true,
    overlayToggleHintVisible: false,
    overlayToggleEnabled: false,
    overlayPaletteView: true,
    overlayTimingChart: true,
    overlayRendererDiagnosticsBar: true,
} satisfies Partial<HardwareSettings>;

const LEGACY_MAPPED = {
    isDetectingDroppedFrames: true,
    isOverlayEnabled: false,
    isOverlayVisibleAtStart: true,
    isOverlayToggleHintVisible: false,
    isOverlayToggleEnabled: false,
    isOverlayPaletteEnabled: true,
    isOverlayTimingChartEnabled: true,
    isOverlayRendererDiagnosticsBarEnabled: true,
} satisfies Partial<HardwareSettings>;

const INVALID = new Vector2i(0, 0);

describe('mergeHardwareSettings characterization - default path (no displaySize)', () => {
    it('keeps every field set in configure() and fills displaySize from defaults', () => {
        expect(mergeHardwareSettings(everyFieldSet())).toStrictEqual({
            ...everyFieldSet(),
            displaySize: new Vector2i(320, 240),
        });
    });

    it('returns exactly defaultConfig() for an empty object', () => {
        expect(mergeHardwareSettings({})).toStrictEqual(defaultConfig());
    });

    it('maps null optional vectors to the invalid 0x0 sentinel', () => {
        expect(mergeHardwareSettings({ drawingBufferSize: NULL_VECTOR, maxCanvasSize: NULL_VECTOR })).toStrictEqual({
            ...defaultConfig(),
            drawingBufferSize: INVALID,
            maxCanvasSize: INVALID,
        });
    });

    it('maps deprecated aliases onto current keys and drops the legacy keys', () => {
        expect(mergeHardwareSettings(LEGACY_ONLY)).toStrictEqual({ ...defaultConfig(), ...LEGACY_MAPPED });
    });

    it("turns on keyboard scroll capture for the 'single' layout when unset", () => {
        expect(mergeHardwareSettings({ keyboardLayout: 'single' })).toStrictEqual({
            ...defaultConfig(),
            keyboardLayout: 'single',
            isCapturingKeyboardScroll: true,
        });
    });
});

describe('mergeHardwareSettings characterization - explicit displaySize path', () => {
    it('keeps every field set in configure()', () => {
        const partial = { ...everyFieldSet(), displaySize: new Vector2i(200, 150) };

        expect(mergeHardwareSettings(partial)).toStrictEqual({
            ...everyFieldSet(),
            displaySize: new Vector2i(200, 150),
        });
    });

    it('leaves every optional unset except the required defaults and backend', () => {
        expect(mergeHardwareSettings({ displaySize: new Vector2i(100, 50) })).toStrictEqual(
            explicitPathDefaults(new Vector2i(100, 50)),
        );
    });

    it('maps null displaySize and null optional vectors to the invalid 0x0 sentinel', () => {
        expect(
            mergeHardwareSettings({
                displaySize: NULL_VECTOR,
                drawingBufferSize: NULL_VECTOR,
                maxCanvasSize: NULL_VECTOR,
            }),
        ).toStrictEqual({ ...explicitPathDefaults(INVALID), drawingBufferSize: INVALID, maxCanvasSize: INVALID });
    });

    it('maps deprecated aliases onto current keys and drops the legacy keys', () => {
        expect(mergeHardwareSettings({ ...LEGACY_ONLY, displaySize: new Vector2i(100, 50) })).toStrictEqual({
            ...explicitPathDefaults(new Vector2i(100, 50)),
            ...LEGACY_MAPPED,
        });
    });

    it("turns on keyboard scroll capture for the 'single' layout when unset", () => {
        expect(mergeHardwareSettings({ displaySize: new Vector2i(100, 50), keyboardLayout: 'single' })).toStrictEqual({
            ...explicitPathDefaults(new Vector2i(100, 50)),
            keyboardLayout: 'single',
            isCapturingKeyboardScroll: true,
        });
    });
});

describe('mergeHardwareSettings - null on a non-vector field', () => {
    // Untyped JS only (TypeScript rejects these). Since BT-729, null means the same as omitted.
    const NULL_SCALARS = {
        targetFPS: null,
        isSplashEnabled: null,
        isDetectingDroppedFrames: null,
        audioVoices: null,
        keyboardLayout: null,
        splashColorDark: null,
        overlayStyle: null,
    } as unknown as Partial<HardwareSettings>;

    it('acts like omitted on the default path', () => {
        expect(mergeHardwareSettings(NULL_SCALARS)).toStrictEqual(defaultConfig());
    });

    it('acts like omitted on the explicit path', () => {
        expect(mergeHardwareSettings({ ...NULL_SCALARS, displaySize: new Vector2i(100, 50) })).toStrictEqual(
            explicitPathDefaults(new Vector2i(100, 50)),
        );
    });
});

describe('mergeHardwareSettings characterization - no aliasing', () => {
    it.each([
        ['default path', {}],
        ['explicit path', { displaySize: new Vector2i(200, 150) }],
    ])('copies vectors, colors and style records on the %s', (_label, extra) => {
        const partial = { ...everyFieldSet(), ...extra };
        const merged = mergeHardwareSettings(partial);

        const referenceKeys = [
            'displaySize',
            'drawingBufferSize',
            'maxCanvasSize',
            'splashColorDark',
            'splashColorLight',
            'overlayStyle',
            'overlayTimingChartStyle',
            'overlayAudioMeterStyle',
        ] as const;

        for (const key of referenceKeys) {
            // eslint-disable-next-line security/detect-object-injection -- key is a literal keyof HardwareSettings
            expect(merged[key]).not.toBe(partial[key]);
        }
    });
});
