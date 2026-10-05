import type { Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

/** Maximum allowed pixel-difference ratio across snapshot comparisons. */
const MAX_DIFF = 0.01;

/**
 * Common test runner: load fixture, take snapshot.
 *
 * Every mode needs the WebGPU backend, so each test skips unless the fixture reports `'webgpu'`. Effect modes throw
 * from `BT.effectAdd` on the software renderer, which fails fixture init and reports `null`; the baseline and upscale
 * modes add no effect, so on a silent software fallback they would render without error and need the backend check.
 *
 * @param page - Playwright page handle.
 * @param mode - Fixture mode hash (matches a `case` in the fixture's switch).
 * @param snapshot - Snapshot file name.
 */
async function runMode(page: Page, mode: string, snapshot: string): Promise<void> {
    if ((await openFixture(page, `/post-process.html#${mode}`)) !== 'webgpu') {
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
