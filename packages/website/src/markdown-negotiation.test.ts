/**
 * Covers `markdownNegotiationPlugin`: both of its branches.
 *
 * The plugin exists because `run_worker_first: true` puts the Worker in front of Cloudflare's
 * static assets, so it has to re-implement assets-first itself. That makes the second branch as
 * load-bearing as the first: anything it does not negotiate must be forwarded to the `ASSETS`
 * binding, and only a 404 from that binding may fall through to the next middleware. Getting that
 * wrong takes the whole site down rather than just the markdown variant, which is why the
 * forwarding tests assert on the exact request object and on which statuses fall through.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { markdownNegotiationPlugin } from './markdown-negotiation';
import {
    createFakeAssets,
    createMockContext,
    createPluginMiddleware,
    type FakeAssets,
    type PluginMiddleware,
} from './__test__/hono-context';
import {
    createFakeLoader,
    createFakePage,
    createMockAppContext,
    createTextAdapter,
    type FakeLoaderCalls,
} from './__test__/press-context';

const MARKDOWN = { accept: 'text/markdown' };

const GETTING_STARTED = createFakePage({
    url: '/docs/getting-started',
    title: 'Getting started',
    description: 'Install and draw your first frame.',
});

function buildMiddleware(options: { texts?: Map<string, string>; adapters?: 'none' } = {}): {
    middleware: Promise<PluginMiddleware>;
    calls: FakeLoaderCalls;
} {
    const texts = options.texts ?? new Map([['/docs/getting-started', 'Install the package.']]);
    const { loader, calls } = createFakeLoader([GETTING_STARTED]);
    const context = createMockAppContext({
        loader,
        adapters: options.adapters === 'none' ? [] : [createTextAdapter(texts)],
    });

    return { middleware: createPluginMiddleware(markdownNegotiationPlugin(), context), calls };
}

describe('markdownNegotiationPlugin', () => {
    let middleware: PluginMiddleware;
    let calls: FakeLoaderCalls;

    beforeEach(async () => {
        const built = buildMiddleware();
        middleware = await built.middleware;
        calls = built.calls;
    });

    it('names itself', () => {
        expect(markdownNegotiationPlugin().name).toBe('markdown-negotiation');
    });

    describe('negotiating markdown', () => {
        it('returns the page as markdown with the documented content type', async () => {
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            const response = await harness.run(middleware);

            expect(response?.status).toBe(200);
            expect(await response?.text()).toBe('# Getting started (/docs/getting-started)\n\nInstall the package.');
            expect(response?.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
            expect(harness.nextCalls).toBe(0);
        });

        it('varies on Accept, since one URL serves both HTML and markdown', async () => {
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            const response = await harness.run(middleware);

            expect(response?.headers.get('vary')).toBe('Accept');
        });

        it('estimates x-markdown-tokens at four characters per token', async () => {
            // Hand-computed rather than derived from the response, or the assertion would be
            // tautological: "# A (/a)\n\nbody" is 14 characters, so ceil(14 / 4) is 4.
            const page = createFakePage({ url: '/a', title: 'A' });
            const { loader } = createFakeLoader([page]);
            const context = createMockAppContext({
                loader,
                adapters: [createTextAdapter(new Map([['/a', 'body']]))],
            });
            const plugin = await createPluginMiddleware(markdownNegotiationPlugin(), context);
            const harness = createMockContext({ url: 'https://blit386.dev/a', headers: MARKDOWN });

            const response = await harness.run(plugin);

            expect(await response?.text()).toBe('# A (/a)\n\nbody');
            expect(response?.headers.get('x-markdown-tokens')).toBe('4');
        });

        it('answers HEAD with no body but the full-length token count', async () => {
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                method: 'HEAD',
                headers: MARKDOWN,
            });

            const response = await harness.run(middleware);

            expect(await response?.text()).toBe('');
            expect(response?.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
            expect(response?.headers.get('x-markdown-tokens')).toBe('16');
        });

        it('derives page slugs from the request path', async () => {
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            await harness.run(middleware);

            expect(calls.getPage).toEqual([['docs', 'getting-started']]);
        });

        it('derives empty slugs for the site root', async () => {
            const harness = createMockContext({ url: 'https://blit386.dev/', headers: MARKDOWN });

            await harness.run(middleware);

            expect(calls.getPage).toEqual([[]]);
        });

        it('takes the first adapter that returns text', async () => {
            const { loader } = createFakeLoader([GETTING_STARTED]);
            const context = createMockAppContext({
                loader,
                adapters: [
                    { 'core:get-text': () => undefined },
                    createTextAdapter(new Map([['/docs/getting-started', 'from the second adapter']])),
                ],
            });
            const plugin = await createPluginMiddleware(markdownNegotiationPlugin(), context);
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            const response = await harness.run(plugin);

            expect(await response?.text()).toContain('from the second adapter');
        });

        it('calls the adapter with the app context as `this`', async () => {
            const { loader } = createFakeLoader([GETTING_STARTED]);
            let seen: unknown;
            const context = createMockAppContext({
                loader,
                adapters: [
                    {
                        'core:get-text'() {
                            seen = this;
                            return 'text';
                        },
                    },
                ],
            });
            const plugin = await createPluginMiddleware(markdownNegotiationPlugin(), context);
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            await harness.run(plugin);

            expect(seen).toBe(context);
        });
    });

    describe('deciding whether markdown was asked for', () => {
        const cases: [accept: string | undefined, negotiated: boolean][] = [
            ['text/markdown', true],
            ['text/markdown;q=0.9,text/html;q=0.8', true],
            ['text/html', false],
            // A browser's catch-all must keep getting HTML.
            ['*/*', false],
            // Markdown offered, but ranked below HTML.
            ['text/html,text/markdown;q=0.5', false],
            [undefined, false],
        ];

        it.each(cases)('treats Accept %s as negotiated=%s', async (accept, negotiated) => {
            const assets = createFakeAssets(
                () => new Response('pre-rendered', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
            );
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                headers: accept === undefined ? undefined : { accept },
                env: { ASSETS: assets },
            });

            const response = await harness.run(middleware);

            expect(response?.headers.get('content-type')).toBe(
                negotiated ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
            );
            expect(assets.requests).toHaveLength(negotiated ? 0 : 1);
        });
    });

    describe('forwarding to the ASSETS binding', () => {
        let assets: FakeAssets;

        function assetsHarness(response: Response, overrides: { url?: string; headers?: Record<string, string> } = {}) {
            assets = createFakeAssets(() => response);

            return createMockContext({
                url: overrides.url ?? 'https://blit386.dev/logo.svg',
                headers: overrides.headers,
                env: { ASSETS: assets },
            });
        }

        it('returns the asset response as-is and never delegates', async () => {
            const asset = new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
            const harness = assetsHarness(asset);

            const response = await harness.run(middleware);

            expect(response).toBe(asset);
            expect(harness.nextCalls).toBe(0);
        });

        it('forwards the original request object untouched', async () => {
            const harness = assetsHarness(new Response('ok'));

            await harness.run(middleware);

            expect(assets.requests[0]).toBe(harness.context.req.raw);
        });

        it('falls through to the next middleware when the binding has no such asset', async () => {
            const harness = assetsHarness(new Response('not found', { status: 404 }));

            const response = await harness.run(middleware);

            // RSC payloads, /mcp, and /api/search all live here: no static asset exists, so the
            // 404 must not be returned to the client.
            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
        });

        it('returns a non-404 error from the binding rather than falling through', async () => {
            const harness = assetsHarness(new Response('boom', { status: 500 }));

            const response = await harness.run(middleware);

            expect(response?.status).toBe(500);
            expect(harness.nextCalls).toBe(0);
        });

        it('forwards a negotiable request whose page does not exist', async () => {
            const harness = assetsHarness(new Response('ok'), {
                url: 'https://blit386.dev/nope',
                headers: MARKDOWN,
            });

            await harness.run(middleware);

            expect(assets.requests).toHaveLength(1);
        });

        it('forwards a negotiable request when no adapter can produce text', async () => {
            const built = buildMiddleware({ adapters: 'none' });
            const noAdapters = await built.middleware;
            const harness = assetsHarness(new Response('ok'), {
                url: 'https://blit386.dev/docs/getting-started',
                headers: MARKDOWN,
            });

            await harness.run(noAdapters);

            expect(assets.requests).toHaveLength(1);
        });

        it('never negotiates a path that already ends in .md', async () => {
            const harness = assetsHarness(new Response('# raw'), {
                url: 'https://blit386.dev/docs/getting-started.md',
                headers: MARKDOWN,
            });

            const response = await harness.run(middleware);

            // The static `.md` variants the llms.txt plugin emits are already markdown on disk;
            // re-negotiating them would double-wrap the title heading.
            expect(await response?.text()).toBe('# raw');
            expect(response?.headers.get('x-markdown-tokens')).toBeNull();
            expect(assets.requests).toHaveLength(1);
        });
    });

    describe('without an ASSETS binding', () => {
        it('delegates when the env has no binding', async () => {
            const harness = createMockContext({ url: 'https://blit386.dev/logo.svg', env: {} });

            const response = await harness.run(middleware);

            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
        });

        it('delegates when there is no env at all', async () => {
            const harness = createMockContext({ url: 'https://blit386.dev/logo.svg' });

            await harness.run(middleware);

            expect(harness.nextCalls).toBe(1);
        });
    });

    describe('skipping non-readonly methods', () => {
        it.each(['POST', 'PUT', 'DELETE'])('delegates a %s request without touching the binding', async (method) => {
            const assets = createFakeAssets(() => new Response('ok'));
            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                method,
                headers: MARKDOWN,
                env: { ASSETS: assets },
            });

            await harness.run(middleware);

            expect(harness.nextCalls).toBe(1);
            expect(assets.requests).toHaveLength(0);
        });
    });
});
