// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/buttons.ts`: button, key and gamepad state and edges, keyboard
 * maps, axes, any-key / any-button, triggers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BT } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';
import type { FaceButtonCode } from '../input/buttonFlags';
import { getKeyboardFaceButtonKeys, setKeyboardLayout } from '../input/keyboardRuntimeMaps';

describe('BT.isDown', () => {
    beforeEach(() => {
        BT.inputMapReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        BT.inputMapReset();
    });

    it('returns false for face buttons when keyboard and gamepad are unavailable', () => {
        expect(BT.isDown(BT.BTN_A)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isDown(BT.BTN_START, 2)).toBe(false);
    });

    it('delegates pointer buttons to the pointer subsystem', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonDown: isDown } as never);

        expect(BT.isDown(BT.BTN_POINTER_A, 0)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(20, 0);
    });

    it('uses ANY semantics for combined button masks', () => {
        const isDown = vi.fn().mockImplementation((codes: readonly string[]) => codes.includes('KeyA'));
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyA');

        expect(BT.isDown(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
    });

    it('returns false for pointer buttons when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.isDown(BT.BTN_POINTER_A)).toBe(false);
        expect(BT.isDown(BT.BTN_POINTER_D, 3)).toBe(false);
    });

    it('uses gamepad for player 2+ when keyboard maps are unavailable', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);

        expect(BT.isDown(BT.BTN_START, 2)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(BT.BTN_START, 2);
    });
});

describe('BT.isPressed', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for face buttons when keyboard and gamepad are unavailable', () => {
        expect(BT.isPressed(BT.BTN_B)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isPressed(BT.BTN_B, 1)).toBe(false);
    });

    it('reads pointer buttons with the carried press inside update()', () => {
        const isButtonPressed = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonPressed } as never);
        vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(true);

        expect(BT.isPressed(BT.BTN_POINTER_B, 0)).toBe(true);
        expect(isButtonPressed).toHaveBeenCalledWith(21, 0, 'update');
    });

    it('reads pointer buttons without the carried press outside update()', () => {
        const isButtonPressed = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonPressed } as never);
        vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(false);

        expect(BT.isPressed(BT.BTN_POINTER_B, 0)).toBe(true);
        expect(isButtonPressed).toHaveBeenCalledWith(21, 0, 'frame');
    });

    it('forwards repeatRate to keyboard/gamepad face-button queries', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        const isButtonPressedKeyboard = vi.fn().mockReturnValue(false);
        const isButtonPressedGamepad = vi.fn().mockReturnValue(true);
        const isButtonDownKeyboard = vi.fn().mockReturnValue(false);
        const isButtonDownGamepad = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: isButtonDownKeyboard,
            isButtonPressed: isButtonPressedKeyboard,
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: isButtonDownGamepad,
            isButtonPressed: isButtonPressedGamepad,
        } as never);

        BT.isPressed(BT.BTN_A, 0, 6);

        expect(isButtonPressedKeyboard).toHaveBeenCalledWith(expect.any(Array), 6, 120);
        expect(isButtonPressedGamepad).toHaveBeenCalledWith(BT.BTN_A, 0, 6, 120);
    });

    it('suppresses pressed edge when merged button was already down via keyboard', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(false),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(true),
        } as never);

        expect(BT.isPressed(BT.BTN_A, 0)).toBe(false);
    });

    it('allows repeat events during dual-source hold when repeatRate is enabled', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(true),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(false),
        } as never);

        expect(BT.isPressed(BT.BTN_A, 0, 6)).toBe(true);
    });
});

describe('BT.isReleased', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for face buttons when keyboard is unavailable', () => {
        expect(BT.isReleased(BT.BTN_X)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isReleased(BT.BTN_X, 3)).toBe(false);
    });

    it('delegates pointer buttons to the pointer subsystem', () => {
        const isButtonReleased = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonReleased } as never);

        expect(BT.isReleased(BT.BTN_POINTER_C, 2)).toBe(true);
        expect(isButtonReleased).toHaveBeenCalledWith(22, 2, 'frame');
    });

    it('reads pointer releases on the update clock inside update()', () => {
        const isButtonReleased = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonReleased } as never);
        vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(true);

        expect(BT.isReleased(BT.BTN_POINTER_A, 0)).toBe(true);
        expect(isButtonReleased).toHaveBeenCalledWith(20, 0, 'update');
    });

    it('merges keyboard and gamepad for players 0 and 1', () => {
        const isButtonReleasedKeyboard = vi.fn().mockReturnValue(false);
        const isButtonReleased = vi.fn().mockReturnValue(true);
        const isButtonDownKeyboard = vi.fn().mockReturnValue(false);
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: isButtonDownKeyboard,
            isButtonReleased: isButtonReleasedKeyboard,
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown, isButtonReleased } as never);

        expect(BT.isReleased(BT.BTN_A, 1)).toBe(true);
        expect(isButtonReleased).toHaveBeenCalledWith(BT.BTN_A, 1);
    });

    it('suppresses released edge when merged button remains down via keyboard', () => {
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonReleased: vi.fn().mockReturnValue(false),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(false),
            isButtonReleased: vi.fn().mockReturnValue(true),
        } as never);

        expect(BT.isReleased(BT.BTN_A, 0)).toBe(false);
    });
});

