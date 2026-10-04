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
    /** Explicit `pressed` flag per button index, overriding the derived one (browsers set it themselves). */
    pressedFlags?: Record<number, boolean>;
    axes?: number[];
}

function makeGamepad(state: PadState): Gamepad {
    const buttons = Array.from({ length: 16 }, (_, index) => ({
        pressed: state.pressedFlags?.[index] ?? state.pressed?.includes(index) ?? false,
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
        input.endFrame(1);

        expect(input.isConnected(0)).toBe(true);
        expect(input.isConnected(1)).toBe(true);
        expect(input.isConnected(2)).toBe(false);
        expect(input.connectedCount()).toBe(2);
    });

    it('reports down/pressed/released edges across endFrame', () => {
        pads[0] = makeGamepad({ pressed: [0] });
        input.endFrame(9); // roll(prev=disconnected); poll(current=pressed)

        expect(input.isButtonDown(BT.BTN_A, 0)).toBe(true);
        expect(input.isButtonPressed(BT.BTN_A, 0, undefined, 10)).toBe(true);
        expect(input.isButtonReleased(BT.BTN_A, 0)).toBe(false);

        input.endFrame(10); // roll(prev=current=pressed); poll(current still pressed)

        expect(input.isButtonPressed(BT.BTN_A, 0, undefined, 11)).toBe(false);

        pads[0] = makeGamepad({ pressed: [] });
        input.endFrame(11); // roll(prev=current=pressed); poll(current=released)

        expect(input.isButtonReleased(BT.BTN_A, 0)).toBe(true);
    });

    it('supports repeat behavior for held buttons', () => {
        pads[0] = makeGamepad({ pressed: [0] });
        input.endFrame(0); // roll(prev=disconnected); poll(current=pressed)

        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 5)).toBe(true);
        input.endFrame(5);

        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 6)).toBe(false);
        expect(input.isButtonPressed(BT.BTN_A, 0, 3, 8)).toBe(true);
    });

    it('uses ANY semantics for bitmasks', () => {
        pads[0] = makeGamepad({ pressed: [0] });
        input.endFrame(1);
        expect(input.isButtonDown(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_B, 0)).toBe(false);
    });

    it('maps dpad buttons to direction flags', () => {
        pads[0] = makeGamepad({ pressed: [12] });
        input.endFrame(1);
        expect(input.isButtonDown(BT.BTN_UP, 0)).toBe(true);
    });

    it('maps triggers to BTN_L2 / BTN_R2 at the 0.5 threshold', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0.49, 0.5] });
        input.endFrame(1);

        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(false);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(true);
        // The analog value is untouched by the digital mapping.
        expect(input.getAxis(BT.AXIS_TRIGGER_L, 0)).toBe(0.49);
    });

    it('ignores the browser pressed flag for triggers and thresholds the analog value', () => {
        const buttons = [0, 0, 0, 0, 0, 0, 0.2, 0.2];

        pads[0] = makeGamepad({ buttons, pressedFlags: { 6: true, 7: true } });
        input.endFrame(1);
        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(false);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(false);

        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0.5, 0.5], pressedFlags: { 6: true, 7: true } });
        input.endFrame(2);
        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);

        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0.5, 0.5], pressedFlags: { 6: false, 7: false } });
        input.endFrame(3);
        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
    });

    it('reads a digital-only trigger reporting pressed with value 1 as down', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1], pressedFlags: { 6: true, 7: true } });
        input.endFrame(1);

        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
    });

    it('does not map triggers onto the shoulder bits', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
        input.endFrame(1);

        expect(input.isButtonDown(BT.BTN_SHOULDER, 0)).toBe(false);

        pads[0] = makeGamepad({ pressed: [4, 5] });
        input.endFrame(2);

        expect(input.isButtonDown(BT.BTN_SHOULDER, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(false);
    });

    it('reports trigger pressed/released edges and supports repeat', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1] });
        input.endFrame(0);

        expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 5)).toBe(true);
        input.endFrame(5);

        expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 6)).toBe(false);
        expect(input.isButtonPressed(BT.BTN_L2, 0, 3, 8)).toBe(true);

        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0] });
        input.endFrame(9);

        expect(input.isButtonReleased(BT.BTN_L2, 0)).toBe(true);
    });

    it('reads triggers as up on a pad that reports fewer than eight buttons', () => {
        const pad = makeGamepad({});
        (pad as unknown as { buttons: unknown[] }).buttons = pad.buttons.slice(0, 6);
        pads[0] = pad;
        input.endFrame(1);

        expect(input.isButtonDown(BT.BTN_TRIGGER, 0)).toBe(false);
    });

    it('treats disconnect as release for a held trigger', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 0, 1] });
        input.endFrame(1);
        pads[0] = null;
        input.endFrame(2);

        expect(input.isButtonReleased(BT.BTN_R2, 0)).toBe(true);
    });

    it('ignores unknown bits in a mask', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1] });
        input.endFrame(1);

        expect(input.isButtonDown(1 << 20, 0)).toBe(false);
        expect(input.isButtonDown(BT.BTN_A | BT.BTN_L2, 0)).toBe(true);
    });

    it('keeps the mirrored trigger bits in step with BT.BTN_L2 / BT.BTN_R2', () => {
        pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
        input.endFrame(1);

        expect(input.isButtonDown(BT.BTN_L2, 0)).toBe(true);
        expect(input.isButtonDown(BT.BTN_R2, 0)).toBe(true);
        expect(BT.BTN_L2).toBe(1 << 16);
        expect(BT.BTN_R2).toBe(1 << 17);
    });

    it('applies dead zone to stick axes and keeps trigger range', () => {
        pads[0] = makeGamepad({
            axes: [0.7, 0, 0, 0],
            buttons: [0, 0, 0, 0, 0, 0, 0.25],
        });
        input.endFrame(1);
        expect(input.getAxis(BT.AXIS_LEFT_X, 0)).toBe(0);
        expect(input.getAxis(BT.AXIS_TRIGGER_L, 0)).toBe(0.25);

        input.setDeadZone(0.2);
        input.endFrame(2); // dead-zone changes only take effect on the next poll
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
        input.endFrame(1); // roll(prev=disconnected); poll(current=pressed, connected)
        input.endFrame(2); // roll(prev=current=pressed, connected); poll(current unchanged)

        pads[0] = null;
        input.endFrame(3); // roll(prev=current=pressed, connected); poll(current=disconnected)
        expect(input.isButtonReleased(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
    });

    it('polls navigator.getGamepads at most once per frame regardless of query count', () => {
        pads[0] = makeGamepad({ pressed: [0] });
        input.endFrame(1);

        const getGamepadsSpy = vi.mocked(globalThis.navigator.getGamepads);
        getGamepadsSpy.mockClear();

        input.isButtonDown(BT.BTN_A, 0);
        input.isButtonDown(BT.BTN_B, 0);
        input.getAxis(BT.AXIS_LEFT_X, 0);
        input.isConnected(0);
        input.connectedCount();
        expect(getGamepadsSpy).not.toHaveBeenCalled();

        input.endFrame(2);
        expect(getGamepadsSpy).toHaveBeenCalledTimes(1);
    });

    describe('any-button helpers', () => {
        it('isAnyButtonDown is true while any mapped button is held', () => {
            expect(input.isAnyButtonDown(0)).toBe(false);

            pads[0] = makeGamepad({ pressed: [1] });
            input.endFrame(1);

            expect(input.isAnyButtonDown(0)).toBe(true);
            expect(input.isAnyButtonDown(1)).toBe(false);
        });

        it('isAnyButtonPressed fires for a new button while another is held', () => {
            pads[0] = makeGamepad({ pressed: [0] });
            input.endFrame(1);
            input.endFrame(2);

            expect(input.isAnyButtonPressed(0, undefined, 2)).toBe(false);

            pads[0] = makeGamepad({ pressed: [0, 1] });
            input.endFrame(3);

            expect(input.isAnyButtonPressed(0, undefined, 3)).toBe(true);
        });

        it('isAnyButtonPressed repeats while held', () => {
            pads[0] = makeGamepad({ pressed: [0] });
            input.endFrame(0);

            expect(input.isAnyButtonPressed(0, 3, 5)).toBe(true);
            input.endFrame(5);

            expect(input.isAnyButtonPressed(0, 3, 6)).toBe(false);
            expect(input.isAnyButtonPressed(0, 3, 8)).toBe(true);
        });

        it('ignores stick and trigger axes', () => {
            pads[0] = makeGamepad({ axes: [1, 1, 1, 1], buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
            input.endFrame(1);

            // Triggers (raw buttons 6 and 7) set BTN_L2 / BTN_R2, which the any-button mask leaves out on purpose.
            expect(input.isAnyButtonDown(0)).toBe(false);
        });

        it('isAnyButtonReleased waits until every button is up', () => {
            pads[0] = makeGamepad({ pressed: [0, 1] });
            input.endFrame(1);
            input.endFrame(2);

            pads[0] = makeGamepad({ pressed: [1] });
            input.endFrame(3);

            expect(input.isAnyButtonReleased(0)).toBe(false);

            pads[0] = makeGamepad({ pressed: [] });
            input.endFrame(4);

            expect(input.isAnyButtonReleased(0)).toBe(true);

            input.endFrame(5);

            expect(input.isAnyButtonReleased(0)).toBe(false);
        });

        it('isAnyButtonReleased treats a disconnect while held as a release', () => {
            pads[0] = makeGamepad({ pressed: [0] });
            input.endFrame(1);
            input.endFrame(2);

            pads[0] = null;
            input.endFrame(3);

            expect(input.isAnyButtonReleased(0)).toBe(true);
        });

        it('does not count a trigger pull as a press or a release', () => {
            pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1, 1] });
            input.endFrame(1);

            expect(input.isAnyButtonPressed(0, undefined, 2)).toBe(false);

            input.endFrame(2);
            pads[0] = makeGamepad({});
            input.endFrame(3);

            expect(input.isAnyButtonReleased(0)).toBe(false);
        });

        it('isAnyButtonReleased ignores a trigger that is still held', () => {
            pads[0] = makeGamepad({ pressed: [0], buttons: [1, 0, 0, 0, 0, 0, 1] });
            input.endFrame(1);
            input.endFrame(2);

            pads[0] = makeGamepad({ buttons: [0, 0, 0, 0, 0, 0, 1] });
            input.endFrame(3);

            expect(input.isAnyButtonReleased(0)).toBe(true);
        });

        it('returns false for invalid players and disconnected pads', () => {
            expect(input.isAnyButtonDown(-1)).toBe(false);
            expect(input.isAnyButtonPressed(99, undefined, 0)).toBe(false);
            expect(input.isAnyButtonReleased(4)).toBe(false);
            expect(input.isAnyButtonDown(0)).toBe(false);
            expect(input.isAnyButtonReleased(0)).toBe(false);
        });
    });
});
