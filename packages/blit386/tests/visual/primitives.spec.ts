import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Primitive Rendering', () => {
    test('should render known primitive patterns', async ({ page }) => {
        if ((await openFixture(page, '/primitives.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('primitives.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching primitive patterns in software mode', async ({ page }) => {
        expect(await openFixture(page, '/primitives.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('primitives-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
