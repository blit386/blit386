/**
 * Unit tests for the module-scoped audio decode/unload seam in
 * `audioDecodeContext.ts`.
 *
 * Verifies the decode context registry round-trips and defaults to `null`,
 * and that the unload handler defaults to a no-op and can be reassigned.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    getAudioDecodeContext,
    notifyAudioClipUnload,
    setAudioClipUnloadHandler,
    setAudioDecodeContext,
} from './audioDecodeContext';

afterEach(() => {
    setAudioDecodeContext(null);
    setAudioClipUnloadHandler(() => {});
});

describe('audioDecodeContext', () => {
    describe('decode context registry', () => {
        it('should return null before any context is registered', () => {
            expect(getAudioDecodeContext()).toBeNull();
        });

        it('should return the registered context', () => {
            const context = {} as AudioContext;

            setAudioDecodeContext(context);

            expect(getAudioDecodeContext()).toBe(context);
        });

        it('should clear the registered context when set to null', () => {
            setAudioDecodeContext({} as AudioContext);
            setAudioDecodeContext(null);

            expect(getAudioDecodeContext()).toBeNull();
        });
    });

    describe('unload handler', () => {
        it('should not throw when no handler is registered', () => {
            expect(() => notifyAudioClipUnload({} as AudioBuffer)).not.toThrow();
        });

        it('should invoke the registered handler with the released buffer', () => {
            const handler = vi.fn();
            const buffer = {} as AudioBuffer;

            setAudioClipUnloadHandler(handler);
            notifyAudioClipUnload(buffer);

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith(buffer);
        });

        it('should stop invoking a replaced handler', () => {
            const firstHandler = vi.fn();
            const secondHandler = vi.fn();

            setAudioClipUnloadHandler(firstHandler);
            setAudioClipUnloadHandler(secondHandler);
            notifyAudioClipUnload({} as AudioBuffer);

            expect(firstHandler).not.toHaveBeenCalled();
            expect(secondHandler).toHaveBeenCalledOnce();
        });
    });
});
