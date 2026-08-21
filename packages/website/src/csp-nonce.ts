import type { ConfigContext, ServerPlugin } from 'fumapress';
import { buildCsp, generateNonce } from './csp';

/**
 * The slice of Cloudflare's `HTMLRewriter` this plugin uses.
 *
 * Declared locally rather than pulled from `@cloudflare/workers-types`, the same way
 * `markdown-negotiation.ts` declares `AssetsBinding`: this package's `tsconfig.json` compiles with
 * `lib: ["dom", ...]`, and the Workers types collide with it wholesale.
 */
interface RewriterElement {
    setAttribute: (name: string, value: string) => void;
}

export interface HtmlRewriterLike {
    on: (selector: string, handlers: { element: (element: RewriterElement) => void }) => HtmlRewriterLike;
    transform: (response: Response) => Response;
}

declare const HTMLRewriter: new () => HtmlRewriterLike;

/** `1` in the `BLIT386_CSP_REPORT_ONLY` Worker var switches a deployment to report-only. */
const REPORT_ONLY_ENABLED = '1';

interface CspEnv {
    BLIT386_CSP_REPORT_ONLY?: string;
}

/** The Worker's `fetch`, as Cloudflare calls it. */
type EntryFetch = (request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response>;

export interface CspNonceOptions {
    /**
     * Builds the rewriter. Exists so `csp-nonce.test.ts` can inject a double – `HTMLRewriter` is a
     * workerd global and this package runs plain Vitest on Node (see `vitest.config.ts`). The real
     * HTML parsing is Cloudflare's and is covered by the `wrangler dev` pass in `CLAUDE.md`.
     */
    createRewriter?: () => HtmlRewriterLike;
}

/**
 * The rewriter to use, or `undefined` where there is none.
 *
 * `HTMLRewriter` only exists in workerd. This same entry is also fetched under Node: once per page
 * while `waku build` prerenders the site, again by `linkValidationPlugin`, and again under
 * `waku dev`. None of those serve the `public/_headers` policy in the first place, so having no
 * rewriter there is not a degraded mode – there is simply nothing to stamp.
 */
function resolveRewriterFactory(override?: () => HtmlRewriterLike): (() => HtmlRewriterLike) | undefined {
    if (override !== undefined) {
        return override;
    }

    return typeof HTMLRewriter === 'undefined' ? undefined : () => new HTMLRewriter();
}

/**
 * Decides whether a response is prerendered HTML that needs a nonce.
 *
 * A null body rules out both `HEAD` and `304 Not Modified`; the explicit 304 check is belt-and-braces
 * in case a runtime ever hands back an empty-but-present stream. Status is otherwise unconstrained so
 * that Waku's rendered 404 page – which carries the same inline bootstrap scripts as any other page –
 * is stamped too.
 */
function isStampableHtml(response: Response, method: string): boolean {
    if (method !== 'GET' || response.body === null || response.status === 304) {
        return false;
    }

    return response.headers.get('content-type')?.toLowerCase().startsWith('text/html') === true;
}

/**
 * Stamps `nonce` onto every `<script>` and serves the matching policy.
 *
 * Removing `etag` and `last-modified` is load-bearing, not tidying. HTML is served
 * `cache-control: public, max-age=0, must-revalidate`, so with a validator present the browser would
 * revalidate, get a `304`, and apply that response's *fresh* nonce header to its *cached* body – whose
 * scripts carry the previous nonce. Every script on the page would then be blocked. Without a
 * validator there is nothing to revalidate with, so a body and its header always arrive together. The
 * cost is a full HTML body instead of a 304 on repeat visits; at `max-age=0` the round trip happened
 * either way.
 */
function stampNonce(response: Response, createRewriter: () => HtmlRewriterLike, reportOnly: boolean): Response {
    const nonce = generateNonce();

    // A real tokenizer, not a string replace. `<script` occurs inside the RSC flight payload as
    // ordinary JSON string data (any docs page discussing CSP contains it literally), and only a
    // parser knows that script raw-text state ends at `</script` alone.
    const transformed = createRewriter()
        .on('script', {
            // Kept trivial on purpose: a throwing handler truncates an already-streaming body.
            element(element) {
                element.setAttribute('nonce', nonce);
            },
        })
        .transform(response);

    const headers = new Headers(response.headers);

    if (reportOnly) {
        // Rollout mode: measure a policy against real traffic on next.blit386.dev without risking a
        // blank page. Nothing is enforced here – the base policy that `public/_headers` applied has
        // to go too, or it would block the very scripts the report is meant to be measuring.
        headers.delete('content-security-policy');
        headers.set('content-security-policy-report-only', buildCsp(nonce));
    } else {
        headers.set('content-security-policy', buildCsp(nonce));
    }

    headers.delete('etag');
    headers.delete('last-modified');

    return new Response(transformed.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/** Wraps one `fetch` so its HTML responses come back stamped. */
function wrapFetch(inner: EntryFetch, options: CspNonceOptions): EntryFetch {
    return async (request, env, ctx) => {
        const response = await inner(request, env, ctx);
        const createRewriter = resolveRewriterFactory(options.createRewriter);

        if (createRewriter === undefined || !isStampableHtml(response, request.method)) {
            return response;
        }

        const reportOnly = (env as CspEnv | undefined)?.BLIT386_CSP_REPORT_ONLY === REPORT_ONLY_ENABLED;

        return stampNonce(response, createRewriter, reportOnly);
    };
}

/**
 * Allows the site's inline scripts by a per-request nonce, so `script-src` never needs
 * `'unsafe-inline'` (BT-191).
 *
 * The site renders statically (`mode: 'static'` in `press.config.tsx`), so its HTML is a build
 * artifact: Waku's React bootstrap script and the RSC flight payload `rsc-html-stream` injects are
 * both per-page, no fixed hash list can cover them, and Waku's own `unstable_setNonce` only applies
 * to request-time SSR. That leaves the Worker as the only place a nonce can be applied.
 *
 * This wraps the server entry's `fetch` rather than contributing a middleware, because a Fumapress
 * `ServerPlugin` middleware never sees the response it would need to rewrite. Fumapress runs plugin
 * middlewares through its own composer (`fumapress/dist/router/index.js`, `pluginsMiddleware`), which
 * keeps a downstream handler's returned `Response` in a local and returns it at the end – it never
 * assigns `c.res`. So after `await next()`, `c.res` is still Hono's placeholder, and only its
 * *headers* survive, merged onto the real response by Hono's `set res`. That is enough for
 * `channelHeadersPlugin`'s `x-robots-tag`, and not enough here: stamping needs the body.
 *
 * The server entry is the outermost hook, and its `fetch` is called with `(request, env, ...)` –
 * which is also where the `BLIT386_CSP_REPORT_ONLY` var arrives, the same request-time binding read
 * `channelHeadersPlugin` documents for `BLIT386_CHANNEL`.
 */
export function cspNoncePlugin<C extends ConfigContext = ConfigContext>(
    options: CspNonceOptions = {},
): ServerPlugin<C> {
    return {
        name: 'csp-nonce',

        unstable_onServerEntry(entry) {
            // Both, deliberately. `entry.defaultExport.fetch` is what Cloudflare invokes on the
            // deployed Worker – `dist/server/index.js` re-exports it – while `entry.fetch` is the
            // one `waku build`'s prerender and `linkValidationPlugin` call. Patching only the
            // former would leave the build path unwrapped; patching only the latter (the obvious
            // reading of "the entry's fetch") silently does nothing in production.
            //
            // Mutated in place rather than spread into copies, the same way `linkValidationPlugin`
            // patches `entry.build`: these objects are the adapter's, and a copy would drop
            // anything on them that is not a plain own enumerable property.
            entry.fetch = wrapFetch(entry.fetch as EntryFetch, options) as typeof entry.fetch;

            const { defaultExport } = entry as { defaultExport?: { fetch?: EntryFetch } };
            if (defaultExport?.fetch !== undefined) {
                defaultExport.fetch = wrapFetch(defaultExport.fetch, options);
            }

            return entry;
        },
    };
}
