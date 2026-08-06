/**
 * Unit tests for the splash gating resolver and its URL flag reader.
 *
 * Runs in the default node environment on purpose: the precedence logic must stay
 * testable without a `happy-dom` opt-in, so `globalThis.location` is stubbed by hand.
 */

import { describe, expect, it } from 'vitest';

import { readUrlFlags, resolveSplashEnabled } from './gating';

describe('resolveSplashEnabled', () => {
    it('honors an explicit configure() flag over every other signal', () => {
        expect(
            resolveSplashEnabled({ configureFlag: false, urlForceOn: true, urlForceOff: false, devMode: false }),
        ).toBe(false);

        expect(resolveSplashEnabled({ configureFlag: true, urlForceOn: false, urlForceOff: true, devMode: true })).toBe(
            true,
        );
    });

    it('lets ?nosplash beat ?splash when both are present', () => {
        expect(
            resolveSplashEnabled({ configureFlag: undefined, urlForceOn: true, urlForceOff: true, devMode: false }),
        ).toBe(false);
    });

    it('lets ?splash force the splash on in a dev build', () => {
        expect(
            resolveSplashEnabled({ configureFlag: undefined, urlForceOn: true, urlForceOff: false, devMode: true }),
        ).toBe(true);
    });

    it('lets ?nosplash force the splash off in a release build', () => {
        expect(
            resolveSplashEnabled({ configureFlag: undefined, urlForceOn: false, urlForceOff: true, devMode: false }),
        ).toBe(false);
    });

    it('falls back to release-on, dev-off when no override is present', () => {
        expect(
            resolveSplashEnabled({ configureFlag: undefined, urlForceOn: false, urlForceOff: false, devMode: false }),
        ).toBe(true);

        expect(
            resolveSplashEnabled({ configureFlag: undefined, urlForceOn: false, urlForceOff: false, devMode: true }),
        ).toBe(false);
    });
});

describe('readUrlFlags', () => {
    it('reports both flags false when there is no location', () => {
        const original = Reflect.getOwnPropertyDescriptor(globalThis, 'location');

        Reflect.deleteProperty(globalThis, 'location');

        try {
            expect(readUrlFlags()).toEqual({ forceOn: false, forceOff: false });
        } finally {
            if (original) {
                Reflect.defineProperty(globalThis, 'location', original);
            }
        }
    });

    it('reads a valueless ?splash flag', () => {
        withSearch('?splash', () => {
            expect(readUrlFlags()).toEqual({ forceOn: true, forceOff: false });
        });
    });

    it('reads a valueless ?nosplash flag', () => {
        withSearch('?nosplash', () => {
            expect(readUrlFlags()).toEqual({ forceOn: false, forceOff: true });
        });
    });

    it('reads both flags when both appear', () => {
        withSearch('?splash&nosplash', () => {
            expect(readUrlFlags()).toEqual({ forceOn: true, forceOff: true });
        });
    });

    it('ignores an unrelated query string', () => {
        withSearch('?backend=software', () => {
            expect(readUrlFlags()).toEqual({ forceOn: false, forceOff: false });
        });
    });
});

/**
 * Runs `body` with `globalThis.location.search` stubbed to `search`.
 *
 * @param search - Query string including the leading '?'.
 * @param body - Assertions to run while the stub is installed.
 */
function withSearch(search: string, body: () => void): void {
    const original = Reflect.getOwnPropertyDescriptor(globalThis, 'location');

    Reflect.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { search },
        writable: true,
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
