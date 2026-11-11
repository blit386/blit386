/**
 * Tile grid helpers for {@link SpriteSheet}: tile size validation and the tile
 * source-rectangle writers shared by `SpriteSheet.tileRect` and `BT.drawTile`.
 */

import { SPRITE_TILE_GRID_MISSING_MESSAGE, spriteTileOutOfGridError } from '../utils/errorMessages';
import type { Rect2i } from '../utils/Rect2i';
import { assertTileCoordinate, assertTileSize } from '../utils/TileGrid';
import { Vector2i } from '../utils/Vector2i';
import type { SpriteSheet } from './SpriteSheet';

/**
 * Validates a tile size given as a number (square) or a `Vector2i` and returns
 * it as a frozen `Vector2i` copy. Shared by the {@link SpriteSheet.tileSize}
 * setter and the `tileSize` option of `load` / `loadIndexed`.
 *
 * @param value - Tile size in pixels.
 * @returns Frozen tile size.
 * @throws RangeError if the size is not a positive integer on both axes.
 */
export function toTileSize(value: number | Vector2i): Vector2i {
    const tileW = typeof value === 'number' ? value : value.x;
    const tileH = typeof value === 'number' ? value : value.y;

    assertTileSize(tileW, tileH);

    return Object.freeze(new Vector2i(tileW, tileH));
}

/**
 * Writes the source rectangle of one tile into `out`, validating the tile size
 * and checking the tile against the sheet's current grid of whole tiles.
 *
 * Engine-internal: shared by {@link SpriteSheet.tileRect} and `BT.drawTile` so
 * both apply the same bounds rules. Not re-exported from the package entry.
 *
 * @param out - Rectangle to write into.
 * @param sheet - Sheet whose current size bounds the grid.
 * @param col - Zero-based column.
 * @param row - Zero-based row.
 * @param tileW - Tile width in pixels.
 * @param tileH - Tile height in pixels.
 * @returns `out`, for chaining.
 * @throws RangeError for an invalid size or coordinate, or a tile outside the grid.
 */
export function writeTileRect(
    out: Rect2i,
    sheet: SpriteSheet,
    col: number,
    row: number,
    tileW: number,
    tileH: number,
): Rect2i {
    assertTileSize(tileW, tileH);
    assertTileCoordinate('column', col);
    assertTileCoordinate('row', row);

    const columns = Math.floor(sheet.width / tileW);
    const rows = Math.floor(sheet.height / tileH);

    if (col >= columns || row >= rows) {
        throw new RangeError(spriteTileOutOfGridError(`(${col}, ${row})`, columns, rows));
    }

    out.x = col * tileW;
    out.y = row * tileH;
    out.width = tileW;
    out.height = tileH;

    return out;
}

/**
 * Writes the source rectangle of one tile into `out` using the sheet's own
 * {@link SpriteSheet.tileSize}: a row-major index when `row` is `undefined`,
 * otherwise a column and row.
 *
 * Engine-internal; not re-exported from the package entry.
 *
 * @param out - Rectangle to write into.
 * @param sheet - Sheet with a tile grid.
 * @param colOrIndex - Row-major index when `row` is `undefined`, otherwise the column.
 * @param row - Zero-based row, or `undefined` for the index form.
 * @returns `out`, for chaining.
 * @throws Error if the sheet has no tile size.
 * @throws RangeError for an invalid coordinate or a tile outside the grid.
 */
export function writeGridTileRect(
    out: Rect2i,
    sheet: SpriteSheet,
    colOrIndex: number,
    row: number | undefined,
): Rect2i {
    const tileSize = sheet.tileSize;

    if (tileSize === null) {
        throw new Error(SPRITE_TILE_GRID_MISSING_MESSAGE);
    }

    if (row !== undefined) {
        return writeTileRect(out, sheet, colOrIndex, row, tileSize.x, tileSize.y);
    }

    assertTileCoordinate('index', colOrIndex);

    const columns = Math.floor(sheet.width / tileSize.x);
    const rows = Math.floor(sheet.height / tileSize.y);

    // Also covers a zero-tile grid (tile larger than the sheet), so the modulo below never divides by zero.
    if (colOrIndex >= columns * rows) {
        throw new RangeError(spriteTileOutOfGridError(`index ${colOrIndex}`, columns, rows));
    }

    return writeTileRect(out, sheet, colOrIndex % columns, Math.floor(colOrIndex / columns), tileSize.x, tileSize.y);
}
