/**
 * Inline row-major mask for the overlay toggle hint icon.
 *
 * `#` draws a foreground pixel; `.` is transparent.
 */

/** Tilde toggle hint icon, one string per pixel row. */
const ROWS = [
    '...........',
    '...........',
    '...##......',
    '..#..#..#..',
    '......##...',
    '...........',
    '...........',
] as const;

/** Toggle hint icon width in pixels. */
export const ICON_WIDTH = ROWS[0].length;

/** Toggle hint icon height in pixels. */
export const ICON_HEIGHT = ROWS.length;

/**
 * Row-major tilde toggle hint mask (`width` × `height`); `1` is foreground, `0` transparent.
 */
export const ICON_MASK: readonly number[] = ROWS.flatMap((row) => [...row].map((pixel) => (pixel === '#' ? 1 : 0)));
