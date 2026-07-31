/* eslint-disable security/detect-object-injection */

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
 * Player index 0 default keyboard map (WASD, Space/KeyB, etc.).
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
 * Player index 1 default keyboard map (arrows, numpad alternates).
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
 * Deep-copies default face-button rows into a mutable map (`button` → `KeyboardEvent.code` list).
 *
 * Used by {@link BT.inputMapReset} so exported defaults are never mutated.
 *
 * @param source - One player's default record (`DEFAULT_KEYBOARD_PLAYER1` or `DEFAULT_KEYBOARD_PLAYER2`).
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
 * @returns Tuple `[player0Map, player1Map]`.
 */
export function createDefaultKeyboardRuntimeMaps(): [Map<number, string[]>, Map<number, string[]>] {
    return [
        cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_PLAYER1),
        cloneDefaultKeyboardPlayerMap(DEFAULT_KEYBOARD_PLAYER2),
    ];
}
