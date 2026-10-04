/**
 * Shared fixture for sprite flip / rotation tests: the 3x2 `ABC / DEF` source from
 * `docs/api-rendering.md` and an independent grid-based oracle for every flags mask.
 */

/** Source rows. Letter `A` is stored as palette index 1, `B` as 2, and so on. */
export const SOURCE_ROWS: readonly string[] = ['ABC', 'DEF'];

/** Source width and height. */
export const SOURCE_W = SOURCE_ROWS[0]?.length ?? 0;
export const SOURCE_H = SOURCE_ROWS.length;

/** The source as row-major indexed pixels (A = 1 ... F = 6). */
export const SOURCE_PIXELS: Uint8Array<ArrayBuffer> = Uint8Array.from(SOURCE_ROWS.join(''), (ch) => letterToIndex(ch));

/** A 5x4 sheet with the source at (1, 1), so draws exercise a non-zero source-rect offset. */
export const PADDED_SHEET_W = 5;
export const PADDED_SHEET_H = 4;
export const PADDED_SHEET_PIXELS: Uint8Array<ArrayBuffer> = Uint8Array.from(
    { length: PADDED_SHEET_W * PADDED_SHEET_H },
    (_, i) => {
        const x = (i % PADDED_SHEET_W) - 1;
        const y = Math.floor(i / PADDED_SHEET_W) - 1;
        const inside = x >= 0 && x < SOURCE_W && y >= 0 && y < SOURCE_H;

        return inside ? (SOURCE_PIXELS[y * SOURCE_W + x] ?? 0) : 0;
    },
);

/** Where the source sits inside {@link PADDED_SHEET_PIXELS}: `Rect2i` constructor arguments (x, y, width, height). */
export const PADDED_SRC_RECT_ARGS = [1, 1, SOURCE_W, SOURCE_H] as const;

/** Expected result per orientation `0`-`7`, copied from the doc table (rows joined with ` / `). */
export const DOC_RESULTS: readonly string[] = [
    'ABC / DEF',
    'CBA / FED',
    'DEF / ABC',
    'FED / CBA',
    'DA / EB / FC',
    'FC / EB / DA',
    'AD / BE / CF',
    'CF / BE / AD',
];

/**
 * Converts a letter to its stored palette index.
 *
 * @param ch - Letter `A`-`F`.
 * @returns Index `1`-`6`.
 */
export function letterToIndex(ch: string): number {
    return ch.charCodeAt(0) - 64;
}

/**
 * Converts a stored palette index back to its letter; `0` (transparent) becomes `.`.
 *
 * @param index - Stored index.
 * @returns The letter.
 */
export function indexToLetter(index: number): string {
    return index === 0 ? '.' : String.fromCharCode(64 + index);
}

/**
 * Applies a flags mask to any grid of letters, in the documented order: FLIP_H, FLIP_V, then clockwise quarter
 * turns (1 + 2 + 4 bits -> 1, 2, 3), summed mod 4. Independent of the engine's orientation table.
 *
 * @param rows - Source rows, all the same length.
 * @param mask - Flags inside `0x1f`.
 * @returns The resulting rows.
 */
export function orientRows(rows: readonly string[], mask: number): string[] {
    let grid = rows.map((row) => [...row]);

    if (mask & 1) {
        grid = grid.map((row) => [...row].reverse());
    }

    if (mask & 2) {
        grid = [...grid].reverse();
    }

    const turns = ((mask & 4 ? 1 : 0) + (mask & 8 ? 2 : 0) + (mask & 16 ? 3 : 0)) % 4;

    for (let t = 0; t < turns; t++) {
        const height = grid.length;
        const width = grid[0]?.length ?? 0;
        // Clockwise: new row c is old column c read bottom to top.
        grid = Array.from({ length: width }, (_, c) =>
            // eslint-disable-next-line security/detect-object-injection
            Array.from({ length: height }, (_, r) => grid[height - 1 - r]?.[c] ?? '?'),
        );
    }

    return grid.map((row) => row.join(''));
}

