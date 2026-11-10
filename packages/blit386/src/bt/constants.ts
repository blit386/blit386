/**
 * Constant members of the `BT` namespace: sprite orientation bits, button and pointer flags, player indices, gamepad
 * axes, and the default keyboard tables. Values only, no engine state.
 */

import * as flags from '../input/buttonFlags';
import {
    DEFAULT_KEYBOARD_PLAYER1,
    DEFAULT_KEYBOARD_PLAYER2,
    DEFAULT_KEYBOARD_SINGLE_PLAYER1,
    DEFAULT_KEYBOARD_SINGLE_PLAYER2,
} from '../input/defaultKeyboardMap';
import * as gamepadMapping from '../input/gamepadMapping';
import {
    SPRITE_FLIP_H,
    SPRITE_FLIP_V,
    SPRITE_ROT_90_CW,
    SPRITE_ROT_180_CW,
    SPRITE_ROT_270_CW,
} from '../render/SpriteOrientation';

/** Constant members of `BT`, merged into it by `BLIT386.ts`. */
export const constants = {
    /**
     * Horizontal flip flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    FLIP_H: SPRITE_FLIP_H,

    /**
     * Vertical flip flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    FLIP_V: SPRITE_FLIP_V,

    /**
     * Rotate 90° clockwise flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_90_CW: SPRITE_ROT_90_CW,

    /**
     * Rotate 180° flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_180_CW: SPRITE_ROT_180_CW,

    /**
     * Rotate 270° clockwise flag for sprite rendering. Pass in {@link SpriteDrawParams.flags}; combine with the other `FLIP_*` / `ROT_*` bits using `|`.
     *
     * @since 0.1.0
     * @changed 1.8.0 Accepted by `BT.drawSprite` through `SpriteDrawParams.flags`.
     */
    ROT_270_CW: SPRITE_ROT_270_CW,

    /**
     * Up button bit flag.
     *
     * @since 0.1.0
     */
    BTN_UP: flags.BTN_UP,

    /**
     * Down button bit flag.
     *
     * @since 0.1.0
     */
    BTN_DOWN: flags.BTN_DOWN,

    /**
     * Left button bit flag.
     *
     * @since 0.1.0
     */
    BTN_LEFT: flags.BTN_LEFT,

    /**
     * Right button bit flag.
     *
     * @since 0.1.0
     */
    BTN_RIGHT: flags.BTN_RIGHT,

    /**
     * A button bit flag.
     *
     * @since 0.1.0
     */
    BTN_A: flags.BTN_A,

    /**
     * B button bit flag.
     *
     * @since 0.1.0
     */
    BTN_B: flags.BTN_B,

    /**
     * X button bit flag.
     *
     * @since 0.1.0
     */
    BTN_X: flags.BTN_X,

    /**
     * Y button bit flag.
     *
     * @since 0.1.0
     */
    BTN_Y: flags.BTN_Y,

    /**
     * Left shoulder button bit flag.
     *
     * @since 0.1.0
     */
    BTN_L: flags.BTN_L,

    /**
     * Right shoulder button bit flag.
     *
     * @since 0.1.0
     */
    BTN_R: flags.BTN_R,

    /**
     * Start button bit flag.
     *
     * @since 0.1.0
     */
    BTN_START: flags.BTN_START,

    /**
     * Select button bit flag.
     *
     * @since 0.1.0
     */
    BTN_SELECT: flags.BTN_SELECT,

    /**
     * Primary pointer button code.
     *
     * Maps to mouse left for slot 0; touch contact for slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_A: flags.BTN_POINTER_A,

    /**
     * Secondary pointer button code.
     *
     * Maps to mouse right for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_B: flags.BTN_POINTER_B,

    /**
     * Tertiary pointer button code.
     *
     * Maps to mouse middle for slot 0 (matches RetroBlit canonical, not the
     * DOM `PointerEvent.button` index where 1 is middle and 2 is right).
     * Always `false` for touch slots 1-3.
     *
     * @since 0.1.0
     */
    BTN_POINTER_C: flags.BTN_POINTER_C,

    /**
     * Auxiliary pointer button code.
     *
     * Maps to mouse back/forward extra buttons (DOM `PointerEvent.button`
     * 3 or 4) for slot 0. Always `false` for touch slots 1-3.
     *
     * @since 1.0.3
     */
    BTN_POINTER_D: flags.BTN_POINTER_D,

    /**
     * Player one index.
     *
     * @since 1.0.3
     */
    PLAYER_ONE: 0,

    /**
     * Player two index.
     *
     * @since 1.0.3
     */
    PLAYER_TWO: 1,

    /**
     * Player three index.
     *
     * @since 1.0.3
     */
    PLAYER_THREE: 2,

    /**
     * Player four index.
     *
     * @since 1.0.3
     */
    PLAYER_FOUR: 3,

    /**
     * Left stick horizontal axis index.
     *
     * @since 1.0.3
     */
    AXIS_LEFT_X: gamepadMapping.AXIS_LEFT_X,

    /**
     * Left stick vertical axis index.
     *
     * @since 1.0.3
     */
    AXIS_LEFT_Y: gamepadMapping.AXIS_LEFT_Y,

    /**
     * Right stick horizontal axis index.
     *
     * @since 1.0.3
     */
    AXIS_RIGHT_X: gamepadMapping.AXIS_RIGHT_X,

    /**
     * Right stick vertical axis index.
     *
     * @since 1.0.3
     */
    AXIS_RIGHT_Y: gamepadMapping.AXIS_RIGHT_Y,

    /**
     * Left trigger axis index (0.0 to 1.0).
     *
     * @since 1.0.3
     */
    AXIS_TRIGGER_L: gamepadMapping.AXIS_TRIGGER_L,

    /**
     * Right trigger axis index (0.0 to 1.0).
     *
     * @since 1.0.3
     */
    AXIS_TRIGGER_R: gamepadMapping.AXIS_TRIGGER_R,

    /**
     * All face buttons (A/B/X/Y).
     *
     * @since 1.0.3
     */
    BTN_ABXY: flags.BTN_ABXY,

    /**
     * Both shoulder buttons.
     *
     * @since 1.0.3
     */
    BTN_SHOULDER: flags.BTN_SHOULDER,

    /**
     * Left trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_L)`.
     *
     * @since 1.8.0
     */
    BTN_L2: flags.BTN_L2,

    /**
     * Right trigger as a digital button (down at 50% pull or more). Gamepad only:
     * keyboard players never trigger it and `BT.inputMap` rejects it. The analog
     * pull is still available through `BT.getAxis(BT.AXIS_TRIGGER_R)`.
     *
     * @since 1.8.0
     */
    BTN_R2: flags.BTN_R2,

    /**
     * Either trigger as a digital button (`BTN_L2 | BTN_R2`).
     *
     * @since 1.8.0
     */
    BTN_TRIGGER: flags.BTN_TRIGGER,

    /**
     * Any pointer button (A/B/C/D).
     *
     * @since 1.0.3
     */
    BTN_POINTER_ANY: flags.BTN_POINTER_ANY,

    /**
     * Default `KeyboardEvent.code` values for player index 0 (first keyboard player).
     *
     * @since 1.0.3
     * @changed 1.8.0 Now the `'versus'` `keyboardLayout` table (the default); see
     *   `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1` for `'single'`.
     */
    DEFAULT_KEYBOARD_PLAYER1,

    /**
     * Default `KeyboardEvent.code` values for player index 1 (second keyboard player).
     *
     * @since 1.0.3
     * @changed 1.8.0 Now the `'versus'` `keyboardLayout` table (the default); see
     *   `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER2` for `'single'`.
     */
    DEFAULT_KEYBOARD_PLAYER2,

    /**
     * Default `KeyboardEvent.code` values for player index 0 under
     * `keyboardLayout: 'single'`: WASD plus the arrow keys on the D-pad.
     *
     * @since 1.8.0
     */
    DEFAULT_KEYBOARD_SINGLE_PLAYER1,

    /**
     * Default `KeyboardEvent.code` values for player index 1 under
     * `keyboardLayout: 'single'`: IJKL on the D-pad.
     *
     * @since 1.8.0
     */
    DEFAULT_KEYBOARD_SINGLE_PLAYER2,
};
