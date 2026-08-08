/**
 * Covers `feedPlugin`: the RSS 2.0 feed at `GET /feed.xml`.
 *
 * A feed is consumed by readers that are unforgiving about malformed XML and about dates that are
 * not RFC 822, so the assertions here are on the exact serialized output rather than on a parsed
 * shape. The escaping tests pin what `escapeXml` does and does not touch, which matters because a
 * post title is author-controlled text going straight into markup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedPlugin } from './feed';
import { createMockContext, createPluginMiddleware, type PluginMiddleware } from './__test__/hono-context';
import {
    createFakeLoader,
    createFakePage,
    createMockAppContext,
    type FakeLoader,
    type FakeLoaderCalls,
} from './__test__/press-context';
import type { AppContext } from 'fumapress';
import type { Page } from 'fumadocs-core/source';

function blogPost(input: { url: string; title: string; description?: string; date?: unknown }): Page {
    return createFakePage({
        url: input.url,
        title: input.title,
        description: input.description,
        type: 'blog',
        data: input.date === undefined ? {} : { date: input.date },
    });
}

const POSTS = [
    blogPost({ url: '/blog/older', title: 'Older post', description: 'The first one.', date: '2026-06-25' }),
    blogPost({ url: '/blog/newer', title: 'Newer post', description: 'The second one.', date: '2026-07-04' }),
];

async function buildMiddleware(
    pages: Page[],
    options: { siteConfig?: AppContext['siteConfig']; loader?: () => FakeLoader } = {},
): Promise<{ middleware: PluginMiddleware; calls: FakeLoaderCalls }> {
    const built = createFakeLoader(pages);
    const context = createMockAppContext({
        loader: options.loader ?? built.loader,
        ...(options.siteConfig === undefined ? {} : { siteConfig: options.siteConfig }),
    });

    return { middleware: await createPluginMiddleware(feedPlugin(), context), calls: built.calls };
}

/** Fetches the feed and returns its body. */
async function fetchFeed(middleware: PluginMiddleware, method = 'GET'): Promise<Response> {
    const harness = createMockContext({ url: 'https://blit386.dev/feed.xml', method });
    const response = await harness.run(middleware);

    if (response === undefined) {
        throw new Error('the feed middleware delegated instead of answering');
    }

    return response;
}

