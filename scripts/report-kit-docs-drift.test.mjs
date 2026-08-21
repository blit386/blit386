import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDriftBody, LINEAR_TEAM_ID, reportDrift } from './report-kit-docs-drift.mjs';

const REPORT = {
    drift: true,
    engineVersion: '1.6.0',
    docsReviewedAt: '1.5.0',
    dueDocs: [{ docFile: 'content/docs/random.md', pages: ['api/random'] }],
};

describe('formatDriftBody', () => {
    it('names the engine version, the marker version, and every due doc', () => {
        const body = formatDriftBody(REPORT);
        assert.match(body, /1\.6\.0/u);
        assert.match(body, /1\.5\.0/u);
        assert.match(body, /content\/docs\/random\.md/u);
        assert.match(body, /api\/random/u);
    });
});

describe('reportDrift', () => {
    /** Builds a fake `fetch` that dispatches by operationName embedded in the query string. */
    function makeLinearFetch({ existingIssue = null } = {}) {
        const calls = [];
        const fetchImpl = async (_url, init) => {
            const body = JSON.parse(init.body);
            calls.push(body);

            if (body.query.includes('FindTrackingIssue')) {
                return jsonResponse({ issues: { nodes: existingIssue ? [existingIssue] : [] } });
            }
            if (body.query.includes('ResolveLabelIds')) {
                return jsonResponse({
                    issueLabels: {
                        nodes: [
                            { id: 'lbl-doc', name: 'doc' },
                            { id: 'lbl-cb386', name: 'create-blit386' },
                        ],
                    },
                });
            }
            if (body.query.includes('CreateIssue')) {
                return jsonResponse({ issueCreate: { success: true, issue: { id: 'iss-new', identifier: 'BT-999' } } });
            }
            if (body.query.includes('AddComment')) {
                return jsonResponse({ commentCreate: { success: true, comment: { id: 'c-1' } } });
            }
            throw new Error(`Unexpected query: ${body.query}`);
        };
        return { fetchImpl, calls };
    }

    function jsonResponse(data) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ data }) };
    }

    it('creates a new issue when no tracking issue exists', async () => {
        // reportDrift calls the real linear-client functions, which default to global fetch when no
        // fetchImpl is passed – so this test monkeypatches global fetch for the duration of the call.
        const { fetchImpl, calls } = makeLinearFetch();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        const createCall = calls.find((call) => call.query.includes('CreateIssue'));
        assert.ok(createCall, 'expected a CreateIssue mutation');
        assert.equal(createCall.variables.input.teamId, LINEAR_TEAM_ID);
        assert.deepEqual(createCall.variables.input.labelIds.sort(), ['lbl-cb386', 'lbl-doc']);
    });

    it('adds a comment when a tracking issue already exists', async () => {
        const { fetchImpl, calls } = makeLinearFetch({
            existingIssue: { id: 'iss-1', identifier: 'BT-500', title: 'docs(kit): kit docs need review...' },
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        const commentCall = calls.find((call) => call.query.includes('AddComment'));
        assert.ok(commentCall, 'expected an AddComment mutation');
        assert.equal(commentCall.variables.issueId, 'iss-1');
        assert.ok(!calls.some((call) => call.query.includes('CreateIssue')), 'should not create a duplicate issue');
    });
});
