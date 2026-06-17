/**
 * Unit tests for {@link GamepadInput}.
 */
/* eslint-disable security/detect-object-injection */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BT } from '../BLIT386';
import { DEFAULT_GAMEPAD_DEAD_ZONE, GamepadInput } from './GamepadInput';

interface PadState {
    isConnected?: boolean;
    buttons?: number[];
    pressed?: number[];
    axes?: number[];
}

function makeGamepad(state: PadState): Gamepad {
    const buttons = Array.from({ length: 16 }, (_, index) => ({
        pressed: state.pressed?.includes(index) ?? false,
        touched: false,
        value: state.buttons?.[index] ?? (state.pressed?.includes(index) ? 1 : 0),
    }));

    return {
        id: 'test-pad',
        index: 0,
        connected: state.isConnected ?? true,
        mapping: 'standard',
        timestamp: 0,
        axes: state.axes ?? [0, 0, 0, 0],
        buttons,
        vibrationActuator: null,
        hapticActuators: [],
    } as unknown as Gamepad;
}

describe('GamepadInput', () => {
    let pads: (Gamepad | null)[];
    let input: GamepadInput;

    beforeEach(() => {
        pads = [null, null, null, null];
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                getGamepads: vi.fn(() => pads),
            },
        });
        input = new GamepadInput();
        input.attach();
    });

    afterEach(() => {
        input.detach();
        vi.restoreAllMocks();
    });

    it('uses default dead zone', () => {
        expect(input.getDeadZone()).toBe(DEFAULT_GAMEPAD_DEAD_ZONE);
    });

    it('tracks connected gamepads and counts connected players', () => {
        pads[0] = makeGamepad({ isConnected: true });
        pads[1] = makeGamepad({ isConnected: true });

        expect(input.isConnected(0)).toBe(true);
        expect(input.isConnected(1)).toBe(true);
        expect(input.isConnected(2)).toBe(false);
        expect(input.connectedCount()).toBe(2);
    });

    it('reports down/pressed/released edges across endFrame', () => {
        pads[0] = makeGamepad({ pressed: [0] });

        expect(input.isButtonDown(BT.BTN_A, 0)).toBe(true);
        expect(input.isButtonPressed(BT.BTN_A, 0, undefined, 10)).toBe(true);
        expect(input.isButtonReleased(BT.BTN_A, 0)).toBe(false);

        input.endFrame(10);

        expect(input.isButtonPressed(BT.BTN_A, 0, undefined, 11)).toBe(false);

        pads[0] = makeGamepad({ pressed: [] });

        expect(input.isButtonReleased(BT.BTN_A, 0)).toBe(true);
    });

    it('supports repeat behavior for held buttons', () => {
        pads[0] = makeGamepad({ pressed: [0] });

        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 5)).toBe(true);
        input.endFrame(5);

        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 6)).toBe(false);
        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 8)).toBe(true);
    });

    it('uses ANY semantics for bitmasks', () => {
        pads[0] = makeGamepad({ pressed: [0] });
        expect(input.isButtonDown(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_B, 0)).toBe(false);
    });

    it('maps dpad buttons to direction flags', () => {
        pads[0] = makeGamepad({ pressed: [12] });
        expect(input.isButtonDown(BT.BTN_UP, 0)).toBe(true);
    });

    it('applies dead zone to stick axes and keeps trigger range', () => {
        pads[0] = makeGamepad({
            axes: [0.7, 0, 0, 0],
            buttons: [0, 0, 0, 0, 0, 0, 0.25],
        });
        expect(input.getAxis(BT.AXIS_LEFT_X, 0)).toBe(0);
        expect(input.getAxis(BT.AXIS_TRIGGER_L, 0)).toBe(0.25);

        input.setDeadZone(0.2);
        expect(input.getAxis(BT.AXIS_LEFT_X, 0)).toBeGreaterThan(0);
    });

    it('returns safe defaults for invalid players or disconnected states', () => {
        expect(input.isButtonDown(BT.BTN_A, -1)).toBe(false);
        expect(input.isButtonPressed(BT.BTN_A, 99, undefined, 0)).toBe(false);
        expect(input.isButtonReleased(BT.BTN_A, 3)).toBe(false);
        expect(input.getAxis(BT.AXIS_LEFT_X, 2)).toBe(0);
        expect(input.connectedCount()).toBe(0);
    });

    it('treats disconnect as release for previously held buttons', () => {
        pads[0] = makeGamepad({ pressed: [0, 1] });
        input.endFrame(1);

        pads[0] = null;
        expect(input.isButtonReleased(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
    });
});
