/**
 * Sprite sheet, indexed setup, and tile grid messages.
 */

import type { TileCoordinateName } from '../TileGrid';

/**
 * Returns the error message for a sprite pixel whose color is absent from the
 * active palette.
 *
 * @param x - Pixel x coordinate within the source image.
 * @param y - Pixel y coordinate within the source image.
 * @param src - Source image label (e.g. `'sheet.png'` or `(unnamed)`).
 * @param hex - The color that was not found, as a lowercase hex string.
 * @returns User-facing error string.
 */
export function spriteColorNotInPaletteError(x: number, y: number, src: string, hex: string): string {
    return (
        `The pixel at (${x}, ${y}) in ${src} has the color ${hex}, but that color isn't in your palette.` +
        ` Either add ${hex} to the palette, or change that pixel in the image.`
    );
}

/**
 * Error message shown when a sprite sheet has not been indexized
 * before use.
 */
export const SPRITE_NOT_INDEXIZED_MESSAGE =
    "This sprite sheet hasn't been prepared yet. Use SpriteSheet.loadIndexed(...) for one-step setup," +
    ' or call sheet.indexize(palette) after BT.paletteSet.';

/**
 * Error message shown when a tile is looked up by grid position on
 * a sprite sheet that has no tile size.
 */
export const SPRITE_TILE_GRID_MISSING_MESSAGE =
    'This sprite sheet has no tile size, so it cannot find a tile by its grid position.' +
    ' Load it with SpriteSheet.load(url, { tileSize: 16 }) or loadIndexed(url, palette, slot, { tileSize: 16 }),' +
    ' or set sheet.tileSize = 16. To pass the size yourself, put it before the position:' +
    ' BT.drawTile(sheet, col, row, tileSize, destPos).';

/**
 * Returns the error message shown when a tile size is not a positive whole
 * number up to the maximum on both axes.
 *
 * @param value - The rejected size, already formatted for display.
 * @param max - Largest allowed tile edge in pixels.
 * @returns User-facing error string.
 */
export function spriteTileSizeInvalidError(value: string, max: number): string {
    return `Tile size must be a positive whole number of pixels, at most ${max}, on both axes. Got: ${value}.`;
}

/**
 * Returns the error message shown when a tile column, row, or index is not a
 * whole number of 0 or more.
 *
 * @param name - Which coordinate was rejected.
 * @param value - The rejected value.
 * @returns User-facing error string.
 */
export function spriteTileCoordinateInvalidError(name: TileCoordinateName, value: number): string {
    return `Tile ${name} must be a whole number of 0 or more. Got: ${value}.`;
}

/**
 * Returns the error message shown when a tile lies outside the sheet's grid of
 * whole tiles.
 *
 * @param tile - The requested tile, already formatted for display.
 * @param columns - Whole tiles across the sheet.
 * @param rows - Whole tiles down the sheet.
 * @returns User-facing error string.
 */
export function spriteTileOutOfGridError(tile: string, columns: number, rows: number): string {
    return (
        `Tile ${tile} is outside this sheet's grid of ${columns} x ${rows} whole tiles.` +
        ' A partial tile at the right or bottom edge does not count.'
    );
}
