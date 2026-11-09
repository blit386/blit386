import { expect, test } from './coverage-fixture';
import { openFixture } from './open-fixture';

test.describe('Text input', () => {
    test('BT.inputString receives keys typed on the focused canvas', async ({ page }) => {
        expect(await openFixture(page, '/text-input.html?backend=software')).toBe('software');

        await page.locator('canvas').focus();
        await page.keyboard.type('ab');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');

        // Real key events, not synthetic beforeinput: a canvas is not editable, so the browser never sends one.
        await expect
            .poll(() => page.evaluate(() => (window as unknown as { __TYPED__: string }).__TYPED__))
            .toBe('ab\x08\x0d');
    });
});