/**
 * Applies a flags mask to the source grid by literally flipping and rotating rows of letters, in the
 * documented order: FLIP_H, FLIP_V, then clockwise quarter turns (1 + 2 + 4 bits -> 1, 2, 3), summed mod 4.
 * Independent of the engine's orientation table, so it can check it.
 *
 * @param mask - Flags inside `0x1f`.
 * @returns The resulting grid as ` / `-joined rows.
 */
export function applyMaskToGrid(mask: number): string {
    return orientRows(SOURCE_ROWS, mask).join(' / ');
}

/**
 * Nearest-neighbor stretch oracle: destination pixel `d` samples its center, exact ties rounding down. Written with
 * an explicit tie test so it stays independent of the engine's `stretchSampleIndex`.
 *
 * @param rows - Post-flags rows (`fw` wide, `fh` tall).
 * @param dw - Destination width.
 * @param dh - Destination height.
 * @returns `dh` rows of `dw` letters.
 */
export function stretchRows(rows: readonly string[], dw: number, dh: number): string[] {
    const fh = rows.length;
    const fw = rows[0]?.length ?? 0;
    const pick = (d: number, f: number, size: number): number => {
        const num = (2 * d + 1) * f;
        const den = 2 * size;

        return num % den === 0 ? num / den - 1 : Math.floor(num / den);
    };

    return Array.from({ length: dh }, (_, dy) =>
        Array.from({ length: dw }, (_, dx) => rows[pick(dy, fh, dh)]?.[pick(dx, fw, dw)] ?? '?').join(''),
    );
}

/**
 * Block-copy oracle for integer scale: every letter repeated `sx` times, every row `sy` times.
 *
 * @param rows - Post-flags rows.
 * @param sx - Horizontal scale.
 * @param sy - Vertical scale.
 * @returns The scaled rows.
 */
export function scaleRows(rows: readonly string[], sx: number, sy: number): string[] {
    return rows.flatMap((row) => Array.from({ length: sy }, () => [...row].map((ch) => ch.repeat(sx)).join('')));
}

/**
 * Lays `rows` into a `sheetW x sheetH` indexed buffer at (1, 1), transparent elsewhere.
 *
 * @param rows - Letter rows (`A` = 1).
 * @param sheetW - Sheet width.
 * @param sheetH - Sheet height.
 * @returns Row-major indexed pixels.
 */
function padRows(rows: readonly string[], sheetW: number, sheetH: number): Uint8Array<ArrayBuffer> {
    return Uint8Array.from({ length: sheetW * sheetH }, (_, i) => {
        const x = (i % sheetW) - 1;
        const y = Math.floor(i / sheetW) - 1;
        // eslint-disable-next-line security/detect-object-injection
        const ch = rows[y]?.[x];

        return ch === undefined ? 0 : letterToIndex(ch);
    });
}

/** A 5x3 source with 15 distinct letters, for stretch tests that need a 5-texel axis (5 -> 7). */
export const WIDE_W = 5;
export const WIDE_H = 3;
export const WIDE_ROWS: readonly string[] = Array.from({ length: WIDE_H }, (_, r) =>
    Array.from({ length: WIDE_W }, (_, c) => String.fromCharCode(65 + r * WIDE_W + c)).join(''),
);

/** A 7x5 sheet with {@link WIDE_ROWS} at (1, 1). */
export const WIDE_SHEET_W = 7;
export const WIDE_SHEET_H = 5;
export const WIDE_SHEET_PIXELS: Uint8Array<ArrayBuffer> = padRows(WIDE_ROWS, WIDE_SHEET_W, WIDE_SHEET_H);

/** Where the wide source sits in {@link WIDE_SHEET_PIXELS}: `Rect2i` constructor arguments. */
export const WIDE_SRC_RECT_ARGS = [1, 1, WIDE_W, WIDE_H] as const;
