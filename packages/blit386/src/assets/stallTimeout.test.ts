/**
 * Unit tests for {@link withStallTimeout}.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DOWNLOAD_TIMEOUT_MS, StallTimeoutError, withStallTimeout } from './stallTimeout';

describe('withStallTimeout', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the result and clears the timer when the work settles in time', async () => {
        vi.useFakeTimers();

        await expect(withStallTimeout(async () => 'done')).resolves.toBe('done');

        expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts the signal and rejects with StallTimeoutError after the idle window', async () => {
        vi.useFakeTimers();

        let signal: AbortSignal | undefined;
        const rejection = expect(
            withStallTimeout((s) => {
                signal = s;

                return new Promise<never>(() => undefined);
            }),
        ).rejects.toBeInstanceOf(StallTimeoutError);

        await vi.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS + 1);
        await rejection;

        expect(signal?.aborted).toBe(true);
    });

    it('re-arms the window each time the work reports progress', async () => {
        vi.useFakeTimers();

        const result = withStallTimeout(async (_signal, rearm) => {
            for (let i = 0; i < 3; i++) {
                await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_TIMEOUT_MS - 1000));
                rearm();
            }

            return 'slow but alive';
        });

        await vi.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS * 4);

        await expect(result).resolves.toBe('slow but alive');
    });
});
