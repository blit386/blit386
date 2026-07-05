/**
 * Unit tests for {@link defaultConfig} exported from {@link IBTDemo}.
 *
 * Confirms the default display resolution, frame rate, and canvas sizing
 * (`defaultConfig()` includes `drawingBufferSize` by default), and verifies each
 * call to {@link defaultConfig} returns fresh objects so demos do not share
 * mutable settings state.
 */

import { describe, expect, it } from 'vitest';

import { validateDimensions } from '../utils/RenderLimits';
import { Vector2i } from '../utils/Vector2i';
import {
    defaultConfig,
    mergeHardwareSettings,
    needsOverlayRendererDiagnostics,
    resolveOverlayTimingChartDiagnostics,
} from './IBTDemo';

describe('defaultConfig', () => {
    it('should return 320x240 display size', () => {
        const settings = defaultConfig();

        expect(settings.displaySize.x).toBe(320);
        expect(settings.displaySize.y).toBe(240);
    });

    it('should return the 60 FPS target', () => {
        const settings = defaultConfig();

        expect(settings.targetFPS).toBe(60);
    });

    it('should include 640x480 drawingBufferSize by default', () => {
        const settings = defaultConfig();

        expect(settings.drawingBufferSize?.x).toBe(640);
        expect(settings.drawingBufferSize?.y).toBe(480);
    });

    it('should include 960x720 maxCanvasSize by default', () => {
        const settings = defaultConfig();

        expect(settings.maxCanvasSize?.x).toBe(960);
        expect(settings.maxCanvasSize?.y).toBe(720);
    });

    it("should default outputUpscaleFilter to 'nearest'", () => {
        const settings = defaultConfig();

        expect(settings.outputUpscaleFilter).toBe('nearest');
    });

    it("should default backend to 'webgpu'", () => {
        const settings = defaultConfig();

        expect(settings.backend).toBe('webgpu');
    });

    it('should default audioVoices to 16', () => {
        const settings = defaultConfig();

        expect(settings.audioVoices).toBe(16);
    });

    it('should enable overlay by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayEnabled).toBe(true);
    });

    it('should disable overlay palette view by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayPaletteEnabled).toBe(false);
    });

    it('should hide overlay body by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayVisibleAtStart).toBe(false);
    });

    it('should show overlay toggle hint by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayToggleHintVisible).toBe(true);
    });

    it('should enable overlay toggle input by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayToggleEnabled).toBe(true);
    });

    it('should disable overlay timing chart by default', () => {
        const settings = defaultConfig();

        expect(settings.isOverlayTimingChartEnabled).toBe(false);
    });

    it('should return a fresh object on each call', () => {
        const a = defaultConfig();
        const b = defaultConfig();

        expect(a).not.toBe(b);
        expect(a.displaySize).not.toBe(b.displaySize);
        expect(a.drawingBufferSize).not.toBe(b.drawingBufferSize);
        expect(a.maxCanvasSize).not.toBe(b.maxCanvasSize);
    });
});

