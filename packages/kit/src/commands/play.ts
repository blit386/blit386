/**
 * `blit play` - play-test the game from a terminal.
 *
 * Opens the game in the Chrome or Edge already on this computer, runs a list of steps (hold keys, wait, read the game
 * state, save frames), and prints one JSON line per step. Made for AI agents whose browser cannot run JavaScript in the
 * page (Cursor's built-in browser, Claude Code in a terminal), and handy for people.
 *
 * `vite` and `playwright-core` are optional peer dependencies loaded with a lazy `import()`: every game already has
 * `vite`, and `playwright-core` (about 13 MB) is only needed by people who use this command, so a game without it gets
 * an install hint instead of a crash. `playwright-core` never downloads a browser; it drives the one installed.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser, Page } from 'playwright-core';
import type { ViteDevServer } from 'vite';
import { detectPackageManager, findProjectRoot, pmAddArgs } from '../env';
import { ui } from '../messages';

const HELP = `Usage: blit play [options] <step> [<step> ...]

Starts the dev server, opens the game in a real browser, runs the steps in order, and prints one JSON line per step.
Exits with code 1 if the page logged an error or a step failed.

Options:
  --seed <n>          Same seed, same game: random rolls repeat on every run (?seed=<n>).
  --url <url>         Use a dev server that is already running instead of starting one.
  --backend software  Use the Canvas 2D renderer instead of WebGPU (?backend=software).
  --headed            Show the browser window instead of running it hidden.
  --help              Show this text.

Steps (keys use KeyboardEvent.code names: ArrowLeft, KeyA, Space, Enter, ...):
  wait:<ms>           Let the game run for <ms> milliseconds.
  press:<key>         Tap a key.
  hold:<key>:<ms>     Hold a key down for <ms> milliseconds.
  move:<x>:<y>        Move the mouse to game pixel (x, y).
  click:<x>:<y>       Click at game pixel (x, y).
  state               Print window.__game.state() (or BT.ticks if the game has no __game).
  shot[:<file.png>]   Save the next frame as a PNG (default: screenshots/tick-<n>.png).
  eval:<expression>   Print the result of a JavaScript expression run in the game page (BT is available).

Example:
  npx blit play --seed 42 wait:1000 state hold:ArrowLeft:500 state shot
`;

/** Tried in this order; the command uses whichever browser the computer already has. */
const BROWSER_CHANNELS = ['chrome', 'msedge'] as const;

/** The only value `?backend=` accepts (`BTAPI.getBackendQueryOverride` in the engine). */
const SOFTWARE_BACKEND = 'software';

/** How long the game gets to run its first tick before the run gives up. */
const START_TIMEOUT_MS = 20_000;

type PlaywrightModule = typeof import('playwright-core');
type ViteModule = typeof import('vite');

/**
 * The shape of the game page's globals, as far as this command reads them. This package compiles for Node without the
 * DOM library, so page code reaches them through `globalThis as unknown as GamePage` instead of `window`/`document`.
 */
interface GamePage {
    document: {
        querySelector(selector: string): {
            getBoundingClientRect(): { left: number; top: number; width: number; height: number };
        } | null;
    };
    BT: {
        ticks: number;
        activeBackend: string | null;
        displaySize: { x: number; y: number };
        captureFrame(): Promise<Blob>;
    };
    __game?: { state(): unknown };
}

const print = (line: Record<string, unknown>): void => {
    process.stdout.write(`${JSON.stringify(line)}\n`);
};

function toNumber(text: string | undefined, what: string): number {
    const value = Number(text);

    if (text === undefined || text === '' || !Number.isFinite(value)) {
        throw new Error(`${what} must be a number, got "${text ?? ''}".`);
    }

    return value;
}

/** Load an optional peer dependency, or return null when the game does not have it installed. */
async function importOptional<T>(name: string): Promise<T | null> {
    try {
        return (await import(name)) as T;
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
            return null;
        }

        throw error;
    }
}

async function launchBrowser(playwright: PlaywrightModule, headed: boolean): Promise<Browser | null> {
    for (const channel of BROWSER_CHANNELS) {
        try {
            return await playwright.chromium.launch({ channel, headless: !headed });
        } catch {
            // Not installed - try the next one.
        }
    }

    return null;
}

/** Game pixel (x, y) -> page position, so steps can use the same coordinates as the game's draw calls. */
function toPagePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
    return page.evaluate(
        ([gx, gy]) => {
            const game = globalThis as unknown as GamePage;
            const canvas = game.document.querySelector('canvas');

            if (!canvas) {
                throw new Error('The page has no <canvas>.');
            }

            const rect = canvas.getBoundingClientRect();
            const size = game.BT.displaySize;

            return {
                x: rect.left + ((gx + 0.5) * rect.width) / size.x,
                y: rect.top + ((gy + 0.5) * rect.height) / size.y,
            };
        },
        [x, y] as const,
    );
}

