/**
 * The gallery's navigation math, tested without a DOM: rows from client rects, nearest-center
 * up/down moves across a ragged flow layout, and stacking.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRows, demoNeighbor, moveFocus, nearestInRow, visibleOrder } from '../layout-model.js';

const entries = [
    { slug: 'basics', pose: 'start' },
    { slug: 'basics', pose: 'settled' },
    { slug: 'sprites', pose: 'start' },
    { slug: 'camera', pose: 'start' },
    { slug: 'camera', pose: 'pan' },
];

describe('visibleOrder', () => {
    it('shows every pose when unstacked', () => {
        const tiles = visibleOrder(entries, { stacked: false, expanded: new Set(), filter: '' });

        assert.equal(tiles.length, 5);
        assert.deepEqual(tiles[0], { key: 'basics/start', slug: 'basics', pose: 'start', stackSize: 1 });
    });

    it('collapses each demo to its first pose with a count when stacked', () => {
        const tiles = visibleOrder(entries, { stacked: true, expanded: new Set(), filter: '' });

        assert.deepEqual(
            tiles.map((tile) => [tile.key, tile.stackSize]),
            [
                ['basics/start', 2],
                ['sprites/start', 1],
                ['camera/start', 2],
            ],
        );
    });

    it('expands one stack inline while the rest stay collapsed', () => {
        const tiles = visibleOrder(entries, { stacked: true, expanded: new Set(['camera']), filter: '' });

        assert.deepEqual(
            tiles.map((tile) => tile.key),
            ['basics/start', 'sprites/start', 'camera/start', 'camera/pan'],
        );
    });

    it('filters by slug substring', () => {
        const tiles = visibleOrder(entries, { stacked: false, expanded: new Set(), filter: 'cam' });

        assert.deepEqual(
            tiles.map((tile) => tile.key),
            ['camera/start', 'camera/pan'],
        );
    });
});

describe('buildRows and nearestInRow', () => {
    const boxes = [
        { key: 'a', x: 0, y: 0, w: 100, h: 50 },
        { key: 'b', x: 110, y: 0, w: 100, h: 50 },
        { key: 'c', x: 220, y: 0.5, w: 60, h: 50 },
        { key: 'd', x: 0, y: 60, w: 200, h: 50 },
        { key: 'e', x: 210, y: 60, w: 50, h: 50 },
    ];

    it('groups boxes by top edge with a one pixel tolerance', () => {
        const rows = buildRows(boxes);

        assert.deepEqual(
            rows.map((row) => row.map((box) => box.key)),
            [
                ['a', 'b', 'c'],
                ['d', 'e'],
            ],
        );
    });

    it('sorts each row by x even when a fractional top edge comes first', () => {
        const rows = buildRows([
            { key: 'p', x: 300, y: 0, w: 50, h: 50 },
            { key: 'q', x: 220, y: 0.5, w: 50, h: 50 },
        ]);

        assert.deepEqual(
            rows.map((row) => row.map((box) => box.key)),
            [['q', 'p']],
        );
    });

    it('picks the box whose center is nearest', () => {
        const [row] = buildRows(boxes);

        assert.equal(nearestInRow(row, 240).key, 'c');
        assert.equal(nearestInRow(row, 60).key, 'a');
    });

    describe('moveFocus', () => {
        const rows = buildRows(boxes);

        it('moves left and right within the visible order and stops at the ends', () => {
            assert.equal(moveFocus(rows, 'b', 'right'), 'c');
            assert.equal(moveFocus(rows, 'c', 'right'), 'd');
            assert.equal(moveFocus(rows, 'e', 'right'), 'e');
            assert.equal(moveFocus(rows, 'a', 'left'), 'a');
        });

        it('moves down to the nearest center in the next row', () => {
            assert.equal(moveFocus(rows, 'c', 'down'), 'e');
            assert.equal(moveFocus(rows, 'a', 'down'), 'd');
        });

        it('moves up to the nearest center in the row above', () => {
            assert.equal(moveFocus(rows, 'e', 'up'), 'c');
        });

        it('stays put on down from the last row and up from the first', () => {
            assert.equal(moveFocus(rows, 'e', 'down'), 'e');
            assert.equal(moveFocus(rows, 'b', 'up'), 'b');
        });

        it('jumps to the first and last tile', () => {
            assert.equal(moveFocus(rows, 'c', 'home'), 'a');
            assert.equal(moveFocus(rows, 'c', 'end'), 'e');
        });

        it('returns the current key when it is not in any row', () => {
            assert.equal(moveFocus(rows, 'zzz', 'down'), 'zzz');
        });
    });
});

describe('demoNeighbor', () => {
    const order = ['basics/start', 'basics/settled', 'sprites/start', 'camera/start', 'camera/pan'];

    it('jumps to the first tile of the next demo', () => {
        assert.equal(demoNeighbor(order, 'basics/start', 1), 'sprites/start');
        assert.equal(demoNeighbor(order, 'sprites/start', 1), 'camera/start');
    });

    it('jumps to the first tile of the previous demo', () => {
        assert.equal(demoNeighbor(order, 'camera/pan', -1), 'sprites/start');
        assert.equal(demoNeighbor(order, 'basics/settled', -1), 'basics/start');
    });

    it('stops at the ends', () => {
        assert.equal(demoNeighbor(order, 'camera/pan', 1), 'camera/pan');
        assert.equal(demoNeighbor(order, 'basics/start', -1), 'basics/start');
    });

    it('returns the demo first tile when only one demo is shown', () => {
        const solo = ['solo/start', 'solo/pan'];

        assert.equal(demoNeighbor(solo, 'solo/pan', -1), 'solo/start');
    });

    it('returns the current key when it is not in the order', () => {
        assert.equal(demoNeighbor(order, 'zzz/start', 1), 'zzz/start');
    });
});
