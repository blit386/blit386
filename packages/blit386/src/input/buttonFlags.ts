/**
 * The `BT.BTN_*` bit flags and the masks built from them, defined once. Import-free, so `BLIT386.ts` and every input
 * module can share it without a cycle. Internal: the public names are the `BT.BTN_*` members.
 */

/** Up face button (`BT.BTN_UP`). */
export const BTN_UP = 1 << 0;

/** Down face button (`BT.BTN_DOWN`). */
export const BTN_DOWN = 1 << 1;

/** Left face button (`BT.BTN_LEFT`). */
export const BTN_LEFT = 1 << 2;

/** Right face button (`BT.BTN_RIGHT`). */
export const BTN_RIGHT = 1 << 3;

/** A face button (`BT.BTN_A`). */
export const BTN_A = 1 << 4;

/** B face button (`BT.BTN_B`). */
export const BTN_B = 1 << 5;

/** X face button (`BT.BTN_X`). */
export const BTN_X = 1 << 6;

/** Y face button (`BT.BTN_Y`). */
export const BTN_Y = 1 << 7;

/** Left shoulder (`BT.BTN_L`). */
export const BTN_L = 1 << 8;

/** Right shoulder (`BT.BTN_R`). */
export const BTN_R = 1 << 9;

/** Start (`BT.BTN_START`). */
export const BTN_START = 1 << 10;

/** Select (`BT.BTN_SELECT`). */
export const BTN_SELECT = 1 << 11;

/** Pointer button A (`BT.BTN_POINTER_A`, left mouse / primary touch). */
export const BTN_POINTER_A = 1 << 12;

/** Pointer button B (`BT.BTN_POINTER_B`). */
export const BTN_POINTER_B = 1 << 13;

/** Pointer button C (`BT.BTN_POINTER_C`). */
export const BTN_POINTER_C = 1 << 14;

/** Pointer button D (`BT.BTN_POINTER_D`). */
export const BTN_POINTER_D = 1 << 15;

/** Left trigger as a digital button (`BT.BTN_L2`, gamepad only). */
export const BTN_L2 = 1 << 16;

/** Right trigger as a digital button (`BT.BTN_R2`, gamepad only). */
export const BTN_R2 = 1 << 17;

/** `BT.BTN_ABXY`: any of the four action buttons. */
export const BTN_ABXY = BTN_A | BTN_B | BTN_X | BTN_Y;

/** `BT.BTN_SHOULDER`: either shoulder. */
export const BTN_SHOULDER = BTN_L | BTN_R;

/** `BT.BTN_TRIGGER`: either digital trigger. */
export const BTN_TRIGGER = BTN_L2 | BTN_R2;

/** `BT.BTN_POINTER_ANY`: any pointer button. */
export const BTN_POINTER_ANY = BTN_POINTER_A | BTN_POINTER_B | BTN_POINTER_C | BTN_POINTER_D;

/** Face-button bit flags `BTN_UP` … `BTN_SELECT`, in bit order. */
export const FACE_BUTTON_FLAGS = [
    BTN_UP,
    BTN_DOWN,
    BTN_LEFT,
    BTN_RIGHT,
    BTN_A,
    BTN_B,
    BTN_X,
    BTN_Y,
    BTN_L,
    BTN_R,
    BTN_START,
    BTN_SELECT,
] as const;

/** Face-button bit-flag code type. */
export type FaceButtonCode = (typeof FACE_BUTTON_FLAGS)[number];

/** Every face-button bit (`BTN_UP` … `BTN_SELECT`). */
export const FACE_BUTTON_MASK = (BTN_SELECT << 1) - 1;

/** Pointer button bit flags `BTN_POINTER_A` … `D`, in bit order. */
export const POINTER_FLAGS = [BTN_POINTER_A, BTN_POINTER_B, BTN_POINTER_C, BTN_POINTER_D] as const;

/** Trigger button bit flags (`BTN_L2`, `BTN_R2`). Gamepad only, no keyboard fallback. */
export const TRIGGER_BUTTON_FLAGS = [BTN_L2, BTN_R2] as const;
