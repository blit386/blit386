/**
 * Covers `methodGuardPlugin`: non-GET/HEAD requests nothing else claimed get a 405 instead of
 * falling through to Waku, which would render the whole page on demand (BT-587).
 */

import { describe, expect, it } from 'vitest';
import { markdownNegotiationPlugin } from './markdown-negotiation';
import { mcpServerPlugin } from './mcp-server';
import { methodGuardPlugin } from './method-guard';
import {
    createFakeAssets,
    createMockContext,
    createPluginMiddleware,
    type PluginMiddleware,
} from './__test__/hono-context';
import { createFakeLoader, createMockAppContext } from './__test__/press-context';

const PAGE_URL = 'https://blit386.dev/docs/api/rendering';

async function buildGuard(): Promise<PluginMiddleware> {
    return createPluginMiddleware(methodGuardPlugin(), createMockAppContext());
}

describe('methodGuardPlugin', () => {
    it('names itself', () => {
        expect(methodGuardPlugin().name).toBe('method-guard');
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
        'refuses %s to a page with 405 and Allow',
        async (method) => {
            const harness = createMockContext({ url: PAGE_URL, method });

            const response = await harness.run(await buildGuard());

            expect(response?.status).toBe(405);
            expect(response?.headers.get('allow')).toBe('GET, HEAD');
            expect(harness.nextCalls).toBe(0);
        },
    );

    it.each(['GET', 'HEAD'])('delegates %s unchanged', async (method) => {
        const harness = createMockContext({ url: PAGE_URL, method });

        const response = await harness.run(await buildGuard());

        expect(response).toBeUndefined();
        expect(harness.nextCalls).toBe(1);
    });

    describe('chained after the other plugins', () => {
        // Hono's compose, reduced to what these three middlewares need: each may answer or delegate.
        async function runChain(options: { url: string; method: string; body?: string }) {
            const { loader } = createFakeLoader([]);
            const context = createMockAppContext({ loader, adapters: [] });
            const assets = createFakeAssets(() => new Response('not found', { status: 404 }));
            const chain = [
                await createPluginMiddleware(markdownNegotiationPlugin(), context),
                await createPluginMiddleware(mcpServerPlugin(), context),
                await buildGuard(),
            ];

            for (const middleware of chain) {
                const harness = createMockContext({ ...options, env: { ASSETS: assets } });
                const response = await harness.run(middleware);
                if (response !== undefined) {
                    return response;
                }
            }

            return undefined;
        }

        it('lets POST /mcp reach the MCP handler', async () => {
            const response = await runChain({
                url: 'https://blit386.dev/mcp',
                method: 'POST',
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
            });

            expect(response?.status).toBe(200);
            expect(await response?.json()).toMatchObject({ jsonrpc: '2.0', id: 1 });
        });

        it('refuses POST to a page that no plugin claims', async () => {
            const response = await runChain({ url: PAGE_URL, method: 'POST', body: '{}' });

            expect(response?.status).toBe(405);
        });
    });
});
