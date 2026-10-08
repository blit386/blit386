import type { ConfigContext, ServerPlugin } from 'fumapress';
import { isGetOrHead } from './http-methods';

const ALLOWED_METHODS = 'GET, HEAD';

/**
 * Refuses every non-GET/HEAD request that no earlier plugin claimed, with `405` and `Allow: GET, HEAD`.
 *
 * Without it, `POST /docs/api/rendering` falls through `markdownNegotiationPlugin` (which only
 * serves GET/HEAD from `ASSETS`) into Waku, which renders the whole page on demand - 100+ ms of
 * CPU against 5 ms for the static hit, since BT-586 stripped the prerendered payloads.
 *
 * Chosen over an `/mcp` exception inside `markdownNegotiationPlugin`: registered LAST in the chain,
 * it only ever sees requests nothing claimed, so a future POST route (`/mcp` today) works the moment
 * its plugin is registered, with no path list here to forget. `OPTIONS` is refused like any other
 * method: nothing serves CORS (not even `/mcp`), and the MCP clients we target (Claude Code, Cursor)
 * are not browsers, so they send no preflight.
 */
export function methodGuardPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'method-guard',
        createMiddlewares() {
            return [
                async (c, next) => {
                    const { method } = c.req;
                    if (isGetOrHead(method)) {
                        return next();
                    }

                    return new Response('Method Not Allowed', {
                        status: 405,
                        headers: { allow: ALLOWED_METHODS, 'content-type': 'text/plain; charset=utf-8' },
                    });
                },
            ];
        },
    };
}
