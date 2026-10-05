import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Mixed Rendering', () => {
    test('should render primitives and sprites together with correct layering', async ({ page }) => {
        if ((await openFixture(page, '/mixed.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('mixed.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching primitives and sprites layering in software mode', async ({ page }) => {
        expect(await openFixture(page, '/mixed.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('mixed-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
