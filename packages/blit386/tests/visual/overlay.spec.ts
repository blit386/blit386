import type { Page } from '@playwright/test';

import { expect, test } from './coverage-fixture';

/** Live frames to run before the snapshot: enough to fill part of the timing chart and pass both tags. */
const FRAME_COUNT = 90;

/** Exact fixed-step interval at the fixture's 60 FPS. */
const FRAME_MS = 1000 / 60;

/**
 * Fixed RMS level each bus analyzer reports, in the order AudioManager.enableBusMetering creates them (main, music,
 * sfx): one over the clip threshold, one over the warning threshold, one normal, so every meter tint draws.
 */
const BUS_LEVELS = [1, 0.8, 0.4];

/**
 * Replaces requestAnimationFrame, cancelAnimationFrame, and performance.now with a manual clock, so every overlay
 * reading - present FPS, frame/update()/render() times, the timing chart - comes from time the test hands out, the same
 * on every run. `__spendMs` lets the fixture's update() and render() take a fixed time. Same clock as
 * render-at.spec.ts, plus that hook.
 */
async function installManualClock(page: Page): Promise<void> {
    await page.addInitScript(() => {
        let now = 0;
        let nextId = 1;
        const pending = new Map<number, FrameRequestCallback>();
        const w = window as unknown as Record<string, unknown>;

        Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
        w.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            const id = nextId++;

            pending.set(id, callback);

            return id;
        };
        w.cancelAnimationFrame = (id: number): void => {
            pending.delete(id);
        };
        w.__spendMs = (ms: number): void => {
            now += ms;
        };
        w.__advanceFrame = (ms: number): void => {
            now += ms;

            const callbacks = [...pending.values()];

            pending.clear();
            for (const callback of callbacks) {
                callback(now);
            }
        };
    });
}

/**
 * Bus meters read AnalyserNode samples in real time. Each analyzer instead reports a constant signal whose RMS is its
 * bus's BUS_LEVELS entry, so the meter bars are the same on every run.
 */
async function installFixedBusLevels(page: Page): Promise<void> {
    await page.addInitScript((busLevels: number[]) => {
        const levels = new WeakMap<AnalyserNode, number>();
        const createAnalyser = AudioContext.prototype.createAnalyser;
        let analyzerCount = 0;

        AudioContext.prototype.createAnalyser = function (this: AudioContext): AnalyserNode {
            const analyzer = createAnalyser.call(this);

            levels.set(analyzer, busLevels[analyzerCount++] ?? 0);

            return analyzer;
        };
        AnalyserNode.prototype.getFloatTimeDomainData = function (this: AnalyserNode, samples: Float32Array): void {
            samples.fill(levels.get(this) ?? 0);
        };
    }, BUS_LEVELS);
}

/**
 * Loads the fixture under the manual clock and runs FRAME_COUNT live frames.
 *
 * @returns The active backend, or `null` when init failed.
 */
async function runOverlay(page: Page, query: string): Promise<'webgpu' | 'software' | null> {
    await installManualClock(page);
    await installFixedBusLevels(page);
    await page.goto(`/overlay.html${query}`);
    // Timer polling, not Playwright's default 'raf': the manual clock replaced requestAnimationFrame.
    await page.waitForFunction(
        () => {
            const w = window as unknown as { __BOOTED__: boolean; __INIT_FAILED__: boolean };

            return w.__BOOTED__ || w.__INIT_FAILED__;
        },
        undefined,
        { polling: 50, timeout: 10_000 },
    );

    // Bus levels read 0 until a user gesture unlocks audio; a trusted key press on the canvas is that gesture.
    await page.locator('canvas').press('Shift');
    await page.waitForFunction(
        () => {
            const w = window as unknown as { BT: { isAudioUnlocked: boolean }; __INIT_FAILED__: boolean };

            return w.__INIT_FAILED__ || w.BT.isAudioUnlocked;
        },
        undefined,
        { polling: 50, timeout: 10_000 },
    );

    return page.evaluate(
        ({ frames, frameMs }) => {
            const w = window as unknown as {
                BT: { activeBackend: 'webgpu' | 'software' | null };
                __INIT_FAILED__: boolean;
                __advanceFrame: (ms: number) => void;
            };

            if (w.__INIT_FAILED__) {
                return null;
            }

            // GameLoop.start() spends two frames before timing begins.
            w.__advanceFrame(0);
            w.__advanceFrame(0);

            for (let frame = 0; frame < frames; frame++) {
                w.__advanceFrame(frameMs);
            }

            return w.BT.activeBackend;
        },
        { frames: FRAME_COUNT, frameMs: FRAME_MS },
    );
}

// Exact comparison (Playwright's default, no pixel-ratio tolerance): the manual clock and the fixed bus levels make
// every frame byte-identical, and a 1 px overlay shift must fail.
test.describe('Engine Overlay', () => {
    test('should render every overlay section', async ({ page }) => {
        const backend = await runOverlay(page, '');

        // Skip only a silent software fallback (no WebGPU in this browser); a failed init (null) must fail.
        if (backend === 'software') {
            test.skip(true, 'WebGPU not available in this environment');

            return;
        }

        expect(backend).toBe('webgpu');
        await expect(page.locator('canvas')).toHaveScreenshot('overlay.png');
    });

    test('should render matching overlay output in software mode', async ({ page }) => {
        expect(await runOverlay(page, '?backend=software')).toBe('software');
        await expect(page.locator('canvas')).toHaveScreenshot('overlay-software.png');
    });
});
