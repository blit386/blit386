/**
 * Unit tests for the `?seed=N` resolver and its URL reader.
 *
 * Runs in the default node environment on purpose, like `src/splash/gating.test.ts`:
 * `globalThis.location` is stubbed by hand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSeedUrlParam, resolveSeedUrlParam } from './SeedUrlParam';

describe('resolveSeedUrlParam', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts a positive whole number', () => {
        expect(resolveSeedUrlParam('42')).toBe(42);
    });

    it('accepts 0', () => {
        expect(resolveSeedUrlParam('0')).toBe(0);
    });

    it('accepts a negative whole number', () => {
        expect(resolveSeedUrlParam('-7')).toBe(-7);
    });

    it('returns null when the parameter is absent', () => {
        expect(resolveSeedUrlParam(null)).toBeNull();
    });

    it.each([
        ['1.5', 'float'],
        ['abc', 'non-numeric'],
        ['', 'empty'],
        ['9007199254740993', 'beyond safe integer range'],
    ])('rejects %s (%s) with a warning', (raw) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(resolveSeedUrlParam(raw)).toBeNull();
        expect(warn).toHaveBeenCalledWith(`[BT] Ignoring ?seed=${raw}: it must be a whole number.`);
    });
});

describe('readSeedUrlParam', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns null when there is no location', () => {
        const original = Reflect.getOwnPropertyDescriptor(globalThis, 'location');

        Reflect.deleteProperty(globalThis, 'location');

        try {
            expect(readSeedUrlParam()).toBeNull();
        } finally {
            if (original) {
                Reflect.defineProperty(globalThis, 'location', original);
            }
        }
    });

    it('reads a valid seed from location.search', () => {
        vi.stubGlobal('location', { search: '?nosplash&seed=1234' });

        expect(readSeedUrlParam()).toBe(1234);
    });

    it('returns null when ?seed is absent', () => {
        vi.stubGlobal('location', { search: '?nosplash' });

        expect(readSeedUrlParam()).toBeNull();
    });

    it('returns null and warns when the search string cannot be parsed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const original = globalThis.URLSearchParams;

        vi.stubGlobal('location', { search: '?seed=1' });
        vi.stubGlobal(
            'URLSearchParams',
            class {
                constructor() {
                    throw new Error('malformed');
                }
            },
        );

        try {
            expect(readSeedUrlParam()).toBeNull();
            expect(warn).toHaveBeenCalledWith('[BT] Failed to parse ?seed URL parameter:', expect.any(Error));
        } finally {
            vi.stubGlobal('URLSearchParams', original);
        }
    });
});
