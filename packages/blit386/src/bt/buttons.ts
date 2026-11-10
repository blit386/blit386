/**
 * Button, key, and gamepad input: held state and edges, keyboard maps, axes, and the any-key / any-button queries.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { BTAPI } from '../core/BTAPI';
import * as flags from '../input/buttonFlags';
import {
    getKeyboardFaceButtonKeys,
    resetKeyboardFaceButtonMaps,
    setKeyboardFaceButtonKeys,
} from '../input/keyboardRuntimeMaps';
import { POINTER_BUTTON_CODES } from '../input/PointerInput';
import { pointerClock } from './internal';

/**
 * Returns runtime keyboard `KeyboardEvent.code` list for a face button and player,
 * or `null` when there is no keyboard fallback (e.g. players 2-3 for face buttons).
 *
 * @param button - Face button constant (`BT.BTN_UP` … `BT.BTN_SELECT`).
 * @param player - Zero-based player index.
 * @returns Key codes for that mapping, or `null` if unsupported.
 */
function faceButtonKeys(button: number, player: number): readonly string[] | null {
    if (!flags.FACE_BUTTON_FLAGS.includes(button as flags.FaceButtonCode)) {
        return null;
    }

    return getKeyboardFaceButtonKeys(player, button);
}

/** Button, key, and gamepad input members of `BT`. */
export const buttons = {
    /**
     * Checks whether a button is currently held.
     *
     * For pointer buttons (`BTN_POINTER_A..D`), the second parameter is the
     * pointer slot index (0 = mouse, 1-3 = touch / pen). For mouse slot 0:
     * `A` is left, `B` is right, `C` is middle, `D` is back / forward
     * (matches RetroBlit canonical, not DOM `PointerEvent.button` index).
     * Touch / pen slots only support `A`; B/C/D return `false`.
     *
     * `button` accepts one or more bit flags from the `BTN_*` set (for example
     * `BT.BTN_A | BT.BTN_B`). Matching uses ANY semantics: returns `true` when
     * any selected button is held.
     *
     * For face buttons (`BTN_UP`…`BTN_SELECT`), players `0` and `1` merge keyboard
     * and gamepad input (logical OR). Players `2` and `3` use gamepad only.
     * Pointer flags (`BTN_POINTER_*`) use the `player` argument as pointer slot.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads / keyboard, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @returns `true` while the button remains pressed.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isDown: (button: number, player: number = 0): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & flags.BTN_POINTER_ANY;

        if (pointerMask !== 0) {
            for (const [i, pointerCode] of POINTER_BUTTON_CODES.entries()) {
                if ((pointerMask & (flags.POINTER_FLAGS.at(i) ?? 0)) === 0) {
                    continue;
                }

                if (BTAPI.instance.getPointer()?.isButtonDown(pointerCode, player) ?? false) {
                    return true;
                }
            }
        }

        const faceMask = button & flags.FACE_BUTTON_MASK;

        for (const faceButton of flags.FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const isKeyboardDown =
                BTAPI.instance.getKeyboard()?.isButtonDown(faceButtonKeys(faceButton, player) ?? []) ?? false;
            const isGamepadDown = BTAPI.instance.getGamepad()?.isButtonDown(faceButton, player) ?? false;

            if (isKeyboardDown || isGamepadDown) {
                return true;
            }
        }

        for (const triggerButton of flags.TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonDown(triggerButton, player) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isDown}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isDown} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads / keyboard, or pointer slot.
     * @returns `true` while the button remains pressed.
     */
    buttonDown: (button: number, player: number = 0): boolean => {
        return buttons.isDown(button, player);
    },

    /**
     * Checks whether a button was pressed on the current frame.
     *
     * Same parameter semantics as {@link isDown}; returns `true` only on
     * the frame the button transitions from up to down.
     *
     * Call from `update()`, not `render()`, for reliable detection: for keyboard and
     * gamepad buttons, the press edge clears once per fixed-update tick, which always
     * runs before that frame's `render()`.
     * Pointer buttons keep two clocks: from `update()` the press is reported to exactly one
     * update, from `render()` to exactly one rendered frame.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @changed 1.8.1 Gamepad edges clear once per fixed update, not once per rendered frame, so each reaches exactly one `update()`.
     * @changed 1.8.1 Pointer presses are tracked per fixed update, so a frame that runs several `update()` steps reports a click to the first one only.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @param repeatRate - Optional repeat interval in fixed ticks (`0`/omitted = edge only).
     * @returns `true` on the transition frame.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isPressed: (button: number, player: number = 0, repeatRate?: number): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & flags.BTN_POINTER_ANY;

        if (pointerMask !== 0) {
            for (const [i, pointerCode] of POINTER_BUTTON_CODES.entries()) {
                if ((pointerMask & (flags.POINTER_FLAGS.at(i) ?? 0)) === 0) {
                    continue;
                }

                const pointer = BTAPI.instance.getPointer();

                if (pointer === null) {
                    continue;
                }

                if (pointer.isButtonPressed(pointerCode, player, pointerClock())) {
                    return true;
                }
            }
        }

        const faceMask = button & flags.FACE_BUTTON_MASK;
        const tick = BTAPI.instance.getTicks();

        for (const faceButton of flags.FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const keyboard = BTAPI.instance.getKeyboard();
            const gamepad = BTAPI.instance.getGamepad();
            const keyboardCodes = faceButtonKeys(faceButton, player) ?? [];
            const isKeyboardDown = keyboard?.isButtonDown(keyboardCodes) ?? false;
            const isGamepadDown = gamepad?.isButtonDown(faceButton, player) ?? false;
            const keyboardIsPressed = keyboard?.isButtonPressed(keyboardCodes, repeatRate, tick) ?? false;
            const gamepadIsPressed = gamepad?.isButtonPressed(faceButton, player, repeatRate, tick) ?? false;
            const isRepeatEnabled = repeatRate !== undefined && repeatRate > 0;
            const mergedIsPressed = isRepeatEnabled
                ? keyboardIsPressed || gamepadIsPressed
                : (keyboardIsPressed && !(isGamepadDown && !gamepadIsPressed)) ||
                  (gamepadIsPressed && !(isKeyboardDown && !keyboardIsPressed));

            if (mergedIsPressed) {
                return true;
            }
        }

        for (const triggerButton of flags.TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonPressed(triggerButton, player, repeatRate, tick) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isPressed}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isPressed} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot.
     * @param repeatRate - Optional repeat interval in fixed ticks (`0`/omitted = edge only).
     * @returns `true` on the transition frame.
     */
    buttonPressed: (button: number, player: number = 0, repeatRate?: number): boolean => {
        return buttons.isPressed(button, player, repeatRate);
    },

    /**
     * Checks whether a button was released on the current frame.
     *
     * Same parameter semantics as {@link isDown}; returns `true` only on
     * the frame the button transitions from down to up.
     *
     * Call from `update()`, not `render()`, for reliable detection: for keyboard and
     * gamepad buttons, the release edge clears once per fixed-update tick, which always
     * runs before that frame's `render()`.
     * Pointer buttons keep two clocks: from `update()` the release is reported to exactly one
     * update, from `render()` to exactly one rendered frame.
     *
     * `BTN_L2`, `BTN_R2` and `BTN_TRIGGER` are gamepad only (no keyboard mapping).
     *
     * @since 1.1.1
     * @changed 1.8.0 Also accepts BTN_L2 / BTN_R2 / BTN_TRIGGER (gamepad only).
     * @changed 1.8.1 Gamepad edges clear once per fixed update, not once per rendered frame, so each reaches exactly one `update()`.
     * @changed 1.8.1 Pointer releases are tracked per fixed update, so a release on a frame that runs no `update()` reaches the next one.
     * @changed 1.8.1 A keyboard-mapped button held when the canvas or window loses focus reports a release.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot
     *                 (0-3) for `BTN_POINTER_*`.
     * @returns `true` on the release frame.
     */
    // eslint-disable-next-line complexity -- explicit per-flag routing keeps input semantics easy to audit.
    isReleased: (button: number, player: number = 0): boolean => {
        if (!Number.isInteger(button) || button <= 0) {
            return false;
        }

        const pointerMask = button & flags.BTN_POINTER_ANY;

        if (pointerMask !== 0) {
            for (const [i, pointerCode] of POINTER_BUTTON_CODES.entries()) {
                if ((pointerMask & (flags.POINTER_FLAGS.at(i) ?? 0)) === 0) {
                    continue;
                }

                if (BTAPI.instance.getPointer()?.isButtonReleased(pointerCode, player, pointerClock()) ?? false) {
                    return true;
                }
            }
        }

        const faceMask = button & flags.FACE_BUTTON_MASK;

        for (const faceButton of flags.FACE_BUTTON_FLAGS) {
            if ((faceMask & faceButton) === 0) {
                continue;
            }

            const keyboard = BTAPI.instance.getKeyboard();
            const gamepad = BTAPI.instance.getGamepad();
            const keyboardCodes = faceButtonKeys(faceButton, player) ?? [];
            const isKeyboardDown = keyboard?.isButtonDown(keyboardCodes) ?? false;
            const isGamepadDown = gamepad?.isButtonDown(faceButton, player) ?? false;
            const keyboardIsReleased = keyboard?.isButtonReleased(keyboardCodes) ?? false;
            const gamepadIsReleased = gamepad?.isButtonReleased(faceButton, player) ?? false;
            const mergedIsReleased =
                (keyboardIsReleased && !(isGamepadDown && !gamepadIsReleased)) ||
                (gamepadIsReleased && !(isKeyboardDown && !keyboardIsReleased));

            if (mergedIsReleased) {
                return true;
            }
        }

        for (const triggerButton of flags.TRIGGER_BUTTON_FLAGS) {
            if ((button & triggerButton) === 0) {
                continue;
            }

            if (BTAPI.instance.getGamepad()?.isButtonReleased(triggerButton, player) ?? false) {
                return true;
            }
        }

        return false;
    },

    /**
     * Backward-compatible alias for {@link isReleased}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isReleased} instead.
     * @param button - Button constant from the `BTN_*` set.
     * @param player - Zero-based player index for gamepads, or pointer slot.
     * @returns `true` on the release frame.
     */
    buttonReleased: (button: number, player: number = 0): boolean => {
        return buttons.isReleased(button, player);
    },

    /**
     * Assigns one or more `KeyboardEvent.code` values to a face button for a keyboard player.
     *
     * Logical button state is the OR of all listed keys. Only players `0` and `1`
     * support keyboard; other indices no-op. `button` must be one face-button
     * bit flag (`BT.BTN_UP` … `BT.BTN_SELECT`). Pass an empty key list
     * to clear keyboard bindings for that button until remapped again. A call made
     * before `BT.init()` is kept: `init()` seeds the layout from `configure()`, then
     * reapplies it.
     *
     * @since 1.0.3
     * @changed 1.8.1 A call made before `BT.init()` survives the layout seed instead of being discarded.
     * @param player - Zero-based player index (`0` or `1`).
     * @param button - Face button constant.
     * @param keys - DOM key codes (for example `'Space'`, `'KeyW'`).
     */
    inputMap: (player: number, button: number, ...keys: string[]): void => {
        if (player !== 0 && player !== 1) {
            return;
        }

        if (!flags.FACE_BUTTON_FLAGS.includes(button as flags.FaceButtonCode)) {
            return;
        }

        setKeyboardFaceButtonKeys(player, button, [...keys]);
    },

    /**
     * Restores built-in default keyboard maps for players `0` and `1`.
     *
     * Uses the tables for the active `keyboardLayout` from `configure()`:
     * `BT.DEFAULT_KEYBOARD_PLAYER1` / `BT.DEFAULT_KEYBOARD_PLAYER2` for `'versus'` (the
     * default), `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1` / `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER2`
     * for `'single'`.
     *
     * @since 1.0.3
     * @changed 1.8.0 Restores the defaults of the active `HardwareSettings.keyboardLayout`
     *   instead of always the `'versus'` tables.
     */
    inputMapReset: (): void => {
        resetKeyboardFaceButtonMaps();
    },

    /**
     * Reads a gamepad axis value for a player.
     *
     * Stick axes return values in `[-1.0, 1.0]` with dead-zone filtering.
     * Trigger axes return values in `[0.0, 1.0]`.
     *
     * @since 1.0.3
     * @param axis - Axis constant (`AXIS_LEFT_X` .. `AXIS_TRIGGER_R`).
     * @param player - Zero-based player index (`0`..`3`).
     * @returns Axis value, or `0` when unavailable.
     */
    getAxis: (axis: number, player: number = 0): number => {
        return BTAPI.instance.getGamepad()?.getAxis(axis, player) ?? 0;
    },

    /**
     * Reports whether a player's gamepad is connected.
     *
     * @since 1.1.1
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    isGamepadConnected: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isConnected(player) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isGamepadConnected}.
     *
     * @since 1.0.3
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isGamepadConnected} instead.
     * @param player - Zero-based player index (`0`..`3`).
     * @returns `true` when a gamepad is available for that slot.
     */
    gamepadConnected: (player: number = 0): boolean => {
        return buttons.isGamepadConnected(player);
    },

    /**
     * Number of currently connected gamepads (max 4).
     *
     * @since 1.0.4
     * @returns Connected gamepad count (0..4).
     */
    get gamepadCount(): number {
        return BTAPI.instance.getGamepad()?.connectedCount() ?? 0;
    },

    /**
     * Checks whether a keyboard key is currently held.
     *
     * Uses `KeyboardEvent.code` (for example `"KeyW"`, `"Space"`, `"ArrowUp"`).
     *
     * @since 1.1.1
     * @param key - DOM keyboard code string.
     * @returns `true` while the key remains pressed.
     */
    isKeyDown: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyDown(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyDown}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isKeyDown} instead.
     * @param key - DOM keyboard code string.
     * @returns `true` while the key remains pressed.
     */
    keyDown: (key: string): boolean => {
        return buttons.isKeyDown(key);
    },

    /**
     * Checks whether a keyboard key was pressed on the current fixed-update tick.
     *
     * Optional `repeatRate` is in fixed ticks between repeats (`0` or omitted =
     * edge only). When `repeatRate > 0`, repeats fire while held per
     * `(ticks - firstPressTick) > 0 && (ticks - firstPressTick) % repeatRate === 0`.
     *
     * Call from `update()`, not `render()`: the press edge clears once per fixed-update
     * tick, which always runs before that frame's `render()`, so a press read from
     * `render()` can be intermittently missed under rapid input.
     *
     * @since 1.1.1
     * @param key - DOM keyboard code string.
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on the press edge (and on repeat ticks when configured).
     */
    isKeyPressed: (key: string, repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getKeyboard()?.isKeyPressed(key, repeatRate, tick) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyPressed}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isKeyPressed} instead.
     * @param key - DOM keyboard code string.
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on the press edge (and on repeat ticks when configured).
     */
    keyPressed: (key: string, repeatRate?: number): boolean => {
        return buttons.isKeyPressed(key, repeatRate);
    },

    /**
     * Checks whether a keyboard key was released on the current frame.
     *
     * Call from `update()`, not `render()`: the release edge clears once per fixed-update
     * tick, which always runs before that frame's `render()`, so a release read from
     * `render()` can be intermittently missed under rapid input. A key held when the canvas or the
     * window loses focus is released then, and reports this edge on the next update.
     *
     * @since 1.1.1
     * @changed 1.8.1 A key held when the canvas or window loses focus reports a release.
     * @param key - DOM keyboard code string.
     * @returns `true` on the release edge.
     */
    isKeyReleased: (key: string): boolean => {
        return BTAPI.instance.getKeyboard()?.isKeyReleased(key) ?? false;
    },

    /**
     * Backward-compatible alias for {@link isKeyReleased}.
     *
     * @since 0.1.0
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isKeyReleased} instead.
     * @param key - DOM keyboard code string.
     * @returns `true` on the release edge.
     */
    keyReleased: (key: string): boolean => {
        return buttons.isKeyReleased(key);
    },

    /**
     * Text typed on the focused canvas since the last fixed-update flush, built from `keydown`:
     * printable ASCII (32-126), `\x08` for Backspace, `\x0d` for Enter, `\x09` for Tab and `\x1b` for Escape.
     * Characters and Backspace repeat while the key is held; Enter, Tab and Escape arrive once per press. Ctrl and Alt
     * shortcuts type nothing. Physical keyboards only: IME composition, touch keyboards and paste do not reach it.
     * Read during `update()`; the buffer clears at the end of each fixed update step.
     *
     * @since 1.0.4
     * @changed 1.8.1 Built from `keydown`, so typed characters arrive; it used to rely on `beforeinput`, which a canvas never receives.
     * @returns Characters typed since the last fixed-update flush.
     */
    get inputString(): string {
        return BTAPI.instance.getKeyboard()?.getInputString() ?? '';
    },

    /**
     * Checks whether at least one keyboard key is currently held.
     *
     * @since 1.8.0
     * @returns `true` while any key is down.
     */
    isAnyKeyDown: (): boolean => {
        return BTAPI.instance.getKeyboard()?.isAnyKeyDown() ?? false;
    },

    /**
     * Checks whether any keyboard key was pressed on the current fixed-update tick.
     *
     * Fires when a key goes down, even if other keys are already held. With `repeatRate > 0` it
     * also fires every `repeatRate` ticks while keys stay held, counted from the earliest-pressed
     * key that is still down. Call from `update()`, not `render()`, like {@link isKeyPressed}.
     *
     * @since 1.8.0
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on a press edge (and on repeat ticks when configured).
     */
    isAnyKeyPressed: (repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getKeyboard()?.isAnyKeyPressed(repeatRate, tick) ?? false;
    },

    /**
     * Checks whether every keyboard key has just been released.
     *
     * Matches RetroBlit: `true` only on the tick where no key is held any more and at least one
     * was held before. Releasing one key while another stays down does not count; use
     * {@link isKeyReleased} for per-key edges. Losing focus while keys are held counts as the release.
     * Call from `update()`, not `render()`.
     *
     * @since 1.8.0
     * @changed 1.8.1 Fires when the canvas or window loses focus while keys are held.
     * @returns `true` on the tick the last held key comes up.
     */
    isAnyKeyReleased: (): boolean => {
        return BTAPI.instance.getKeyboard()?.isAnyKeyReleased() ?? false;
    },

    /**
     * Checks whether at least one gamepad button is held for a player.
     *
     * Covers the `BTN_UP` to `BTN_SELECT` buttons of a connected gamepad. Sticks, triggers
     * (analog or `BTN_L2` / `BTN_R2`), the keyboard, and pointers are not included; use {@link isAnyKeyDown} for the keyboard.
     *
     * @since 1.8.0
     * @param player - Zero-based gamepad index (0-3).
     * @returns `true` while any of the player's gamepad buttons is down.
     */
    isAnyButtonDown: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isAnyButtonDown(player) ?? false;
    },

    /**
     * Checks whether any gamepad button was pressed since the last fixed update.
     *
     * Same press and repeat semantics as {@link isAnyKeyPressed}, for one player's gamepad. Call from `update()`:
     * like {@link isPressed}, the edge clears once per fixed update, so each press reaches exactly one `update()`.
     *
     * @since 1.8.0
     * @changed 1.8.1 The edge clears once per fixed update, not once per rendered frame, so it is no longer missed on a frame that runs no update or repeated on a frame that runs several.
     * @param player - Zero-based gamepad index (0-3).
     * @param repeatRate - Ticks between repeat triggers; omit or `0` for no repeat.
     * @returns `true` on a press edge (and on repeat ticks when configured).
     */
    isAnyButtonPressed: (player: number = 0, repeatRate?: number): boolean => {
        const tick = BTAPI.instance.getTicks();

        return BTAPI.instance.getGamepad()?.isAnyButtonPressed(player, repeatRate, tick) ?? false;
    },

    /**
     * Checks whether every gamepad button has just been released for a player.
     *
     * Same "everything is up" meaning as {@link isAnyKeyReleased}: `true` only on the update where no button
     * is held any more and at least one was held before. A gamepad disconnecting while buttons were held
     * also counts. Call from `update()`: like {@link isReleased}, the edge clears once per fixed update.
     *
     * @since 1.8.0
     * @changed 1.8.1 The edge clears once per fixed update, not once per rendered frame, so it is no longer missed on a frame that runs no update or repeated on a frame that runs several.
     * @param player - Zero-based gamepad index (0-3).
     * @returns `true` on the first update after the last held button comes up.
     */
    isAnyButtonReleased: (player: number = 0): boolean => {
        return BTAPI.instance.getGamepad()?.isAnyButtonReleased(player) ?? false;
    },
};
