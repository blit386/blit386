import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addComment, createIssue, findTrackingIssue, linearRequest, resolveLabelIds } from './linear-client.mjs';

/** @param {{ ok?: boolean, status?: number, statusText?: string, body: unknown }} response */
function makeFetch(response) {
    let capturedRequest = null;
    const fetchImpl = async (url, init) => {
        capturedRequest = { url, init };
        return {
            ok: response.ok ?? true,
            status: response.status ?? 200,
            statusText: response.statusText ?? 'OK',
            json: async () => response.body,
        };
    };
    return { fetchImpl, getCapturedRequest: () => capturedRequest };
}

describe('linearRequest', () => {
    it('posts the query/variables and returns data on success', async () => {
        const { fetchImpl, getCapturedRequest } = makeFetch({ body: { data: { ok: true } } });
        const data = await linearRequest('key-123', 'query { ok }', { a: 1 }, fetchImpl);

        assert.deepEqual(data, { ok: true });
        const request = getCapturedRequest();
        assert.equal(request.url, 'https://api.linear.app/graphql');
        assert.equal(request.init.headers.Authorization, 'key-123');
        assert.deepEqual(JSON.parse(request.init.body), { query: 'query { ok }', variables: { a: 1 } });
    });

    it('throws when the GraphQL response has an errors array', async () => {
        const { fetchImpl } = makeFetch({ body: { errors: [{ message: 'nope' }] } });
        await assert.rejects(() => linearRequest('key-123', 'query { ok }', {}, fetchImpl), /Linear API error/u);
    });

    it('throws on a non-OK HTTP status', async () => {
        const { fetchImpl } = makeFetch({ ok: false, status: 401, statusText: 'Unauthorized', body: {} });
        await assert.rejects(
            () => linearRequest('bad-key', 'query { ok }', {}, fetchImpl),
            /Linear API request failed: 401/u,
        );
    });

    it('propagates a network-level rejection', async () => {
        const fetchImpl = async () => {
            throw new Error('network down');
        };
        await assert.rejects(() => linearRequest('key-123', 'query { ok }', {}, fetchImpl), /network down/u);
    });
});

describe('findTrackingIssue', () => {
    it('returns the first matching issue', async () => {
        const { fetchImpl } = makeFetch({
            body: { data: { issues: { nodes: [{ id: 'iss-1', identifier: 'BT-500', title: 'docs(kit): ...' }] } } },
        });
        const issue = await findTrackingIssue('key-123', { teamId: 'team-1', titlePrefix: 'docs(kit):' }, fetchImpl);
        assert.deepEqual(issue, { id: 'iss-1', identifier: 'BT-500', title: 'docs(kit): ...' });
    });

    it('returns null when no issue matches', async () => {
        const { fetchImpl } = makeFetch({ body: { data: { issues: { nodes: [] } } } });
        const issue = await findTrackingIssue('key-123', { teamId: 'team-1', titlePrefix: 'docs(kit):' }, fetchImpl);
        assert.equal(issue, null);
    });
});

describe('resolveLabelIds', () => {
    it('maps label names to ids', async () => {
        const { fetchImpl } = makeFetch({
            body: {
                data: {
                    issueLabels: {
                        nodes: [
                            { id: 'lbl-1', name: 'doc' },
                            { id: 'lbl-2', name: 'create-blit386' },
                        ],
                    },
                },
            },
        });
        const ids = await resolveLabelIds('key-123', { teamId: 'team-1', names: ['doc', 'create-blit386'] }, fetchImpl);
        assert.deepEqual(ids, { doc: 'lbl-1', 'create-blit386': 'lbl-2' });
    });
});

describe('createIssue', () => {
    it('returns the created issue on success', async () => {
        const { fetchImpl } = makeFetch({
            body: { data: { issueCreate: { success: true, issue: { id: 'iss-1', identifier: 'BT-500' } } } },
        });
        const issue = await createIssue(
            'key-123',
            {
                teamId: 'team-1',
                title: 'docs(kit): review',
                description: 'body',
                labelIds: ['lbl-1'],
                assigneeId: 'user-1',
                projectId: 'proj-1',
            },
            fetchImpl,
        );
        assert.deepEqual(issue, { id: 'iss-1', identifier: 'BT-500' });
    });

    it('throws when Linear reports success: false', async () => {
        const { fetchImpl } = makeFetch({ body: { data: { issueCreate: { success: false, issue: null } } } });
        await assert.rejects(
            () =>
                createIssue(
                    'key-123',
                    { teamId: 't', title: 't', description: 'd', labelIds: [], assigneeId: 'a', projectId: 'p' },
                    fetchImpl,
                ),
            /success: false/u,
        );
    });
});

describe('addComment', () => {
    it('returns the created comment on success', async () => {
        const { fetchImpl } = makeFetch({
            body: { data: { commentCreate: { success: true, comment: { id: 'c-1' } } } },
        });
        const comment = await addComment('key-123', { issueId: 'iss-1', body: 'update' }, fetchImpl);
        assert.deepEqual(comment, { id: 'c-1' });
    });

    it('throws when Linear reports success: false', async () => {
        const { fetchImpl } = makeFetch({ body: { data: { commentCreate: { success: false, comment: null } } } });
        await assert.rejects(
            () => addComment('key-123', { issueId: 'iss-1', body: 'update' }, fetchImpl),
            /success: false/u,
        );
    });
});
