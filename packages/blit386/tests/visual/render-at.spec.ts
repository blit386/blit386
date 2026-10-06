import type { BrowserContext, Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';

/** Tick both runs meet at - odd, mid-cycle, a few seconds in. */
const TARGET_TICK = 157;

/** Exact fixed-step interval at the fixture's 60 FPS. */
const FRAME_MS = 1000 / 60;

/**
 * Replaces requestAnimationFrame, cancelAnimationFrame, and performance.now with a manual clock, so the test - not the
 * browser - decides when frames run and how much time each covers. Installed before any page script runs.
 */
async function installManualClock(page: Page): Promise<void> {
    await page.addInitScript(() => {
        let now = 0;
        let nextId = 1;
        const pending = new Map<number, FrameRequestCallback>();
        const w = window as unknown as Record<string, unknown>;

        Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
        w.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            const id = nextId++;

            pending.set(id, callback);

            return id;
        };
        w.cancelAnimationFrame = (id: number): void => {
            pending.delete(id);
        };
        w.__advanceFrame = (ms: number): void => {
            now += ms;

            const callbacks = [...pending.values()];

            pending.clear();
            for (const callback of callbacks) {
                callback(now);
            }
        };
    });
}

/**
 * Loads the fixture under the manual clock and waits until bootstrap has created the loop.
 *
 * @returns The active backend, or `null` when init failed.
 */
async function openUnderManualClock(page: Page, query: string): Promise<'webgpu' | 'software' | null> {
    await installManualClock(page);
    await page.goto(`/render-at.html${query}`);
    // Timer polling, not Playwright's default 'raf': the manual clock replaced requestAnimationFrame.
    await page.waitForFunction(
        () => {
            const w = window as unknown as { __BOOTED__: boolean; __INIT_FAILED__: boolean };

            return w.__BOOTED__ || w.__INIT_FAILED__;
        },
        undefined,
        { polling: 50, timeout: 10_000 },
    );

    return page.evaluate(() => {
        const w = window as unknown as {
            BT: { activeBackend: 'webgpu' | 'software' | null };
            __INIT_FAILED__: boolean;
        };

        return w.__INIT_FAILED__ ? null : w.BT.activeBackend;
    });
}

/** A captured frame: PNG bytes as base64 for an exact comparison, plus a distinct-color count. */
interface CapturedFrame {
    png: string;
    colors: number;
}

/**
 * Describes a PNG Blob in the page: its bytes as base64 so Node can compare them, and its distinct-color count so two
 * blank frames cannot pass as a match.
 */
const DESCRIBE_BLOB = `async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return { png: btoa(binary), colors: colors.size };
}`;

/** Runs the live loop to TARGET_TICK in exact fixed steps, then captures at that tick. */
async function captureLive(page: Page): Promise<CapturedFrame> {
    return page.evaluate(
        async ({ target, frameMs, describeSource }) => {
            const w = window as unknown as {
                BT: { ticks: number; captureFrame: () => Promise<Blob> };
                __advanceFrame: (ms: number) => void;
            };
            const describe = new Function(`return ${describeSource}`)() as (
                blob: Blob,
            ) => Promise<{ png: string; colors: number }>;

            // GameLoop.start() spends two frames before timing begins.
            w.__advanceFrame(0);
            w.__advanceFrame(0);

            for (let guard = 0; w.BT.ticks < target; guard++) {
                if (guard > target * 4) {
                    throw new Error(`live loop stalled at tick ${w.BT.ticks}`);
                }

                w.__advanceFrame(frameMs);
            }

            if (w.BT.ticks !== target) {
                throw new Error(`live loop overshot to tick ${w.BT.ticks}`);
            }

            // A zero-time frame renders the current tick again with no update, settling the capture.
            const capture = w.BT.captureFrame();

            w.__advanceFrame(0);

            return describe(await capture);
        },
        { target: TARGET_TICK, frameMs: FRAME_MS, describeSource: DESCRIBE_BLOB },
    );
}

/** Seeks a fresh page straight to TARGET_TICK and captures. */
async function captureSeek(page: Page): Promise<CapturedFrame> {
    return page.evaluate(
        async ({ seconds, target, describeSource }) => {
            const w = window as unknown as {
                BT: { ticks: number; renderAt: (s: number) => Promise<void>; captureFrame: () => Promise<Blob> };
            };
            const describe = new Function(`return ${describeSource}`)() as (
                blob: Blob,
            ) => Promise<{ png: string; colors: number }>;

            await w.BT.renderAt(seconds);

            if (w.BT.ticks !== target) {
                throw new Error(`seek landed on tick ${w.BT.ticks}`);
            }

            return describe(await w.BT.captureFrame());
        },
        { seconds: TARGET_TICK / 60, target: TARGET_TICK, describeSource: DESCRIBE_BLOB },
    );
}

/**
 * Captures the live-loop frame and the seeked frame on two separate pages.
 *
 * Pages come from the test's `context` (which `coverage-fixture` extends) and are left open for context teardown to
 * close: the fixture collects visual coverage from `context.pages()` after the test body, so closing them here would
 * throw that coverage away.
 *
 * @returns The backend and both captures, or `null` captures when init failed.
 */
async function liveVersusSeek(
    context: BrowserContext,
    query: string,
): Promise<{ backend: string | null; live: CapturedFrame | null; seek: CapturedFrame | null }> {
    const livePage = await context.newPage();
    const seekPage = await context.newPage();
    const backend = await openUnderManualClock(livePage, query);

    if (backend === null) {
        return { backend, live: null, seek: null };
    }

    await openUnderManualClock(seekPage, query);

    return { backend, live: await captureLive(livePage), seek: await captureSeek(seekPage) };
}

// Both pages pin ?seed=: BT.random otherwise time-seeds from Date.now(), which the manual clock
// does not fake, so the two page loads would draw different streams before any seek.
test.describe('BT.renderAt determinism', () => {
    test('a seeked frame matches the live loop byte for byte (WebGPU)', async ({ context }) => {
        const result = await liveVersusSeek(context, '?seed=7');

        if (result.backend !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        expect(result.live?.colors).toBeGreaterThan(2);
        expect(result.seek?.png).toBe(result.live?.png);
    });

    test('a seeked frame matches the live loop byte for byte (software)', async ({ context }) => {
        const result = await liveVersusSeek(context, '?backend=software&seed=7');

        expect(result.backend).toBe('software');
        expect(result.live?.colors).toBeGreaterThan(2);
        expect(result.seek?.png).toBe(result.live?.png);
    });

    // The sync-editor case: scrub back on the page that just played, so the 'start' reset (RNG
    // restore, effect clear, init() re-run) has live state to undo, not a fresh boot.
    test('a scrub on the page that played matches its own live frame (software)', async ({ context }) => {
        const page = await context.newPage();

        expect(await openUnderManualClock(page, '?backend=software&seed=7')).toBe('software');

        const live = await captureLive(page);
        const seek = await captureSeek(page);

        expect(live.colors).toBeGreaterThan(2);
        expect(seek.png).toBe(live.png);
    });
});
