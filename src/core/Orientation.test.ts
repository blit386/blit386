/**
 * Unit tests for {@link Orientation}.
 */
// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Orientation } from './Orientation';

type FakeOrientation = {
    type: string;
    lock: ReturnType<typeof vi.fn>;
    unlock: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    dispatchEvent: (event: Event) => boolean;
};

function installMockOrientation(type = 'landscape-primary'): FakeOrientation {
    const target = new EventTarget();

    const orientation: FakeOrientation = {
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
        value: { orientation },
    });

    return orientation;
}

describe('Orientation', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'screen');
        vi.restoreAllMocks();
    });

    it('reports null when the Screen Orientation API is unsupported', () => {
        Reflect.deleteProperty(globalThis, 'screen');

        expect(Orientation.type).toBeNull();
    });

    it('reads the current orientation type', () => {
        installMockOrientation('portrait-primary');

        expect(Orientation.type).toBe('portrait-primary');
    });

    it('does nothing on attach when the API is unsupported', () => {
        Reflect.deleteProperty(globalThis, 'screen');

        const orientation = new Orientation();

        expect(() => orientation.attach('landscape', null)).not.toThrow();
    });

    it('installs a change listener and requests a lock when preferred is not any', async () => {
        const mock = installMockOrientation();
        const onChange = vi.fn();
        const orientation = new Orientation();

        orientation.attach('landscape', onChange);

        expect(mock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

        await vi.waitFor(() => {
            expect(mock.lock).toHaveBeenCalledWith('landscape');
        });
    });

    it('skips the lock attempt when preferredOrientation is any', () => {
        const mock = installMockOrientation();
        const orientation = new Orientation();

        orientation.attach('any', null);

        expect(mock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mock.lock).not.toHaveBeenCalled();
    });

    it('skips the lock attempt when lock is not implemented', () => {
        const mock = installMockOrientation();
        // Platforms without lock (for example iOS Safari) expose orientation without the method.
        Reflect.deleteProperty(mock, 'lock');

        const orientation = new Orientation();

        expect(() => orientation.attach('landscape', null)).not.toThrow();
    });

    it('logs a warning and does not throw when lock rejects', async () => {
        const mock = installMockOrientation();
        mock.lock.mockRejectedValue(new Error('denied'));

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orientation = new Orientation();

        expect(() => orientation.attach('portrait', null)).not.toThrow();

        await vi.waitFor(() => {
            expect(warnSpy).toHaveBeenCalledWith('[BT] Failed to lock screen orientation:', expect.any(Error));
        });
    });

    it('invokes the change handler with the current type', () => {
        const mock = installMockOrientation('landscape-primary');
        const onChange = vi.fn();
        const orientation = new Orientation();

        orientation.attach('any', onChange);

        mock.type = 'portrait-primary';
        mock.dispatchEvent(new Event('change'));

        expect(onChange).toHaveBeenCalledWith('portrait-primary');
    });

    it('removes the listener and unlocks on detach', () => {
        const mock = installMockOrientation();
        const orientation = new Orientation();

        orientation.attach('landscape', null);
        orientation.detach();

        expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mock.unlock).toHaveBeenCalled();
    });

    it('does not invoke the change handler after detach', () => {
        const mock = installMockOrientation();
        const onChange = vi.fn();
        const orientation = new Orientation();

        orientation.attach('any', onChange);
        orientation.detach();

        mock.dispatchEvent(new Event('change'));

        expect(onChange).not.toHaveBeenCalled();
    });
});
