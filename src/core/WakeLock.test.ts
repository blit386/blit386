/**
 * Unit tests for {@link WakeLock}.
 */
// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { WakeLock } from './WakeLock';

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

    Object.defineProperty(globalThis.navigator, 'wakeLock', {
        configurable: true,
        value: mockWakeLock,
    });

    return mockWakeLock;
}

function setVisibilityState(state: DocumentVisibilityState): void {
    Object.defineProperty(globalThis.document, 'visibilityState', {
        configurable: true,
        value: state,
    });
}

describe('WakeLock', () => {
    let visibilityChangeListeners: Array<EventListener> = [];

    // Intercept addEventListener to track visibilitychange listeners
    const originalAddEventListener = globalThis.document.addEventListener;
    globalThis.document.addEventListener = function (
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions,
    ) {
        if (type === 'visibilitychange') {
            visibilityChangeListeners.push(listener);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    afterEach(() => {
        Reflect.deleteProperty(globalThis.navigator, 'wakeLock');
        // Remove all tracked visibilitychange listeners to prevent test isolation
        visibilityChangeListeners.forEach((listener) => {
            if (typeof globalThis.document !== 'undefined') {
                globalThis.document.removeEventListener('visibilitychange', listener);
            }
        });
        visibilityChangeListeners = [];
        vi.restoreAllMocks();
    });

    it('does nothing when the Wake Lock API is unsupported', () => {
        Reflect.deleteProperty(globalThis.navigator, 'wakeLock');

        const addEventListenerSpy = vi.spyOn(globalThis.document, 'addEventListener');
        const wakeLock = new WakeLock();

        wakeLock.attach();

        expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('requests a screen wake lock on attach', async () => {
        const sentinel = createFakeSentinel();
        const mockWakeLock = installMockWakeLock(async () => sentinel);

        const wakeLock = new WakeLock();
        wakeLock.attach();

        await vi.waitFor(() => {
            expect(mockWakeLock.request).toHaveBeenCalledWith('screen');
        });
    });

    it('logs a warning and does not throw when the request rejects', async () => {
        installMockWakeLock(async () => {
            throw new Error('denied');
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const wakeLock = new WakeLock();

        expect(() => wakeLock.attach()).not.toThrow();

        await vi.waitFor(() => {
            expect(warnSpy).toHaveBeenCalledWith('[BT] Failed to acquire wake lock:', expect.any(Error));
        });
    });

    it('releases the held sentinel on detach', async () => {
        const sentinel = createFakeSentinel();
        const mockWakeLock = installMockWakeLock(async () => sentinel);

        const wakeLock = new WakeLock();
        wakeLock.attach();

        await vi.waitFor(() => {
            expect(mockWakeLock.request).toHaveBeenCalled();
        });

        wakeLock.detach();

        expect(sentinel.release).toHaveBeenCalled();
    });

    it('removes the visibilitychange listener on detach', () => {
        installMockWakeLock(async () => createFakeSentinel());

        const removeEventListenerSpy = vi.spyOn(globalThis.document, 'removeEventListener');
        const wakeLock = new WakeLock();

        wakeLock.attach();
        wakeLock.detach();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('re-acquires the lock when the page becomes visible again after the sentinel released', async () => {
        const firstSentinel = createFakeSentinel();
        const secondSentinel = createFakeSentinel();
        const request = vi.fn(async () => firstSentinel);

        installMockWakeLock(request);

        const wakeLock = new WakeLock();
        wakeLock.attach();

        await vi.waitFor(() => {
            expect(request).toHaveBeenCalledTimes(1);
        });

        // The platform auto-releases the sentinel while the page is hidden.
        await firstSentinel.release();
        request.mockImplementation(async () => secondSentinel);

        setVisibilityState('visible');
        globalThis.document.dispatchEvent(new Event('visibilitychange'));

        await vi.waitFor(() => {
            expect(request).toHaveBeenCalledTimes(2);
        });
    });

    it('does not re-request when a lock is already held', async () => {
        const sentinel = createFakeSentinel();
        const request = vi.fn(async () => sentinel);

        installMockWakeLock(request);

        const wakeLock = new WakeLock();
        wakeLock.attach();

        await vi.waitFor(() => {
            expect(request).toHaveBeenCalledTimes(1);
        });

        setVisibilityState('visible');
        globalThis.document.dispatchEvent(new Event('visibilitychange'));

        expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not start a second concurrent request while one is in flight', async () => {
        let resolveRequest: (sentinel: WakeLockSentinel) => void = () => {};
        const pending = new Promise<WakeLockSentinel>((resolve) => {
            resolveRequest = resolve;
        });
        const request = vi.fn(() => pending);

        installMockWakeLock(request);
        setVisibilityState('visible');

        const wakeLock = new WakeLock();
        wakeLock.attach();

        globalThis.document.dispatchEvent(new Event('visibilitychange'));
        globalThis.document.dispatchEvent(new Event('visibilitychange'));

        expect(request).toHaveBeenCalledTimes(1);

        resolveRequest(createFakeSentinel());

        await vi.waitFor(() => {
            expect(request).toHaveBeenCalledTimes(1);
        });
    });
});
