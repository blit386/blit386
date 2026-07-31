/**
 * Inline row-major mask for the overlay toggle hint icon.
 *
 * `1` draws a foreground pixel; `0` is transparent.
 */

/** Toggle hint icon width in pixels. */
export const ICON_WIDTH = 11;

/** Toggle hint icon height in pixels. */
export const ICON_HEIGHT = 7;

/**
 * Row-major tilde toggle hint mask (`width` × `height`).
 */
export const ICON_MASK: readonly number[] = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, //
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, //
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0, //
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0, //
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    0, //
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, //
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, //
];
