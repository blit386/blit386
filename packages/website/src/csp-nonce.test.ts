/**
 * Covers `cspNoncePlugin`.
 *
 * The plugin wraps the server entry's `fetch`, so these tests call it the way Cloudflare does –
 * `fetch(request, env, ctx)` – with a stub entry standing in for Waku's.
 *
 * `HTMLRewriter` is a workerd global and this package runs plain Vitest on Node (`vitest.config.ts`,
 * "Test runners" in CLAUDE.md), so the plugin takes a rewriter factory and these tests inject a
 * double. That draws the fidelity line deliberately: everything the plugin decides – when to stamp,
 * what nonce, which headers survive – is asserted here, while the HTML parsing stays Cloudflare's and
 * is covered by the `wrangler dev` pass in CLAUDE.md.
 */

import { describe, expect, it } from 'vitest';
import { BASE_CSP } from './csp';
import { cspNoncePlugin, type CspNonceOptions, type HtmlRewriterLike } from './csp-nonce';

const REPORT_ONLY_ENV = { BLIT386_CSP_REPORT_ONLY: '1' };

/** What `public/_headers` has already applied by the time the Worker sees an asset response. */
const ASSET_HEADERS = {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': BASE_CSP,
    'cache-control': 'public, max-age=0, must-revalidate',
    etag: '"87eaabf8441fbd725e14f88ea6debca3"',
    'last-modified': 'Wed, 20 Aug 2026 10:00:00 GMT',
};

interface RewriterSpy {
    /** Selectors the plugin registered a handler for. */
    readonly selectors: string[];
    /** Every `nonce` stamped onto a `<script>`, one entry per element seen. */
    readonly stamped: string[];
    createRewriter: NonNullable<CspNonceOptions['createRewriter']>;
}

/**
 * A rewriter double that records what the plugin asked for and replays the handler against two
 * pretend `<script>` elements, so a plugin that registers a handler but never stamps is caught.
 */
function createRewriterSpy(): RewriterSpy {
    const selectors: string[] = [];
    const stamped: string[] = [];

    return {
        selectors,
        stamped,

        createRewriter() {
            const rewriter: HtmlRewriterLike = {
                on(selector, handlers) {
                    selectors.push(selector);

                    for (let index = 0; index < 2; index += 1) {
                        handlers.element({
                            setAttribute(name, value) {
                                if (name === 'nonce') {
                                    stamped.push(value);
                                }
                            },
                        });
                    }

                    return rewriter;
                },

                transform(response) {
                    return response;
                },
            };

            return rewriter;
        },
    };
}

type EntryFetch = (request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response>;

type StubEntry = { fetch: () => Response; defaultExport: { fetch: () => Response } };

/** Applies the plugin to a stub of Waku's Cloudflare entry. */
function patchEntry(downstream: Response, options: CspNonceOptions = {}): StubEntry {
    const entry: StubEntry = { fetch: () => downstream, defaultExport: { fetch: () => downstream } };
    const patched = cspNoncePlugin(options).unstable_onServerEntry?.(
        entry as unknown as Parameters<NonNullable<ReturnType<typeof cspNoncePlugin>['unstable_onServerEntry']>>[0],
    );

    if (patched === undefined) {
        throw new Error('cspNoncePlugin contributed no server-entry wrapper');
    }

    return patched as unknown as StubEntry;
}

/**
 * The `fetch` Cloudflare actually invokes on the deployed Worker.
 *
 * `dist/server/index.js` re-exports `entry.defaultExport`, not `entry`, so this is the path that has
 * to be stamped for any of this to reach production. `entry.fetch` is covered separately below.
 */
function wrap(downstream: Response, options: CspNonceOptions = {}): EntryFetch {
    return patchEntry(downstream, options).defaultExport.fetch as EntryFetch;
}

function htmlResponse(headers: Record<string, string> = {}, init: ResponseInit = {}): Response {
    return new Response('<!doctype html><script></script>', { headers: { ...ASSET_HEADERS, ...headers }, ...init });
}

/** The nonce inside a serialized policy. */
function nonceOf(policy: string | null): string {
    const match = policy?.match(/'nonce-([^']+)'/);
    if (!match?.[1]) {
        throw new Error(`no nonce in policy: ${policy}`);
    }

    return match[1];
}

