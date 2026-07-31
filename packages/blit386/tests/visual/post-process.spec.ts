import type { Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';

// Delay after render-complete signal before taking a screenshot, to allow the
// GPU to present the frame. Override via GPU_PRESENT_DELAY env var for CI tuning.
// Falls back to 100 ms if the env var is missing, malformed, or non-positive.
const GPU_PRESENT_DELAY = (() => {
    const raw = process.env.GPU_PRESENT_DELAY;
    if (!raw) {
        return 100;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
})();

/** Maximum allowed pixel-difference ratio across snapshot comparisons. */
const MAX_DIFF = 0.01;

/**
 * Loads the post-process fixture in the requested mode and waits until the
 * scene render has signalled completion (or initialization has failed).
 *
 * @param page - Playwright page handle.
 * @param mode - Fixture mode hash (matches a `case` in the fixture's switch).
 * @returns `true` if the page initialized successfully; `false` when WebGPU
 *   was unavailable in the test environment.
 */
async function loadFixture(page: Page, mode: string): Promise<boolean> {
    await page.goto(`/post-process.html#${mode}`);

    await page.waitForFunction(
        () => {
            const w = window as unknown as Record<string, boolean>;
            return w.__RENDER_COMPLETE__ || w.__INIT_FAILED__;
        },
        { timeout: 10_000 },
    );

    const initFailed = await page.evaluate(() => (window as unknown as Record<string, boolean>).__INIT_FAILED__);

    if (initFailed) {
        return false;
    }

    await page.waitForTimeout(GPU_PRESENT_DELAY);

    return true;
}

/**
 * Common test runner: load fixture, take snapshot.
 *
 * @param page - Playwright page handle.
 * @param mode - Fixture mode hash.
 * @param snapshot - Snapshot file name.
 */
async function runMode(page: Page, mode: string, snapshot: string): Promise<void> {
    const ok = await loadFixture(page, mode);

    if (!ok) {
        test.skip(true, 'WebGPU not available in this environment');
        return;
    }

    await expect(page.locator('canvas')).toHaveScreenshot(snapshot, { maxDiffPixelRatio: MAX_DIFF });
}

test.describe('Post-Process Effects', () => {
    test('baseline scene renders without effects (no chain)', async ({ page }) => {
        await runMode(page, 'baseline', 'post-process-baseline.png');
    });

    test('PixelGlitch alone (pixel tier, chunky bands at logical resolution)', async ({ page }) => {
        await runMode(page, 'pixel-glitch', 'post-process-pixel-glitch.png');
    });

    test('BarrelDistortion alone (display tier, smooth curve at output resolution)', async ({ page }) => {
        await runMode(page, 'barrel', 'post-process-barrel.png');
    });

    test('Scanlines alone (display tier)', async ({ page }) => {
        await runMode(page, 'scanlines', 'post-process-scanlines.png');
    });

    test('RGBMask alone (display tier)', async ({ page }) => {
        await runMode(page, 'mask', 'post-process-mask.png');
    });

    test('Vignette alone (display tier)', async ({ page }) => {
        await runMode(page, 'vignette', 'post-process-vignette.png');
    });

    test('ChromaticAberration alone (display tier)', async ({ page }) => {
        await runMode(page, 'aberration', 'post-process-aberration.png');
    });

    test('Bloom alone (display tier)', async ({ page }) => {
        await runMode(page, 'bloom', 'post-process-bloom.png');
    });

    test('crtPipBoy preset (full CRT stack)', async ({ page }) => {
        await runMode(page, 'crt-pipboy', 'post-process-crt-pipboy.png');
    });

    test('PixelGlitch + crtPipBoy stacked (both tiers active)', async ({ page }) => {
        await runMode(page, 'stacked', 'post-process-stacked.png');
    });

    test('upscale pass with nearest filter (no effects, drawing buffer = 1280x960)', async ({ page }) => {
        await runMode(page, 'upscale-nearest', 'post-process-upscale-nearest.png');
    });

    test('upscale pass with linear filter', async ({ page }) => {
        await runMode(page, 'upscale-linear', 'post-process-upscale-linear.png');
    });
});
