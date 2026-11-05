/**
 * Refresh-rate tests for input edges through the real `BTAPI` loop (BT-743).
 *
 * Ports the BT-696 browser hand checks (and one BT-683 gamepad case) onto the engine harness: at
 * 60, 120 and 144 Hz with `targetFPS: 60`, every pointer release reaches `update()`, each press
 * reaches exactly one `update()`, and the delta and wheel totals `update()` sees match what was sent.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { startEngine } from '../__test__/engineHarness';
import { BT } from '../BLIT386';

const RATES = [60, 120, 144];

/** A click count large enough that releases land before both update and render-only frames. */
const CLICKS = 20;

let dispose: (() => void) | null = null;

afterEach(() => {
    dispose?.();
    dispose = null;
});

/**
 * Boots the harness and registers it for disposal.
 *
 * @param options - Forwarded to `startEngine`.
 * @returns The harness.
 */
async function boot<T>(options: Parameters<typeof startEngine<T>>[0]): ReturnType<typeof startEngine<T>> {
    const harness = await startEngine(options);

    dispose = harness.dispose;

    return harness;
}

/**
 * Frames to hold each state: always spans more than one update interval, so press and release
 * never fall between the same two updates (a down and up inside one gap has its own test below).
 *
 * @param hz - Display refresh rate.
 * @returns Frames per hold.
 */
function holdFrames(hz: number): number {
    return Math.ceil(hz / 60) + 1;
}

describe('input edges through the real loop at display refresh rates', () => {
    it.each(RATES)('the harness clock runs 60 updates per second at %i Hz', async (hz) => {
        const harness = await boot({ read: () => null });

        expect(Math.abs(harness.runAt(hz, hz) - 60)).toBeLessThanOrEqual(1);
        expect(harness.renders).toHaveLength(hz);
    });

    it.each(RATES)('every pointer release reaches update() and each press reaches exactly one at %i Hz', async (hz) => {
        const harness = await boot({
            read: () => ({
                pressed: BT.isPressed(BT.BTN_POINTER_A),
                released: BT.isReleased(BT.BTN_POINTER_A),
            }),
        });
        const hold = holdFrames(hz);
        let releasesBeforeRenderOnlyFrame = 0;

        harness.pointer('pointermove', { clientX: 10, clientY: 10 });
        harness.runAt(hz, hold);
        harness.updates.length = 0;

        for (let click = 0; click < CLICKS; click++) {
            harness.pointer('pointerdown', { buttons: 1 });
            harness.runAt(hz, hold);
            harness.pointer('pointerup');

            // One extra frame makes the cycle odd, so the release drifts across both frame kinds.
            if (harness.frame(1000 / hz) === 0) {
                releasesBeforeRenderOnlyFrame++;
            }

            harness.runAt(hz, hold);
        }

        expect(harness.updates.filter((seen) => seen.released)).toHaveLength(CLICKS);
        expect(harness.updates.filter((seen) => seen.pressed)).toHaveLength(CLICKS);

        if (hz > 60) {
            // Proves the BT-696 path ran: some releases landed in a frame with no update.
            expect(releasesBeforeRenderOnlyFrame).toBeGreaterThan(0);
        }
    });

    it.each(RATES)('a press before a frame that runs several updates reaches only the first at %i Hz', async (hz) => {
        const harness = await boot({ read: () => BT.isPressed(BT.BTN_POINTER_A) });

        harness.pointer('pointermove', { clientX: 10, clientY: 10 });
        harness.runAt(hz, holdFrames(hz));
        harness.updates.length = 0;

        harness.pointer('pointerdown', { buttons: 1 });

        expect(harness.frame(50)).toBeGreaterThanOrEqual(2);
        expect(harness.updates[0]).toBe(true);
        expect(harness.updates.filter(Boolean)).toHaveLength(1);
    });

    it.each(RATES)('the pointerDelta and wheel totals update() sees equal what was sent at %i Hz', async (hz) => {
        const harness = await boot({
            configure: { isCapturingPointerScroll: true },
            read: () => ({ delta: BT.pointerDelta(0), scroll: BT.pointerScrollDelta }),
        });
        const moves = 30;

        harness.pointer('pointermove', { clientX: 10, clientY: 10 });
        harness.runAt(hz, holdFrames(hz));
        harness.updates.length = 0;

        harness.runAt(hz, moves, (index) => {
            harness.pointer('pointermove', { clientX: 11 + index, clientY: 11 + index });
            harness.wheel(3);
        });
        // Let input from the last render-only frames reach an update.
        harness.runAt(hz, holdFrames(hz));

        const total = harness.updates.reduce(
            (sum, seen) => ({ x: sum.x + seen.delta.x, y: sum.y + seen.delta.y, scroll: sum.scroll + seen.scroll }),
            { x: 0, y: 0, scroll: 0 },
        );

        expect(total).toEqual({ x: moves, y: moves, scroll: moves * 3 });
    });

    it.each(RATES)('every gamepad press and release reaches exactly one update() at %i Hz (BT-683)', async (hz) => {
        const harness = await boot({
            read: () => ({ pressed: BT.isPressed(BT.BTN_A), released: BT.isReleased(BT.BTN_A) }),
        });
        const hold = holdFrames(hz);

        harness.pad(0, []);
        harness.runAt(hz, hold);
        harness.updates.length = 0;

        for (let press = 0; press < CLICKS; press++) {
            harness.pad(0, [0]);
            harness.runAt(hz, hold);
            harness.pad(0, []);
            harness.runAt(hz, hold + 1);
        }

        expect(harness.updates.filter((seen) => seen.pressed)).toHaveLength(CLICKS);
        expect(harness.updates.filter((seen) => seen.released)).toHaveLength(CLICKS);
    });

    it('a key press reaches exactly one update() at 120 Hz', async () => {
        const harness = await boot({ read: () => BT.isKeyPressed('KeyZ') });

        harness.key('keydown', 'KeyZ');
        harness.runAt(120, holdFrames(120));
        harness.key('keyup', 'KeyZ');
        harness.runAt(120, holdFrames(120));

        expect(harness.updates.filter(Boolean)).toHaveLength(1);
    });

    it.each(RATES)('a zero-delay click (down and up in one gap) reaches exactly one update() at %i Hz', async (hz) => {
        const harness = await boot({
            read: () => ({
                pressed: BT.isPressed(BT.BTN_POINTER_A),
                released: BT.isReleased(BT.BTN_POINTER_A),
            }),
        });

        harness.pointer('pointermove', { clientX: 10, clientY: 10 });
        harness.runAt(hz, holdFrames(hz));
        harness.updates.length = 0;

        for (let click = 0; click < CLICKS; click++) {
            harness.pointer('pointerdown', { buttons: 1 });
            harness.pointer('pointerup');
            harness.runAt(hz, holdFrames(hz));
        }

        expect(harness.updates.filter((seen) => seen.pressed)).toHaveLength(CLICKS);
        expect(harness.updates.filter((seen) => seen.released)).toHaveLength(CLICKS);
    });
});