describe('BT.inputMap / BT.inputMapReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        BT.inputMapReset();
    });

    it('remaps player 0 face buttons through the keyboard subsystem', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyZ');

        expect(BT.isDown(BT.BTN_A, 0)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(['KeyZ']);
    });

    it('remaps player 1 independently of player 0', () => {
        const isDown = vi.fn().mockImplementation((codes: readonly string[]) => codes.includes('Numpad9'));
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyX');
        BT.inputMap(1, BT.BTN_A, 'Numpad9');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenLastCalledWith(['KeyX']);

        BT.isDown(BT.BTN_A, 1);
        expect(isDown).toHaveBeenLastCalledWith(['Numpad9']);
    });

    it('passes multiple keys per button for OR semantics', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_UP, 'ArrowUp', 'KeyW');

        BT.isDown(BT.BTN_UP, 0);
        expect(isDown).toHaveBeenCalledWith(['ArrowUp', 'KeyW']);
    });

    it('restores default key lists for both keyboard players', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_UP, 'F1');
        BT.inputMap(1, BT.BTN_UP, 'F2');
        BT.inputMapReset();

        BT.isDown(BT.BTN_UP, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_UP as FaceButtonCode] ?? [])]);

        BT.isDown(BT.BTN_UP, 1);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER2[BT.BTN_UP as FaceButtonCode] ?? [])]);
    });

    it('ignores remap attempts for unsupported keyboard players', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(2, BT.BTN_A, 'KeyZ');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_A as FaceButtonCode] ?? [])]);
    });

    it('ignores remap attempts with out-of-range face button ids', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, 99, 'KeyZ');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_A as FaceButtonCode] ?? [])]);
    });

    it('allows clearing keyboard bindings with an empty key list', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A);

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([]);
    });
});

describe('BT keyboard defaults under keyboardLayout', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        // BTAPI seeds this from configure() at init; restore the engine's pre-init layout.
        setKeyboardLayout('versus');
    });

    function spyKeyboard(): ReturnType<typeof vi.fn> {
        const isDown = vi.fn().mockImplementation((codes: readonly string[]) => codes.includes('ArrowLeft'));
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        return isDown;
    }

    it('keeps the arrow keys on player 1 under versus', () => {
        spyKeyboard();
        setKeyboardLayout('versus');

        expect(BT.isDown(BT.BTN_LEFT, 0)).toBe(false);
        expect(BT.isDown(BT.BTN_LEFT, 1)).toBe(true);
    });

    it('answers player 0 to both A and the left arrow under single', () => {
        const isDown = spyKeyboard();
        setKeyboardLayout('single');

        expect(BT.isDown(BT.BTN_LEFT)).toBe(true);
        expect(isDown).toHaveBeenLastCalledWith([
            ...(BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1[BT.BTN_LEFT as FaceButtonCode] ?? []),
        ]);
        expect(isDown).toHaveBeenLastCalledWith(['KeyA', 'ArrowLeft']);
    });

    it('moves player 1 to IJKL under single', () => {
        const isDown = spyKeyboard();
        setKeyboardLayout('single');

        expect(BT.isDown(BT.BTN_LEFT, 1)).toBe(false);
        expect(isDown).toHaveBeenLastCalledWith(['KeyJ']);
    });

    it('lets BT.inputMap override one button of the single layout', () => {
        const isDown = spyKeyboard();
        setKeyboardLayout('single');

        BT.inputMap(0, BT.BTN_LEFT, 'KeyQ');

        expect(BT.isDown(BT.BTN_LEFT, 0)).toBe(false);
        expect(isDown).toHaveBeenLastCalledWith(['KeyQ']);
    });

    it('restores the single layout on BT.inputMapReset', () => {
        const isDown = spyKeyboard();
        setKeyboardLayout('single');
        BT.inputMap(0, BT.BTN_LEFT, 'KeyQ');
        BT.inputMap(1, BT.BTN_LEFT, 'KeyZ');

        BT.inputMapReset();

        expect(BT.isDown(BT.BTN_LEFT, 0)).toBe(true);
        expect(isDown).toHaveBeenLastCalledWith(['KeyA', 'ArrowLeft']);
        BT.isDown(BT.BTN_LEFT, 1);
        expect(isDown).toHaveBeenLastCalledWith(['KeyJ']);
    });
});

