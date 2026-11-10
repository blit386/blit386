import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

/**
 * BT-756: cases where the WebGPU backend used to draw differently from the software blit, which
 * `docs/api-rendering.md` names the pixel spec. Each case renders `render-parity.html#<mode>` on both
 * backends and compares the canvases byte for byte, with no stored baseline.
 */
test.describe('Render backend parity', () => {
    for (const [name, mode] of [
        ['a rect fill drawn over a sprite', 'order'],
        ['a sprite drawn over a rect fill', 'reverse'],
        ['system text under a later rect outline', 'text'],
        ['empty and negative sizes beside a 1px-tall outline', 'sizes'],
        ['a half-transparent palette slot over opaque draws', 'alpha'],
    ]) {
        test(`should render ${name} identically on WebGPU and software (BT-756)`, async ({ page }) => {
            if ((await openFixture(page, `/render-parity.html#${mode}`)) !== 'webgpu') {
                test.skip(true, 'WebGPU not available in this environment');
                return;
            }

            const gpu = await page.locator('canvas').screenshot();

            expect(await openFixture(page, `/render-parity.html?backend=software#${mode}`)).toBe('software');

            const software = await page.locator('canvas').screenshot();

            expect(Buffer.compare(gpu, software)).toBe(0);
        });
    }
});
