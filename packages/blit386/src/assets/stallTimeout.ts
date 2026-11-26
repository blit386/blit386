/**
 * Idle-timeout wrapper shared by every loader that streams a `fetch` body (`AudioClip`, `BitmapFont`).
 */

/** Maximum silence on a `fetch` (waiting for headers, or between body chunks) before aborting it. */
export const DOWNLOAD_TIMEOUT_MS = 15_000;

/** Thrown by {@link withStallTimeout} when the work went {@link DOWNLOAD_TIMEOUT_MS} without progress. */
export class StallTimeoutError extends Error {
    /** Creates the error with the idle window in its message. */
    constructor() {
        super(`No data received for ${DOWNLOAD_TIMEOUT_MS} ms`);

        this.name = 'StallTimeoutError';
    }
}

/**
 * Runs `run` with an abort signal that fires after {@link DOWNLOAD_TIMEOUT_MS} of silence.
 *
 * The timer covers the wait for headers and restarts whenever `run` calls its `rearm` argument
 * (once per received body chunk), so a slow download that keeps making progress is never cut off.
 * On a stall the signal aborts and the result rejects with {@link StallTimeoutError}, even when the
 * work itself ignores the signal. The timer is always cleared once the work settles.
 *
 * @param run - Work to guard; pass `signal` to `fetch` and call `rearm` on progress.
 * @returns Whatever `run` resolves with.
 * @throws StallTimeoutError if the work stalls; otherwise whatever `run` throws.
 */
export async function withStallTimeout<T>(run: (signal: AbortSignal, rearm: () => void) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let rejectStall: (error: StallTimeoutError) => void = () => undefined;

    const stalled = new Promise<never>((_resolve, reject) => {
        rejectStall = reject;
    });

    const arm = (): void => {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            controller.abort();

            rejectStall(new StallTimeoutError());
        }, DOWNLOAD_TIMEOUT_MS);
    };

    arm();

    try {
        return await Promise.race([run(controller.signal, arm), stalled]);
    } finally {
        clearTimeout(timeoutId);
    }
}
