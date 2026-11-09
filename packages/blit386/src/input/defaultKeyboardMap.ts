/* eslint-disable security/detect-object-injection */

import type { KeyboardLayout } from '../core/IBTDemo';
import {
    BTN_A,
    BTN_B,
    BTN_DOWN,
    BTN_L,
    BTN_LEFT,
    BTN_R,
    BTN_RIGHT,
    BTN_SELECT,
    BTN_START,
    BTN_UP,
    BTN_X,
    BTN_Y,
    FACE_BUTTON_FLAGS,
    type FaceButtonCode,
} from './buttonFlags';

/**
 * Default keyboard bindings for face buttons (key mapping).
 *
 * Values are `KeyboardEvent.code` strings. Logical button state is the OR of
 * all listed keys for that button.
 */

/**
 * Player index 0 default keyboard map (WASD, Space/KeyB, etc.) for the `'versus'`
 * {@link KeyboardLayout} (the default).
 */
export const DEFAULT_KEYBOARD_PLAYER1: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    [BTN_UP]: ['KeyW'],
    [BTN_DOWN]: ['KeyS'],
    [BTN_LEFT]: ['KeyA'],
    [BTN_RIGHT]: ['KeyD'],
    [BTN_A]: ['Space', 'KeyB'],
    [BTN_B]: ['KeyN'],
    [BTN_X]: [],
    [BTN_Y]: [],
    [BTN_L]: [],
    [BTN_R]: [],
    [BTN_START]: ['Digit5'],
    [BTN_SELECT]: ['Escape'],
};

/**
 * Player index 1 default keyboard map (arrows, numpad alternates) for the `'versus'`
 * {@link KeyboardLayout} (the default).
 */
export const DEFAULT_KEYBOARD_PLAYER2: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    [BTN_UP]: ['ArrowUp'],
    [BTN_DOWN]: ['ArrowDown'],
    [BTN_LEFT]: ['ArrowLeft'],
    [BTN_RIGHT]: ['ArrowRight'],
    [BTN_A]: ['Semicolon', 'Numpad1'],
    [BTN_B]: ['Quote', 'Numpad2'],
    [BTN_X]: [],
    [BTN_Y]: [],
    [BTN_L]: [],
    [BTN_R]: [],
    [BTN_START]: ['Backspace', 'NumpadDivide'],
    [BTN_SELECT]: [],
};

/**
 * Player index 0 default keyboard map for the `'single'` {@link KeyboardLayout}: the
 * `'versus'` table ({@link DEFAULT_KEYBOARD_PLAYER1}) plus the arrow keys on the D-pad.
 */
export const DEFAULT_KEYBOARD_SINGLE_PLAYER1: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    ...DEFAULT_KEYBOARD_PLAYER1,
    [BTN_UP]: ['KeyW', 'ArrowUp'],
    [BTN_DOWN]: ['KeyS', 'ArrowDown'],
    [BTN_LEFT]: ['KeyA', 'ArrowLeft'],
    [BTN_RIGHT]: ['KeyD', 'ArrowRight'],
};

/**
 * Player index 1 default keyboard map for the `'single'` {@link KeyboardLayout}: IJKL on
 * the D-pad (the arrows moved to player 0) and the same face/system keys as
 * {@link DEFAULT_KEYBOARD_PLAYER2}.
 */
export const DEFAULT_KEYBOARD_SINGLE_PLAYER2: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    ...DEFAULT_KEYBOARD_PLAYER2,
    [BTN_UP]: ['KeyI'],
    [BTN_DOWN]: ['KeyK'],
    [BTN_LEFT]: ['KeyJ'],
    [BTN_RIGHT]: ['KeyL'],
};

/**
 * Deep-copies default face-button rows into a mutable map (`button` → `KeyboardEvent.code` list).
 *
 * Used by {@link BT.inputMapReset} so exported defaults are never mutated.
 *
 * @param source - One player's default record (for example `DEFAULT_KEYBOARD_PLAYER1`).
 * @returns Map with face-button bit-flag keys and copied string arrays.
 */
export function cloneDefaultKeyboardPlayerMap(
    source: Readonly<Record<FaceButtonCode, readonly string[]>>,
): Map<number, string[]> {
    const result = new Map<number, string[]>();

    for (const button of FACE_BUTTON_FLAGS) {
        const codes = source[button] ?? [];

        result.set(button, [...codes]);
    }

    return result;
}

/**
 * Fresh runtime maps for keyboard players 0 and 1 from built-in defaults.
 *
 * @param layout - Which default table pair to copy (`'versus'` when omitted).
 * @returns Tuple `[player0Map, player1Map]`.
 */
export function createDefaultKeyboardRuntimeMaps(
    layout: KeyboardLayout = 'versus',
): [Map<number, string[]>, Map<number, string[]>] {
    if (layout === 'single') {
        return [
            cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_SINGLE_PLAYER1),
            cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_SINGLE_PLAYER2),
        ];
    }

    return [
        cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_PLAYER1),
        cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_PLAYER2),
    ];
}
