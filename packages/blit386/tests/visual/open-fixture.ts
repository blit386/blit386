import type { Page } from '@playwright/test';

/** Backend a fixture actually rendered with; `null` when init failed or the fixture never reported one. */
export type ActiveBackend = 'webgpu' | 'software' | null;

/**
 * Delay after the render-complete signal before a screenshot, to let the GPU present the frame. Override via the
 * `GPU_PRESENT_DELAY` env var for CI tuning; falls back to 100 ms when missing, malformed, or non-positive.
 */
const GPU_PRESENT_DELAY = (() => {
    const parsed = Number.parseInt(process.env.GPU_PRESENT_DELAY ?? '', 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
})();

/**
 * Opens a fixture, waits for the first frame, and returns the backend that actually started.
 *
 * `BTAPI` falls back to the software renderer without calling bootstrap's `onError` when WebGPU init fails, so
 * `__INIT_FAILED__` alone cannot tell a WebGPU render from a software one. Each fixture therefore publishes
 * `window.__ACTIVE_BACKEND__ = BT.activeBackend` right before `__RENDER_COMPLETE__`. WebGPU tests must skip unless this
 * returns `'webgpu'`; software tests must assert `'software'`.
 *
 * @param page - Playwright page handle.
 * @param url - Fixture URL, including any `?backend=` query or `#mode` hash.
 * @returns The active backend, or `null` when init failed.
 */
export async function openFixture(page: Page, url: string): Promise<ActiveBackend> {
    await page.goto(url);
    await page.waitForFunction(
        () => {
            const w = window as unknown as Record<string, boolean>;

            return w.__RENDER_COMPLETE__ || w.__INIT_FAILED__;
        },
        { timeout: 10_000 },
    );

    const initFailed = await page.evaluate(() => (window as unknown as Record<string, boolean>).__INIT_FAILED__);

    await page.waitForTimeout(GPU_PRESENT_DELAY);

    if (initFailed) {
        return null;
    }

    return page.evaluate(() => (window as unknown as { __ACTIVE_BACKEND__: ActiveBackend }).__ACTIVE_BACKEND__);
}
