#!/usr/bin/env node
/**
 * Smoke test for the single-file CDN path (docs/guide-single-file.md, BT-857): a plain HTML page imports the built
 * `dist/blit386.js` as an ES module, with no bundler and no import map, boots a game in headless Chrome, and must
 * draw a frame. A build change that adds a bare import (`import 'some-dep'`) or splits out a chunk breaks this path for
 * every pasted game; the browser then fails to load the module and the test fails.
 *
 * The page and the engine are served from disk through Playwright request routing on a fake origin, so nothing here
 * transforms the module the way Vite would. Every other request is refused and reported. The software backend is
 * forced (`?backend=software`) so the test needs no GPU: module loading is what it checks, not WebGPU.
 *
 * Usage (after `pnpm run build`): pnpm run test:single-file
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_BUNDLE = join(PACKAGE_ROOT, 'dist', 'blit386.js');
const ORIGIN = 'http://single-file.test';
const ENGINE_URL = `${ORIGIN}/npm/blit386/dist/blit386.js`;
const PAGE_URL = `${ORIGIN}/index.html?backend=software`;
const FRAME_TIMEOUT_MS = 15_000;

// Palette slot 1 is painted this color, so a drawn frame is told apart from a blank canvas.
const CLEAR_RGB = [18, 22, 40];

const PAGE_HTML = `<!doctype html>
<html lang="en">
    <head><meta charset="UTF-8" /><title>single-file smoke</title></head>
    <body>
        <canvas id="blit386-canvas"></canvas>
        <script type="module">
            import { bootstrap, BT, Color32 } from '${ENGINE_URL}';

            window.__FRAMES__ = 0;

            class Game {
                configure() {
                    return { isSplashEnabled: false };
                }

                async init() {
                    const palette = BT.paletteCreate(16);

                    palette.set(1, new Color32(${CLEAR_RGB.join(', ')}));
                    BT.paletteSet(palette);

                    return true;
                }

                update() {}

                render() {
                    BT.clear(1);
                    window.__BACKEND__ = BT.activeBackend;
                    window.__FRAMES__ += 1;
                }
            }

            bootstrap(Game, { onError: (error) => { window.__BOOT_ERROR__ = String(error); } });
        </script>
    </body>
</html>
`;

/**
 * Boot the page and wait for a drawn frame.
 *
 * @returns {Promise<string[]>} Every problem found; empty when the smoke test passed.
 */
async function run() {
    const engineSource = readFileSync(ENGINE_BUNDLE, 'utf8');
    const browser = await chromium.launch({ channel: 'chrome' });

    /** @type {string[]} */
    const problems = [];

    try {
        const page = await browser.newPage();

        page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                problems.push(`console error: ${message.text()}`);
            }
        });

        await page.route('**/*', (route) => {
            const url = route.request().url();

            if (url === PAGE_URL) {
                return route.fulfill({ contentType: 'text/html', body: PAGE_HTML });
            }

            if (url === ENGINE_URL) {
                return route.fulfill({ contentType: 'text/javascript', body: engineSource });
            }

            problems.push(`unexpected request: ${url}`);

            return route.abort();
        });

        await page.goto(PAGE_URL);

        try {
            await page.waitForFunction(
                () => globalThis.__FRAMES__ >= 2 || globalThis.__BOOT_ERROR__ !== undefined,
                null,
                {
                    timeout: FRAME_TIMEOUT_MS,
                },
            );
        } catch {
            problems.push(`no frame drawn within ${FRAME_TIMEOUT_MS} ms`);

            return problems;
        }

        const state = await page.evaluate(() => {
            const canvas = /** @type {HTMLCanvasElement} */ (globalThis.document.getElementById('blit386-canvas'));
            const pixel = canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data;

            return {
                bootError: globalThis.__BOOT_ERROR__,
                backend: globalThis.__BACKEND__,
                pixel: pixel ? [...pixel.slice(0, 3)] : null,
            };
        });

        if (state.bootError !== undefined) {
            problems.push(`bootstrap failed: ${state.bootError}`);
        } else if (state.backend !== 'software') {
            problems.push(`expected the software backend, got ${String(state.backend)}`);
        } else if (JSON.stringify(state.pixel) !== JSON.stringify(CLEAR_RGB)) {
            problems.push(
                `canvas pixel (0, 0) is ${JSON.stringify(state.pixel)}, expected ${JSON.stringify(CLEAR_RGB)}`,
            );
        }
    } finally {
        await browser.close();
    }

    return problems;
}

const problems = await run();

if (problems.length > 0) {
    console.error('Single-file smoke test failed: dist/blit386.js does not boot from a plain HTML page.');

    for (const problem of problems) {
        console.error(`  ${problem}`);
    }

    process.exitCode = 1;
} else {
    console.log('Single-file smoke test passed: dist/blit386.js booted from a plain HTML page and drew a frame.');
}
