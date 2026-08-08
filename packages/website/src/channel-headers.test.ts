/**
 * Covers `channelHeadersPlugin`: the `next`-channel `X-Robots-Tag` and the disallow-all
 * `robots.txt` override.
 *
 * The load-bearing tests are the two in "reads the channel at request time". The header must come
 * from `c.env.BLIT386_CHANNEL`, which the Worker receives through `wrangler.json` `vars`, never
 * from `process.env`, which inside the deployed Worker holds nothing the CI build step set. Both
 * tests point `process.env` at the opposite value from `c.env`, so neither can pass against a
 * `process.env` implementation – whether that read happens at module scope or per request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelHeadersPlugin } from './channel-headers';
import { createMockContext, createPluginMiddleware, type PluginMiddleware } from './__test__/hono-context';
import { createMockAppContext } from './__test__/press-context';

const NEXT_ENV = { BLIT386_CHANNEL: 'next' };
const DISALLOW_ALL = 'User-agent: *\nDisallow: /\n';

describe('channelHeadersPlugin', () => {
    let middleware: PluginMiddleware;

    beforeEach(async () => {
        middleware = await createPluginMiddleware(channelHeadersPlugin(), createMockAppContext());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // `createPluginMiddleware` throws unless the plugin contributes exactly one middleware, so
    // every test in this file also asserts that.
    it('names itself', () => {
        expect(channelHeadersPlugin().name).toBe('channel-headers');
    });

    describe('reads the channel at request time', () => {
        it('marks the response noindex when the request env says next, whatever process.env says', async () => {
            // A module-scope `process.env.BLIT386_CHANNEL` captured this at import time; a lazy
            // per-request `process.env` read sees it now. Both must lose to the binding.
            vi.stubEnv('BLIT386_CHANNEL', 'production');

            const harness = createMockContext({
                url: 'https://next.blit386.dev/docs/getting-started',
                env: NEXT_ENV,
            });

            await harness.run(middleware);

            expect(harness.context.res.headers.get('x-robots-tag')).toBe('noindex');
        });

        it('leaves the response indexable when the request env says production, whatever process.env says', async () => {
            // Also kills a `process.env.X === 'next' || c.env?.X === 'next'` fallback.
            vi.stubEnv('BLIT386_CHANNEL', 'next');

            const harness = createMockContext({
                url: 'https://blit386.dev/docs/getting-started',
                env: { BLIT386_CHANNEL: 'production' },
            });

            await harness.run(middleware);

            expect(harness.context.res.headers.get('x-robots-tag')).toBeNull();
            expect(harness.nextCalls).toBe(1);
        });
    });

    describe('on the production channel', () => {
        it('delegates without a header when the env has no channel var', async () => {
            const harness = createMockContext({ env: {} });

            await harness.run(middleware);

            expect(harness.nextCalls).toBe(1);
            expect(harness.context.res.headers.get('x-robots-tag')).toBeNull();
        });

        it('delegates without a header when there is no env at all', async () => {
            const harness = createMockContext();

            await harness.run(middleware);

            expect(harness.nextCalls).toBe(1);
            expect(harness.context.res.headers.get('x-robots-tag')).toBeNull();
        });

        it('ignores a channel value that is not exactly "next"', async () => {
            const harness = createMockContext({ env: { BLIT386_CHANNEL: 'preview' } });

            await harness.run(middleware);

            expect(harness.nextCalls).toBe(1);
            expect(harness.context.res.headers.get('x-robots-tag')).toBeNull();
        });

        it('does not intercept robots.txt', async () => {
            const harness = createMockContext({ url: 'https://blit386.dev/robots.txt', env: {} });

            const response = await harness.run(middleware);

            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
        });
    });

    describe('on the next channel', () => {
        it('serves a disallow-all robots.txt without reaching the static asset', async () => {
            const harness = createMockContext({ url: 'https://next.blit386.dev/robots.txt', env: NEXT_ENV });

            const response = await harness.run(middleware);

            expect(response).toBeInstanceOf(Response);
            expect(await response?.text()).toBe(DISALLOW_ALL);
            expect(response?.headers.get('content-type')).toBe('text/plain; charset=utf-8');
            expect(response?.headers.get('x-robots-tag')).toBe('noindex');

            // Never delegating is the point: the markdown-negotiation plugin further down the
            // chain would otherwise serve the production robots.txt from the ASSETS binding.
            expect(harness.nextCalls).toBe(0);
        });

        it('answers HEAD /robots.txt with the same headers and no body', async () => {
            const harness = createMockContext({
                url: 'https://next.blit386.dev/robots.txt',
                method: 'HEAD',
                env: NEXT_ENV,
            });

            const response = await harness.run(middleware);

            expect(await response?.text()).toBe('');
            expect(response?.headers.get('content-type')).toBe('text/plain; charset=utf-8');
            expect(response?.headers.get('x-robots-tag')).toBe('noindex');
            expect(harness.nextCalls).toBe(0);
        });

        it('falls past the robots override for a non-GET request to the same path', async () => {
            const harness = createMockContext({
                url: 'https://next.blit386.dev/robots.txt',
                method: 'POST',
                env: NEXT_ENV,
            });

            const response = await harness.run(middleware);

            expect(response).toBeUndefined();
            expect(harness.nextCalls).toBe(1);
            expect(harness.context.res.headers.get('x-robots-tag')).toBe('noindex');
        });

        it('adds the header to a downstream response without disturbing its other headers', async () => {
            const harness = createMockContext({ url: 'https://next.blit386.dev/docs/faq', env: NEXT_ENV });

            await harness.run(middleware);

            expect(harness.context.res.headers.get('x-robots-tag')).toBe('noindex');
            expect(harness.context.res.headers.get('content-type')).toBe('text/html; charset=utf-8');
        });
    });
});
