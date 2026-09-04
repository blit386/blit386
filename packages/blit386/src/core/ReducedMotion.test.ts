/**
 * Unit tests for {@link ReducedMotion}.
 */
// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readReducedMotionUrlFlags, ReducedMotion, resolveReducedMotionPreferred } from './ReducedMotion';

/**
 * Runs `body` with `globalThis.location.search` stubbed to `search`, restoring it afterward.
 *
 * @param search – Query string including the leading '?'.
 * @param body – Assertions to run while the stub is installed.
 */
function withSearch(search: string, body: () => void): void {
    const original = Reflect.getOwnPropertyDescriptor(globalThis, 'location');

    Reflect.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { search },
    });

    try {
        body();
    } finally {
        Reflect.deleteProperty(globalThis, 'location');

        if (original) {
            Reflect.defineProperty(globalThis, 'location', original);
        }
    }
}

describe('resolveReducedMotionPreferred', () => {
    it('lets ?noreducedmotion beat ?reducedmotion when both are present', () => {
        expect(
            resolveReducedMotionPreferred({ urlForceOn: true, urlForceOff: true, platformPrefersReduced: true }),
        ).toBe(false);
    });

    it('lets ?reducedmotion force it on regardless of the platform read', () => {
        expect(
            resolveReducedMotionPreferred({ urlForceOn: true, urlForceOff: false, platformPrefersReduced: false }),
        ).toBe(true);
    });

    it('lets ?noreducedmotion force it off regardless of the platform read', () => {
        expect(
            resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: true, platformPrefersReduced: true }),
        ).toBe(false);
    });

    it('falls back to the platform read when neither flag is present', () => {
        expect(
            resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: false, platformPrefersReduced: true }),
        ).toBe(true);

        expect(
            resolveReducedMotionPreferred({ urlForceOn: false, urlForceOff: false, platformPrefersReduced: false }),
        ).toBe(false);
    });
});

describe('readReducedMotionUrlFlags', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'location');
    });

    it('reports both flags false when there is no location', () => {
        expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: false });
    });

    it('reads a valueless ?reducedmotion flag', () => {
        withSearch('?reducedmotion', () => {
            expect(readReducedMotionUrlFlags()).toEqual({ forceOn: true, forceOff: false });
        });
    });

    it('reads a valueless ?noreducedmotion flag', () => {
        withSearch('?noreducedmotion', () => {
            expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: true });
        });
    });

    it('ignores an unrelated query string', () => {
        withSearch('?backend=software', () => {
            expect(readReducedMotionUrlFlags()).toEqual({ forceOn: false, forceOff: false });
        });
    });
});

describe('ReducedMotion.isPreferred', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'matchMedia');
        Reflect.deleteProperty(globalThis, 'location');
    });

    it('is false when matchMedia is unavailable', () => {
        expect(ReducedMotion.isPreferred).toBe(false);
    });

    it('reads the platform matchMedia result', () => {
        const matchMedia = vi.fn(() => ({ matches: true }));
        Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: matchMedia });

        expect(ReducedMotion.isPreferred).toBe(true);
        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
});

type FakeMediaQueryList = {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    dispatchEvent: (event: Event) => boolean;
};

function installMockMatchMedia(matches = false): { mql: FakeMediaQueryList; matchMedia: ReturnType<typeof vi.fn> } {
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

    const matchMedia = vi.fn(() => mql);

    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: matchMedia });

    return { mql, matchMedia };
}

describe('ReducedMotion instance', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'matchMedia');
    });

    it('does nothing on attach when matchMedia is unavailable', () => {
        const reducedMotion = new ReducedMotion();

        expect(() => reducedMotion.attach(null)).not.toThrow();
    });

    it('installs a change listener on attach', () => {
        const { mql } = installMockMatchMedia();
        const reducedMotion = new ReducedMotion();

        reducedMotion.attach(vi.fn());

        expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('forwards change events with the new matches value', () => {
        const { mql } = installMockMatchMedia(false);
        const onChange = vi.fn();
        const reducedMotion = new ReducedMotion();

        reducedMotion.attach(onChange);

        const event = Object.assign(new Event('change'), { matches: true });
        mql.dispatchEvent(event);

        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('removes the listener on detach and stops forwarding', () => {
        const { mql } = installMockMatchMedia();
        const onChange = vi.fn();
        const reducedMotion = new ReducedMotion();

        reducedMotion.attach(onChange);
        reducedMotion.detach();

        expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));

        mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it('rebinds the callback via setOnChange without touching the listener', () => {
        const { mql } = installMockMatchMedia();
        const oldOnChange = vi.fn();
        const newOnChange = vi.fn();
        const reducedMotion = new ReducedMotion();

        reducedMotion.attach(oldOnChange);
        reducedMotion.setOnChange(newOnChange);

        mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

        expect(newOnChange).toHaveBeenCalledWith(true);
        expect(oldOnChange).not.toHaveBeenCalled();
    });

    it('resolves a URL override over a contradicting platform change, suppressing the callback', () => {
        withSearch('?noreducedmotion', () => {
            const { mql } = installMockMatchMedia(false);
            const onChange = vi.fn();
            const reducedMotion = new ReducedMotion();

            reducedMotion.attach(onChange);

            // The platform now prefers reduced motion, but ?noreducedmotion still forces it off –
            // the resolved value (false) hasn't changed from what attach() already reported.
            mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

            expect(onChange).not.toHaveBeenCalled();
        });
    });

    it('stays suppressed under an active override no matter which way the platform swings', () => {
        withSearch('?reducedmotion', () => {
            const { mql } = installMockMatchMedia(false);
            const onChange = vi.fn();
            const reducedMotion = new ReducedMotion();

            reducedMotion.attach(onChange);

            // ?reducedmotion forces the resolved value to true regardless of the platform read, so
            // neither a false nor a true platform event changes it from what attach() already reported.
            mql.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
            mql.dispatchEvent(Object.assign(new Event('change'), { matches: true }));

            expect(onChange).not.toHaveBeenCalled();
        });
    });

    it('suppresses a redundant notification when the resolved value does not actually change', () => {
        const { mql } = installMockMatchMedia(false);
        const onChange = vi.fn();
        const reducedMotion = new ReducedMotion();

        reducedMotion.attach(onChange);

        mql.dispatchEvent(Object.assign(new Event('change'), { matches: false }));

        expect(onChange).not.toHaveBeenCalled();
    });
});
