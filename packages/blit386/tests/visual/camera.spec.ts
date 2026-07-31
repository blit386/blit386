import { expect, test } from './coverage-fixture';

const GPU_PRESENT_DELAY = Number(process.env.GPU_PRESENT_DELAY ?? 100);

test.describe('Camera Rendering', () => {
    test('should offset all geometry by the camera position', async ({ page }) => {
        await page.goto('/camera.html');

        await page.waitForFunction(
            () => {
                const w = window as unknown as Record<string, boolean>;
                return w.__RENDER_COMPLETE__ || w.__INIT_FAILED__;
            },
            { timeout: 10_000 },
        );

        const initFailed = await page.evaluate(() => (window as unknown as Record<string, boolean>).__INIT_FAILED__);

        if (initFailed) {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await page.waitForTimeout(GPU_PRESENT_DELAY);

        await expect(page.locator('canvas')).toHaveScreenshot('camera.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching camera offsets in software mode', async ({ page }) => {
        await page.goto('/camera.html?backend=software');

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

        await expect(page.locator('canvas')).toHaveScreenshot('camera-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
