/**
 * The site's Content-Security-Policy, defined once.
 *
 * Two surfaces serve this policy and they must not drift apart:
 *
 * - `public/_headers` applies {@link BASE_CSP} to every response Cloudflare serves from the ASSETS
 *   binding – images, fonts, `.md` routes, JSON. It is the fail-closed default.
 * - `src/csp-nonce.ts` replaces that header on prerendered HTML with `buildCsp(nonce)`, whose
 *   `script-src` carries a fresh per-request nonce.
 *
 * `public/_headers` is a static file that cannot import anything, so its CSP line is a hand-written
 * copy of {@link BASE_CSP}. `csp.test.ts` reads the file and asserts the two are character-identical,
 * which is what makes the copy safe (see `.claude/rules/named-constants.md`).
 *
 * Why a nonce rather than hashes: the site is prerendered (`mode: 'static'` in `press.config.tsx`),
 * and Waku's React bootstrap script plus the RSC flight payload that `rsc-html-stream` injects are
 * both per-page, so no fixed hash list can cover them. Waku's own `unstable_setNonce` is
 * request-time SSR only and does nothing under static rendering, hence the Worker-side stamping.
 *
 * Deliberately no `'strict-dynamic'`: every chunk this site loads is same-origin and already covered
 * by `'self'`, while `'strict-dynamic'` would void both `'self'` and the `https://plausible.io`
 * allowance. Worth revisiting only if third-party scripts ever start loading further scripts.
 */

/** Placeholder occupying the nonce's slot in {@link CSP_DIRECTIVES}; removed when no nonce is given. */
const NONCE_PLACEHOLDER = '<nonce>';

/** How many random bytes back a nonce. The CSP spec asks for at least 128 bits of entropy. */
const NONCE_BYTES = 16;

/**
 * Every directive, in the order they are serialized.
 *
 * `script-src` is the one BT-191 changed: it used to carry `'unsafe-inline'`, which let any injected
 * `<script>` in an HTML response execute and undercut most of the rest of this policy.
 *
 * Load-bearing entries that must not be tightened (see `CLAUDE.md`, "Blog media"): `media-src 'self'`
 * for the self-hosted blog clips, and `frame-src https://demos.blit386.dev` for embedded demos.
 * `style-src 'unsafe-inline'` remains – Fumadocs and Tailwind both emit inline styles, and removing it
 * is a separate piece of work from BT-191.
 */
const CSP_DIRECTIVES: readonly (readonly [directive: string, ...sources: string[]])[] = [
    ['default-src', "'self'"],
    ['base-uri', "'self'"],
    ['object-src', "'none'"],
    ['script-src', "'self'", NONCE_PLACEHOLDER, 'https://plausible.io'],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'https://fonts.vancura.dev'],
    ['connect-src', "'self'", 'https://plausible.io'],
    ['media-src', "'self'"],
    ['worker-src', "'self'", 'blob:'],
    ['child-src', "'none'"],
    ['frame-src', "'self'", 'https://demos.blit386.dev'],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ['upgrade-insecure-requests'],
];

/**
 * Serializes the policy, substituting `nonce` into `script-src`.
 *
 * @param nonce Base64 nonce to allow inline scripts with. Omit for the nonce-free base policy.
 * @returns The `Content-Security-Policy` header value.
 */
export function buildCsp(nonce?: string): string {
    return CSP_DIRECTIVES.map(([directive, ...sources]) =>
        [
            directive,
            ...sources.flatMap((source) => {
                if (source !== NONCE_PLACEHOLDER) {
                    return [source];
                }

                return nonce === undefined ? [] : [`'nonce-${nonce}'`];
            }),
        ].join(' '),
    ).join('; ');
}

/**
 * The policy `public/_headers` serves, with no nonce.
 *
 * Every response the Worker does not rewrite gets this, and so does any HTML the Worker somehow
 * misses – in which case the page fails closed (blank) rather than silently losing its protection.
 */
export const BASE_CSP = buildCsp();

/** Generates a fresh per-request nonce. */
export function generateNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

    return btoa(String.fromCharCode(...bytes));
}

/**
 * File extensions served as something other than HTML.
 *
 * Anything else – `/`, `/docs/getting-started`, `/blog/`, an explicit `.html` – is a prerendered page.
 * The list errs toward "not HTML" only for extensions this site actually emits, because the costly
 * mistake runs the other way: an HTML path misread as an asset keeps its conditional request headers
 * and can end up serving a stale body against a fresh nonce (see `isHtmlAssetPath`).
 */
const NON_HTML_EXTENSIONS = new Set([
    'css',
    'ico',
    'js',
    'json',
    'map',
    'md',
    'mp4',
    'png',
    'svg',
    'txt',
    'webp',
    'woff2',
    'xml',
]);

/**
 * Whether a path is served as prerendered HTML.
 *
 * Used to decide which requests must not be answered with a `304`. A conditional request for HTML is
 * unanswerable once nonces are in play: RFC 9111 has the client merge the `304`'s headers into its
 * *stored* body, so a fresh `Content-Security-Policy` would land on a body whose scripts carry an
 * older nonce – or none at all, for a copy cached before this shipped – and every script on the page
 * would be blocked until that file's hash changed. `markdown-negotiation.ts` therefore drops the
 * conditional headers on the way to the ASSETS binding for these paths, and only these: hashed JS,
 * CSS, and fonts genuinely rely on `304`s.
 *
 * @param pathname Request path, without query or hash.
 */
export function isHtmlAssetPath(pathname: string): boolean {
    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
    const dot = lastSegment.lastIndexOf('.');

    if (dot <= 0) {
        return true;
    }

    return !NON_HTML_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}
