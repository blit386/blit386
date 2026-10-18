# Security Policy

This package (`blit386-website`, the source for blit386.dev) is `private: true` and has no release line of its own - it
has no version tags of its own: a push to `main` deploys the `blit386-next` preview Worker, and the production `blit386`
Worker deploys on the monorepo's release tag push (or a manual run), both to Cloudflare Workers. The supported-versions
table in the [root `SECURITY.md`](../../SECURITY.md) describes the published `blit386` engine and does not apply here;
this file exists only to route reports and note the scope specific to this package. The root file is the canonical
policy.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

Use [GitHub private vulnerability reporting](https://github.com/blit386/blit386/security/advisories/new) or contact the
maintainers directly.

## Scope specific to this package

- Supply chain (npm dependencies of the docs site)
- CI/CD and Cloudflare deploy credentials
- User-facing content injection via MDX (review PRs carefully)
- The Worker code in `src/`: the `/mcp` endpoint, Markdown negotiation, the CSP nonce rewriting, and the method guard

## Hardening in place

Defenses a report here can test against. Details live in [`CLAUDE.md`](CLAUDE.md).

- **No `'unsafe-inline'` in `script-src`.** The Content-Security-Policy is defined once in `src/csp.ts`. Every
  prerendered HTML response gets a fresh per-request nonce stamped onto each `<script>` by `src/csp-nonce.ts`, with a
  matching header. Every other response gets the nonce-free `BASE_CSP` from `public/_headers`, so the default fails
  closed. `style-src` still allows `'unsafe-inline'` because Fumadocs and Tailwind emit inline styles.
- **Other response headers**, from `public/_headers`: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and `frame-ancestors 'none'`
  in the CSP. HTML responses carry no `ETag` or `Last-Modified`, since a `304` would pair a fresh nonce with a cached
  body.
- **Non-GET/HEAD requests get `405`.** Any request other than `GET` or `HEAD` that no plugin claims is refused with
  `Allow: GET, HEAD` (`src/method-guard.ts`) rather than rendered on demand. The only POST route is `/mcp`, and
  `OPTIONS` is refused too because no endpoint serves CORS.
- **`/mcp` is read-only and unauthenticated by design.** It exposes `search_docs`, `get_doc_page`, and
  `get_docs_summary` over public documentation. `get_doc_page` treats its argument as a lookup key into the in-memory
  corpus and never fetches it, and it rejects URLs on any host other than the request's own origin or `blit386.dev`.
- **Preview deployments are not indexed.** The `next` channel sets `noindex` and serves a disallow-all `robots.txt`.

For engine/runtime security issues in the BLIT386 library itself, or the reporting timeline and supported-version
policy, see the [root `SECURITY.md`](../../SECURITY.md).
