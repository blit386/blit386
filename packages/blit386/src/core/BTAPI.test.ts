/**
 * Unit tests for {@link BTAPI}.
 *
 * Covers the public engine facade exposed to demos:
 * - singleton lifecycle and version constants
 * - safe accessor behavior before initialization
 * - no-op drawing and camera APIs before renderer setup
 * - initialization failure cases for invalid hardware settings and WebGPU setup
 * - successful initialization, accessor population, and loop startup
 *
 * The suite isolates global browser and singleton state with WebGPU mocks,
 * stubbed animation-frame scheduling, and per-test singleton reset helpers.
 *
 * Suites that exercise one engine part live beside it in `src/core/engine/<Part>.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    activeEffectCount,
    decodedPngSize,
    installRealPNGOffscreenCanvasMock,
    makeMock2DCanvas,
    makeMockCanvas,
    makeMockDemo,
    makeOffscreenCanvas2dContext,
    type OffscreenCanvas2DMock,
    resetSingleton,
} from '../__test__/btapiFixtures';
import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../__test__/webgpu-mock';
import { AssetLoader } from '../assets/AssetLoader';
import { AudioClip } from '../assets/AudioClip';
import type { BitmapFont } from '../assets/BitmapFont';
import { Palette } from '../assets/Palette';
import { registerIndexedSheet, type SpriteSheet, unregisterIndexedSheet } from '../assets/SpriteSheet';
import { AudioManager } from '../audio/AudioManager';
import { BT } from '../BLIT386';
import { KeyboardInput } from '../input/KeyboardInput';
import { getKeyboardFaceButtonKeys, setKeyboardLayout } from '../input/keyboardRuntimeMaps';
import { Overlay } from '../overlay';
import type { Effect } from '../render/effects/Effect';
import type { SpriteDrawParams } from '../render/SpriteOrientation';
import { Color32 } from '../utils/Color32';
import { NO_ACTIVE_PALETTE_MESSAGE, SOFTWARE_CANVAS_TAKEN_MESSAGE } from '../utils/errorMessages';
import type * as FrameCaptureModule from '../utils/FrameCapture';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { BTAPI } from './BTAPI';
import type { GameLoop } from './GameLoop';
import type { HardwareSettings, IBTDemo, OverlayRow } from './IBTDemo';

vi.mock('../utils/FrameCapture', async (importOriginal) => {
    const actual = await importOriginal<typeof FrameCaptureModule>();

    return { ...actual, downloadBlob: vi.fn() };
});

describe('BTAPI', () => {
    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        installMockNavigatorGPU();
    });

    afterEach(() => {
        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.unstubAllGlobals();
    });

    describe('version constants', () => {
        it('should expose VERSION_MAJOR as a number', () => {
            expect(typeof BTAPI.VERSION_MAJOR).toBe('number');
        });

        it('should expose VERSION_MINOR as a number', () => {
            expect(typeof BTAPI.VERSION_MINOR).toBe('number');
        });

        it('should expose VERSION_PATCH as a number', () => {
            expect(typeof BTAPI.VERSION_PATCH).toBe('number');
        });

        it('should match package.json version', () => {
            const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
            const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
            const btapiVersion = `${BTAPI.VERSION_MAJOR}.${BTAPI.VERSION_MINOR}.${BTAPI.VERSION_PATCH}`;

            expect(btapiVersion).toBe(version);
        });
    });

    describe('singleton', () => {
        it('should return the same instance on multiple accesses', () => {
            const a = BTAPI.instance;
            const b = BTAPI.instance;

            expect(a).toBe(b);
        });

        it('should create a new instance after singleton reset', () => {
            const a = BTAPI.instance;

            resetSingleton();

            const b = BTAPI.instance;

            expect(a).not.toBe(b);
        });
    });

    describe('pre-initialization accessors', () => {
        it('getTicks should return 0 before init', () => {
            expect(BTAPI.instance.getTicks()).toBe(0);
        });

        it('resetTicks should not throw before init', () => {
            expect(() => BTAPI.instance.resetTicks()).not.toThrow();
        });

        it('getRenderAlpha should return 0 before init', () => {
            expect(BTAPI.instance.getRenderAlpha()).toBe(0);
        });

        it('getDevice should return null before init', () => {
            expect(BTAPI.instance.getDevice()).toBeNull();
        });

        it('getContext should return null before init', () => {
            expect(BTAPI.instance.getContext()).toBeNull();
        });

        it('getCanvas should return null before init', () => {
            expect(BTAPI.instance.getCanvas()).toBeNull();
        });

        it('getRenderer should return null before init', () => {
            expect(BTAPI.instance.getRenderer()).toBeNull();
        });

        it('getPointer should return null before init', () => {
            expect(BTAPI.instance.getPointer()).toBeNull();
        });

        it('getKeyboard should return null before init', () => {
            expect(BTAPI.instance.getKeyboard()).toBeNull();
        });

        it('getGamepad should return null before init', () => {
            expect(BTAPI.instance.getGamepad()).toBeNull();
        });

        it('getHardwareSettings should return null before init', () => {
            expect(BTAPI.instance.getHardwareSettings()).toBeNull();
        });

        it('getPalette should return null before palette is set', () => {
            expect(BTAPI.instance.palettes.getPalette()).toBeNull();
        });

        it('getCameraOffset should return a zero vector before init', () => {
            const offset = BTAPI.instance.getCameraOffset();

            expect(offset.x).toBe(0);
            expect(offset.y).toBe(0);
        });
    });

    describe('pre-initialization drawing no-ops', () => {
        it('stop should not throw before init', () => {
            expect(() => BTAPI.instance.stop()).not.toThrow();
        });

        it('setClearColor should not throw before init', () => {
            expect(() => BTAPI.instance.draw.setClearColor(1)).not.toThrow();
        });

        it('clearRect should not throw before init', () => {
            expect(() => BTAPI.instance.draw.clearRect(new Rect2i(0, 0, 10, 10), 1)).not.toThrow();
        });

        it('drawPixel should not throw before init', () => {
            expect(() => BTAPI.instance.draw.drawPixel(new Vector2i(0, 0), 2)).not.toThrow();
        });

        it('drawLine should not throw before init', () => {
            expect(() => BTAPI.instance.draw.drawLine(new Vector2i(0, 0), new Vector2i(10, 10), 3)).not.toThrow();
        });

        it('drawRect should not throw before init', () => {
            expect(() => BTAPI.instance.draw.drawRect(new Rect2i(0, 0, 10, 10), 4)).not.toThrow();
        });

        it('drawRectFill should not throw before init', () => {
            expect(() => BTAPI.instance.draw.drawRectFill(new Rect2i(0, 0, 10, 10), 5)).not.toThrow();
        });

        it('drawSystemText should not throw before init', () => {
            expect(() => BTAPI.instance.draw.drawSystemText(new Vector2i(0, 0), 8, 'test')).not.toThrow();
        });

        it('drawSprite should not throw before init', () => {
            const mockSheet = { isIndexed: () => true } as unknown as SpriteSheet;
            expect(() =>
                BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0)),
            ).not.toThrow();
        });

        it('drawSprite should throw when sprite sheet is not indexized', () => {
            const mockSheet = { isIndexed: () => false } as unknown as SpriteSheet;
            expect(() =>
                BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0)),
            ).toThrow("This sprite sheet hasn't been prepared yet.");
        });

        describe('drawSpriteWithParams', () => {
            const sheet = { isIndexed: () => true } as unknown as SpriteSheet;
            const src = new Rect2i(0, 0, 16, 16);
            const dest = new Vector2i(0, 0);

            it.each([
                ['null', null],
                ['an array', []],
            ])('throws for %s params', (label, params) => {
                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(sheet, src, dest, params as unknown as SpriteDrawParams),
                ).toThrow(`got ${label}`);
            });

            it.each([
                ['2', 2],
                ['Vector2i(2, 1)', new Vector2i(2, 1)],
            ])('throws for a Rect2i destination with scale %s', (_label, scale) => {
                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(sheet, src, new Rect2i(0, 0, 8, 8), { scale }),
                ).toThrow('takes no scale');
            });

            it.each([
                ['undefined', undefined],
                ['1', 1],
                ['Vector2i(1, 1)', new Vector2i(1, 1)],
            ])('accepts a Rect2i destination with neutral scale %s', (_label, scale) => {
                const params: SpriteDrawParams = scale === undefined ? {} : { scale };

                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(sheet, src, new Rect2i(0, 0, 8, 8), params),
                ).not.toThrow();
            });

            it.each([0, -1, 1.5, Number.NaN])('throws for scale %s, pointing at a Rect2i destination', (scale) => {
                expect(() => BTAPI.instance.draw.drawSpriteWithParams(sheet, src, dest, { scale })).toThrow(
                    'Rect2i destination',
                );
            });

            it('throws for a destination that is neither a Vector2i nor a Rect2i', () => {
                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(sheet, src, { x: 0, y: 0 } as unknown as Vector2i, {}),
                ).toThrow('Vector2i or Rect2i destination');
            });

            it('throws for a flag bit outside 0x1f, naming the constants', () => {
                expect(() => BTAPI.instance.draw.drawSpriteWithParams(sheet, src, dest, { flags: 1 << 5 })).toThrow(
                    /BT\.FLIP_H.*BT\.ROT_270_CW/,
                );
            });

            it('reads params without mutating them', () => {
                const params = Object.freeze({ flags: 1, paletteOffset: 2 });

                expect(() => BTAPI.instance.draw.drawSpriteWithParams(sheet, src, dest, params)).not.toThrow();
            });
        });

        it('drawSprite should keep a registered sheet in spritesRefresh tracking', () => {
            const palette = new Palette(16);
            const reindexize = vi.fn();
            const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;

            registerIndexedSheet(mockSheet);
            BTAPI.instance.palettes.setPalette(palette);
            BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.palettes.spritesRefresh();

            expect(reindexize).toHaveBeenCalledWith(palette);
            unregisterIndexedSheet(mockSheet);
        });

        it('drawBitmapText should not throw before init', () => {
            const mockSheet = { isIndexed: () => true } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            expect(() => BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi')).not.toThrow();
        });

        it('drawBitmapText should throw when font sprite sheet is not indexized', () => {
            const mockSheet = { isIndexed: () => false } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            expect(() => BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi')).toThrow(
                "This sprite sheet hasn't been prepared yet.",
            );
        });

        it('drawBitmapText should keep a registered font sheet in spritesRefresh tracking', () => {
            const palette = new Palette(16);
            const reindexize = vi.fn();
            const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;

            registerIndexedSheet(mockSheet);
            BTAPI.instance.palettes.setPalette(palette);
            BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi');
            BTAPI.instance.palettes.spritesRefresh();

            expect(reindexize).toHaveBeenCalledWith(palette);
            unregisterIndexedSheet(mockSheet);
        });

        it('setCameraOffset should not throw before init', () => {
            expect(() => BTAPI.instance.setCameraOffset(new Vector2i(10, 20))).not.toThrow();
        });

        it('resetCamera should not throw before init', () => {
            expect(() => BTAPI.instance.resetCamera()).not.toThrow();
        });

        /**
         * Reads the private cache the engine re-applies to the renderer at the start of the
         * next frame, to survive a render frame with zero fixed-update steps.
         *
         * @returns The cached camera offset.
         */
        function lastCameraOffset(): Vector2i {
            return (BTAPI.instance as unknown as { lastCameraOffset: Vector2i }).lastCameraOffset;
        }

        it("resetCamera should not clear the offset cached for next frame's re-prime immediately", () => {
            // resetCamera() is also how demos flip to screen space for UI at the end of
            // render(), expecting their next update() to restore the world offset via
            // setCameraOffset(). Clearing the cache immediately would leak a snap-to-origin
            // flash into a render frame with zero fixed-update steps that falls before that
            // restoring call - see BTAPI's pendingCameraReset doc comment.
            BTAPI.instance.setCameraOffset(new Vector2i(500, 0));
            BTAPI.instance.resetCamera();

            expect(lastCameraOffset()).toEqual(new Vector2i(500, 0));
        });

        it('resetCamera should durably clear the cached offset once the next fixed-update tick commits it', () => {
            BTAPI.instance.setCameraOffset(new Vector2i(500, 0));
            BTAPI.instance.resetCamera();

            (
                BTAPI.instance as unknown as { frameLoop: { commitPendingCameraReset(): void } }
            ).frameLoop.commitPendingCameraReset();

            expect(lastCameraOffset()).toEqual(new Vector2i(0, 0));
        });

        it('setCameraOffset should supersede a pending resetCamera before it commits', () => {
            BTAPI.instance.setCameraOffset(new Vector2i(500, 0));
            BTAPI.instance.resetCamera();
            BTAPI.instance.setCameraOffset(new Vector2i(10, 20));

            (
                BTAPI.instance as unknown as { frameLoop: { commitPendingCameraReset(): void } }
            ).frameLoop.commitPendingCameraReset();

            expect(lastCameraOffset()).toEqual(new Vector2i(10, 20));
        });

        it('setPalette should store the provided palette before init', () => {
            const palette = new Palette(16);

            BTAPI.instance.palettes.setPalette(palette);

            expect(BTAPI.instance.palettes.getPalette()).toBe(palette);
        });
    });

    describe('init', () => {
        it('should return false for NaN targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(NaN), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for zero targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(0), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for negative targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(-30), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for non-integer audioVoices', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 1.5), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for audioVoices below 1', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 0), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for audioVoices above 64', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 65), makeMockCanvas());

            expect(result).toBe(false);
        });

        describe('overlay configure numbers', () => {
            /** Mock demo whose configure() adds overlay fields to the base mock settings. */
            function makeOverlayDemo(overlay: Record<string, unknown>): IBTDemo {
                const demo = makeMockDemo();
                const base = (demo.configure as () => Record<string, unknown>)();

                return { ...demo, configure: vi.fn().mockReturnValue({ ...base, ...overlay }) };
            }

            it.each([
                ['fractional overlayTimingChartHeight', { overlayTimingChartHeight: 22.5 }],
                ['zero overlayTimingChartHeight', { overlayTimingChartHeight: 0 }],
                ['fractional overlayAudioMeterHeight', { overlayAudioMeterHeight: 22.5 }],
                ['fractional overlayPaletteColumns', { overlayPaletteColumns: 7.5 }],
                ['zero overlayPaletteColumns', { overlayPaletteColumns: 0 }],
                ['overlayStyle.barPaletteIndex past 255', { overlayStyle: { barPaletteIndex: 256 } }],
                [
                    'negative overlayTimingChartStyle.tagPaletteIndex',
                    { overlayTimingChartStyle: { tagPaletteIndex: -1 } },
                ],
                [
                    'fractional overlayAudioMeterStyle.levelBarPaletteIndex',
                    { overlayAudioMeterStyle: { levelBarPaletteIndex: 1.5 } },
                ],
            ])('should return false for %s', async (_label, overlay) => {
                const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
                const result = await BTAPI.instance.init(makeOverlayDemo(overlay), makeMockCanvas());

                expect(result).toBe(false);
                expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(Object.keys(overlay)[0] ?? ''));
            });

            it('should accept whole-number heights, columns and palette indices 0-255', async () => {
                const demo = makeOverlayDemo({
                    overlayTimingChartHeight: 32,
                    overlayAudioMeterHeight: 13,
                    overlayPaletteColumns: 16,
                    overlayStyle: { barPaletteIndex: 0, textPaletteIndex: 255 },
                    overlayTimingChartStyle: { tagPaletteIndex: 5 },
                    overlayAudioMeterStyle: { clipPaletteIndex: 4, trackPaletteIndex: null },
                });

                expect(await BTAPI.instance.init(demo, makeMockCanvas())).toBe(true);
            });

            it('should ignore overlay numbers while the overlay is disabled', async () => {
                const demo = makeOverlayDemo({ isOverlayEnabled: false, overlayTimingChartHeight: 22.5 });

                expect(await BTAPI.instance.init(demo, makeMockCanvas())).toBe(true);
            });
        });

        it('should accept the default audioVoices (16)', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(true);
        });

        it('should accept a valid custom audioVoices value', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 32), makeMockCanvas());

            expect(result).toBe(true);
        });

        it('should accept the boundary audioVoices values 1 and 64', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(60, true, 1), makeMockCanvas())).toBe(true);

            resetSingleton();

            expect(await BTAPI.instance.init(makeMockDemo(60, true, 64), makeMockCanvas())).toBe(true);
        });

        it('should pass the configured audioVoices to AudioManager.attach', async () => {
            const attachSpy = vi.spyOn(AudioManager.prototype, 'attach');

            await BTAPI.instance.init(makeMockDemo(60, true, 3), makeMockCanvas());

            expect(attachSpy).toHaveBeenCalledWith(expect.anything(), 3);
        });

        it('should pass the default audioVoices to AudioManager.attach when none is configured', async () => {
            const attachSpy = vi.spyOn(AudioManager.prototype, 'attach');

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(attachSpy).toHaveBeenCalledWith(expect.anything(), 16);
        });

        it('should reject an overlapping init and keep isInitialized false until the new init finishes', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(BTAPI.instance.isInitialized()).toBe(true);

            const secondDemo = makeMockDemo();
            const second = BTAPI.instance.init(secondDemo, makeMockCanvas());

            expect(BTAPI.instance.isInitialized()).toBe(false);

            const third = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(third).toBe(false);
            expect(BTAPI.instance.getDemo()).toBe(secondDemo);
            expect(BTAPI.instance.isInitialized()).toBe(false);

            expect(await second).toBe(true);
            expect(BTAPI.instance.isInitialized()).toBe(true);
        });

        it('should leave exactly one running loop after two sequential inits', async () => {
            const readLoop = (): GameLoop | null => (BTAPI.instance as unknown as { loop: GameLoop | null }).loop;
            const isRunning = (loop: GameLoop | null): boolean =>
                (loop as unknown as { isRunning: boolean } | null)?.isRunning === true;

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstLoop = readLoop();

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const secondLoop = readLoop();

            expect(secondLoop).not.toBe(firstLoop);
            expect(isRunning(firstLoop)).toBe(false);
            expect(isRunning(secondLoop)).toBe(true);
        });

        it('should still init and run the loop when matchMedia throws (BT-878)', async () => {
            vi.stubGlobal(
                'matchMedia',
                vi.fn(() => {
                    throw new Error('matchMedia blocked');
                }),
            );
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const loop = (BTAPI.instance as unknown as { loop: GameLoop | null }).loop;

            expect((loop as unknown as { isRunning: boolean } | null)?.isRunning).toBe(true);
            expect(warn).toHaveBeenCalledTimes(1);

            warn.mockRestore();
        });

        it('should destroy the first GPU device when a second init runs', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstDevice = BTAPI.instance.getDevice();

            if (firstDevice === null) {
                throw new Error('expected the WebGPU backend to start');
            }

            const destroy = vi.spyOn(firstDevice, 'destroy');

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            expect(destroy).toHaveBeenCalledTimes(1);
            expect(BTAPI.instance.getDevice()).not.toBe(firstDevice);
        });

        it('should report not ready after a restart whose demo init fails', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);
            expect(await BTAPI.instance.init(makeMockDemo(60, false), makeMockCanvas())).toBe(false);

            expect(BTAPI.instance.isInitialized()).toBe(false);
        });

        it('should clear the old renderer effects before a restart drops it', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstRenderer = BTAPI.instance.getRenderer();

            if (firstRenderer === null) {
                throw new Error('expected a renderer after init');
            }

            const clearEffects = vi.spyOn(firstRenderer, 'clearEffects');

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            expect(clearEffects).toHaveBeenCalledTimes(1);
        });

        it('should start a restart with no palette, palette effects or pending camera reset (BT-759)', async () => {
            const first = makeMockDemo();

            vi.mocked(first.init).mockImplementation(async () => {
                BTAPI.instance.palettes.setPalette(Palette.pico8());
                BTAPI.instance.palettes.paletteCycle(1, 4, 1);
                BTAPI.instance.resetCamera();

                return true;
            });
            expect(await BTAPI.instance.init(first, makeMockCanvas())).toBe(true);
            expect(activeEffectCount()).toBe(1);

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            expect(() => BT.palette).toThrow(NO_ACTIVE_PALETTE_MESSAGE);
            expect(activeEffectCount()).toBe(0);
            expect((BTAPI.instance as unknown as { pendingCameraReset: boolean }).pendingCameraReset).toBe(false);
        });

        it('should reject a captureFrame still pending when init restarts (BT-756)', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstRenderer = BTAPI.instance.getRenderer();

            if (firstRenderer === null) {
                throw new Error('expected a renderer after init');
            }

            const pending = firstRenderer.captureFrame();

            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            await expect(pending).rejects.toThrow('renderer was reset');
        });

        it('should release the old device and renderer when a restart has invalid settings', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstDevice = BTAPI.instance.getDevice();

            if (firstDevice === null) {
                throw new Error('expected the WebGPU backend to start');
            }

            const destroy = vi.spyOn(firstDevice, 'destroy');

            expect(await BTAPI.instance.init(makeMockDemo(0), makeMockCanvas())).toBe(false);

            expect(destroy).toHaveBeenCalledTimes(1);
            expect(BTAPI.instance.getRenderer()).toBeNull();
            expect(BTAPI.instance.getActiveBackend()).toBeNull();
        });

        it('should drop the old renderer when a restart fails after destroying the old device', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            // The new adapter's texture limit rejects the size inside the renderer step, after the old device is gone.
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice: async () => createMockGPUDevice(),
                            features: new Set(),
                            limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const tooLarge: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(2048, 1024),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
            };

            expect(await BTAPI.instance.init(tooLarge, makeMockCanvas())).toBe(false);
            expect(BTAPI.instance.getRenderer()).toBeNull();
        });

        it('should destroy the first GPU device on a stop() then init() cycle', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            const firstDevice = BTAPI.instance.getDevice();

            if (firstDevice === null) {
                throw new Error('expected the WebGPU backend to start');
            }

            const destroy = vi.spyOn(firstDevice, 'destroy');

            BTAPI.instance.stop();
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);

            expect(destroy).toHaveBeenCalledTimes(1);
        });

        it('should clear the in-progress guard after a failed init', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(NaN), makeMockCanvas())).toBe(false);
            expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);
        });

        describe('?seed URL parameter', () => {
            afterEach(() => {
                vi.unstubAllGlobals();
            });

            it('seeds BT.random from ?seed=N before the demo init() runs', async () => {
                vi.stubGlobal('location', { search: '?seed=42' });
                const log = vi.spyOn(console, 'log').mockImplementation(() => {});

                const demo = makeMockDemo();
                let seedSeenInInit: number | undefined;
                (demo.init as ReturnType<typeof vi.fn>).mockImplementation(async () => {
                    seedSeenInInit = BTAPI.instance.getRandom().seedValue;

                    return true;
                });

                expect(await BTAPI.instance.init(demo, makeMockCanvas())).toBe(true);
                expect(seedSeenInInit).toBe(42);
                expect(log).toHaveBeenCalledWith('[BT] Seeded BT.random from ?seed=42');
            });

            it("lets the game's own randomSeed() in init() override ?seed=N", async () => {
                vi.stubGlobal('location', { search: '?seed=42' });

                const demo = makeMockDemo();
                (demo.init as ReturnType<typeof vi.fn>).mockImplementation(async () => {
                    BTAPI.instance.randomSeed(7);

                    return true;
                });

                expect(await BTAPI.instance.init(demo, makeMockCanvas())).toBe(true);
                expect(BTAPI.instance.getRandom().seedValue).toBe(7);
            });

            it('keeps the time seed and warns for a non-integer ?seed', async () => {
                vi.stubGlobal('location', { search: '?seed=abc' });
                const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const before = BTAPI.instance.getRandom().seedValue;

                expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);
                expect(BTAPI.instance.getRandom().seedValue).toBe(before);
                expect(warn).toHaveBeenCalledWith('[BT] Ignoring ?seed=abc: it must be a whole number.');
            });

            it('does not reseed on a hot-reload swap', async () => {
                vi.stubGlobal('location', { search: '?seed=42' });

                expect(await BTAPI.instance.init(makeMockDemo(), makeMockCanvas())).toBe(true);
                BTAPI.instance.getRandom().next();
                const state = BTAPI.instance.getRandom().getState();

                expect(await BTAPI.instance.hotReplaceDemo(makeMockDemo())).toBe(true);
                expect(BTAPI.instance.getRandom().getState()).toBe(state);
            });
        });

        it('rejects invalid displaySize before layout or renderer setup', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: { x: 0, y: 240 } as Vector2i,
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(canvas.style.setProperty).not.toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects invalid software drawingBufferSize before software renderer allocation', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: { x: 8193, y: 480 } as Vector2i,
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(getContext).not.toHaveBeenCalled();
        });

        it('rejects invalid maxCanvasSize before layout or renderer setup', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    maxCanvasSize: { x: Number.NaN, y: 720 } as Vector2i,
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(canvas.style.setProperty).not.toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU dimensions above adapter texture limits before canvas allocation', async () => {
            const requestDevice = vi.fn(async () => createMockGPUDevice());
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(2048, 1024),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU drawingBufferSize above adapter texture limits before canvas allocation', async () => {
            const requestDevice = vi.fn(async () => createMockGPUDevice());
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(2048, 1024),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU dimensions above device texture limits without software fallback', async () => {
            const requestDevice = vi.fn(async () => ({
                ...createMockGPUDevice(),
                limits: { maxTextureDimension2D: 512 } as GPUSupportedLimits,
            }));
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 2048 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(1024, 768),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalledWith('2d');
            expect(BTAPI.instance.getActiveBackend()).toBeNull();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('returns false when both WebGPU and software renderer init fail', async () => {
            uninstallMockNavigatorGPU();

            // makeMockCanvas() returns null for getContext('2d'), so the auto-fallback
            // SoftwareRenderer also fails to initialize.
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('explains a software restart on a canvas WebGPU already uses (BT-759)', async () => {
            const canvas = makeMockCanvas();

            expect(await BTAPI.instance.init(makeMockDemo(), canvas)).toBe(true);

            const software: IBTDemo = {
                ...makeMockDemo(),
                configure: () => ({ isSplashEnabled: false, targetFPS: 60, backend: 'software' }),
            };
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            // A canvas that already has a 'webgpu' context returns null for getContext('2d').
            expect(await BTAPI.instance.init(software, canvas)).toBe(false);
            expect(errorSpy).toHaveBeenCalledWith(`[BT] ${SOFTWARE_CANVAS_TAKEN_MESSAGE}`);
        });

        it('initializes successfully in software mode when WebGPU is unavailable', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).toBeNull();
            expect(BTAPI.instance.getContext()).toBeNull();
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
        });

        describe('fractional coordinates on the software backend', () => {
            /** Initializes a 4x1 software canvas and returns a function that renders and reads the logical frame. */
            async function initFourByOne(): Promise<() => number[]> {
                uninstallMockNavigatorGPU();
                let frame: Uint8ClampedArray | null = null;
                vi.stubGlobal(
                    'OffscreenCanvas',
                    class MockOffscreenCanvas {
                        constructor(
                            public width: number,
                            public height: number,
                        ) {}
                        getContext(contextType?: string): OffscreenCanvas2DMock | null {
                            if (contextType !== '2d') {
                                return null;
                            }

                            return {
                                ...makeOffscreenCanvas2dContext(),
                                putImageData: vi.fn((imageData: ImageData) => {
                                    frame = imageData.data as Uint8ClampedArray;
                                }),
                            };
                        }
                    },
                );
                const demo: IBTDemo = {
                    configure: () => ({
                        isSplashEnabled: false,
                        displaySize: new Vector2i(4, 1),
                        targetFPS: 60,
                        backend: 'software',
                    }),
                    init: vi.fn().mockResolvedValue(true),
                    update: vi.fn(),
                    render: vi.fn(),
                };

                await BTAPI.instance.init(demo, makeMock2DCanvas());
                const palette = new Palette(16);
                palette.set(1, new Color32(200, 100, 50, 255));
                BTAPI.instance.palettes.setPalette(palette);

                return () => {
                    BTAPI.instance.getRenderer()?.endFrame(0);

                    return Array.from(frame ?? []);
                };
            }

            const PIXEL_1 = [0, 0, 0, 0, 200, 100, 50, 255, 0, 0, 0, 0, 0, 0, 0, 0];

            it('drawPixelXY truncates fractional x and y so only pixel 1 changes', async () => {
                const render = await initFourByOne();
                BTAPI.instance.getRenderer()?.beginFrame();

                BTAPI.instance.draw.drawPixelXY(1.5, 0.5, 1);

                expect(render()).toEqual(PIXEL_1);
            });

            it('drawPixel truncates a Vector2i mutated to fractional x and y so only pixel 1 changes', async () => {
                const render = await initFourByOne();
                BTAPI.instance.getRenderer()?.beginFrame();
                const pos = new Vector2i(0, 0);

                pos.x = 1.5;
                pos.y = 0.5;
                BTAPI.instance.draw.drawPixel(pos, 1);

                expect(render()).toEqual(PIXEL_1);
            });
        });

        it('URL override ?backend=software wins over configure().backend=webgpu', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getHardwareSettings()?.backend).toBe('software');
            expect(BTAPI.instance.getRequestedBackend()).toBe('software');
            expect(BTAPI.instance.getActiveBackend()).toBe('software');
            expect(BTAPI.instance.getDevice()).toBeNull();
        });

        it('ignores unknown backend query values and keeps configure backend', async () => {
            vi.stubGlobal('location', { search: '?backend=banana' });

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);
            expect(BTAPI.instance.getHardwareSettings()?.backend).toBe('webgpu');
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getDevice()).not.toBeNull();
        });

        it('falls back to software (and fails cleanly) when WebGPU adapter is unavailable', async () => {
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => null,
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });

            // BTAPI catches the adapter throw and falls back to software.
            // makeMockCanvas() has no 2D context, so software init also fails -> false.
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false when renderer initialization fails', async () => {
            // Provide an adapter that returns a device broken for shader compilation.
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice: async () => ({
                                createShaderModule: () => {
                                    throw new Error("GPU isn't available");
                                },
                            }),
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });

            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false when demo.init() returns false', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, false), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return true and populate accessors on success', async () => {
            const canvas = makeMockCanvas();
            const result = await BTAPI.instance.init(makeMockDemo(), canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).not.toBeNull();
            expect(BTAPI.instance.getContext()).not.toBeNull();
            expect(BTAPI.instance.getCanvas()).toBe(canvas);
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
            expect(BTAPI.instance.getHardwareSettings()).not.toBeNull();
            expect(BTAPI.instance.getPointer()).not.toBeNull();
            expect(BTAPI.instance.getKeyboard()).not.toBeNull();
            expect(BTAPI.instance.getGamepad()).not.toBeNull();
        });

        it('should merge partial configure with defaultConfig', async () => {
            const demo: IBTDemo = {
                configure: () => ({ isSplashEnabled: false, targetFPS: 30 }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);

            const hw = BTAPI.instance.getHardwareSettings();

            expect(hw).not.toBeNull();
            expect(hw?.displaySize.x).toBe(320);
            expect(hw?.drawingBufferSize?.x).toBe(640);
            expect(hw?.targetFPS).toBe(30);
        });

        it('should use defaultConfig when configure is omitted', async () => {
            const demo: IBTDemo = {
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            // This demo has no configure() to opt out of the splash with, so gate it
            // off the way a development build does. Splash behavior has its own suite.
            globalThis.__BLIT386_DEV__ = true;

            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);

            const hw = BTAPI.instance.getHardwareSettings();

            expect(hw).not.toBeNull();
            expect(hw?.displaySize.x).toBe(320);
            expect(hw?.displaySize.y).toBe(240);
            expect(hw?.drawingBufferSize?.x).toBe(640);
            expect(hw?.drawingBufferSize?.y).toBe(480);
            expect(hw?.outputUpscaleFilter).toBe('nearest');
            expect(hw?.targetFPS).toBe(60);

            Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
        });

        it('stop detaches pointer and keyboard input so subsequent accessors return null', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(BTAPI.instance.getPointer()).not.toBeNull();
            expect(BTAPI.instance.getKeyboard()).not.toBeNull();
            expect(BTAPI.instance.getGamepad()).not.toBeNull();

            BTAPI.instance.stop();

            expect(BTAPI.instance.getPointer()).toBeNull();
            expect(BTAPI.instance.getKeyboard()).toBeNull();
            expect(BTAPI.instance.getGamepad()).toBeNull();
        });

        it('double init without stop detaches prior pointer and keyboard before reattaching', async () => {
            const canvas = makeMockCanvas();

            await BTAPI.instance.init(makeMockDemo(), canvas);

            const pointerBefore = BTAPI.instance.getPointer();
            const keyboardBefore = BTAPI.instance.getKeyboard();

            expect(pointerBefore).not.toBeNull();
            expect(keyboardBefore).not.toBeNull();

            vi.mocked(canvas.removeEventListener).mockClear();

            await BTAPI.instance.init(makeMockDemo(), canvas);

            expect(BTAPI.instance.getPointer()).not.toBe(pointerBefore);
            expect(BTAPI.instance.getKeyboard()).not.toBe(keyboardBefore);

            const removedKinds = vi.mocked(canvas.removeEventListener).mock.calls.map((call) => call[0]);

            expect(removedKinds).toContain('pointermove');
            expect(removedKinds).toContain('keydown');
        });

        it('should start the game loop on success', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('forwards overlayRows from the demo into Overlay.updateAndRender', async () => {
            const customRows: OverlayRow[] = [{ leftText: 'Position: 1, 2' }];
            const demo: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: true,
                }),
                overlayRows: vi.fn().mockReturnValue(customRows),
            };
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations before overlay render.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (overlaySpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(demo.overlayRows).toHaveBeenCalled();
            expect(overlaySpy).toHaveBeenCalled();
            const lastCall = overlaySpy.mock.calls.at(-1);
            const getCustomRows = lastCall?.[5] as (() => typeof customRows) | undefined;
            const timing = lastCall?.[6] as
                | {
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
                  }
                | undefined;

            expect(getCustomRows).toBeDefined();

            if (!getCustomRows) {
                return;
            }

            expect(getCustomRows()).toBe(customRows);

            expect(timing).toBeDefined();

            if (!timing) {
                return;
            }

            expect(timing.frameMs).toBeGreaterThanOrEqual(0);
            expect(timing.updateMs).toBeGreaterThanOrEqual(0);
            expect(timing.renderMs).toBeGreaterThanOrEqual(0);
            expect(timing.updateSteps).toBeGreaterThanOrEqual(0);
            expect(timing.drawCalls).toBeGreaterThanOrEqual(0);
            expect(timing.droppedFrames).toBeGreaterThanOrEqual(0);
            expect(timing.primitiveOverflowCount).toBeGreaterThanOrEqual(0);
            expect(timing.spriteOverflowCount).toBeGreaterThanOrEqual(0);
            expect(timing.primitiveSubmittedVertices).toBeGreaterThanOrEqual(0);
            expect(timing.spriteSubmittedVertices).toBeGreaterThanOrEqual(0);
        });

        it('calls gamepad.endFrame during render-phase input flush', async () => {
            const rafCallbacks: FrameRequestCallback[] = [];
            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const gamepad = BTAPI.instance.getGamepad();
            expect(gamepad).not.toBeNull();
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const endFrameSpy = vi.spyOn(gamepad as NonNullable<typeof gamepad>, 'endFrame');
            // GameLoop.start uses a double-rAF bootstrap before the first tick.
            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error(
                        'Exceeded max rAF callback drain iterations before gamepad.endFrame was called; possible loop stall.',
                    );
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (endFrameSpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(endFrameSpy).toHaveBeenCalled();
        });

        it('stop should not throw after successful initialization', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(() => BTAPI.instance.stop()).not.toThrow();
        });

        it('captureFrame returns a blob after successful initialization', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const mockBlob = new Blob(['test'], { type: 'image/png' });

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrame').mockResolvedValue(mockBlob);

            const result = await BTAPI.instance.capture.captureFrame();

            expect(result).toBe(mockBlob);
        });

        it('captureFrame decodes to outputSize (drawingBufferSize), not displaySize, on the WebGPU path', async () => {
            installRealPNGOffscreenCanvasMock();

            // makeMockDemo() sets displaySize 320x240 and drawingBufferSize 640x480, so
            // outputSize (drawingBufferSize ?? displaySize) resolves to 640x480 - the captured
            // PNG must match that, not the smaller logical displaySize (regression for BT-488).
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const capturePromise = BTAPI.instance.capture.captureFrame();

            renderer?.beginFrame();
            renderer?.endFrame(0);

            const blob = await capturePromise;
            const { width, height } = await decodedPngSize(blob);

            expect(width).toBe(BT.outputSize.x);
            expect(height).toBe(BT.outputSize.y);
            expect(width).toBe(640);
            expect(height).toBe(480);
        });

        it("captureFrame('display') decodes to displaySize, not outputSize (drawingBufferSize), on the WebGPU path", async () => {
            installRealPNGOffscreenCanvasMock();

            // Same mock demo as the outputSize test above (displaySize 320x240,
            // drawingBufferSize 640x480), but captureFrame('display') (BT-532, the public
            // form of the Shift+F9 path from BT-490) must decode to the smaller logical
            // displaySize, the opposite of the default captureFrame()/outputSize contract
            // BT-488 confirmed.
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const capturePromise = BTAPI.instance.capture.captureFrame('display');

            renderer?.beginFrame();
            renderer?.endFrame(0);

            const blob = await capturePromise;
            const { width, height } = await decodedPngSize(blob);

            expect(width).toBe(BT.displaySize.x);
            expect(height).toBe(BT.displaySize.y);
            expect(width).toBe(320);
            expect(height).toBe(240);
        });

        it("captureFrame('display') and a concurrent shortcut capture both resolve from one frame", async () => {
            installRealPNGOffscreenCanvasMock();

            // The public display-size capture has its own renderer slot (BT-532), so an
            // agent's capture and a human's F9 press in the same frame never supersede
            // each other - both settle, both at displaySize.
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const publicCapture = BTAPI.instance.capture.captureFrame('display');
            const shortcutCapture = (renderer as NonNullable<typeof renderer>).captureFrameForShortcut();

            renderer?.beginFrame();
            renderer?.endFrame(0);

            const [publicBlob, shortcutBlob] = await Promise.all([publicCapture, shortcutCapture]);

            for (const blob of [publicBlob, shortcutBlob]) {
                const { width, height } = await decodedPngSize(blob);

                expect(width).toBe(320);
                expect(height).toBe(240);
            }
        });

        it('captureFrame works in software mode after a rendered frame', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const canvas = makeMock2DCanvas();

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const capturePromise = BTAPI.instance.capture.captureFrame();
            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            renderer?.beginFrame();
            renderer?.endFrame(0);

            const blob = await capturePromise;
            expect(blob.type).toBe('image/png');

            // Software backend still must match outputSize (drawingBufferSize ?? displaySize):
            // 640x480 here, not the smaller 320x240 logical displaySize.
            const { width, height } = await decodedPngSize(blob);

            expect(width).toBe(BT.outputSize.x);
            expect(height).toBe(BT.outputSize.y);
            expect(width).toBe(640);
            expect(height).toBe(480);
        });

        it("captureFrame('display') decodes to displaySize, not outputSize (drawingBufferSize), in software mode", async () => {
            vi.stubGlobal('location', { search: '?backend=software' });

            // Unlike makeOffscreenCanvas2dContext()'s stub above, this mock also implements
            // convertToBlob() so SoftwareRenderer's displaySize capture path (which exports
            // from the pre-upscale `logicalCanvas`, not the output `canvas`) can be decoded
            // and verified, mirroring installRealPNGOffscreenCanvasMock()'s WebGPU-path mock.
            class MockOffscreenCanvasWithBlob {
                private putData: { data: Uint8ClampedArray; width: number; height: number } | null = null;

                constructor(
                    public width: number,
                    public height: number,
                ) {}

                getContext(contextType?: string): OffscreenCanvas2DMock | null {
                    if (contextType !== '2d') {
                        return null;
                    }

                    return {
                        imageSmoothingEnabled: false,
                        createImageData: (w: number, h: number) =>
                            ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData,
                        putImageData: vi.fn((imageData: ImageData) => {
                            this.putData = {
                                data: imageData.data as Uint8ClampedArray,
                                width: imageData.width,
                                height: imageData.height,
                            };
                        }),
                    };
                }

                async convertToBlob(): Promise<Blob> {
                    if (!this.putData) {
                        throw new Error('putImageData was not called before convertToBlob');
                    }

                    const png = new PNG({ width: this.putData.width, height: this.putData.height });

                    png.data = Buffer.from(this.putData.data);

                    return new Blob([new Uint8Array(PNG.sync.write(png))], { type: 'image/png' });
                }
            }

            vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvasWithBlob);
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const canvas = makeMock2DCanvas();

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const capturePromise = BTAPI.instance.capture.captureFrame('display');

            renderer?.beginFrame();
            renderer?.endFrame(0);

            const blob = await capturePromise;

            expect(blob.type).toBe('image/png');

            const { width, height } = await decodedPngSize(blob);

            expect(width).toBe(BT.displaySize.x);
            expect(height).toBe(BT.displaySize.y);
            expect(width).toBe(320);
            expect(height).toBe(240);
        });

        it('auto-falls back to software when WebGPU is unavailable and 2D canvas is available', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    // No backend field - defaults to 'webgpu', should auto-fallback
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).toBeNull();
            expect(BTAPI.instance.getContext()).toBeNull();
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getActiveBackend()).toBe('software');
        });

        it('reports webgpu as active backend when WebGPU succeeds', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(true);
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getActiveBackend()).toBe('webgpu');
        });

        it('reports null requested and active backends before init', () => {
            expect(BTAPI.instance.getRequestedBackend()).toBeNull();
            expect(BTAPI.instance.getActiveBackend()).toBeNull();
        });

        it('exposes requested and active backends on BT after URL override', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BT.init(demo, makeMock2DCanvas());

            expect(result).toBe(true);
            expect(BT.requestedBackend).toBe('software');
            expect(BT.activeBackend).toBe('software');
        });

        it('keeps BT.requestedBackend webgpu when BT.activeBackend is software after fallback', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BT.init(demo, makeMock2DCanvas());

            expect(result).toBe(true);
            expect(BT.requestedBackend).toBe('webgpu');
            expect(BT.activeBackend).toBe('software');
        });
    });

    describe('keyboard layout', () => {
        const BTN_LEFT = 1 << 2;

        afterEach(() => {
            setKeyboardLayout('versus');
        });

        function makeLayoutDemo(settings: Partial<HardwareSettings>, init: () => boolean): IBTDemo {
            return {
                ...makeMockDemo(),
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    ...settings,
                }),
                init: vi.fn(async () => init()),
            };
        }

        it('seeds the single layout before the game init() runs', async () => {
            let player0LeftAtInit: readonly string[] | null = null;
            const demo = makeLayoutDemo({ keyboardLayout: 'single' }, () => {
                player0LeftAtInit = getKeyboardFaceButtonKeys(0, BTN_LEFT);

                return true;
            });

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(player0LeftAtInit).toEqual(['KeyA', 'ArrowLeft']);
            expect(getKeyboardFaceButtonKeys(1, BTN_LEFT)).toEqual(['KeyJ']);
        });

        it('keeps BT.inputMap calls made in the game init()', async () => {
            const demo = makeLayoutDemo({ keyboardLayout: 'single' }, () => {
                BT.inputMap(0, BT.BTN_LEFT, 'KeyQ');

                return true;
            });

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(getKeyboardFaceButtonKeys(0, BTN_LEFT)).toEqual(['KeyQ']);
        });

        it('reseeds versus when configure() omits the layout', async () => {
            setKeyboardLayout('single');
            const demo = makeLayoutDemo({}, () => true);

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(getKeyboardFaceButtonKeys(0, BTN_LEFT)).toEqual(['KeyA']);
            expect(getKeyboardFaceButtonKeys(1, BTN_LEFT)).toEqual(['ArrowLeft']);
        });

        it('captures keyboard scroll under single unless configure() opts out', async () => {
            const setIsCapturingScroll = vi.spyOn(KeyboardInput.prototype, 'setIsCapturingScroll');

            await BTAPI.instance.init(
                makeLayoutDemo({ keyboardLayout: 'single' }, () => true),
                makeMockCanvas(),
            );

            expect(setIsCapturingScroll).toHaveBeenLastCalledWith(true);

            resetSingleton();
            installMockNavigatorGPU();
            await BTAPI.instance.init(
                makeLayoutDemo({ keyboardLayout: 'single', isCapturingKeyboardScroll: false }, () => true),
                makeMockCanvas(),
            );

            expect(setIsCapturingScroll).toHaveBeenLastCalledWith(false);
        });
    });

    describe('assignTag', () => {
        it('forwards tags to Overlay when the timing chart is enabled', async () => {
            const assignSpy = vi.spyOn(Overlay.prototype, 'assignTag');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.assignTag('Checkpoint');

            expect(assignSpy).toHaveBeenCalledWith('Checkpoint', expect.any(Number));
        });

        it('does not store tags when isOverlayTimingChartEnabled is disabled', async () => {
            const { TimingChart } = await import('../overlay/timing-chart/TimingChart');
            const assignSpy = vi.spyOn(TimingChart.prototype, 'assignTag');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.assignTag('Ignored');

            expect(assignSpy).not.toHaveBeenCalled();
        });
    });

    describe('post-process effects', () => {
        function makeStubEffect(): Effect {
            return {
                tier: 'pixel',
                init: vi.fn(),
                updateUniforms: vi.fn(),
                encodePass: vi.fn(),
                dispose: vi.fn(),
            };
        }

        it('effectAdd throws before init', () => {
            expect(() => BTAPI.instance.effectAdd(makeStubEffect())).toThrow('renderer not initialized');
        });

        it('effectRemove throws before init', () => {
            expect(() => BTAPI.instance.effectRemove(makeStubEffect())).toThrow('renderer not initialized');
        });

        it('effectClear throws before init', () => {
            expect(() => BTAPI.instance.effectClear()).toThrow('renderer not initialized');
        });

        it('effectAdd / effectClear delegate to the renderer after init', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            const addSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'addEffect');
            const clearSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'clearEffects');

            const effect = makeStubEffect();
            BTAPI.instance.effectAdd(effect);

            expect(addSpy).toHaveBeenCalledWith(effect);

            BTAPI.instance.effectClear();

            expect(clearSpy).toHaveBeenCalled();
        });

        it('effectRemove delegates to the renderer after init', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();
            const removeSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'removeEffect');

            const effect = makeStubEffect();
            BTAPI.instance.effectAdd(effect);
            BTAPI.instance.effectRemove(effect);

            expect(removeSpy).toHaveBeenCalledWith(effect);
        });
    });

    describe('getLoadingAssetsCount', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns 0 when nothing is loading', () => {
            expect(BTAPI.instance.getLoadingAssetsCount()).toBe(0);
        });

        it('sums the AssetLoader and AudioClip in-flight counts', () => {
            vi.spyOn(AssetLoader, 'loadingCount', 'get').mockReturnValue(2);
            vi.spyOn(AudioClip, 'loadingCount', 'get').mockReturnValue(3);

            expect(BTAPI.instance.getLoadingAssetsCount()).toBe(5);
        });
    });

    describe('hot reload', () => {
        describe('getDemo', () => {
            it('returns null before initialization', () => {
                expect(BTAPI.instance.getDemo()).toBeNull();
            });

            it('returns the active demo instance after initialization', async () => {
                const demo = makeMockDemo();

                await BTAPI.instance.init(demo, makeMockCanvas());

                expect(BTAPI.instance.getDemo()).toBe(demo);
            });
        });

        describe('isInitialized', () => {
            it('returns false before initialization', () => {
                expect(BTAPI.instance.isInitialized()).toBe(false);
            });

            it('returns true after a successful initialization', async () => {
                await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

                expect(BTAPI.instance.isInitialized()).toBe(true);
            });
        });

        describe('isDevMode', () => {
            afterEach(() => {
                Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
            });

            it('delegates to devMode.isDevMode', () => {
                expect(BTAPI.instance.isDevMode()).toBe(false);

                globalThis.__BLIT386_DEV__ = true;

                expect(BTAPI.instance.isDevMode()).toBe(true);
            });
        });

        describe('hotReplaceDemo', () => {
            afterEach(() => {
                Reflect.deleteProperty(globalThis, 'screen');
                Reflect.deleteProperty(globalThis, 'matchMedia');
            });

            it('swaps in the new demo and returns true when init() succeeds', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = makeMockDemo();
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(true);
                expect(BTAPI.instance.getDemo()).toBe(newDemo);
            });

            it('keeps the previous demo and returns false when init() returns false', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = makeMockDemo(60, false);
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('keeps the previous demo and returns false when init() throws', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = { ...makeMockDemo(), init: vi.fn().mockRejectedValue(new Error('boom')) };
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('never touches input/audio subsystems on failure (unlike cold-boot init failure)', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const clearSpy = vi.spyOn(
                    BTAPI.instance.subsystems as unknown as { clearInputSubsystems: () => void },
                    'clearInputSubsystems',
                );

                const newDemo = makeMockDemo(60, false);
                await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(clearSpy).not.toHaveBeenCalled();
            });

            it('returns false without swapping when the candidate is missing update()/render()', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const broken = { ...makeMockDemo(), update: undefined } as unknown as IBTDemo;
                const result = await BTAPI.instance.hotReplaceDemo(broken);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('rebinds orientation change events to the new demo after a successful swap', async () => {
                const target = new EventTarget();
                const mockOrientation = {
                    type: 'landscape-primary',
                    lock: vi.fn(async () => undefined),
                    unlock: vi.fn(),
                    addEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.addEventListener(event, listener),
                    ),
                    removeEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.removeEventListener(event, listener),
                    ),
                    dispatchEvent: (event: Event) => target.dispatchEvent(event),
                };

                Object.defineProperty(globalThis, 'screen', {
                    configurable: true,
                    value: { orientation: mockOrientation },
                });

                const oldOnOrientationChange = vi.fn();
                const oldDemo = { ...makeMockDemo(), onOrientationChange: oldOnOrientationChange };
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newOnOrientationChange = vi.fn();
                const newDemo = { ...makeMockDemo(), onOrientationChange: newOnOrientationChange };
                await BTAPI.instance.hotReplaceDemo(newDemo);

                mockOrientation.type = 'portrait-primary';
                mockOrientation.dispatchEvent(new Event('change'));

                expect(newOnOrientationChange).toHaveBeenCalledWith('portrait-primary');
                expect(oldOnOrientationChange).not.toHaveBeenCalled();
            });

            it('rebinds reduced-motion change events to the new demo after a successful swap', async () => {
                const target = new EventTarget();
                const mockMediaQueryList = {
                    matches: false,
                    addEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.addEventListener(event, listener),
                    ),
                    removeEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.removeEventListener(event, listener),
                    ),
                    dispatchEvent: (event: Event) => target.dispatchEvent(event),
                };

                Object.defineProperty(globalThis, 'matchMedia', {
                    configurable: true,
                    value: vi.fn(() => mockMediaQueryList),
                });

                const oldOnReducedMotionChange = vi.fn();
                const oldDemo = { ...makeMockDemo(), onReducedMotionChange: oldOnReducedMotionChange };
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newOnReducedMotionChange = vi.fn();
                const newDemo = { ...makeMockDemo(), onReducedMotionChange: newOnReducedMotionChange };
                await BTAPI.instance.hotReplaceDemo(newDemo);

                mockMediaQueryList.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

                expect(newOnReducedMotionChange).toHaveBeenCalledWith(true);
                expect(oldOnReducedMotionChange).not.toHaveBeenCalled();
            });
        });
    });
});
