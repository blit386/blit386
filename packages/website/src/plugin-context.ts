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
 * Calls each adapter's hook in order and returns the first defined result (mirrors fumapress's own
 * `renderBody`/`renderToc`, which are not part of the public API - `ctx.adapters` is).
 */
export async function callFirstAdapter<C extends ConfigContext, P, T>(
    ctx: AppContext<C>,
    page: P,
    hook: (
        adapter: AppContext<C>['adapters'][number],
    ) => ((this: AppContext<C>, page: P) => T | Promise<T>) | undefined,
): Promise<Awaited<T> | undefined> {
    for (const adapter of ctx.adapters) {
        const result = await hook(adapter)?.call(ctx, page);

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}

/**
 * A page's markdown from the first adapter that implements `core:get-text` - the same extraction the
 * llms.txt `.md` variants use, so markdown negotiation and the MCP server serve what agents get there.
 */
export function getPageText<C extends ConfigContext>(
    ctx: AppContext<C>,
    page: Parameters<GetText<C>>[0],
): Promise<string | undefined> {
    return callFirstAdapter(ctx, page, (adapter) => adapter['core:get-text']);
}
