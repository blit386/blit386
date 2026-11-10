/**
 * W3C standard-mapping tables for {@link GamepadInput}: raw button and axis indices, the `BTN_*` flags they set,
 * the `BT.AXIS_*` values, the stick dead zone, and the pure readers that turn one browser `Gamepad` into a button
 * mask and an axis tuple.
 */

/* eslint-disable security/detect-object-injection */

import {
    BTN_A,
    BTN_B,
    BTN_DOWN,
    BTN_L,
    BTN_L2,
    BTN_LEFT,
    BTN_R,
    BTN_R2,
    BTN_RIGHT,
    BTN_SELECT,
    BTN_START,
    BTN_UP,
    BTN_X,
    BTN_Y,
    FACE_BUTTON_FLAGS,
    FACE_BUTTON_MASK,
} from './buttonFlags';

/** Default analog dead zone for stick axes. */
const DEFAULT_GAMEPAD_DEAD_ZONE = 0.75;

/** Standard mapping button indices (W3C standard gamepad mapping). */
const GP_BUTTON_A = 0;
const GP_BUTTON_B = 1;
const GP_BUTTON_X = 2;
const GP_BUTTON_Y = 3;
const GP_BUTTON_L = 4;
const GP_BUTTON_R = 5;
const GP_BUTTON_L2 = 6;
const GP_BUTTON_R2 = 7;
const GP_BUTTON_SELECT = 8;
const GP_BUTTON_START = 9;
const GP_BUTTON_UP = 12;
const GP_BUTTON_DOWN = 13;
const GP_BUTTON_LEFT = 14;
const GP_BUTTON_RIGHT = 15;

/** Standard-mapping button index and the `BTN_*` flag it sets; triggers are separate (analog threshold). */
const DIGITAL_BUTTONS: readonly (readonly [number, number])[] = [
    [GP_BUTTON_UP, BTN_UP],
    [GP_BUTTON_DOWN, BTN_DOWN],
    [GP_BUTTON_LEFT, BTN_LEFT],
    [GP_BUTTON_RIGHT, BTN_RIGHT],
    [GP_BUTTON_A, BTN_A],
    [GP_BUTTON_B, BTN_B],
    [GP_BUTTON_X, BTN_X],
    [GP_BUTTON_Y, BTN_Y],
    [GP_BUTTON_L, BTN_L],
    [GP_BUTTON_R, BTN_R],
    [GP_BUTTON_START, BTN_START],
    [GP_BUTTON_SELECT, BTN_SELECT],
];

/** Raw `Gamepad.axes` indices of the two sticks (W3C standard gamepad mapping). */
const RAW_LEFT_X = 0;
const RAW_LEFT_Y = 1;
const RAW_RIGHT_X = 2;
const RAW_RIGHT_Y = 3;

/** Left stick horizontal (`BT.AXIS_LEFT_X`). The `AXIS_*` values are also the axis order of a player snapshot. */
export const AXIS_LEFT_X = 0;

/** Left stick vertical (`BT.AXIS_LEFT_Y`). */
export const AXIS_LEFT_Y = 1;

/** Right stick horizontal (`BT.AXIS_RIGHT_X`). */
export const AXIS_RIGHT_X = 2;

/** Right stick vertical (`BT.AXIS_RIGHT_Y`). */
export const AXIS_RIGHT_Y = 3;

/** Left trigger, analog (`BT.AXIS_TRIGGER_L`). */
export const AXIS_TRIGGER_L = 4;

/** Right trigger, analog (`BT.AXIS_TRIGGER_R`). */
export const AXIS_TRIGGER_R = 5;

/** Every flag a gamepad can set: the face buttons plus the two digital triggers. */
export const VALID_BUTTON_FLAGS = [...FACE_BUTTON_FLAGS, BTN_L2, BTN_R2] as const;

/**
 * The face buttons OR-ed together; the mask behind the any-button helpers. The trigger buttons
 * are left out on purpose: `BT.isAnyButton*` is documented to cover `BTN_UP` to `BTN_SELECT` only.
 */
export const ANY_BUTTON_MASK = FACE_BUTTON_MASK;

export const VALID_AXIS_INDICES = [
    AXIS_LEFT_X,
    AXIS_LEFT_Y,
    AXIS_RIGHT_X,
    AXIS_RIGHT_Y,
    AXIS_TRIGGER_L,
    AXIS_TRIGGER_R,
] as const;