describe('BT gamepad constants and APIs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes player constants', () => {
        expect(BT.PLAYER_ONE).toBe(0);
        expect(BT.PLAYER_TWO).toBe(1);
        expect(BT.PLAYER_THREE).toBe(2);
        expect(BT.PLAYER_FOUR).toBe(3);
    });

    it('exposes axis constants', () => {
        expect(BT.AXIS_LEFT_X).toBe(0);
        expect(BT.AXIS_LEFT_Y).toBe(1);
        expect(BT.AXIS_RIGHT_X).toBe(2);
        expect(BT.AXIS_RIGHT_Y).toBe(3);
        expect(BT.AXIS_TRIGGER_L).toBe(4);
        expect(BT.AXIS_TRIGGER_R).toBe(5);
    });

    it('exposes combo constants', () => {
        expect(BT.BTN_ABXY).toBe(BT.BTN_A | BT.BTN_B | BT.BTN_X | BT.BTN_Y);
        expect(BT.BTN_SHOULDER).toBe(BT.BTN_L | BT.BTN_R);
        expect(BT.BTN_POINTER_ANY).toBe(BT.BTN_POINTER_A | BT.BTN_POINTER_B | BT.BTN_POINTER_C | BT.BTN_POINTER_D);
    });

    it('defines trigger button constants above the pointer bits', () => {
        expect(BT.BTN_L2).toBe(1 << 16);
        expect(BT.BTN_R2).toBe(1 << 17);
        expect(BT.BTN_TRIGGER).toBe(BT.BTN_L2 | BT.BTN_R2);
        expect(BT.BTN_TRIGGER & BT.BTN_POINTER_ANY).toBe(0);
        expect(BT.BTN_TRIGGER & BT.BTN_SHOULDER).toBe(0);
    });

    it('delegates getAxis/isGamepadConnected/gamepadCount to gamepad subsystem', () => {
        const getAxis = vi.fn().mockReturnValue(0.25);
        const isConnected = vi.fn().mockReturnValue(true);
        const connectedCount = vi.fn().mockReturnValue(2);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ getAxis, isConnected, connectedCount } as never);

        expect(BT.getAxis(BT.AXIS_LEFT_X, 1)).toBe(0.25);
        expect(getAxis).toHaveBeenCalledWith(BT.AXIS_LEFT_X, 1);
        expect(BT.isGamepadConnected(1)).toBe(true);
        expect(isConnected).toHaveBeenCalledWith(1);
        expect(BT.gamepadCount).toBe(2);
        expect(connectedCount).toHaveBeenCalledWith();
    });

    it('returns 0 from getAxis when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.getAxis(BT.AXIS_LEFT_X, 1)).toBe(0);
    });

    it('returns false from isGamepadConnected when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.isGamepadConnected(1)).toBe(false);
    });

    it('returns 0 from gamepadCount when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.gamepadCount).toBe(0);
    });
});

describe('BT.isKeyDown', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyDown('Space')).toBe(false);
    });
});

describe('BT.isKeyPressed', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyPressed('ArrowUp')).toBe(false);
    });
});

describe('BT.isKeyReleased', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyReleased('KeyA')).toBe(false);
    });
});