describe('mergeHardwareSettings', () => {
    it('returns defaultConfig when partial is undefined', () => {
        const settings = mergeHardwareSettings();

        expect(settings.displaySize.x).toBe(320);
        expect(settings.drawingBufferSize?.x).toBe(640);
        expect(settings.targetFPS).toBe(60);
        expect(settings.backend).toBe('webgpu');
    });

    it('merges targetFPS-only partials with full defaults', () => {
        const settings = mergeHardwareSettings({ targetFPS: 30 });

        expect(settings.displaySize.x).toBe(320);
        expect(settings.drawingBufferSize?.x).toBe(640);
        expect(settings.targetFPS).toBe(30);
        expect(settings.isOverlayPaletteEnabled).toBe(false);
    });

    it('keeps drawingBufferSize unset when displaySize is provided without output sizing', () => {
        const settings = mergeHardwareSettings({
            displaySize: defaultConfig().displaySize,
            targetFPS: 60,
        });

        expect(settings.displaySize.x).toBe(320);
        expect(settings.drawingBufferSize).toBeUndefined();
        expect(settings.targetFPS).toBe(60);
        expect(settings.backend).toBe('webgpu');
    });

    it('merges audioVoices-only partials with full defaults', () => {
        const settings = mergeHardwareSettings({ audioVoices: 32 });

        expect(settings.audioVoices).toBe(32);
        expect(settings.targetFPS).toBe(60);
    });

    it('keeps audioVoices unset when displaySize is provided without an explicit audioVoices', () => {
        const settings = mergeHardwareSettings({
            displaySize: new Vector2i(320, 240),
        });

        expect(settings.audioVoices).toBeUndefined();
    });

    it('applies an explicit audioVoices alongside displaySize', () => {
        const settings = mergeHardwareSettings({
            displaySize: new Vector2i(320, 240),
            audioVoices: 8,
        });

        expect(settings.audioVoices).toBe(8);
    });

    it('applies only provided fields when displaySize is set', () => {
        const settings = mergeHardwareSettings({
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(640, 480),
            backend: 'software',
        });

        expect(settings.drawingBufferSize?.x).toBe(640);
        expect(settings.backend).toBe('software');
        expect(settings.targetFPS).toBe(60);
        expect(settings.isOverlayEnabled).toBe(true);
        expect(settings.isOverlayPaletteEnabled).toBe(false);
    });

    it('honors isOverlayEnabled: false from configure()', () => {
        const settings = mergeHardwareSettings({ isOverlayEnabled: false });

        expect(settings.isOverlayEnabled).toBe(false);
    });

    it('merges overlayStyle from configure()', () => {
        const settings = mergeHardwareSettings({
            overlayStyle: { barPaletteIndex: 2, textPaletteIndex: 3, gapPaletteIndex: 4 },
        });

        expect(settings.overlayStyle?.barPaletteIndex).toBe(2);
        expect(settings.overlayStyle?.textPaletteIndex).toBe(3);
        expect(settings.overlayStyle?.gapPaletteIndex).toBe(4);
    });

    it('merges overlay visibility and toggle flags from configure()', () => {
        const settings = mergeHardwareSettings({
            isOverlayVisibleAtStart: true,
            isOverlayToggleHintVisible: false,
            isOverlayToggleEnabled: false,
        });

        expect(settings.isOverlayVisibleAtStart).toBe(true);
        expect(settings.isOverlayToggleHintVisible).toBe(false);
        expect(settings.isOverlayToggleEnabled).toBe(false);
    });

    it('merges isOverlayTimingChartEnabled flags from configure()', () => {
        const settings = mergeHardwareSettings({
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: 20,
                renderBarPaletteIndex: 21,
                warningPaletteIndex: 22,
            },
        });

        expect(settings.isOverlayTimingChartEnabled).toBe(true);
        expect(settings.overlayTimingChartStyle?.updateBarPaletteIndex).toBe(20);
        expect(settings.overlayTimingChartStyle?.renderBarPaletteIndex).toBe(21);
        expect(settings.overlayTimingChartStyle?.warningPaletteIndex).toBe(22);
    });

    it('merges overlayTimingChartHeight from configure()', () => {
        const settings = mergeHardwareSettings({
            isOverlayTimingChartEnabled: true,
            overlayTimingChartHeight: 36,
        });

        expect(settings.overlayTimingChartHeight).toBe(36);
    });

    it('merges renderer diagnostics overlay flags from configure()', () => {
        const settings = mergeHardwareSettings({
            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,
        });

        expect(settings.overlayTimingChartDiagnostics).toBe('rich');
        expect(settings.isOverlayRendererDiagnosticsBarEnabled).toBe(true);
    });

    it('resolveOverlayTimingChartDiagnostics defaults to minimal when chart enabled', () => {
        const settings = mergeHardwareSettings({ isOverlayTimingChartEnabled: true });

        expect(resolveOverlayTimingChartDiagnostics(settings)).toBe('minimal');
    });

    it('needsOverlayRendererDiagnostics is true for diagnostics bar alone', () => {
        const settings = mergeHardwareSettings({
            isOverlayTimingChartEnabled: false,
            isOverlayRendererDiagnosticsBarEnabled: true,
        });

        expect(needsOverlayRendererDiagnostics(settings)).toBe(true);
    });

    it('surfaces null displaySize via dimension validation instead of returning null', () => {
        const settings = mergeHardwareSettings({
            displaySize: null as unknown as Vector2i,
        });

        expect(settings.displaySize).toEqual(new Vector2i(0, 0));
        expect(validateDimensions(settings)).not.toBeNull();
    });

    it('surfaces null optional vectors via dimension validation in the explicit profile path', () => {
        const settings = mergeHardwareSettings({
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: null as unknown as Vector2i,
        });

        expect(settings.drawingBufferSize).toEqual(new Vector2i(0, 0));
        expect(validateDimensions(settings)).not.toBeNull();
    });

    it('surfaces null maxCanvasSize via dimension validation in the explicit profile path', () => {
        const settings = mergeHardwareSettings({
            displaySize: new Vector2i(320, 240),
            maxCanvasSize: null as unknown as Vector2i,
        });

        expect(settings.maxCanvasSize).toEqual(new Vector2i(0, 0));
        expect(validateDimensions(settings)).not.toBeNull();
    });
});
