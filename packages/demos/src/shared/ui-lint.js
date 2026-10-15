/**
 * Layout lint for the shared UI kit - pure rules over the snapshot `UiContext.snapshot()`
 * returns (see ui-core.js). The /shots capture page runs these after every capture and shows
 * the findings as badges; the headless driver writes them into manifest.json.
 *
 * Nothing here touches BT or the DOM, so the rules run in node:test against hand-built
 * snapshots as easily as in the browser.
 */

import { UI_ANCHORS } from './ui-core.js';

const LINT_RULES = ['overlap', 'out-of-display', 'margin', 'row-gap'];

/**
 * The rectangle two boxes share, or null when they only touch or do not meet.
 *
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
function intersection(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const bottom = Math.min(a.y + a.h, b.y + b.h);

    if (right <= x || bottom <= y) {
        return null;
    }

    return { x, y, w: right - x, h: bottom - y };
}

/**
 * Is the box fully inside the display?
 *
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {{ w: number, h: number }} display
 * @returns {boolean}
 */
function insideDisplay(rect, display) {
    return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= display.w && rect.y + rect.h <= display.h;
}

/**
 * Every pair of widgets, across all groups, whose hit rectangles overlap.
 *
 * @param {Array<object>} groups
 * @returns {Array<object>}
 */
function findOverlaps(groups) {
    const widgets = groups.flatMap((group) => group.widgets);
    const findings = [];

    for (let i = 0; i < widgets.length; i++) {
        for (let j = i + 1; j < widgets.length; j++) {
            const shared = intersection(widgets[i].rect, widgets[j].rect);

            if (shared) {
                findings.push({
                    rule: 'overlap',
                    message: `"${widgets[i].id}" overlaps "${widgets[j].id}"`,
                    rect: shared,
                });
            }
        }
    }

    return findings;
}

/**
 * Groups and widgets that leave the display.
 *
 * @param {Array<object>} groups
 * @param {{ w: number, h: number }} display
 * @returns {Array<object>}
 */
function findOutOfDisplay(groups, display) {
    const findings = [];

    for (const group of groups) {
        if (!insideDisplay(group.rect, display)) {
            findings.push({
                rule: 'out-of-display',
                message: `${group.anchor} group leaves the display`,
                rect: group.rect,
            });
        }

        for (const widget of group.widgets) {
            if (!insideDisplay(widget.rect, display)) {
                findings.push({
                    rule: 'out-of-display',
                    message: `"${widget.id}" leaves the display`,
                    rect: widget.rect,
                });
            }
        }
    }

    return findings;
}

/**
 * Unpinned corner groups whose distance to their anchored edges differs from their margin.
 *
 * @param {Array<object>} groups
 * @param {{ w: number, h: number }} display
 * @returns {Array<object>}
 */
function findMarginDrift(groups, display) {
    const findings = [];

    for (const group of groups) {
        if (group.anchor === UI_ANCHORS.TOP_BAR) {
            continue;
        }

        const isRight = group.anchor === UI_ANCHORS.TOP_RIGHT || group.anchor === UI_ANCHORS.BOTTOM_RIGHT;
        const isBottom = group.anchor === UI_ANCHORS.BOTTOM_LEFT || group.anchor === UI_ANCHORS.BOTTOM_RIGHT;
        const edges = [];

        if (!group.pinnedX) {
            const gap = isRight ? display.w - (group.rect.x + group.rect.w) : group.rect.x;

            if (gap !== group.margin) {
                edges.push(`${isRight ? 'right' : 'left'} gap ${gap}`);
            }
        }

        if (!group.pinnedY) {
            const gap = isBottom ? display.h - (group.rect.y + group.rect.h) : group.rect.y;

            if (gap !== group.margin) {
                edges.push(`${isBottom ? 'bottom' : 'top'} gap ${gap}`);
            }
        }

        if (edges.length > 0) {
            findings.push({
                rule: 'margin',
                message: `${group.anchor} group: ${edges.join(', ')}, expected ${group.margin}`,
                rect: group.rect,
            });
        }
    }

    return findings;
}

/**
 * Groups whose consecutive content rows are not evenly spaced. A zero-width row is a
 * ui.spacer(): it ends one run of rows and starts another, so deliberate breathing room never
 * counts as drift.
 *
 * @param {Array<object>} groups
 * @returns {Array<object>}
 */
function findRowGapDrift(groups) {
    const findings = [];

    for (const group of groups) {
        const runs = [[]];

        for (const row of group.rows) {
            if (row.w === 0) {
                runs.push([]);
            } else {
                runs[runs.length - 1].push(row);
            }
        }

        for (const run of runs) {
            const gaps = run.slice(1).map((row, index) => row.y - (run[index].y + run[index].h));

            if (gaps.length > 1 && gaps.some((gap) => gap !== gaps[0])) {
                findings.push({
                    rule: 'row-gap',
                    message: `${group.anchor} group: row gaps ${gaps.join(', ')}`,
                    rect: group.rect,
                });
            }
        }
    }

    return findings;
}

/**
 * Run every rule over one frame's layout.
 *
 * @param {{ display: { w: number, h: number }, groups: Array<object> }} snapshot
 * @returns {Array<{ rule: string, message: string, rect: object }>}
 */
function lintSnapshot(snapshot) {
    return [
        ...findOverlaps(snapshot.groups),
        ...findOutOfDisplay(snapshot.groups, snapshot.display),
        ...findMarginDrift(snapshot.groups, snapshot.display),
        ...findRowGapDrift(snapshot.groups),
    ];
}

export { LINT_RULES, lintSnapshot };
