import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { test as baseTest } from '@playwright/test';

const NYC_OUTPUT_DIR = path.resolve(process.cwd(), '.nyc_output');

/**
 * Extended Playwright test fixture that collects Istanbul coverage data
 * from the browser after each test. Only active when VISUAL_COVERAGE=1.
 *
 * Coverage JSON files are written to .nyc_output/ for nyc to process.
 */
export const test = baseTest.extend({
    context: async ({ context }, use) => {
        await use(context);

        // Only collect coverage when VISUAL_COVERAGE is set.
        if (!process.env.VISUAL_COVERAGE) {
            return;
        }

        // Ensure output directory exists.
        if (!fs.existsSync(NYC_OUTPUT_DIR)) {
            fs.mkdirSync(NYC_OUTPUT_DIR, { recursive: true });
        }

        // Collect coverage from all pages in this context.
        for (const page of context.pages()) {
            try {
                const coverage = await page.evaluate(() => {
                    const w = window as unknown as Record<string, unknown>;

                    return w.__coverage__ ? JSON.stringify(w.__coverage__) : null;
                });

                if (coverage) {
                    const id = crypto.randomUUID();
                    const filename = path.join(NYC_OUTPUT_DIR, `playwright-${id}.json`);

                    fs.writeFileSync(filename, coverage);
                }
            } catch {
                // Page may have been closed or navigated away; skip silently.
            }
        }
    },
});

export { expect } from '@playwright/test';
