/**
 * Unit tests for {@link resolveDevMode} and {@link isDevMode}.
 *
 * `resolveDevMode` is a pure function taking its inputs as parameters, so its
 * tests run in the default Node vitest environment with no `happy-dom`
 * opt-in – this property is load-bearing for BT-416, which needs `BT`
 * assignment guards to stay testable outside a DOM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as HotRuntimeModule from '../hot/HotRuntime';
import { isDevMode, resolveDevMode } from './devMode';

vi.mock('../hot/HotRuntime', async (importOriginal) => {
    const actual = await importOriginal<typeof HotRuntimeModule>();

    return { ...actual, isHotActive: vi.fn(() => false) };
});

describe('resolveDevMode', () => {
    it('returns the override when true, regardless of other signals', () => {
        expect(resolveDevMode({ override: true, globalDevFlag: false, hotActive: false })).toBe(true);
    });

    it('returns the override when false, regardless of other signals', () => {
        expect(resolveDevMode({ override: false, globalDevFlag: true, hotActive: true })).toBe(false);
    });

    it('falls back to the global dev flag when no override is given', () => {
        expect(resolveDevMode({ globalDevFlag: true, hotActive: false })).toBe(true);
    });

    it('falls back to hot-active when no override and no global dev flag', () => {
        expect(resolveDevMode({ globalDevFlag: false, hotActive: true })).toBe(true);
    });

    it('resolves to release when no signal indicates dev', () => {
        expect(resolveDevMode({ globalDevFlag: false, hotActive: false })).toBe(false);
    });
});

describe('isDevMode', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
    });

    it('returns false when nothing indicates a dev build', () => {
        expect(isDevMode()).toBe(false);
    });

    it('returns true when globalThis.__BLIT386_DEV__ is set', () => {
        globalThis.__BLIT386_DEV__ = true;

        expect(isDevMode()).toBe(true);
    });

    it('treats a missing globalThis.__BLIT386_DEV__ as release, not a crash', () => {
        expect(typeof globalThis.__BLIT386_DEV__).toBe('undefined');
        expect(isDevMode()).toBe(false);
    });

    it('lets an explicit override win over the global dev flag', () => {
        globalThis.__BLIT386_DEV__ = true;

        expect(isDevMode(false)).toBe(false);
    });
});
