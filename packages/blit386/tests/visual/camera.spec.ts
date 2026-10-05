import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Camera Rendering', () => {
    test('should offset all geometry by the camera position', async ({ page }) => {
        if ((await openFixture(page, '/camera.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await expect(page.locator('canvas')).toHaveScreenshot('camera.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('should render matching camera offsets in software mode', async ({ page }) => {
        expect(await openFixture(page, '/camera.html?backend=software')).toBe('software');

        await expect(page.locator('canvas')).toHaveScreenshot('camera-software.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
