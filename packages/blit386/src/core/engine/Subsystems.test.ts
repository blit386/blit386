/**
 * Unit tests for `src/core/engine/Subsystems.ts`, driven through `BTAPI`: reduced-motion tracking and audio bus
 * metering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMockCanvas, makeMockDemo, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { AudioManager } from '../../audio/AudioManager';
import { BT } from '../../BLIT386';
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

    describe('reduced motion', () => {
        type FakeMediaQueryList = {
            matches: boolean;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
            dispatchEvent: (event: Event) => boolean;
        };

        afterEach(() => {
            Reflect.deleteProperty(globalThis, 'matchMedia');
        });

        function installMockMatchMedia(matches = false): FakeMediaQueryList {
            const target = new EventTarget();

            const mql: FakeMediaQueryList = {
                matches,
                addEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.addEventListener(event, listener);
                }),
                removeEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.removeEventListener(event, listener);
                }),
                dispatchEvent: (event: Event) => target.dispatchEvent(event),
            };

            Object.defineProperty(globalThis, 'matchMedia', {
                configurable: true,
                value: vi.fn(() => mql),
            });

            return mql;
        }

        function makeReducedMotionDemo(onReducedMotionChange?: (prefersReduced: boolean) => void): IBTDemo {
            const demo: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                }),
            };

            if (onReducedMotionChange !== undefined) {
                demo.onReducedMotionChange = onReducedMotionChange;
            }

            return demo;
        }

        it('exposes the current preference via isReducedMotionPreferred', () => {
            installMockMatchMedia(true);

            expect(BTAPI.instance.isReducedMotionPreferred()).toBe(true);
            expect(BT.isReducedMotionPreferred).toBe(true);
        });

        it('forwards preference change events to demo.onReducedMotionChange', async () => {
            const mql = installMockMatchMedia(false);
            const onReducedMotionChange = vi.fn();

            await BTAPI.instance.init(makeReducedMotionDemo(onReducedMotionChange), makeMockCanvas());

            mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

            expect(onReducedMotionChange).toHaveBeenCalledWith(true);
        });

        it('removes the reduced-motion listener on stop', async () => {
            const mql = installMockMatchMedia();

            await BTAPI.instance.init(makeReducedMotionDemo(vi.fn()), makeMockCanvas());

            BTAPI.instance.stop();

            expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        });
    });

    describe('audio meter bus metering', () => {
        it('calls enableBusMetering when isOverlayAudioMetersEnabled is enabled', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');
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

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(meteringSpy).toHaveBeenCalled();
        });

        it('does not call enableBusMetering when isOverlayAudioMetersEnabled is disabled (default)', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(meteringSpy).not.toHaveBeenCalled();
        });

        it('does not call enableBusMetering when isOverlayEnabled is false even if isOverlayAudioMetersEnabled is true', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayEnabled: false,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(meteringSpy).not.toHaveBeenCalled();
        });
    });
});