/** Number of tracked axes per player, in {@link VALID_AXIS_INDICES} order. */
export const GAMEPAD_AXIS_COUNT = VALID_AXIS_INDICES.length;

/** A gamepad button (including a trigger) counts as down at or above this analog value. */
const BUTTON_DOWN_THRESHOLD = 0.5;

/** Fixed-length, preallocated per-player axis tuple (mutated in place, never reallocated). */
export type GamepadAxes = [number, number, number, number, number, number];

/**
 * Reads and clamps a raw stick axis to `[-1, 1]`.
 *
 * @param pad - Gamepad object.
 * @param index - Raw axis index.
 * @returns Clamped axis value.
 */
function getAxis(pad: Gamepad, index: number): number {
    const value = pad.axes[index] ?? 0;

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(-1, Math.min(1, value));
}

/**
 * Reads a trigger/button analog value and clamps to `[0, 1]`.
 *
 * @param pad - Gamepad object.
 * @param index - Raw button index.
 * @returns Clamped analog value.
 */
function getButtonValue(pad: Gamepad, index: number): number {
    const button = pad.buttons[index];

    if (!button) {
        return 0;
    }

    const value = Number.isFinite(button.value) ? button.value : button.pressed ? 1 : 0;

    return Math.max(0, Math.min(1, value));
}

/**
 * Checks digital down-state for a trigger by thresholding its analog value.
 * Browsers set `pressed` themselves (Chromium at about 12% pull), so the flag
 * is ignored here to keep the fixed 50% threshold.
 *
 * @param pad - Gamepad object.
 * @param index - Raw trigger button index.
 * @returns `true` when the analog value reaches the threshold.
 */
function isTriggerDown(pad: Gamepad, index: number): boolean {
    return getButtonValue(pad, index) >= BUTTON_DOWN_THRESHOLD;
}

/**
 * Checks digital down-state for a gamepad button.
 *
 * @param pad - Gamepad object.
 * @param index - Raw button index.
 * @returns `true` when considered pressed.
 */
function isButtonDown(pad: Gamepad, index: number): boolean {
    const button = pad.buttons[index];

    if (!button) {
        return false;
    }

    return button.pressed || button.value >= BUTTON_DOWN_THRESHOLD;
}

/**
 * Maps standard Gamepad API buttons to `BTN_*` bit flags.
 *
 * @param pad - Gamepad object from browser API.
 * @returns Button-state bitmask.
 */
export function mapButtons(pad: Gamepad): number {
    let mask = 0;

    for (const [index, flag] of DIGITAL_BUTTONS) {
        if (isButtonDown(pad, index)) {
            mask |= flag;
        }
    }

    if (isTriggerDown(pad, GP_BUTTON_L2)) {
        mask |= BTN_L2;
    }
    if (isTriggerDown(pad, GP_BUTTON_R2)) {
        mask |= BTN_R2;
    }

    return mask;
}

/**
 * Maps gamepad axis/button values into `AXIS_*` order, writing into the
 * given preallocated tuple in place.
 *
 * @param pad - Gamepad object from browser API.
 * @param target - Preallocated axis tuple to write into.
 */
export function mapAxesInto(pad: Gamepad, target: GamepadAxes): void {
    target[AXIS_LEFT_X] = applyStickDeadZone(getAxis(pad, RAW_LEFT_X));
    target[AXIS_LEFT_Y] = applyStickDeadZone(getAxis(pad, RAW_LEFT_Y));
    target[AXIS_RIGHT_X] = applyStickDeadZone(getAxis(pad, RAW_RIGHT_X));
    target[AXIS_RIGHT_Y] = applyStickDeadZone(getAxis(pad, RAW_RIGHT_Y));
    target[AXIS_TRIGGER_L] = getButtonValue(pad, GP_BUTTON_L2);
    target[AXIS_TRIGGER_R] = getButtonValue(pad, GP_BUTTON_R2);
}

/**
 * Applies the fixed dead zone and re-normalizes stick range.
 *
 * @param value - Raw stick axis value.
 * @returns Dead-zone filtered value.
 */
function applyStickDeadZone(value: number): number {
    const abs = Math.abs(value);

    if (abs <= DEFAULT_GAMEPAD_DEAD_ZONE) {
        return 0;
    }

    const normalized = (abs - DEFAULT_GAMEPAD_DEAD_ZONE) / (1 - DEFAULT_GAMEPAD_DEAD_ZONE);

    return Math.sign(value) * Math.min(1, normalized);
}