async function runStep(page: Page, root: string, step: string): Promise<unknown> {
    const [name, ...args] = step.split(':');

    switch (name) {
        case 'wait':
            await page.waitForTimeout(toNumber(args[0], 'wait time'));
            return undefined;
        case 'press':
            await page.keyboard.press(args[0] ?? '');
            return undefined;
        case 'hold':
            await page.keyboard.down(args[0] ?? '');
            await page.waitForTimeout(toNumber(args[1], 'hold time'));
            await page.keyboard.up(args[0] ?? '');
            return undefined;
        case 'move':
        case 'click': {
            const point = await toPagePoint(page, toNumber(args[0], 'x'), toNumber(args[1], 'y'));

            await (name === 'move' ? page.mouse.move(point.x, point.y) : page.mouse.click(point.x, point.y));
            return undefined;
        }
        case 'state':
            return page.evaluate(() => {
                const game = globalThis as unknown as GamePage;

                return game.__game ? game.__game.state() : { ticks: game.BT.ticks };
            });
        case 'shot': {
            // PNG bytes come back as a plain number array, the simplest thing page.evaluate can carry.
            const { ticks, bytes } = await page.evaluate(async () => {
                const game = globalThis as unknown as GamePage;
                const blob = await game.BT.captureFrame();

                return { ticks: game.BT.ticks, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
            });
            const file = resolve(root, args.join(':') || `screenshots/tick-${ticks}.png`);

            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, Uint8Array.from(bytes));
            return { file };
        }
        case 'eval':
            // Playwright runs a string argument as an expression in the page: the caller's own code, in their local game.
            return page.evaluate(args.join(':'));
        default:
            throw new Error(`Unknown step "${step}". Run \`blit play --help\` to see the steps.`);
    }
}

/** Open the page, wait for the game loop, run every step. Returns the process exit code. */
async function playSteps(page: Page, root: string, url: URL, steps: string[]): Promise<number> {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        const source = message.location().url;

        // A missing favicon is the browser's business, not a game error.
        if (message.type() === 'error' && !source.endsWith('/favicon.ico')) {
            errors.push(source ? `${message.text()} (${source})` : message.text());
        }
    });

    await page.goto(url.href);

    // The engine puts BT on the page in dev builds; wait until the game loop has run at least once.
    await page
        .waitForFunction(
            () => {
                try {
                    return (globalThis as unknown as GamePage).BT.ticks > 0;
                } catch {
                    return false;
                }
            },
            null,
            { timeout: START_TIMEOUT_MS },
        )
        .catch(() => {
            throw new Error(`The game did not start within 20 seconds at ${url.href}. Is it a dev build?`);
        });

    // Send keys to the game, not the page. Focus instead of a click, so the pointer stays out of the way.
    await page.focus('canvas');

    print({
        step: 'ready',
        result: await page.evaluate(() => {
            const game = globalThis as unknown as GamePage;

            return { backend: game.BT.activeBackend, ticks: game.BT.ticks };
        }),
        url: url.href,
    });

    let exitCode = 0;

    for (const step of steps) {
        try {
            print({ step, result: await runStep(page, root, step) });
        } catch (error) {
            // The first line says what went wrong; the rest is a stack.
            print({ step, error: (error instanceof Error ? error.message : String(error)).split('\n')[0] });
            exitCode = 1;
            break;
        }
    }

    print({ step: 'done', errors });

    return errors.length > 0 ? 1 : exitCode;
}

export async function runPlay(argv: string[]): Promise<void> {
    const fail = (message: string): void => {
        process.stderr.write(`${ui.error(message)}\n`);
        process.exitCode = 1;
    };

    let parsed: ReturnType<typeof parsePlayArgs>;

    try {
        parsed = parsePlayArgs(argv);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        return;
    }

    const { options, steps } = parsed;

    if (options.help || steps.length === 0) {
        process.stdout.write(HELP);
        process.exitCode = options.help ? 0 : 1;
        return;
    }

    if (options.seed !== undefined && !Number.isSafeInteger(Number(options.seed))) {
        fail(`--seed must be a whole number, got "${options.seed}".`);
        return;
    }

    if (options.backend !== undefined && options.backend !== SOFTWARE_BACKEND) {
        fail(`--backend only accepts "${SOFTWARE_BACKEND}", got "${options.backend}".`);
        return;
    }

    const root = findProjectRoot(process.cwd());

    if (!root) {
        fail("Couldn't find a game here. Run this inside your game folder.");
        return;
    }

    const playwright = await importOptional<PlaywrightModule>('playwright-core');

    if (!playwright) {
        const pm = detectPackageManager(root);

        fail('`blit play` needs the playwright-core package to drive your browser.');
        process.stderr.write(
            `${ui.info(`Add it once with: ${pm} ${[...pmAddArgs(pm, 'playwright-core'), '-D'].join(' ')}`)}\n`,
        );
        return;
    }

    let server: ViteDevServer | null = null;
    let browser: Browser | null = null;

    try {
        if (!options.url) {
            const vite = await importOptional<ViteModule>('vite');

            if (!vite) {
                throw new Error(
                    "Couldn't load vite from this game. Run your package manager's install, then try again.",
                );
            }

            server = await vite.createServer({ root, logLevel: 'error', server: { port: 0, open: false } });
            await server.listen();
        }

        const address = options.url ?? server?.resolvedUrls?.local[0];

        if (!address) {
            throw new Error("The dev server started but didn't report its address. Pass --url instead.");
        }

        const url = new URL(address);

        if (options.seed !== undefined) {
            url.searchParams.set('seed', options.seed);
        }

        if (options.backend) {
            url.searchParams.set('backend', options.backend);
        }

        browser = await launchBrowser(playwright, options.headed);

        if (!browser) {
            throw new Error(
                'Could not find Google Chrome or Microsoft Edge on this computer. Install one and try again.',
            );
        }

        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });

        process.exitCode = await playSteps(page, root, url, steps);
    } catch (error) {
        print({ step: 'failed', error: error instanceof Error ? error.message : String(error) });
        process.exitCode = 1;
    } finally {
        await browser?.close();
        await server?.close();
    }
}

function parsePlayArgs(argv: string[]) {
    // `npm run x -- ...` drops the `--`, other runners pass it along; skip it either way.
    const { values, positionals } = parseArgs({
        args: argv[0] === '--' ? argv.slice(1) : argv,
        allowPositionals: true,
        options: {
            seed: { type: 'string' },
            url: { type: 'string' },
            backend: { type: 'string' },
            headed: { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });

    return { options: values, steps: positionals };
}
