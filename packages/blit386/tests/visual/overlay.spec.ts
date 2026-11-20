import type { Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

/**
 * Seeks to a fixed time. While `BT.renderAt` holds the loop, the overlay draws one fixed snapshot (present FPS at the
 * target, times and counts at 0, empty timing chart, zeroed audio meters), so the live readouts match on every run.
 * That is why the snapshots take Playwright's exact default instead of a pixel-ratio tolerance: a 1 px overlay shift
 * must fail.
 */
async function freezeOverlay(page: Page): Promise<void> {
    await page.evaluate(() =>
        (window as unknown as { BT: { renderAt: (seconds: number) => Promise<void> } }).BT.renderAt(1),
    );
}

test.describe('Engine Overlay', () => {
    test('should render every overlay section', async ({ page }) => {
        if ((await openFixture(page, '/overlay.html')) !== 'webgpu') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        await freezeOverlay(page);

        await expect(page.locator('canvas')).toHaveScreenshot('overlay.png');
    });

    test('should render matching overlay output in software mode', async ({ page }) => {
        expect(await openFixture(page, '/overlay.html?backend=software')).toBe('software');

        await freezeOverlay(page);

        await expect(page.locator('canvas')).toHaveScreenshot('overlay-software.png');
    });
});
