/**
 * Unit tests for {@link resolveFrameCaptureShortcutEnabled}, {@link isFrameCaptureShortcutEnabled},
 * and {@link defaultFrameCaptureFilename}.
 *
 * `resolveFrameCaptureShortcutEnabled` is a pure function taking its inputs as parameters, so its
 * tests run in the default Node vitest environment with no `happy-dom` opt-in, mirroring
 * `globalExpose.test.ts`.
 */

import { describe, expect, it, vi } from 'vitest';

import type * as DevModeModule from './devMode';
import {
    defaultFrameCaptureFilename,
    isFrameCaptureShortcutEnabled,
    resolveFrameCaptureShortcutEnabled,
} from './FrameCaptureShortcut';

vi.mock('./devMode', async (importOriginal) => {
    const actual = await importOriginal<typeof DevModeModule>();

    return { ...actual, isDevMode: vi.fn(() => false) };
});

describe('resolveFrameCaptureShortcutEnabled', () => {
    it('returns the configure flag when true, regardless of dev mode', () => {
        expect(resolveFrameCaptureShortcutEnabled({ configureFlag: true, devMode: false })).toBe(true);
    });

    it('returns the configure flag when false, regardless of dev mode', () => {
        expect(resolveFrameCaptureShortcutEnabled({ configureFlag: false, devMode: true })).toBe(false);
    });

    it('falls back to dev mode when no configure flag is given', () => {
        expect(resolveFrameCaptureShortcutEnabled({ devMode: true })).toBe(true);
    });

    it('resolves to false in release when no configure flag is given', () => {
        expect(resolveFrameCaptureShortcutEnabled({ devMode: false })).toBe(false);
    });
});

describe('isFrameCaptureShortcutEnabled', () => {
    it('follows the mocked BT.isDevMode when no configure flag is passed', () => {
        expect(isFrameCaptureShortcutEnabled()).toBe(false);
    });

    it('lets an explicit configure flag override dev mode', () => {
        expect(isFrameCaptureShortcutEnabled(true)).toBe(true);
    });
});

describe('defaultFrameCaptureFilename', () => {
    it('formats a zero-padded local timestamp into the filename', () => {
        const date = new Date(2026, 8, 18, 7, 19, 33);

        expect(defaultFrameCaptureFilename(date)).toBe('blit386-capture-2026-09-18-07-19-33.png');
    });

    it('zero-pads single-digit month, day, hour, minute, and second', () => {
        const date = new Date(2026, 0, 2, 3, 4, 5);

        expect(defaultFrameCaptureFilename(date)).toBe('blit386-capture-2026-01-02-03-04-05.png');
    });

    it('defaults to the current moment when no date is passed', () => {
        const before = Date.now();
        const filename = defaultFrameCaptureFilename();
        const after = Date.now();

        const match = /^blit386-capture-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.png$/.exec(filename);

        expect(match).not.toBeNull();

        const [, year, month, day, hours, minutes, seconds] = match as RegExpExecArray;
        const parsed = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hours),
            Number(minutes),
            Number(seconds),
        ).getTime();

        expect(parsed).toBeGreaterThanOrEqual(before - 1000);
        expect(parsed).toBeLessThanOrEqual(after + 1000);
    });
});
