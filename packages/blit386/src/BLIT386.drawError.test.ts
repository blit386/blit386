// @vitest-environment happy-dom
/**
 * A draw call that throws inside a running game (BT-765): the error is reported once, the game's
 * canvas stays in its container, and release builds show no panel at all.
 */

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { startEngine } from './__test__/engineHarness';
import { BT } from './BLIT386';
import { DEFAULT_CONTAINER_ID, setErrorContainerID } from './utils/BootstrapHelpers';
import { Rect2i } from './utils/Rect2i';

const RECT = new Rect2i(1, 1, 4, 4);
const FRAMES = 3;

let dispose: (() => void) | null = null;
let consoleError: MockInstance;

/**
 * Builds `<div id={id}><canvas></canvas></div>` in the document, like the demos page and the
 * scaffolded template.
 *
 * @param id - Container ID.
 * @returns The container and its canvas.
 */
function mountContainer(id: string): { container: HTMLElement; canvas: HTMLCanvasElement } {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');

    container.id = id;
    container.appendChild(canvas);
    document.body.appendChild(container);

    return { container, canvas };
}

/**
 * Runs the engine for {@link FRAMES} frames with a `BT.drawRect` call using a bad palette index on
 * every update and render.
 *
 * @param paletteIndex - Out-of-range index; distinct per test so each message is new.
 */
async function runBadDraws(paletteIndex: number): Promise<void> {
    const harness = await startEngine({
        read: () => {
            BT.drawRect(RECT, paletteIndex);
        },
    });

    dispose = harness.dispose;
    harness.runAt(60, FRAMES);
}

/**
 * Counts the `console.error` calls that report a demo error.
 *
 * @returns Number of `[BT] Demo Error` lines logged.
 */
function demoErrorLogCount(): number {
    return consoleError.mock.calls.filter((call) => String(call[0]).includes('Demo Error')).length;
}

beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    dispose?.();
    dispose = null;
    setErrorContainerID(DEFAULT_CONTAINER_ID);
    vi.unstubAllGlobals();
    consoleError.mockRestore();
    document.body.replaceChildren();
});

describe('BT draw errors in a running game', () => {
    it('keeps the canvas and shows one panel and one log line in a dev build', async () => {
        const { container, canvas } = mountContainer(DEFAULT_CONTAINER_ID);

        vi.stubGlobal('__BLIT386_DEV__', true);
        await runBadDraws(-1);

        expect(container.contains(canvas)).toBe(true);
        expect(container.querySelectorAll('[data-bt-error]')).toHaveLength(1);
        expect(demoErrorLogCount()).toBe(1);
    });

    it('logs once and shows no panel in a release build', async () => {
        const { container, canvas } = mountContainer(DEFAULT_CONTAINER_ID);

        await runBadDraws(-2);

        expect(container.contains(canvas)).toBe(true);
        expect(container.querySelectorAll('[data-bt-error]')).toHaveLength(0);
        expect(demoErrorLogCount()).toBe(1);
    });

    it("uses the bootstrap's containerID", async () => {
        const { container, canvas } = mountContainer('custom-container');

        setErrorContainerID('custom-container');
        vi.stubGlobal('__BLIT386_DEV__', true);
        await runBadDraws(-3);

        expect(container.contains(canvas)).toBe(true);
        expect(container.querySelectorAll('[data-bt-error]')).toHaveLength(1);
        expect(demoErrorLogCount()).toBe(1);
    });
});
