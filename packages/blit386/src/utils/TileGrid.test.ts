import { describe, expect, it } from 'vitest';

import { MAX_RENDER_DIMENSION } from './RenderLimits';
import { assertTileCoordinate, assertTileSize } from './TileGrid';

describe('assertTileSize', () => {
    it('accepts positive integers on both axes', () => {
        expect(() => assertTileSize(16, 24)).not.toThrow();
    });

    it.each([
        [0, 16],
        [16, 0],
        [-8, 8],
        [16.5, 16],
        [Number.NaN, 16],
        [MAX_RENDER_DIMENSION + 1, 16],
        [16, 2 ** 32], // Would truncate to 0 inside Vector2i.
    ])('throws a RangeError for %s x %s', (tileW, tileH) => {
        expect(() => assertTileSize(tileW, tileH)).toThrow(RangeError);
        expect(() => assertTileSize(tileW, tileH)).toThrow(/positive whole number/);
    });

    it('accepts the maximum asset dimension as a tile edge', () => {
        expect(() => assertTileSize(MAX_RENDER_DIMENSION, MAX_RENDER_DIMENSION)).not.toThrow();
    });
});

describe('assertTileCoordinate', () => {
    it('accepts zero and positive integers', () => {
        expect(() => assertTileCoordinate('column', 0)).not.toThrow();
        expect(() => assertTileCoordinate('index', 7)).not.toThrow();
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('throws a RangeError for %s', (value) => {
        expect(() => assertTileCoordinate('row', value)).toThrow(RangeError);
        expect(() => assertTileCoordinate('row', value)).toThrow(/Tile row must be a whole number/);
    });
});
