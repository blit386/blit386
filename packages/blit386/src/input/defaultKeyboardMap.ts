/* eslint-disable security/detect-object-injection */

import type { KeyboardLayout } from '../core/IBTDemo';

/**
 * Default keyboard bindings for face buttons (key mapping).
 *
 * Values are `KeyboardEvent.code` strings. Logical button state is the OR of
 * all listed keys for that button.
 */

/** Face-button bit flags matching `BT.BTN_UP` … `BT.BTN_SELECT`. */
export const FACE_BUTTON_FLAGS = [
    1 << 0,
    1 << 1,
    1 << 2,
    1 << 3,
    1 << 4,
    1 << 5,
    1 << 6,
    1 << 7,
    1 << 8,
    1 << 9,
    1 << 10,
    1 << 11,
] as const;

/** Face-button bit-flag code type. */
export type FaceButtonCode = (typeof FACE_BUTTON_FLAGS)[number];

/**
 * Player index 0 default keyboard map (WASD, Space/KeyB, etc.) for the `'versus'`
 * {@link KeyboardLayout} (the default).
 */
export const DEFAULT_KEYBOARD_PLAYER1: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    [1 << 0]: ['KeyW'],
    [1 << 1]: ['KeyS'],
    [1 << 2]: ['KeyA'],
    [1 << 3]: ['KeyD'],
    [1 << 4]: ['Space', 'KeyB'],
    [1 << 5]: ['KeyN'],
    [1 << 6]: [],
    [1 << 7]: [],
    [1 << 8]: [],
    [1 << 9]: [],
    [1 << 10]: ['Digit5'],
    [1 << 11]: ['Escape'],
};

/**
 * Player index 1 default keyboard map (arrows, numpad alternates) for the `'versus'`
 * {@link KeyboardLayout} (the default).
 */
export const DEFAULT_KEYBOARD_PLAYER2: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    [1 << 0]: ['ArrowUp'],
    [1 << 1]: ['ArrowDown'],
    [1 << 2]: ['ArrowLeft'],
    [1 << 3]: ['ArrowRight'],
    [1 << 4]: ['Semicolon', 'Numpad1'],
    [1 << 5]: ['Quote', 'Numpad2'],
    [1 << 6]: [],
    [1 << 7]: [],
    [1 << 8]: [],
    [1 << 9]: [],
    [1 << 10]: ['Backspace', 'NumpadDivide'],
    [1 << 11]: [],
};

/**
 * Player index 0 default keyboard map for the `'single'` {@link KeyboardLayout}: the
 * `'versus'` table ({@link DEFAULT_KEYBOARD_PLAYER1}) plus the arrow keys on the D-pad.
 */
export const DEFAULT_KEYBOARD_SINGLE_PLAYER1: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    ...DEFAULT_KEYBOARD_PLAYER1,
    [1 << 0]: ['KeyW', 'ArrowUp'],
    [1 << 1]: ['KeyS', 'ArrowDown'],
    [1 << 2]: ['KeyA', 'ArrowLeft'],
    [1 << 3]: ['KeyD', 'ArrowRight'],
};

/**
 * Player index 1 default keyboard map for the `'single'` {@link KeyboardLayout}: IJKL on
 * the D-pad (the arrows moved to player 0) and the same face/system keys as
 * {@link DEFAULT_KEYBOARD_PLAYER2}.
 */
export const DEFAULT_KEYBOARD_SINGLE_PLAYER2: Readonly<Record<FaceButtonCode, readonly string[]>> = {
    ...DEFAULT_KEYBOARD_PLAYER2,
    [1 << 0]: ['KeyI'],
    [1 << 1]: ['KeyK'],
    [1 << 2]: ['KeyJ'],
    [1 << 3]: ['KeyL'],
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
