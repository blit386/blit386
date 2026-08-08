import type { ConfigContext, ServerPlugin } from 'fumapress';

const NOINDEX_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

/**
 * Marks every response `noindex` on the `next.blit386.dev` preview channel, and serves a
 * disallow-all `/robots.txt` there instead of the production `public/robots.txt` asset.
 *
 * Reads `c.env.BLIT386_CHANNEL` at request time, the same way `markdown-negotiation.ts` reads
 * `c.env.ASSETS` – NOT a build-time `process.env.BLIT386_CHANNEL` constant. This module's top
 * level re-runs inside the deployed Worker on every cold start (to reconstruct the Fumapress
 * plugin list), and the Worker has no access to the CI build step's shell env, only to whatever
 * `wrangler.json` declares as `vars` (injected by `scripts/patch-wrangler.mjs` when
 * `BLIT386_CHANNEL=next`), surfaced via `c.env`.
 *
 * Must run before `markdownNegotiationPlugin` in the `.plugins()` chain: that plugin's
 * assets-first fallback serves the static `public/robots.txt` directly and returns without
 * calling `next()`, so a plugin registered after it would never see a `/robots.txt` request in
 * order to override it, and would never get a chance to set a header on any other asset
 * response either.
 */
export function channelHeadersPlugin<C extends ConfigContext = ConfigContext>(): ServerPlugin<C> {
    return {
        name: 'channel-headers',
        createMiddlewares() {
            return [
                async (c, next) => {
                    const isNextChannel =
                        (c.env as { BLIT386_CHANNEL?: string } | undefined)?.BLIT386_CHANNEL === 'next';

                    if (!isNextChannel) {
                        return next();
                    }

                    const { method } = c.req;

                    if (c.req.path === '/robots.txt' && (method === 'GET' || method === 'HEAD')) {
                        return new Response(method === 'HEAD' ? null : NOINDEX_ROBOTS_TXT, {
                            headers: {
                                'content-type': 'text/plain; charset=utf-8',
                                'x-robots-tag': 'noindex',
                            },
                        });
                    }

                    await next();

                    // Mutates the downstream response in place, and that is verified rather than
                    // assumed (BT-464). Hono does NOT clone here: `set res` only reconstructs when
                    // `c.res` had already been read, and nothing upstream reads it, so after
                    // `next()` this `c.res` is the very object `markdownNegotiationPlugin`
                    // returned – which for a static asset is `c.env.ASSETS.fetch()`'s response.
                    // Fetch-spec headers on such a response are guarded `immutable` and `set()`
                    // would throw `TypeError: immutable`; workerd does not enforce that guard, so
                    // the write lands. Confirmed against the deployed `blit386-next` Worker: an
                    // image, a font, and a doc page all return 200 with `X-Robots-Tag: noindex`,
                    // and Workers Logs records no exception for any of them.
                    //
                    // If a runtime or Hono upgrade ever does surface `TypeError: immutable` here,
                    // the fix is to own the response rather than reorder the plugin chain:
                    // `c.res = new Response(c.res.body, c.res)` before setting the header.
                    c.res.headers.set('x-robots-tag', 'noindex');
                },
            ];
        },
    };
}
