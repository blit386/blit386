import type { Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';

const GPU_PRESENT_DELAY = Number(process.env.GPU_PRESENT_DELAY ?? 100);

test.describe('Sprite Rendering', () => {
    /** Opens a fixture, waits for the first frame, and returns `false` when WebGPU init failed. */
    async function openFixture(page: Page, url: string): Promise<boolean> {
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

        return !initFailed;
    }

    test('should render palette-indexed sprites with offset and batching', async ({ page }) => {
        await page.goto('/sprites.html');

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

        await expect(page.locator('canvas')).toHaveScreenshot('sprites.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching indexed sprites with offsets in software mode', async ({ page }) => {
        await page.goto('/sprites.html?backend=software');

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

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render all 8 sprite orientations and their alternate spellings', async ({ page }) => {
        await page.goto('/sprites-oriented.html');

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

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-oriented.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching sprite orientations in software mode', async ({ page }) => {
        await page.goto('/sprites-oriented.html?backend=software');

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

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-oriented-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render integer scales and uneven stretches', async ({ page }) => {
        if (!(await openFixture(page, '/sprites-stretched.html'))) {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-stretched.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render matching scales and stretches in software mode', async ({ page }) => {
        expect(await openFixture(page, '/sprites-stretched.html?backend=software')).toBe(true);

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-stretched-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render stretched sprites identically on WebGPU and software', async ({ page }) => {
        if (!(await openFixture(page, '/sprites-stretched.html'))) {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        const gpu = await page.locator('canvas').screenshot();

        expect(await openFixture(page, '/sprites-stretched.html?backend=software')).toBe(true);

        const software = await page.locator('canvas').screenshot();

        expect(Buffer.compare(gpu, software)).toBe(0);
    });
});
