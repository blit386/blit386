/**
 * Unit tests for the module-scoped audio hooks in `audioDecodeContext.ts`.
 *
 * Verifies the idle defaults (no context, no-op callbacks), that assigned values are what
 * `AudioClip` reads, and that `resetAudioHooks()` restores every default at once.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { audioHooks, resetAudioHooks } from './audioDecodeContext';

afterEach(() => {
    resetAudioHooks();
});

describe('audioDecodeContext', () => {
    describe('decode context', () => {
        it('should be null before any context is assigned', () => {
            expect(audioHooks.context).toBeNull();
        });

        it('should hold the assigned context', () => {
            const context = {} as AudioContext;

            audioHooks.context = context;

            expect(audioHooks.context).toBe(context);
        });
    });

    describe('callbacks', () => {
        it('should not throw from the idle unload callback', () => {
            expect(() => audioHooks.onUnload({} as AudioBuffer)).not.toThrow();
        });

        it('should report no restart from the idle hot-replace callback', () => {
            expect(audioHooks.onHotReplace({} as AudioBuffer, {} as AudioBuffer)).toBe(false);
        });
    });

    describe('resetAudioHooks', () => {
        it('should restore every idle default in one call', () => {
            const onUnload = vi.fn();
            const onHotReplace = vi.fn().mockReturnValue(true);

            audioHooks.context = {} as AudioContext;
            audioHooks.onUnload = onUnload;
            audioHooks.onHotReplace = onHotReplace;

            resetAudioHooks();
            audioHooks.onUnload({} as AudioBuffer);

            expect(audioHooks.context).toBeNull();
            expect(onUnload).not.toHaveBeenCalled();
            expect(audioHooks.onHotReplace({} as AudioBuffer, {} as AudioBuffer)).toBe(false);
            expect(onHotReplace).not.toHaveBeenCalled();
        });
    });
});
