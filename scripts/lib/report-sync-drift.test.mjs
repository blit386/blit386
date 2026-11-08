import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { reportSyncDrift } from './report-sync-drift.mjs';

describe('reportSyncDrift', () => {
    const realLog = console.log;
    const realError = console.error;
    /** @type {string[]} */
    let out;
    /** @type {string[]} */
    let err;

    beforeEach(() => {
        out = [];
        err = [];
        console.log = (msg) => out.push(String(msg));
        console.error = (msg) => err.push(String(msg));
    });

    afterEach(() => {
        console.log = realLog;
        console.error = realError;
    });

    const base = { total: 3, noun: 'thing', syncScript: 'sync:things' };

    it('check mode with drift lists the entries, names the fix and returns 1', () => {
        assert.equal(reportSyncDrift({ ...base, drifted: ['a', 'b'], isCheck: true }), 1);
        assert.match(err.join('\n'), /2 thing\(s\) out of date:[\s\S]*  a[\s\S]*  b[\s\S]*pnpm run sync:things/);
        assert.deepEqual(out, []);
    });

    it('check mode without drift reports up to date and returns 0', () => {
        assert.equal(reportSyncDrift({ ...base, drifted: [], isCheck: true }), 0);
        assert.deepEqual(out, ['All 3 thing(s) up to date.']);
    });

    it('write mode reports what was updated and returns 0', () => {
        assert.equal(reportSyncDrift({ ...base, drifted: ['a'], isCheck: false }), 0);
        assert.deepEqual(out, ['updated a', '\n1 of 3 thing(s) updated.']);
    });

    it('write mode without drift reports already up to date', () => {
        assert.equal(reportSyncDrift({ ...base, drifted: [], isCheck: false }), 0);
        assert.deepEqual(out, ['All 3 thing(s) already up to date.']);
    });
});
