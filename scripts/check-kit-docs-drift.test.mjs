import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeKitDocsDrift } from './check-kit-docs-drift.mjs';

/** Minimal `_api-history.json`-shaped fixture. */
function makeApiHistory({ packageVersion = '1.5.0', symbols = {}, pages = {} } = {}) {
    return { packageVersion, symbols, pages };
}

const TRIGGER_PAGES = {
    'content/docs/random.md': ['api/random'],
    'content/docs/audio.md': ['api/audio'],
};

describe('computeKitDocsDrift', () => {
    it('reports no drift when docsReviewedAt is at or after the engine version', () => {
        const apiHistory = makeApiHistory({ packageVersion: '1.5.0' });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.5.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.drift, false);
        assert.deepEqual(report.dueDocs, []);
    });

    it('reports no drift when no symbol changed inside the review window', () => {
        const apiHistory = makeApiHistory({
            packageVersion: '1.5.0',
            symbols: { 'BT.random': { since: '0.1.0', changes: [] } },
            pages: { 'api/random': ['BT.random'] },
        });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.4.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.drift, false);
    });

    it('flags a doc when a symbol was newly added (since) inside the review window', () => {
        const apiHistory = makeApiHistory({
            packageVersion: '1.5.0',
            symbols: { 'BT.randomSeed': { since: '1.5.0', changes: [] } },
            pages: { 'api/random': ['BT.randomSeed'] },
        });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.4.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.drift, true);
        assert.deepEqual(report.dueDocs, [{ docFile: 'content/docs/random.md', pages: ['api/random'] }]);
    });

    it('flags a doc when a symbol only has a changes[] entry (not since) inside the window', () => {
        const apiHistory = makeApiHistory({
            packageVersion: '1.5.0',
            symbols: {
                'BT.audioVolumeSet': { since: '0.1.0', changes: [{ version: '1.5.0', note: 'now clamps to [0,1]' }] },
            },
            pages: { 'api/audio': ['BT.audioVolumeSet'] },
        });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.4.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.drift, true);
        assert.deepEqual(report.dueDocs, [{ docFile: 'content/docs/audio.md', pages: ['api/audio'] }]);
    });

    it('flags multiple docs when multiple trigger pages changed', () => {
        const apiHistory = makeApiHistory({
            packageVersion: '1.5.0',
            symbols: {
                'BT.random': { since: '1.5.0', changes: [] },
                'BT.audioVolumeSet': { since: '1.5.0', changes: [] },
            },
            pages: { 'api/random': ['BT.random'], 'api/audio': ['BT.audioVolumeSet'] },
        });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.4.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.dueDocs.length, 2);
    });

    it('ignores a symbol change outside the (docsReviewedAt, packageVersion] window', () => {
        const apiHistory = makeApiHistory({
            packageVersion: '1.5.0',
            symbols: { 'BT.random': { since: '0.1.0', changes: [{ version: '1.6.0', note: 'future release' }] } },
            pages: { 'api/random': ['BT.random'] },
        });
        const report = computeKitDocsDrift({ apiHistory, docsReviewedAt: '1.4.0', triggerPages: TRIGGER_PAGES });
        assert.equal(report.drift, false);
    });
});
