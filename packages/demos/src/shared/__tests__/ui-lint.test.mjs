/**
 * Unit tests for the pure layout lint the /shots page runs over a UiContext snapshot.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UI_ANCHORS } from '../ui-core.js';
import { LINT_RULES, lintSnapshot } from '../ui-lint.js';

const rect = (x, y, w, h) => ({ x, y, w, h });

function group(overrides = {}) {
    return {
        anchor: UI_ANCHORS.TOP_LEFT,
        pinnedX: false,
        pinnedY: false,
        margin: 4,
        pad: 5,
        panel: true,
        rect: rect(4, 4, 100, 50),
        rows: [],
        widgets: [],
        ...overrides,
    };
}

const DISPLAY = { w: 320, h: 200 };

describe('lintSnapshot', () => {
    it('is clean for an empty snapshot', () => {
        assert.deepEqual(lintSnapshot({ display: DISPLAY, groups: [] }), []);
    });

    it('exports the rule names the page shows as badges', () => {
        assert.deepEqual(LINT_RULES, ['overlap', 'out-of-display', 'margin', 'row-gap']);
    });

    it('flags two widgets whose rectangles intersect', () => {
        const snap = {
            display: DISPLAY,
            groups: [
                group({
                    widgets: [
                        { id: 'Play', kind: 'button', rect: rect(10, 10, 40, 10) },
                        { id: 'Loop', kind: 'checkbox', rect: rect(30, 15, 40, 10) },
                    ],
                }),
            ],
        };
        const [finding] = lintSnapshot(snap);

        assert.equal(finding.rule, 'overlap');
        assert.match(finding.message, /Play.*Loop/);
        assert.deepEqual(finding.rect, rect(30, 15, 20, 5));
    });

    it('does not flag widgets that only touch edges', () => {
        const snap = {
            display: DISPLAY,
            groups: [
                group({
                    widgets: [
                        { id: 'a', kind: 'button', rect: rect(10, 10, 40, 10) },
                        { id: 'b', kind: 'button', rect: rect(10, 20, 40, 10) },
                    ],
                }),
            ],
        };

        assert.deepEqual(lintSnapshot(snap), []);
    });

    it('flags a group or widget that leaves the display', () => {
        const snap = {
            display: DISPLAY,
            groups: [group({ pinnedX: true, pinnedY: true, rect: rect(300, 4, 40, 20), widgets: [] })],
        };
        const findings = lintSnapshot(snap);

        assert.equal(findings.length, 1);
        assert.equal(findings[0].rule, 'out-of-display');
    });

    it('flags an unpinned group whose anchored edges miss the margin', () => {
        const snap = {
            display: DISPLAY,
            groups: [group({ anchor: UI_ANCHORS.BOTTOM_RIGHT, margin: 4, rect: rect(216, 140, 100, 50) })],
        };
        const findings = lintSnapshot(snap);

        assert.equal(findings.length, 1);
        assert.equal(findings[0].rule, 'margin');
        assert.match(findings[0].message, /bottom.*4/);
    });

    it('leaves pinned groups and top bars alone', () => {
        const snap = {
            display: DISPLAY,
            groups: [
                group({ pinnedX: true, pinnedY: true, rect: rect(50, 50, 20, 20) }),
                group({ anchor: UI_ANCHORS.TOP_BAR, rect: rect(0, 0, 320, 22) }),
            ],
        };

        assert.deepEqual(lintSnapshot(snap), []);
    });

    it('flags unequal gaps between consecutive content rows', () => {
        const snap = {
            display: DISPLAY,
            groups: [
                group({
                    rows: [rect(9, 10, 40, 10), rect(9, 20, 40, 10), rect(9, 33, 40, 10)],
                }),
            ],
        };
        const findings = lintSnapshot(snap);

        assert.equal(findings.length, 1);
        assert.equal(findings[0].rule, 'row-gap');
    });

    it('treats a zero-width row as a deliberate spacer', () => {
        const snap = {
            display: DISPLAY,
            groups: [
                group({
                    rows: [rect(9, 10, 40, 10), rect(9, 20, 0, 6), rect(9, 26, 40, 10), rect(9, 36, 40, 10)],
                }),
            ],
        };

        assert.deepEqual(lintSnapshot(snap), []);
    });
});
