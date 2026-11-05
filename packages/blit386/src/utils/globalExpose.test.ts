/**
 * Unit tests for {@link resolveExposeGlobal} and {@link exposeGlobal}.
 *
 * `resolveExposeGlobal` is a pure function taking its inputs as parameters, so its tests run in
 * the default Node vitest environment with no `happy-dom` opt-in - this property is load-bearing
 * for BT-416, which needs the `window.BT` assignment guard to stay testable outside a DOM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputTrace } from '../input/InputTrace';
import type * as DevModeModule from './devMode';
import { exposeGlobal, exposeInputTrace, resolveExposeGlobal } from './globalExpose';

vi.mock('./devMode', async (importOriginal) => {
    const actual = await importOriginal<typeof DevModeModule>();

    return { ...actual, isDevMode: vi.fn(() => false) };
});

describe('resolveExposeGlobal', () => {
    it('returns the override when true, regardless of dev mode', () => {
        expect(resolveExposeGlobal({ override: true, devMode: false })).toBe(true);
    });

    it('returns the override when false, regardless of dev mode', () => {
        expect(resolveExposeGlobal({ override: false, devMode: true })).toBe(false);
    });

    it('falls back to dev mode when no override is given', () => {
        expect(resolveExposeGlobal({ devMode: true })).toBe(true);
    });

    it('resolves to false in release when no override is given', () => {
        expect(resolveExposeGlobal({ devMode: false })).toBe(false);
    });
});

describe('exposeGlobal', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'window');
    });

    it('does not throw when there is no window (default Node environment)', () => {
        expect(typeof globalThis.window).toBe('undefined');
        expect(() => exposeGlobal({ id: 'BT' })).not.toThrow();
    });

    it('does not assign anything when there is no window', () => {
        exposeGlobal({ id: 'BT' }, true);

        expect(typeof globalThis.window).toBe('undefined');
    });

    it('assigns to window.BT when a window is present and gating allows it', () => {
        const fakeWindow = {} as Window;

        Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

        const value = { id: 'BT' };

        exposeGlobal(value, true);

        expect(fakeWindow.BT).toBe(value);
    });

    it('does not assign to window.BT when gating disallows it', () => {
        const fakeWindow = {} as Window;

        Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

        exposeGlobal({ id: 'BT' }, false);

        expect(fakeWindow.BT).toBeUndefined();
    });
});

describe('exposeInputTrace', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'window');
    });

    it('does not throw when there is no window', () => {
        expect(() => exposeInputTrace(new InputTrace(), true)).not.toThrow();
    });

    it('assigns a start / stop facade over the trace when gating allows it', () => {
        const fakeWindow = {} as Window;

        Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

        const trace = new InputTrace();

        exposeInputTrace(trace, true);

        const facade = fakeWindow.__btInputTrace;

        expect(facade?.isRecording).toBe(false);
        facade?.start({ maxEntries: 5 });
        expect(trace.isRecording).toBe(true);
        expect(facade?.isRecording).toBe(true);
        expect(facade?.stop()).toEqual({ entries: [], isTruncated: false });
        expect(Object.keys(facade ?? {})).toEqual(['start', 'stop', 'isRecording']);
    });

    it('does not assign when gating disallows it (release build, no override)', () => {
        const fakeWindow = {} as Window;

        Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

        exposeInputTrace(new InputTrace());

        expect(fakeWindow.__btInputTrace).toBeUndefined();
    });
});
