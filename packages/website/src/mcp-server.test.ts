/**
 * Covers `mcpServerPlugin`: the public JSON-RPC 2.0 endpoint at `POST /mcp`.
 *
 * This is an external contract – agents call it, so its envelope, error codes, and tool schemas
 * are as public as the site's HTML. `search_docs` ranking is asserted at the exact weight rather
 * than as "title beats body", because the documented contract is that a title or description match
 * counts for ten body matches, and a test that only checks the ordering would still pass if that
 * multiplier drifted.
 *
 * The module's pure helpers (`countMatches`, `buildExcerpt`, `MCP_TOOLS`) stay unexported: every
 * behavior is observable through `tools/call`, so a test-only export would widen the module's
 * surface for nothing.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mcpServerPlugin } from './mcp-server';
import serverCard from '../public/.well-known/mcp/server-card.json';
import {
    createFakeAssets,
    createMockContext,
    createPluginMiddleware,
    type MockContextOptions,
    type PluginMiddleware,
} from './__test__/hono-context';
import {
    createFakeLoader,
    createFakePage,
    createMockAppContext,
    createTextAdapter,
    type FakeLoader,
    type FakeLoaderCalls,
} from './__test__/press-context';

interface JsonRpcResponse {
    jsonrpc?: string;
    id?: unknown;
    result?: unknown;
    error?: { code: number; message: string };
}

/** Issues one JSON-RPC call and returns the parsed envelope plus the raw Response. */
async function rpc(
    middleware: PluginMiddleware,
    body: unknown,
    options: Omit<MockContextOptions, 'body' | 'method'> = {},
): Promise<{ response: Response; json: JsonRpcResponse }> {
    const harness = createMockContext({
        url: options.url ?? 'https://blit386.dev/mcp',
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        ...options,
    });

    const response = await harness.run(middleware);

    if (response === undefined) {
        throw new Error('the MCP middleware delegated instead of answering');
    }

    return { response, json: response.status === 204 ? {} : ((await response.json()) as JsonRpcResponse) };
}

/** Parses the JSON payload `search_docs` packs into its single text content block. */
function searchResults(json: JsonRpcResponse): { title: string; url: string; excerpt: string }[] {
    const result = json.result as { content?: { type: string; text: string }[] } | undefined;
    const text = result?.content?.[0]?.text;

    if (text === undefined) {
        throw new Error(`no text content in result: ${JSON.stringify(json)}`);
    }

    return JSON.parse(text) as { title: string; url: string; excerpt: string }[];
}

const PAGES = [
    createFakePage({ url: '/docs/palette', title: 'Palette cycling', description: 'Animate the palette.' }),
    createFakePage({ url: '/docs/sprites', title: 'Sprites', description: 'Draw sprites.' }),
];

const TEXTS = new Map([
    ['/docs/palette', 'Cycling shifts colors without redrawing.'],
    ['/docs/sprites', 'A sprite is a small bitmap.'],
]);

function buildMiddleware(options: { loader?: FakeLoader | (() => FakeLoader | Promise<FakeLoader>) } = {}): Promise<{
    middleware: PluginMiddleware;
    calls: FakeLoaderCalls;
    extractions: string[];
}> {
    const built = createFakeLoader(PAGES);
    const extractions: string[] = [];
    const context = createMockAppContext({
        loader: options.loader ?? built.loader,
        adapters: [createTextAdapter(TEXTS, (url) => extractions.push(url))],
    });

    return createPluginMiddleware(mcpServerPlugin(), context).then((middleware) => ({
        middleware,
        calls: built.calls,
        extractions,
    }));
}

