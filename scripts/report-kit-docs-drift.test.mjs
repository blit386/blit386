import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDriftBody, LINEAR_TEAM_ID, main, reportDrift } from './report-kit-docs-drift.mjs';

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
        // fetchImpl is passed - so this test monkeypatches global fetch for the duration of the call.
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

    it('skips the comment when the latest comment already matches the report', async () => {
        const { fetchImpl, calls } = makeLinearFetch({
            existingIssue: {
                id: 'iss-1',
                identifier: 'BT-500',
                title: 'docs(kit): kit docs need review...',
                comments: { nodes: [{ body: formatDriftBody(REPORT), createdAt: '2026-10-20T00:00:00Z' }] },
            },
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        assert.ok(!calls.some((call) => call.query.includes('AddComment')), 'should not repost an identical comment');
    });

    it('still comments when the latest comment differs from the report', async () => {
        const { fetchImpl, calls } = makeLinearFetch({
            existingIssue: {
                id: 'iss-1',
                identifier: 'BT-500',
                title: 'docs(kit): kit docs need review...',
                comments: { nodes: [{ body: 'an older report', createdAt: '2026-10-20T00:00:00Z' }] },
            },
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        assert.ok(
            calls.some((call) => call.query.includes('AddComment')),
            'expected an AddComment mutation',
        );
    });

    it('compares against the newest comment whatever order Linear returns them in', async () => {
        const stale = { body: formatDriftBody(REPORT), createdAt: '2026-10-01T00:00:00Z' };
        const newest = { body: 'a newer, different report', createdAt: '2026-10-20T00:00:00Z' };

        for (const nodes of [
            [stale, newest],
            [newest, stale],
        ]) {
            const { fetchImpl, calls } = makeLinearFetch({
                existingIssue: { id: 'iss-1', identifier: 'BT-500', title: 'docs(kit): ...', comments: { nodes } },
            });
            const originalFetch = globalThis.fetch;
            globalThis.fetch = fetchImpl;
            try {
                await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
            } finally {
                globalThis.fetch = originalFetch;
            }

            assert.ok(
                calls.some((call) => call.query.includes('AddComment')),
                'newest differs, so comment',
            );
        }
    });

    it('comments when the tracking issue has no comments yet', async () => {
        const { fetchImpl, calls } = makeLinearFetch({
            existingIssue: {
                id: 'iss-1',
                identifier: 'BT-500',
                title: 'docs(kit): ...',
                description: 'an older report',
                comments: { nodes: [] },
            },
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        assert.ok(
            calls.some((call) => call.query.includes('AddComment')),
            'expected an AddComment mutation',
        );
    });

    it('does not comment when the description already holds the report and there are no comments', async () => {
        const { fetchImpl, calls } = makeLinearFetch({
            existingIssue: {
                id: 'iss-1',
                identifier: 'BT-500',
                title: 'docs(kit): ...',
                description: `${formatDriftBody(REPORT)}\n`,
                comments: { nodes: [] },
            },
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchImpl;
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        assert.ok(!calls.some((call) => call.query.includes('AddComment')));
    });
});

describe('reportDrift markdown normalization', () => {
    it('treats `* ` bullets from Linear as equal to the `- ` bullets it was sent', async () => {
        const stored = formatDriftBody(REPORT).replace(/^- /gmu, '* ');
        const calls = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (_url, init) => {
            const body = JSON.parse(init.body);
            calls.push(body);
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    data: {
                        issues: {
                            nodes: [
                                {
                                    id: 'i',
                                    identifier: 'BT-500',
                                    title: 't',
                                    description: stored,
                                    comments: { nodes: [] },
                                },
                            ],
                        },
                    },
                }),
            };
        };
        try {
            await reportDrift({ apiKey: 'key-123', report: REPORT, log: () => {} });
        } finally {
            globalThis.fetch = originalFetch;
        }

        assert.ok(!calls.some((call) => call.query.includes('AddComment')));
    });
});

describe('main exit codes', () => {
    const CLEAN = { drift: false, docsReviewedAt: '1.8.0' };
    const quiet = async (run) => {
        const { log, error } = console;
        console.log = () => {};
        console.error = () => {};
        try {
            return await run();
        } finally {
            console.log = log;
            console.error = error;
        }
    };
    const boom = () => {
        throw new Error('boom');
    };

    it('returns 1 when the drift check throws', async () => {
        assert.equal(await quiet(() => main({ env: {}, check: boom })), 1);
    });

    it('returns 1 when reporting to Linear throws', async () => {
        const code = await quiet(() =>
            main({ env: { LINEAR_API_KEY: 'k' }, check: () => REPORT, report: async () => boom() }),
        );
        assert.equal(code, 1);
    });

    it('returns 0 when drift is found and reported', async () => {
        const code = await quiet(() =>
            main({ env: { LINEAR_API_KEY: 'k' }, check: () => REPORT, report: async () => {} }),
        );
        assert.equal(code, 0);
    });

    it('returns 0 when drift is found and the key is unset', async () => {
        assert.equal(await quiet(() => main({ env: {}, check: () => REPORT, report: async () => boom() })), 0);
    });

    it('returns 0 on a clean run without a key, and never verifies', async () => {
        assert.equal(await quiet(() => main({ env: {}, check: () => CLEAN, verify: async () => boom() })), 0);
    });

    it('returns 1 on a clean run when the key is rejected', async () => {
        const code = await quiet(() =>
            main({ env: { LINEAR_API_KEY: 'k' }, check: () => CLEAN, verify: async () => boom() }),
        );
        assert.equal(code, 1);
    });

    it('returns 0 on a clean run when the key works', async () => {
        const code = await quiet(() =>
            main({ env: { LINEAR_API_KEY: 'k' }, check: () => CLEAN, verify: async () => {} }),
        );
        assert.equal(code, 0);
    });
});