describe('BT.isAnyKey and BT.isAnyButton helpers', () => {
    it('return false when the engine is not initialized', () => {
        expect(BT.isAnyKeyDown()).toBe(false);
        expect(BT.isAnyKeyPressed()).toBe(false);
        expect(BT.isAnyKeyPressed(5)).toBe(false);
        expect(BT.isAnyKeyReleased()).toBe(false);
        expect(BT.isAnyButtonDown()).toBe(false);
        expect(BT.isAnyButtonPressed()).toBe(false);
        expect(BT.isAnyButtonPressed(1, 5)).toBe(false);
        expect(BT.isAnyButtonReleased(2)).toBe(false);
    });

    it('forward to the keyboard and gamepad trackers', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(7);
        const keyboard = {
            isAnyKeyDown: vi.fn(() => true),
            isAnyKeyPressed: vi.fn(() => true),
            isAnyKeyReleased: vi.fn(() => true),
        };
        const gamepad = {
            isAnyButtonDown: vi.fn(() => true),
            isAnyButtonPressed: vi.fn(() => true),
            isAnyButtonReleased: vi.fn(() => true),
        };

        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(keyboard as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(gamepad as never);

        expect(BT.isAnyKeyDown()).toBe(true);
        expect(BT.isAnyKeyPressed(4)).toBe(true);
        expect(keyboard.isAnyKeyPressed).toHaveBeenCalledWith(4, 7);
        expect(BT.isAnyKeyReleased()).toBe(true);
        expect(BT.isAnyButtonDown(1)).toBe(true);
        expect(gamepad.isAnyButtonDown).toHaveBeenCalledWith(1);
        expect(BT.isAnyButtonPressed(2, 3)).toBe(true);
        expect(gamepad.isAnyButtonPressed).toHaveBeenCalledWith(2, 3, 7);
        expect(BT.isAnyButtonPressed()).toBe(true);
        expect(gamepad.isAnyButtonPressed).toHaveBeenLastCalledWith(0, undefined, 7);
        expect(BT.isAnyButtonReleased()).toBe(true);
        expect(gamepad.isAnyButtonReleased).toHaveBeenCalledWith(0);

        vi.restoreAllMocks();
    });
});

describe('BT trigger buttons (gamepad-only)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('isDown reads BTN_L2 / BTN_R2 from the gamepad per player', () => {
        const isDown = vi.fn((flag: number, player: number) => flag === BT.BTN_R2 && player === 2);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

        expect(BT.isDown(BT.BTN_R2, 2)).toBe(true);
        expect(BT.isDown(BT.BTN_L2, 2)).toBe(false);
        expect(BT.isDown(BT.BTN_TRIGGER, 2)).toBe(true);
        expect(BT.isDown(BT.BTN_R2, 0)).toBe(false);
    });

    it('never consults the keyboard for trigger bits', () => {
        const keyboard = {
            isButtonDown: vi.fn(() => true),
            isButtonPressed: vi.fn(() => true),
            isButtonReleased: vi.fn(() => true),
        };
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(keyboard as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.isDown(BT.BTN_TRIGGER, 0)).toBe(false);
        expect(BT.isPressed(BT.BTN_TRIGGER, 0)).toBe(false);
        expect(BT.isReleased(BT.BTN_TRIGGER, 0)).toBe(false);
        expect(keyboard.isButtonDown).not.toHaveBeenCalled();
        expect(keyboard.isButtonPressed).not.toHaveBeenCalled();
        expect(keyboard.isButtonReleased).not.toHaveBeenCalled();
    });

    it('isPressed forwards repeatRate and tick to the gamepad', () => {
        const isPressed = vi.fn(() => true);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonPressed: isPressed } as never);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(42);

        expect(BT.isPressed(BT.BTN_L2, 1, 6)).toBe(true);
        expect(isPressed).toHaveBeenCalledWith(BT.BTN_L2, 1, 6, 42);
    });

    it('isReleased reads the gamepad release edge', () => {
        const isReleased = vi.fn(() => true);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonReleased: isReleased } as never);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

        expect(BT.isReleased(BT.BTN_R2, 0)).toBe(true);
    });

    it('returns false for trigger bits when the gamepad subsystem is unavailable', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue(null);

        expect(BT.isDown(BT.BTN_L2, 0)).toBe(false);
    });

    it('combines a face button and a trigger in one mask (ANY semantics)', () => {
        const isDown = vi.fn((flag: number) => flag === BT.BTN_L2);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: vi.fn(() => false) } as never);

        expect(BT.isDown(BT.BTN_A | BT.BTN_L2, 0)).toBe(true);
        expect(BT.isDown(BT.BTN_A, 0)).toBe(false);
    });

    it('BT.inputMap rejects trigger bits without storing a keyboard mapping', () => {
        BT.inputMap(0, BT.BTN_L2, 'KeyQ');
        BT.inputMap(1, BT.BTN_TRIGGER, 'KeyE');

        expect(getKeyboardFaceButtonKeys(0, BT.BTN_L2)).toBeNull();
        expect(getKeyboardFaceButtonKeys(1, BT.BTN_TRIGGER)).toBeNull();
    });
});
