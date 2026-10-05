import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Font Rendering', () => {
    test('should render placeholder text at known positions', async ({ page }) => {
        if ((await openFixture(page, '/fonts.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('fonts.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching text output in software mode', async ({ page }) => {
        expect(await openFixture(page, '/fonts.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('fonts-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
