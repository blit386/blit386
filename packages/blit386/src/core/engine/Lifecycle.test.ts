/**
 * Unit tests for `src/core/engine/Lifecycle.ts`, driven through `BTAPI`: the wake lock and screen orientation
 * subsystems attached by init.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMockCanvas, makeMockDemo, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
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

    describe('wake lock', () => {
        afterEach(() => {
            Reflect.deleteProperty(globalThis.navigator, 'wakeLock');
        });

        function createFakeSentinel(): WakeLockSentinel {
            const target = new EventTarget();

            const sentinel = {
                onrelease: null,
                released: false,
                type: 'screen' as const,
                release: vi.fn(async () => {
                    sentinel.released = true;
                    target.dispatchEvent(new Event('release'));
                }),
                addEventListener: target.addEventListener.bind(target),
                removeEventListener: target.removeEventListener.bind(target),
                dispatchEvent: target.dispatchEvent.bind(target),
            };

            return sentinel as unknown as WakeLockSentinel;
        }

        function installMockWakeLock(request: (type?: WakeLockType) => Promise<WakeLockSentinel>): {
            request: ReturnType<typeof vi.fn>;
        } {
            const mockWakeLock = { request: vi.fn(request) };

            Object.defineProperty(globalThis, 'navigator', {
                value: { ...globalThis.navigator, wakeLock: mockWakeLock },
                configurable: true,
            });

            return mockWakeLock;
        }

        function makeWakeLockDemo(isWakeLockEnabled: boolean): IBTDemo {
            return {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    isWakeLockEnabled,
                }),
            };
        }

        it('requests a screen wake lock on successful init when isWakeLockEnabled is true', async () => {
            const sentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => sentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledWith('screen');
            });
        });

        it('does not touch navigator.wakeLock when isWakeLockEnabled is omitted', async () => {
            const mockWakeLock = installMockWakeLock(async () => createFakeSentinel());

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(mockWakeLock.request).not.toHaveBeenCalled();
        });

        it('releases the wake lock on stop', async () => {
            const sentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => sentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalled();
            });

            BTAPI.instance.stop();

            expect(sentinel.release).toHaveBeenCalled();
        });

        it('detaches the previous wake lock before attaching a new one on re-init', async () => {
            const firstSentinel = createFakeSentinel();
            const secondSentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => firstSentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledTimes(1);
            });

            mockWakeLock.request.mockImplementation(async () => secondSentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledTimes(2);
            });

            expect(firstSentinel.release).toHaveBeenCalled();
            expect(secondSentinel.release).not.toHaveBeenCalled();
        });
    });

    describe('screen orientation', () => {
        type FakeOrientation = {
            type: string;
            lock: ReturnType<typeof vi.fn>;
            unlock: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
            dispatchEvent: (event: Event) => boolean;
        };

        let mockOrientation: FakeOrientation | null = null;

        afterEach(() => {
            mockOrientation = null;
            Reflect.deleteProperty(globalThis, 'screen');
        });

        function installMockOrientation(type = 'landscape-primary'): FakeOrientation {
            const target = new EventTarget();

            mockOrientation = {
                type,
                lock: vi.fn(async () => undefined),
                unlock: vi.fn(),
                addEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.addEventListener(event, listener);
                }),
                removeEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.removeEventListener(event, listener);
                }),
                dispatchEvent: (event: Event) => target.dispatchEvent(event),
            };

            Object.defineProperty(globalThis, 'screen', {
                configurable: true,
                value: { orientation: mockOrientation },
            });

            return mockOrientation;
        }

        function makeOrientationDemo(
            preferredOrientation: 'landscape' | 'portrait' | 'any',
            onOrientationChange?: (type: string) => void,
        ): IBTDemo {
            const demo: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    preferredOrientation,
                }),
            };

            if (onOrientationChange !== undefined) {
                demo.onOrientationChange = onOrientationChange;
            }

            return demo;
        }

        it('exposes the current screen orientation via getScreenOrientation', () => {
            installMockOrientation('portrait-secondary');

            expect(BTAPI.instance.getScreenOrientation()).toBe('portrait-secondary');
            expect(BT.screenOrientation).toBe('portrait-secondary');
        });

        it('requests an orientation lock on successful init when preferredOrientation is set', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('landscape'), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mock.lock).toHaveBeenCalledWith('landscape');
            });
        });

        it('does not lock when preferredOrientation is any', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('any'), makeMockCanvas());

            expect(mock.lock).not.toHaveBeenCalled();
        });

        it('forwards orientation change events to demo.onOrientationChange', async () => {
            const mock = installMockOrientation('landscape-primary');
            const onOrientationChange = vi.fn();

            await BTAPI.instance.init(makeOrientationDemo('any', onOrientationChange), makeMockCanvas());

            mock.type = 'portrait-primary';
            mock.dispatchEvent(new Event('change'));

            expect(onOrientationChange).toHaveBeenCalledWith('portrait-primary');
        });

        it('removes the orientation listener on stop', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('landscape'), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mock.lock).toHaveBeenCalledWith('landscape');
            });

            BTAPI.instance.stop();

            expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mock.unlock).toHaveBeenCalled();
        });

        it('does not unlock on stop when preferredOrientation is any', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('any'), makeMockCanvas());

            BTAPI.instance.stop();

            expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mock.unlock).not.toHaveBeenCalled();
        });
    });
});
