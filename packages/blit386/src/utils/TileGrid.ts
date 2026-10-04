import { spriteTileCoordinateInvalidError, spriteTileSizeInvalidError } from './errorMessages';
import { MAX_RENDER_DIMENSION } from './RenderLimits';

/**
 * Largest tile edge in pixels. Same value as `MAX_ASSET_DIMENSION` (which aliases
 * `MAX_RENDER_DIMENSION`): no sheet can be larger, so no tile can be either, and the
 * cap keeps every accepted size exactly representable by `Vector2i`'s 32-bit fields.
 * Imported from `RenderLimits` because `AssetLimits` imports `Rect2i`, which imports
 * this module.
 */
const MAX_TILE_SIZE = MAX_RENDER_DIMENSION;

/**
 * Which tile coordinate a validation error refers to.
 *
 * Engine-internal; not re-exported from the package entry.
 */
export type TileCoordinateName = 'column' | 'row' | 'index';

/**
 * Throws unless both tile dimensions are whole numbers from 1 to the maximum
 * asset dimension.
 *
 * Engine-internal; shared by `Rect2i.fromTile` and the sprite-sheet tile grid.
 *
 * @param tileW - Tile width in pixels.
 * @param tileH - Tile height in pixels.
 * @throws RangeError if either dimension is not a whole number in that range.
 */
export function assertTileSize(tileW: number, tileH: number): void {
    if (!isTileEdge(tileW) || !isTileEdge(tileH)) {
        throw new RangeError(spriteTileSizeInvalidError(`${tileW} x ${tileH}`, MAX_TILE_SIZE));
    }
}

/**
 * Returns whether one tile edge is a whole number from 1 to {@link MAX_TILE_SIZE}.
 *
 * @param value - Edge length in pixels.
 * @returns `true` when the edge is valid.
 */
function isTileEdge(value: number): boolean {
    return Number.isInteger(value) && value > 0 && value <= MAX_TILE_SIZE;
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
