import { describe, expect, it } from 'vitest';

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
    ])('throws a RangeError for %s x %s', (tileW, tileH) => {
        expect(() => assertTileSize(tileW, tileH)).toThrow(RangeError);
        expect(() => assertTileSize(tileW, tileH)).toThrow(/positive whole number/);
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
