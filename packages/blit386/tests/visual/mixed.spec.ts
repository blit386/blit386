import { expect, test } from './coverage-fixture';

const GPU_PRESENT_DELAY = Number(process.env.GPU_PRESENT_DELAY ?? 100);

test.describe('Mixed Rendering', () => {
    test('should render primitives and sprites together with correct layering', async ({ page }) => {
        await page.goto('/mixed.html');

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

        await expect(page.locator('canvas')).toHaveScreenshot('mixed.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching primitives and sprites layering in software mode', async ({ page }) => {
        await page.goto('/mixed.html?backend=software');

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

        await expect(page.locator('canvas')).toHaveScreenshot('mixed-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
