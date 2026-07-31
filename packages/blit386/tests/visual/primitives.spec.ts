import { expect, test } from './coverage-fixture';

// Delay after render-complete signal before taking a screenshot, to allow the
// GPU to present the frame. Override via GPU_PRESENT_DELAY env var for CI tuning.
const GPU_PRESENT_DELAY = Number(process.env.GPU_PRESENT_DELAY ?? 100);

test.describe('Primitive Rendering', () => {
    test('should render known primitive patterns', async ({ page }) => {
        await page.goto('/primitives.html');

        // Wait for either render completion or initialization failure.
        await page.waitForFunction(
            () => {
                const w = window as unknown as Record<string, boolean>;
                return w.__RENDER_COMPLETE__ || w.__INIT_FAILED__;
            },
            { timeout: 10_000 },
        );

        // Check if WebGPU initialization failed (hardware-dependent).
        const initFailed = await page.evaluate(() => (window as unknown as Record<string, boolean>).__INIT_FAILED__);

        if (initFailed) {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        // Wait for the GPU to present the rendered frame before capturing.
        await page.waitForTimeout(GPU_PRESENT_DELAY);

        await expect(page.locator('canvas')).toHaveScreenshot('primitives.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching primitive patterns in software mode', async ({ page }) => {
        await page.goto('/primitives.html?backend=software');

        await page.waitForFunction(
            () => {
                const w = window as unknown as Record<string, boolean>;
                return w.__RENDER_COMPLETE__ || w.__INIT_FAILED__;
            },
            { timeout: 10_000 },
        );

        const initFailed = await page.evaluate(() => (window as unknown as Record<string, boolean>).__INIT_FAILED__);
        expect(initFailed).toBeFalsy();

        await page.waitForTimeout(GPU_PRESENT_DELAY);

        await expect(page.locator('canvas')).toHaveScreenshot('primitives-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
