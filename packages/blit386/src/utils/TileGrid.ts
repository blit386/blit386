import { spriteTileCoordinateInvalidError, spriteTileSizeInvalidError } from './errorMessages';

/**
 * Which tile coordinate a validation error refers to.
 *
 * Engine-internal; not re-exported from the package entry.
 */
export type TileCoordinateName = 'column' | 'row' | 'index';

/**
 * Throws unless both tile dimensions are positive integers.
 *
 * Engine-internal; shared by `Rect2i.fromTile` and the sprite-sheet tile grid.
 *
 * @param tileW - Tile width in pixels.
 * @param tileH - Tile height in pixels.
 * @throws RangeError if either dimension is not a positive integer.
 */
export function assertTileSize(tileW: number, tileH: number): void {
    if (!Number.isInteger(tileW) || !Number.isInteger(tileH) || tileW <= 0 || tileH <= 0) {
        throw new RangeError(spriteTileSizeInvalidError(`${tileW} x ${tileH}`));
    }
}

/**
 * Throws unless a tile column, row, or index is a non-negative integer.
 *
 * Engine-internal; shared by `Rect2i.fromTile` and the sprite-sheet tile grid.
 *
 * @param name - Which coordinate is being checked, for the error message.
 * @param value - The coordinate value.
 * @throws RangeError if the value is negative, fractional, or not finite.
 */
export function assertTileCoordinate(name: TileCoordinateName, value: number): void {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(spriteTileCoordinateInvalidError(name, value));
    }
}