describe('feedPlugin', () => {
    let middleware: PluginMiddleware;
    let calls: FakeLoaderCalls;

    beforeEach(async () => {
        ({ middleware, calls } = await buildMiddleware(POSTS));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('names itself', () => {
        expect(feedPlugin().name).toBe('feed');
    });

    describe('routing', () => {
        it.each([
            ['a different path', 'https://blit386.dev/blog', 'GET'],
            ['a non-readonly method', 'https://blit386.dev/feed.xml', 'POST'],
        ])('delegates %s', async (_label, url, method) => {
            const harness = createMockContext({ url, method });

            const response = await harness.run(middleware);

            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
        });
    });

    describe('the channel', () => {
        it('serves RSS with the documented content type', async () => {
            const response = await fetchFeed(middleware);

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
        });

        it('opens with an XML declaration and the channel metadata', async () => {
            const body = await (await fetchFeed(middleware)).text();

            expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
            expect(body).toContain('<title>BLIT386 Blog</title>');
            expect(body).toContain('<link>https://blit386.dev/blog</link>');
            expect(body).toContain(
                '<atom:link href="https://blit386.dev/feed.xml" rel="self" type="application/rss+xml"/>',
            );
        });

        it('falls back to the production base URL when the site config has none', async () => {
            const built = await buildMiddleware(POSTS, { siteConfig: { name: 'BLIT386' } });

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body).toContain('<link>https://blit386.dev/blog</link>');
        });

        it('answers HEAD with the headers but no body', async () => {
            const response = await fetchFeed(middleware, 'HEAD');

            expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
            expect(await response.text()).toBe('');
        });
    });

    describe('the items', () => {
        it('includes only blog pages', async () => {
            const built = await buildMiddleware([
                ...POSTS,
                createFakePage({ url: '/docs/getting-started', title: 'Getting started', type: 'docs' }),
            ]);

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body).toContain('https://blit386.dev/blog/newer');
            expect(body).not.toContain('/docs/getting-started');
        });

        it('sorts newest first', async () => {
            const body = await (await fetchFeed(middleware)).text();

            expect(body.indexOf('Newer post')).toBeLessThan(body.indexOf('Older post'));
        });

        it('formats the publication date as RFC 822 with a numeric offset', async () => {
            const body = await (await fetchFeed(middleware)).text();

            expect(body).toContain('<pubDate>Thu, 25 Jun 2026 00:00:00 +0000</pubDate>');
        });

        it('gives every item a permalink guid matching its link', async () => {
            const body = await (await fetchFeed(middleware)).text();

            expect(body).toContain('<link>https://blit386.dev/blog/newer</link>');
            expect(body).toContain('<guid isPermaLink="true">https://blit386.dev/blog/newer</guid>');
        });

        it('omits the description element when a post has none', async () => {
            const built = await buildMiddleware([blogPost({ url: '/blog/bare', title: 'Bare', date: '2026-07-04' })]);

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body).not.toContain('<description>\n');
            expect(body).toContain('<title>Bare</title>');
        });

        it('escapes the XML metacharacters that would break the document', async () => {
            const built = await buildMiddleware([
                blogPost({ url: '/blog/x', title: 'A & B <c> "d"', date: '2026-07-04' }),
            ]);

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body).toContain('<title>A &amp; B &lt;c&gt; &quot;d&quot;</title>');
        });

        it('leaves an apostrophe unescaped, since it is legal in element text', async () => {
            const built = await buildMiddleware([
                blogPost({ url: '/blog/y', title: "Vaclav's post", date: '2026-07-04' }),
            ]);

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body).toContain("<title>Vaclav's post</title>");
        });
    });

    describe('a post with no usable date', () => {
        const undated = [
            blogPost({ url: '/blog/dated', title: 'Dated', date: '2026-07-04' }),
            blogPost({ url: '/blog/undated', title: 'Undated' }),
        ];

        it('still publishes the item, but without a pubDate', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const built = await buildMiddleware(undated);

            const body = await (await fetchFeed(built.middleware)).text();
            const item = body.slice(body.indexOf('<title>Undated</title>'));

            expect(body).toContain('<title>Undated</title>');
            expect(item.slice(0, item.indexOf('</item>'))).not.toContain('<pubDate>');
            expect(warn).toHaveBeenCalled();
        });

        it('sorts it below every dated post', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            const built = await buildMiddleware(undated);

            const body = await (await fetchFeed(built.middleware)).text();

            expect(body.indexOf('Dated')).toBeLessThan(body.indexOf('Undated'));
        });

        it('warns with the post title and URL so the source is findable', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const built = await buildMiddleware(undated);

            await fetchFeed(built.middleware);

            expect(warn).toHaveBeenCalledWith(expect.stringContaining('Undated'));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('/blog/undated'));
        });
    });

    describe('caching', () => {
        it('builds the feed once per loader', async () => {
            await fetchFeed(middleware);
            await fetchFeed(middleware);

            expect(calls.getPages).toBe(1);
        });

        it('rebuilds when the loader is replaced', async () => {
            let current = createFakeLoader(POSTS);
            const built = await buildMiddleware(POSTS, { loader: () => current.loader });

            await fetchFeed(built.middleware);
            const first = current.calls.getPages;
            current = createFakeLoader(POSTS);
            await fetchFeed(built.middleware);

            expect(first).toBe(1);
            expect(current.calls.getPages).toBe(1);
        });
    });

    describe('when the build fails', () => {
        /** A loader that cannot be obtained at all – the failure happens before any build starts. */
        function unobtainableLoader(): () => FakeLoader {
            return () => {
                throw new Error('loader unavailable');
            };
        }

        /**
         * A loader that is obtained fine but whose first `getPages()` throws.
         *
         * The distinction matters: this failure lands *inside* the cached build promise, which is
         * the only path that reaches the cache eviction. A loader that throws on the way in never
         * gets as far as being cached.
         */
        function pagesFailOnce(): () => FakeLoader {
            let failing = true;
            const working = createFakeLoader(POSTS).loader;

            return () => ({
                getPage: working.getPage,
                getPages: () => {
                    if (failing) {
                        failing = false;
                        throw new Error('page extraction failed');
                    }

                    return working.getPages();
                },
            });
        }

        it('answers 500 rather than a malformed feed when the loader is unavailable', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const built = await buildMiddleware(POSTS, { loader: unobtainableLoader() });

            const response = await fetchFeed(built.middleware);

            expect(response.status).toBe(500);
            expect(await response.text()).toBe('Internal error: feed unavailable');
            expect(error).toHaveBeenCalled();
        });

        it('answers 500 when the build itself throws', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const built = await buildMiddleware(POSTS, { loader: pagesFailOnce() });

            const response = await fetchFeed(built.middleware);

            expect(response.status).toBe(500);
        });

        it('evicts the failed build so the next request retries', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const built = await buildMiddleware(POSTS, { loader: pagesFailOnce() });

            await fetchFeed(built.middleware);
            const response = await fetchFeed(built.middleware);

            // Without the eviction, the rejected promise would stay cached and every later
            // request in this isolate would keep returning 500.
            expect(response.status).toBe(200);
            expect(await response.text()).toContain('<title>Newer post</title>');
        });
    });
});
