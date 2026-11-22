/**
 * Unit tests for `src/core/engine/OverlayDiagnostics.ts`, driven through `BTAPI`: renderer and audio diagnostics in the
 * overlay snapshots, and audio meter rendering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMockCanvas, makeMockDemo, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Palette } from '../../assets/Palette';
import { AudioManager } from '../../audio/AudioManager';
import { VoicePool } from '../../audio/VoicePool';
import type { OverlayDrawTarget } from '../../overlay';
import { Overlay } from '../../overlay';
import { AUDIO_METER_BAR_GAP_PX, AUDIO_METER_BAR_WIDTH_PX } from '../../overlay/audio-meter/constants';
import { OVERLAY_EDGE_MARGIN_PX } from '../../overlay/layout/constants';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { IBTDemo } from '../IBTDemo';

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

    describe('renderer diagnostics in overlay timing snapshot', () => {
        /**
         * Runs game-loop ticks using a stubbed rAF queue seeded before init.
         *
         * @param demo - Demo passed to {@link BTAPI#init}.
         * @param stopWhen - Stop draining once this returns true.
         * @returns Overlay spy from the initialized instance.
         */
        async function initAndDrainUntil(
            demo: IBTDemo,
            stopWhen: (overlaySpy: ReturnType<typeof vi.spyOn>) => boolean,
        ): Promise<ReturnType<typeof vi.spyOn>> {
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
                    throw new Error('Exceeded max rAF callback drain iterations.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16 * iterations);
                }

                if (stopWhen(overlaySpy)) {
                    break;
                }
            }

            return overlaySpy;
        }

        it('calls getFrameDiagnostics when isOverlayTimingChartEnabled is enabled', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
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

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).toHaveBeenCalled();
        });

        it('does not call getFrameDiagnostics when isOverlayTimingChartEnabled is disabled', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                    isOverlayRendererDiagnosticsBarEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).not.toHaveBeenCalled();
        });

        it('calls getFrameDiagnostics when isOverlayRendererDiagnosticsBarEnabled is enabled without chart', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                    isOverlayRendererDiagnosticsBarEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).toHaveBeenCalled();
        });

        it('copies captured diagnostics into the timing snapshot on frame rollover', async () => {
            const mockDiagnostics = {
                primitiveOverflowCount: 3,
                spriteOverflowCount: 2,
                primitiveSubmittedVertices: 6000,
                spriteSubmittedVertices: 1200,
            };

            vi.spyOn(
                (await import('../../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            ).mockReturnValue(mockDiagnostics);

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

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length >= 2);

            const secondTiming = overlaySpy.mock.calls[1]?.[6] as {
                primitiveOverflowCount: number;
                spriteOverflowCount: number;
                primitiveSubmittedVertices: number;
                spriteSubmittedVertices: number;
            };

            expect(secondTiming).toMatchObject(mockDiagnostics);
        });
    });

    describe('audio diagnostics in overlay audio snapshot', () => {
        /**
         * Runs game-loop ticks using a stubbed rAF queue seeded before init.
         *
         * @param demo - Demo passed to {@link BTAPI#init}.
         * @param stopWhen - Stop draining once this returns true.
         * @returns Overlay spy from the initialized instance.
         */
        async function initAndDrainUntil(
            demo: IBTDemo,
            stopWhen: (overlaySpy: ReturnType<typeof vi.spyOn>) => boolean,
        ): Promise<ReturnType<typeof vi.spyOn>> {
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
                    throw new Error('Exceeded max rAF callback drain iterations.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16 * iterations);
                }

                if (stopWhen(overlaySpy)) {
                    break;
                }
            }

            return overlaySpy;
        }

        it('passes an audio snapshot into updateAndRender when isOverlayAudioMetersEnabled is enabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length > 0);

            const snapshot = overlaySpy.mock.calls[0]?.[9] as
                | { levels: { main: number; music: number; sfx: number }; totalVoices: number }
                | undefined;

            expect(snapshot).toBeDefined();
            expect(snapshot?.levels).toEqual({ main: 0, music: 0, sfx: 0 });
            expect(snapshot?.totalVoices).toBeGreaterThan(0);
        });

        it('reflects voice and level counters from AudioManager on frame rollover', async () => {
            vi.spyOn(VoicePool.prototype, 'getActiveVoiceCount').mockReturnValue(3);
            vi.spyOn(VoicePool.prototype, 'getVoiceCount').mockReturnValue(16);
            vi.spyOn(VoicePool.prototype, 'getStealCount').mockReturnValue(2);
            vi.spyOn(VoicePool.prototype, 'getDropCount').mockReturnValue(1);
            vi.spyOn(AudioManager.prototype, 'getDroppedSfxCount').mockReturnValue(4);
            vi.spyOn(AudioManager.prototype, 'getBusLevels').mockReturnValue({ main: 0.5, music: 0.25, sfx: 0.1 });

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length >= 2);

            const secondSnapshot = overlaySpy.mock.calls[1]?.[9];

            expect(secondSnapshot).toMatchObject({
                activeVoices: 3,
                totalVoices: 16,
                voiceStealCount: 2,
                voiceDropCount: 1,
                preUnlockDropCount: 4,
                levels: { main: 0.5, music: 0.25, sfx: 0.1 },
            });
        });

        it('does not read audio diagnostics when isOverlayAudioMetersEnabled is disabled', async () => {
            const levelsSpy = vi.spyOn(AudioManager.prototype, 'getBusLevels');

            await initAndDrainUntil(makeMockDemo(), (spy) => spy.mock.calls.length > 0);

            expect(levelsSpy).not.toHaveBeenCalled();
        });
    });

    describe('audio meter overlay rendering', () => {
        /**
         * Drains the stubbed rAF queue until `stopWhen` returns true, spying on real renderer bar fills.
         *
         * @param demo - Demo passed to {@link BTAPI#init}.
         * @returns Collected bar fills in draw order.
         */
        async function drainAndCollectBarFills(demo: IBTDemo): Promise<{ index: number; rect: Rect2i }[]> {
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

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const barFills: { index: number; rect: Rect2i }[] = [];

            vi.spyOn(renderer as NonNullable<typeof renderer> & OverlayDrawTarget, 'drawBarFill').mockImplementation(
                (rect: Rect2i, index: number) => {
                    barFills.push({ index, rect: new Rect2i(rect.x, rect.y, rect.width, rect.height) });
                },
            );

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

            expect(overlaySpy).toHaveBeenCalled();

            return barFills;
        }

        /**
         * The three bus bar left-edge X positions `AudioMeter` draws at, computed the same
         * way as `busBarX()` in `src/overlay/audio-meter/AudioMeter.ts` (band left edge at `x: 0`).
         */
        const expectedAudioMeterBarXs = [0, 1, 2].map(
            (busIndex) => OVERLAY_EDGE_MARGIN_PX + busIndex * (AUDIO_METER_BAR_WIDTH_PX + AUDIO_METER_BAR_GAP_PX),
        );

        /**
         * Matches a bar fill against the audio meter's known bar geometry (width and left-edge X),
         * not width alone - width-only matching risks false positives from unrelated same-width bars.
         *
         * @param fill - Collected bar fill from {@link drainAndCollectBarFills}.
         * @param fill.rect - Filled rectangle in display coordinates.
         * @returns `true` when the fill's rect matches one of the three bus bar positions.
         */
        function isAudioMeterBar(fill: { rect: Rect2i }): boolean {
            return fill.rect.width === AUDIO_METER_BAR_WIDTH_PX && expectedAudioMeterBarXs.includes(fill.rect.x);
        }

        it('draws audio meter bars when isOverlayAudioMetersEnabled and the overlay body are enabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const barFills = await drainAndCollectBarFills(demo);
            const meterBarXs = new Set(barFills.filter(isAudioMeterBar).map((fill) => fill.rect.x));

            expect([...meterBarXs].sort((a, b) => a - b)).toEqual(expectedAudioMeterBarXs);
        });

        it('does not draw audio meter bars when isOverlayAudioMetersEnabled is disabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const barFills = await drainAndCollectBarFills(demo);
            const meterBars = barFills.filter(isAudioMeterBar);

            expect(meterBars.length).toBe(0);
        });
    });
});
