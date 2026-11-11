import type { AppContext, ConfigContext } from 'fumapress';

/**
 * The Cloudflare Static Assets binding (`ASSETS` in `dist/server/wrangler.json`). Waku forwards the Worker
 * `env` into the Hono app, so it arrives as `c.env`. Declared locally rather than pulled from
 * `@cloudflare/workers-types`, whose globals collide with the `dom` lib this package compiles with.
 */
export interface AssetsBinding {
    fetch: (request: Request) => Promise<Response>;
}

/** The `ASSETS` binding from a Hono `c.env`, or `undefined` outside the Worker (Node, tests without one). */
export function getAssets(env: unknown): AssetsBinding | undefined {
    return (env as { ASSETS?: AssetsBinding } | undefined)?.ASSETS;
}

type GetText<C extends ConfigContext> = NonNullable<AppContext<C>['adapters'][number]['core:get-text']>;

/**
 * A page's markdown from the first adapter that implements `core:get-text` - the same extraction the
 * llms.txt `.md` variants use, so markdown negotiation and the MCP server serve what agents get there.
 */
export async function getPageText<C extends ConfigContext>(
    ctx: AppContext<C>,
    page: Parameters<GetText<C>>[0],
): Promise<string | undefined> {
    for (const adapter of ctx.adapters) {
        const text = await adapter['core:get-text']?.call(ctx, page);
        if (text !== undefined) {
            return text;
        }
    }

    return undefined;
}