describe('mcpServerPlugin', () => {
    let middleware: PluginMiddleware;
    let calls: FakeLoaderCalls;
    let extractions: string[];

    beforeEach(async () => {
        ({ middleware, calls, extractions } = await buildMiddleware());
    });

    it('names itself', () => {
        expect(mcpServerPlugin().name).toBe('mcp-server');
    });

    describe('routing', () => {
        it.each([
            ['GET', 'https://blit386.dev/mcp'],
            ['POST', 'https://blit386.dev/api/search'],
        ])('delegates %s %s', async (method, url) => {
            const harness = createMockContext({ url, method });

            const response = await harness.run(middleware);

            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
        });
    });

    describe('malformed input', () => {
        it('answers a body that is not JSON with -32700', async () => {
            const { response, json } = await rpc(middleware, '{ not json');

            // JSON-RPC transports errors in the envelope, not the HTTP status.
            expect(response.status).toBe(200);
            expect(json).toEqual({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
            });
        });

        it.each([
            ['an array', []],
            ['null', null],
            ['an object with no method', { jsonrpc: '2.0' }],
            ['a non-string method', { method: 42 }],
        ])('answers %s with -32600', async (_label, body) => {
            const { json } = await rpc(middleware, body);

            expect(json).toEqual({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32600, message: 'Invalid Request' },
            });
        });

        it('answers an unknown method with -32601 naming it', async () => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id: 7, method: 'foo/bar' });

            expect(json).toEqual({
                jsonrpc: '2.0',
                id: 7,
                error: { code: -32601, message: 'Method not found: foo/bar' },
            });
        });
    });

    describe('handshake', () => {
        it('reports the protocol version, capabilities, and server identity', async () => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id: 1, method: 'initialize' });

            expect(json.result).toEqual({
                protocolVersion: '2025-11-25',
                capabilities: { tools: {} },
                serverInfo: { name: 'blit386-docs', version: '1.0.0' },
            });
        });

        it('agrees with the published server card', async () => {
            // `public/.well-known/mcp/server-card.json` is what agents read to discover this
            // endpoint, and nothing else links it to the code.
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id: 1, method: 'initialize' });
            const result = json.result as { serverInfo: unknown };

            expect(result.serverInfo).toEqual(serverCard.serverInfo);
        });

        it.each([
            ['a string id', 'abc'],
            ['a numeric id', 12],
            ['a null id', null],
        ])('echoes %s', async (_label, id) => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id, method: 'initialize' });

            expect(json.id).toBe(id);
        });

        it('omits id entirely for a request that carried none', async () => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', method: 'initialize' });

            expect(Object.hasOwn(json, 'id')).toBe(false);
        });

        it('answers notifications/initialized with a bare 204', async () => {
            const { response } = await rpc(middleware, { jsonrpc: '2.0', method: 'notifications/initialized' });

            expect(response.status).toBe(204);
            expect(await response.text()).toBe('');
        });
    });

    describe('tools/list', () => {
        it('advertises both tools with their full input schemas', async () => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id: 2, method: 'tools/list' });

            expect(json.result).toEqual({
                tools: [
                    {
                        name: 'search_docs',
                        description:
                            'Full-text search across the BLIT386 documentation. Returns matching page titles, URLs, and excerpts.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Search query, e.g. "palette animation"' },
                            },
                            required: ['query'],
                        },
                    },
                    {
                        name: 'get_docs_summary',
                        description: 'Return the llms.txt summary of the BLIT386 documentation site.',
                        inputSchema: { type: 'object', properties: {} },
                    },
                ],
            });
        });
    });

    describe('tools/call dispatch', () => {
        it.each([
            ['missing params', undefined],
            ['params that are not an object', 'search_docs'],
            ['params with a non-string name', { name: 42 }],
        ])('answers %s with -32602', async (_label, params) => {
            const { json } = await rpc(middleware, { jsonrpc: '2.0', id: 3, method: 'tools/call', params });

            expect(json).toEqual({
                jsonrpc: '2.0',
                id: 3,
                error: { code: -32602, message: 'Invalid params' },
            });
        });

        it('answers an unknown tool with -32601 naming it', async () => {
            const { json } = await rpc(middleware, {
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: { name: 'nope' },
            });

            expect(json).toEqual({
                jsonrpc: '2.0',
                id: 4,
                error: { code: -32601, message: 'Unknown tool: nope' },
            });
        });
    });

    describe('search_docs', () => {
        /** Runs a search against a purpose-built corpus and returns the ranked results. */
        async function searchCorpus(
            query: string,
            pages: { url: string; title?: string; description?: string; body?: string }[],
        ) {
            const { loader } = createFakeLoader(
                pages.map((page) =>
                    createFakePage({ url: page.url, title: page.title, description: page.description }),
                ),
            );
            const texts = new Map(pages.filter((p) => p.body !== undefined).map((p) => [p.url, p.body ?? '']));
            const context = createMockAppContext({ loader, adapters: [createTextAdapter(texts)] });
            const plugin = await createPluginMiddleware(mcpServerPlugin(), context);
            const { json } = await rpc(plugin, {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'search_docs', arguments: { query } },
            });

            return searchResults(json);
        }

        it.each([
            ['a missing query', {}],
            ['a non-string query', { query: 7 }],
            ['an empty query', { query: '' }],
        ])('answers %s with -32602', async (_label, args) => {
            const { json } = await rpc(middleware, {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: { name: 'search_docs', arguments: args },
            });

            expect(json).toEqual({
                jsonrpc: '2.0',
                id: 5,
                error: { code: -32602, message: 'Invalid params' },
            });
        });

        it('returns no results for a query that is only whitespace', async () => {
            // Non-empty, so it clears the -32602 guard, but it splits into zero terms.
            const { json } = await rpc(middleware, {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: { name: 'search_docs', arguments: { query: '   ' } },
            });

            expect(searchResults(json)).toEqual([]);
        });

        it('returns matching pages as a JSON payload in one text content block', async () => {
            const { json } = await rpc(middleware, {
                jsonrpc: '2.0',
                id: 6,
                method: 'tools/call',
                params: { name: 'search_docs', arguments: { query: 'palette' } },
            });
            const result = json.result as { content: { type: string; text: string }[] };

            expect(result.content).toHaveLength(1);
            expect(result.content[0]?.type).toBe('text');
            expect(searchResults(json)).toEqual([
                {
                    title: 'Palette cycling',
                    url: '/docs/palette',
                    excerpt: 'Cycling shifts colors without redrawing.',
                },
            ]);
        });

        describe('ranking', () => {
            it('weighs a title match at exactly ten body matches', async () => {
                // Title match scores 10. Sorting it between an 11-match body and a 9-match body
                // pins the multiplier: at 5 the title page would sink to last, at 20 it would rise
                // to first.
                const results = await searchCorpus('palette', [
                    { url: '/title', title: 'Palette cycling', body: 'unrelated text' },
                    { url: '/eleven', title: 'Sprites', body: 'palette '.repeat(11) },
                    { url: '/nine', title: 'Fonts', body: 'palette '.repeat(9) },
                ]);

                expect(results.map((r) => r.url)).toEqual(['/eleven', '/title', '/nine']);
            });

            it('weighs a description match the same as a title match', async () => {
                // The heading scored against is `${title} ${description}`, so both halves count.
                const results = await searchCorpus('palette', [
                    { url: '/described', title: 'Colors', description: 'Palette control.', body: 'nothing here' },
                    { url: '/nine', title: 'Fonts', body: 'palette '.repeat(9) },
                ]);

                expect(results.map((r) => r.url)).toEqual(['/described', '/nine']);
            });

            it('sums the score across every query term', async () => {
                const results = await searchCorpus('palette sprite', [
                    { url: '/both', title: 'Guide', body: 'palette sprite' },
                    { url: '/one', title: 'Guide', body: 'palette' },
                ]);

                expect(results.map((r) => r.url)).toEqual(['/both', '/one']);
            });

            it('matches case-insensitively', async () => {
                const results = await searchCorpus('PALETTE', [{ url: '/p', title: 'X', body: 'the palette' }]);

                expect(results).toHaveLength(1);
            });

            it('ignores extra whitespace between terms', async () => {
                const results = await searchCorpus('  palette   sprite ', [
                    { url: '/both', title: 'X', body: 'palette sprite' },
                ]);

                expect(results).toHaveLength(1);
            });

            it('drops pages that match nothing', async () => {
                const results = await searchCorpus('palette', [
                    { url: '/hit', title: 'X', body: 'palette' },
                    { url: '/miss', title: 'Y', body: 'nothing relevant' },
                ]);

                expect(results.map((r) => r.url)).toEqual(['/hit']);
            });

            it('caps the response at ten results', async () => {
                const pages = Array.from({ length: 12 }, (_unused, i) => ({
                    url: `/page-${i}`,
                    title: 'Palette',
                    body: 'palette',
                }));

                const results = await searchCorpus('palette', pages);

                expect(results).toHaveLength(10);
            });
        });

        describe('excerpts', () => {
            it('returns a short body verbatim', async () => {
                const results = await searchCorpus('palette', [
                    { url: '/p', title: 'X', body: 'palette cycling is cheap' },
                ]);

                expect(results[0]?.excerpt).toBe('palette cycling is cheap');
            });

            it('windows a mid-body match and marks both truncations', async () => {
                const body = `${'x'.repeat(200)} palette ${'y'.repeat(200)}`;

                const results = await searchCorpus('palette', [{ url: '/p', title: 'X', body }]);
                const excerpt = results[0]?.excerpt ?? '';

                expect(excerpt.startsWith('...')).toBe(true);
                expect(excerpt.endsWith('...')).toBe(true);
                expect(excerpt).toContain('palette');
                // 80 characters of radius on each side, plus the two ellipses.
                expect(excerpt.length).toBeLessThanOrEqual(166);
            });

            it('centers on the earliest matched term, not the first term given', async () => {
                const body = `zebra${'x'.repeat(300)}palette`;

                const results = await searchCorpus('palette zebra', [{ url: '/p', title: 'X', body }]);

                expect(results[0]?.excerpt.startsWith('zebra')).toBe(true);
            });

            it('falls back to the description when the page has no body', async () => {
                const results = await searchCorpus('palette', [
                    { url: '/p', title: 'Palette', description: 'The palette guide.' },
                ]);

                expect(results[0]?.excerpt).toBe('The palette guide.');
            });

            it('falls back to the description when the body is only whitespace', async () => {
                const results = await searchCorpus('palette', [
                    { url: '/p', title: 'Palette', description: 'The palette guide.', body: '   \n  ' },
                ]);

                expect(results[0]?.excerpt).toBe('The palette guide.');
            });
        });

        describe('corpus caching', () => {
            const call = { jsonrpc: '2.0', id: 1, method: 'tools/call' } as const;
            const search = { name: 'search_docs', arguments: { query: 'palette' } };

            it('extracts each page once across repeated searches', async () => {
                await rpc(middleware, { ...call, params: search });
                await rpc(middleware, { ...call, params: search });

                expect(calls.getPages).toBe(1);
                expect(extractions).toEqual(['/docs/palette', '/docs/sprites']);
            });

            it('shares one extraction between concurrent first requests', async () => {
                // The promise is cached, not the resolved value, which is what makes this hold.
                await Promise.all([
                    rpc(middleware, { ...call, params: search }),
                    rpc(middleware, { ...call, params: search }),
                ]);

                expect(calls.getPages).toBe(1);
            });

            it('re-extracts when the loader is replaced', async () => {
                let current = createFakeLoader(PAGES).loader;
                const built = await buildMiddleware({ loader: () => current });

                await rpc(built.middleware, { ...call, params: search });
                current = createFakeLoader(PAGES).loader;
                await rpc(built.middleware, { ...call, params: search });

                expect(built.extractions).toHaveLength(PAGES.length * 2);
            });

            it('answers -32603 when the loader cannot be obtained', async () => {
                const context = createMockAppContext({
                    loader: (): FakeLoader => {
                        throw new Error('loader unavailable');
                    },
                    adapters: [createTextAdapter(TEXTS)],
                });
                const plugin = await createPluginMiddleware(mcpServerPlugin(), context);

                const { json } = await rpc(plugin, { ...call, params: search });

                expect(json.error).toEqual({ code: -32603, message: 'Internal error: search unavailable' });
            });

            it('evicts a failed extraction so the next search retries', async () => {
                // The failure has to land inside the cached promise – a loader that throws on the
                // way in never gets as far as being cached. Here the adapter rejects, so
                // `Promise.all` rejects and the eviction path is the one under test. Without it,
                // one transient failure would poison search_docs for the isolate's whole life.
                let failing = true;
                const context = createMockAppContext({
                    loader: createFakeLoader(PAGES).loader,
                    adapters: [
                        {
                            'core:get-text'(page) {
                                if (failing) {
                                    return Promise.reject(new Error('extraction failed'));
                                }

                                return TEXTS.get(page.url);
                            },
                        },
                    ],
                });
                const plugin = await createPluginMiddleware(mcpServerPlugin(), context);

                const failure = await rpc(plugin, { ...call, params: search });
                expect(failure.json.error).toEqual({ code: -32603, message: 'Internal error: search unavailable' });

                failing = false;
                const recovery = await rpc(plugin, { ...call, params: search });
                expect(recovery.json.error).toBeUndefined();
                expect(searchResults(recovery.json)).toHaveLength(1);
            });
        });
    });

    describe('get_docs_summary', () => {
        const call = {
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/call',
            params: { name: 'get_docs_summary' },
        };
        const UNAVAILABLE = { code: -32603, message: 'Internal error: summary unavailable' };

        it('returns the llms.txt body from the ASSETS binding', async () => {
            const assets = createFakeAssets(() => new Response('# BLIT386 docs'));

            const { json } = await rpc(middleware, call, { env: { ASSETS: assets } });

            expect(json.result).toEqual({ content: [{ type: 'text', text: '# BLIT386 docs' }] });
        });

        it('resolves llms.txt against the incoming origin rather than the public hostname', async () => {
            // A Worker fetching its own zone hostname times out with Cloudflare 522, and that error
            // page used to be wrapped as a successful result. Serving from the binding, at the
            // origin the request actually arrived on, is what avoids both.
            const assets = createFakeAssets(() => new Response('# next'));

            await rpc(middleware, call, {
                url: 'https://next.blit386.dev/mcp',
                env: { ASSETS: assets },
            });

            expect(assets.requests[0]?.url).toBe('https://next.blit386.dev/llms.txt');
        });

        it.each([
            ['there is no binding', {}],
            ['there is no env at all', undefined],
        ])('answers -32603 when %s', async (_label, env) => {
            const { json } = await rpc(middleware, call, env === undefined ? {} : { env });

            expect(json.error).toEqual(UNAVAILABLE);
        });

        it.each([404, 500])('answers -32603 when the binding returns %i', async (status) => {
            const assets = createFakeAssets(() => new Response('nope', { status }));

            const { json } = await rpc(middleware, call, { env: { ASSETS: assets } });

            expect(json.error).toEqual(UNAVAILABLE);
        });

        it('answers -32603 when the binding throws', async () => {
            const assets = createFakeAssets(() => {
                throw new Error('binding exploded');
            });

            const { json } = await rpc(middleware, call, { env: { ASSETS: assets } });

            expect(json.error).toEqual(UNAVAILABLE);
        });
    });
});
