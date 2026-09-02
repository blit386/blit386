/**
 * Benchmarks for {@link GamepadInput} per-frame polling and query throughput.
 *
 * `navigator.getGamepads()` is polled exactly once per frame, inside `endFrame()`. Public queries
 * (`isButtonDown`, `isButtonPressed`, `isButtonReleased`, `getAxis`, `isConnected`, `connectedCount`) read
 * the cached snapshot from that single poll and never trigger one themselves; axis tuples are preallocated
 * and written in place rather than reallocated per poll. The realistic-mix benchmark below is what regresses
 * if either guarantee breaks (a query starts polling again, or an axes array starts reallocating).
 */
import { bench, describe, vi } from 'vitest';

import { BT } from '../BLIT386';
import { GamepadInput } from './GamepadInput';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Standard-mapping button count read by {@link GamepadInput} (indices 0-15, plus triggers at 6/7). */
const GAMEPAD_BUTTON_COUNT = 17;

/**
 * Builds a connected `Gamepad` fixture with a realistic mixed button/axis state: some face buttons held, sticks
 * pushed past the default dead zone, and both triggers partially pressed.
 *
 * @returns Fixture gamepad object shaped like the browser Gamepad API.
 */
function makeConnectedPad(): Gamepad {
    const buttons = Array.from({ length: GAMEPAD_BUTTON_COUNT }, (_, index) => {
        const pressed = index === 0 || index === 12;

        return {
            pressed,
            touched: pressed,
            value: index === 6 ? 0.4 : index === 7 ? 0.6 : pressed ? 1 : 0,
        };
    });

    return {
        id: 'bench-pad',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0.9, -0.9, 0.3, 0],
        buttons,
        vibrationActuator: null,
        hapticActuators: [],
    } as unknown as Gamepad;
}

/** Fixed 4-slot gamepad array: player 0 connected, players 1-3 disconnected. */
const pads: readonly (Gamepad | null)[] = [makeConnectedPad(), null, null, null];

vi.stubGlobal('navigator', {
    getGamepads: vi.fn(() => pads),
});

const input = new GamepadInput();

input.attach();

describe('GamepadInput per-frame query mix', () => {
    let tick = 0;

    bench(
        '8x isButtonDown + 4x getAxis + 1x endFrame',
        () => {
            input.isButtonDown(BT.BTN_A, 0);
            input.isButtonDown(BT.BTN_B, 0);
            input.isButtonDown(BT.BTN_UP, 0);
            input.isButtonDown(BT.BTN_DOWN, 0);
            input.isButtonDown(BT.BTN_LEFT, 0);
            input.isButtonDown(BT.BTN_RIGHT, 0);
            input.isButtonDown(BT.BTN_L, 0);
            input.isButtonDown(BT.BTN_R, 0);

            input.getAxis(BT.AXIS_LEFT_X, 0);
            input.getAxis(BT.AXIS_LEFT_Y, 0);
            input.getAxis(BT.AXIS_RIGHT_X, 0);
            input.getAxis(BT.AXIS_TRIGGER_L, 0);

            tick++;
            input.endFrame(tick);
        },
        BENCH_OPTIONS,
    );
});

describe('GamepadInput.isConnected', () => {
    bench(
        'isConnected (cached read)',
        () => {
            input.isConnected(0);
        },
        BENCH_OPTIONS,
    );
});

describe('GamepadInput.endFrame', () => {
    let tick = 0;

    bench(
        'endFrame',
        () => {
            tick++;
            input.endFrame(tick);
        },
        BENCH_OPTIONS,
    );
});
