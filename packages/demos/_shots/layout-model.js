/**
 * Navigation math for the /shots gallery, kept free of the DOM so it is unit-testable.
 *
 * Tiles are laid out by CSS flex-wrap at 1x, so rows have ragged ends and varying widths.
 * Left/right follow the visible order; up/down pick the tile in the adjacent row whose
 * horizontal center is nearest, which is what makes arrow keys feel like a grid.
 */

import { entryKey } from './manifest.js';

// Two tiles whose top edges differ by less than this sit in the same flex row.
const ROW_TOLERANCE_PX = 1;

/**
 * Tiles to show, in order.
 *
 * @param {Array<{ slug: string, pose: string }>} entries - Manifest entries in manifest order.
 * @param {{ stacked: boolean, expanded: Set<string>, filter: string }} view
 * @returns {Array<{ key: string, slug: string, pose: string, stackSize: number }>}
 */
function visibleOrder(entries, view) {
    const filter = view.filter.toLowerCase();
    const shown = entries.filter((entry) => entry.slug.includes(filter));
    const countBySlug = new Map();

    for (const entry of shown) {
        countBySlug.set(entry.slug, (countBySlug.get(entry.slug) ?? 0) + 1);
    }

    const seen = new Set();
    const tiles = [];

    for (const entry of shown) {
        const collapsed = view.stacked && !view.expanded.has(entry.slug);

        if (collapsed && seen.has(entry.slug)) {
            continue;
        }

        seen.add(entry.slug);
        tiles.push({
            key: entryKey(entry.slug, entry.pose),
            slug: entry.slug,
            pose: entry.pose,
            stackSize: collapsed ? countBySlug.get(entry.slug) : 1,
        });
    }

    return tiles;
}

/**
 * Group tile boxes into flex rows by their top edge.
 *
 * @param {Array<{ key: string, x: number, y: number, w: number, h: number }>} boxes
 * @returns {Array<Array<{ key: string, x: number, y: number, w: number, h: number }>>}
 */
function buildRows(boxes) {
    const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];

    for (const box of sorted) {
        const row = rows[rows.length - 1];

        if (row && Math.abs(row[0].y - box.y) <= ROW_TOLERANCE_PX) {
            row.push(box);
        } else {
            rows.push([box]);
        }
    }

    return rows;
}

/**
 * @param {Array<{ x: number, w: number }>} row
 * @param {number} centerX
 * @returns {object}
 */
function nearestInRow(row, centerX) {
    let best = row[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const box of row) {
        const distance = Math.abs(box.x + box.w / 2 - centerX);

        if (distance < bestDistance) {
            best = box;
            bestDistance = distance;
        }
    }

    return best;
}

/**
 * The tile key focus moves to.
 *
 * @param {Array<Array<object>>} rows - From buildRows().
 * @param {string} currentKey
 * @param {'left' | 'right' | 'up' | 'down' | 'home' | 'end'} direction
 * @returns {string}
 */
function moveFocus(rows, currentKey, direction) {
    const flat = rows.flat();

    if (flat.length === 0) {
        return currentKey;
    }

    if (direction === 'home') {
        return flat[0].key;
    }

    if (direction === 'end') {
        return flat[flat.length - 1].key;
    }

    const rowIndex = rows.findIndex((row) => row.some((box) => box.key === currentKey));

    if (rowIndex === -1) {
        return currentKey;
    }

    const flatIndex = flat.findIndex((box) => box.key === currentKey);

    if (direction === 'left') {
        return flat[Math.max(0, flatIndex - 1)].key;
    }

    if (direction === 'right') {
        return flat[Math.min(flat.length - 1, flatIndex + 1)].key;
    }

    const targetRow = rows[rowIndex + (direction === 'down' ? 1 : -1)];

    if (!targetRow) {
        return currentKey;
    }

    const current = flat[flatIndex];

    return nearestInRow(targetRow, current.x + current.w / 2).key;
}

/**
 * First tile of the next (+1) or previous (-1) demo in the visible order.
 *
 * @param {string[]} order - Visible tile keys.
 * @param {string} currentKey
 * @param {1 | -1} delta
 * @returns {string}
 */
function demoNeighbor(order, currentKey, delta) {
    const slugOf = (key) => key.slice(0, key.indexOf('/'));
    const index = order.indexOf(currentKey);

    if (index === -1) {
        return currentKey;
    }

    const currentSlug = slugOf(currentKey);
    // Index of the first tile of the current demo (it may be a later pose we are standing on).
    const start = order.findIndex((key) => slugOf(key) === currentSlug);

    if (delta > 0) {
        const next = order.findIndex((key, i) => i > index && slugOf(key) !== currentSlug);

        return next === -1 ? currentKey : order[next];
    }

    // Backward: the first tile of the previous demo, or this demo's first tile when there is none.
    if (start === 0) {
        return order[0];
    }

    const previousSlug = slugOf(order[start - 1]);

    return order[order.findIndex((key) => slugOf(key) === previousSlug)];
}

export { buildRows, demoNeighbor, moveFocus, nearestInRow, visibleOrder };