describe('cspNoncePlugin', () => {
    it('names itself', () => {
        expect(cspNoncePlugin().name).toBe('csp-nonce');
    });

    describe('prerendered HTML', () => {
        it('stamps every script with the nonce it puts in the header', async () => {
            const spy = createRewriterSpy();
            const response = await wrap(htmlResponse(), { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/'),
            );

            const nonce = nonceOf(response.headers.get('content-security-policy'));

            expect(spy.selectors).toEqual(['script']);
            expect(spy.stamped).toEqual([nonce, nonce]);
        });

        it('wins over the base policy the ASSETS response already carries', async () => {
            const spy = createRewriterSpy();
            const response = await wrap(htmlResponse(), { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/'),
            );

            // public/_headers applied BASE_CSP inside ASSETS.fetch; without a nonce it would block
            // every inline script on the page.
            expect(response.headers.get('content-security-policy')).not.toBe(BASE_CSP);
            expect(response.headers.get('content-security-policy')).toContain("'nonce-");
        });

        it('serves a policy with no unsafe-inline', async () => {
            const response = await wrap(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter })(
                new Request('https://blit386.dev/'),
            );

            const policy = response.headers.get('content-security-policy') ?? '';

            expect(policy.split('; ').find((entry) => entry.startsWith('script-src '))).not.toContain(
                "'unsafe-inline'",
            );
        });

        it('uses a fresh nonce per request', async () => {
            const spy = createRewriterSpy();
            const first = await wrap(htmlResponse(), { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/'),
            );
            const second = await wrap(htmlResponse(), { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/'),
            );

            expect(nonceOf(first.headers.get('content-security-policy'))).not.toBe(
                nonceOf(second.headers.get('content-security-policy')),
            );
        });

        it('drops the validators that would let a 304 pair a new nonce with a cached body', async () => {
            const response = await wrap(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter })(
                new Request('https://blit386.dev/'),
            );

            expect(response.headers.get('etag')).toBeNull();
            expect(response.headers.get('last-modified')).toBeNull();
        });

        it('preserves the status and the headers other plugins set', async () => {
            const response = await wrap(htmlResponse({ 'x-robots-tag': 'noindex' }, { status: 404 }), {
                createRewriter: createRewriterSpy().createRewriter,
            })(new Request('https://blit386.dev/nope'));

            // Waku's rendered 404 carries the same inline bootstrap scripts as any other page.
            expect(response.status).toBe(404);
            expect(response.headers.get('x-robots-tag')).toBe('noindex');
            expect(response.headers.get('content-security-policy')).toContain("'nonce-");
        });
    });

    describe('leaves alone what it must not rewrite', () => {
        it.each([
            ['JSON', 'application/json'],
            ['markdown', 'text/markdown; charset=utf-8'],
            ['plain text', 'text/plain; charset=utf-8'],
        ])('passes a %s response through untouched', async (_label, contentType) => {
            const spy = createRewriterSpy();
            const downstream = new Response('{}', { headers: { 'content-type': contentType, etag: '"x"' } });
            const response = await wrap(downstream, { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/llms.txt'),
            );

            // The base policy from public/_headers is the right one for these.
            expect(response.headers.get('content-security-policy')).toBeNull();
            expect(response.headers.get('etag')).toBe('"x"');
            expect(spy.stamped).toEqual([]);
        });

        it('passes a HEAD response through untouched', async () => {
            const spy = createRewriterSpy();
            const downstream = new Response(null, { headers: ASSET_HEADERS });
            const response = await wrap(downstream, { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/', { method: 'HEAD' }),
            );

            expect(response.headers.get('content-security-policy')).toBe(BASE_CSP);
            expect(spy.stamped).toEqual([]);
        });

        it('passes a 304 through untouched', async () => {
            // A 304 has no body to stamp, so pairing it with a fresh nonce would block every script
            // in the body the browser already has. markdown-negotiation.ts stops HTML 304s upstream;
            // this is the second line of defense.
            const spy = createRewriterSpy();
            const downstream = new Response(null, { status: 304, headers: ASSET_HEADERS });
            const response = await wrap(downstream, { createRewriter: spy.createRewriter })(
                new Request('https://blit386.dev/'),
            );

            expect(response.headers.get('etag')).toBe(ASSET_HEADERS.etag);
            expect(spy.stamped).toEqual([]);
        });

        it('passes HTML through untouched where there is no HTMLRewriter', async () => {
            // Node: `waku build`'s prerender pass, linkValidationPlugin, and `waku dev`. None of
            // them serve the public/_headers policy, so there is nothing to stamp.
            const response = await wrap(htmlResponse())(new Request('https://blit386.dev/'));

            expect(response.headers.get('content-security-policy')).toBe(BASE_CSP);
            expect(response.headers.get('etag')).toBe(ASSET_HEADERS.etag);
        });
    });

    describe('report-only rollout', () => {
        it('reports instead of enforcing when the binding says so', async () => {
            const response = await wrap(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter })(
                new Request('https://next.blit386.dev/'),
                REPORT_ONLY_ENV,
            );

            // The base policy has to go too, or it would block the very scripts the report is
            // meant to be measuring.
            expect(response.headers.get('content-security-policy')).toBeNull();
            expect(nonceOf(response.headers.get('content-security-policy-report-only'))).toBeTruthy();
        });

        it('enforces when the binding is absent', async () => {
            const response = await wrap(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter })(
                new Request('https://blit386.dev/'),
            );

            expect(response.headers.get('content-security-policy-report-only')).toBeNull();
            expect(response.headers.get('content-security-policy')).toContain("'nonce-");
        });

        it('enforces for any value other than the documented one', async () => {
            const response = await wrap(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter })(
                new Request('https://blit386.dev/'),
                { BLIT386_CSP_REPORT_ONLY: 'true' },
            );

            expect(response.headers.get('content-security-policy-report-only')).toBeNull();
        });
    });
});

describe('which fetch gets wrapped', () => {
    // `entry.defaultExport.fetch` is the deployed Worker's; `entry.fetch` is what `waku build`'s
    // prerender pass and linkValidationPlugin call. Wrapping one and not the other is a silent
    // no-op in exactly the environment that matters, so both are pinned.
    it.each([
        ['the deployed Worker entry', (entry: StubEntry) => entry.defaultExport.fetch],
        ['the build-time entry', (entry: StubEntry) => entry.fetch],
    ])('stamps through %s', async (_label, pick) => {
        const entry = patchEntry(htmlResponse(), { createRewriter: createRewriterSpy().createRewriter });
        const response = await (pick(entry) as EntryFetch)(new Request('https://blit386.dev/'));

        expect(response.headers.get('content-security-policy')).toContain("'nonce-");
    });

    it('tolerates an adapter that exposes no defaultExport', () => {
        const entry = { fetch: () => htmlResponse() };

        expect(() =>
            cspNoncePlugin().unstable_onServerEntry?.(
                entry as unknown as Parameters<
                    NonNullable<ReturnType<typeof cspNoncePlugin>['unstable_onServerEntry']>
                >[0],
            ),
        ).not.toThrow();
    });
});
