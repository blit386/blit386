import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Sprite Rendering', () => {
    test('should render palette-indexed sprites with offset and batching', async ({ page }) => {
        if ((await openFixture(page, '/sprites.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('sprites.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render matching indexed sprites with offsets in software mode', async ({ page }) => {
        expect(await openFixture(page, '/sprites.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-software.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render all 8 sprite orientations and their alternate spellings', async ({ page }) => {
        if ((await openFixture(page, '/sprites-oriented.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-oriented.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render matching sprite orientations in software mode', async ({ page }) => {
        expect(await openFixture(page, '/sprites-oriented.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-oriented-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render integer scales and uneven stretches', async ({ page }) => {
        const backend = await openFixture(page, '/sprites-stretched.html');

        if (backend !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-stretched.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render matching scales and stretches in software mode', async ({ page }) => {
        expect(await openFixture(page, '/sprites-stretched.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-stretched-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render stretched sprites identically on WebGPU and software', async ({ page }) => {
        const gpuBackend = await openFixture(page, '/sprites-stretched.html');

        if (gpuBackend !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        const gpu = await page.locator('canvas').screenshot();

        expect(await openFixture(page, '/sprites-stretched.html?backend=software')).toBe('software');

        const software = await page.locator('canvas').screenshot();

        expect(Buffer.compare(gpu, software)).toBe(0);
    });

    test('should render nine-slice panels in every mode', async ({ page }) => {
        if ((await openFixture(page, '/sprites-nineslice.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-nineslice.png', { maxDiffPixelRatio: 0.01 });
    });

    test('should render matching nine-slice panels in software mode', async ({ page }) => {
        expect(await openFixture(page, '/sprites-nineslice.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('sprites-nineslice-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render nine-slice panels identically on WebGPU and software', async ({ page }) => {
        if ((await openFixture(page, '/sprites-nineslice.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');
            return;
        }

        const gpu = await page.locator('canvas').screenshot();

        expect(await openFixture(page, '/sprites-nineslice.html?backend=software')).toBe('software');

        const software = await page.locator('canvas').screenshot();

        expect(Buffer.compare(gpu, software)).toBe(0);
    });
});
