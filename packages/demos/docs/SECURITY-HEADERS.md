# Security headers (Cloudflare Pages)

Deployed demos are static HTML, JS, fonts, and sprites on [demos.blit386.dev](https://demos.blit386.dev/). HTTP response
headers are defined in [`public/_headers`](../public/_headers) and copied into `dist/` at build time.

## Baseline

| Header                    | Value (summary)                   | Why                                                                                                 |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`  | `nosniff`                         | Stops MIME-type sniffing on scripts and assets.                                                     |
| `Referrer-Policy`         | `strict-origin-when-cross-origin` | Limits referrer leakage on cross-origin navigation while keeping same-origin context.               |
| `Permissions-Policy`      | Disables unused browser features  | Reduces attack surface (camera, mic, geolocation, payment, USB, etc.). Demos do not use these APIs. |
| `Content-Security-Policy` | See below                         | Defense-in-depth for script, style, asset, and embedding policy.                                    |

### Content-Security-Policy directives

| Directive                   | Policy                                                         | Compatibility note                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`               | `'self'`                                                       | Fallback for unspecified fetch types.                                                                                                                                                                      |
| `base-uri`                  | `'self'`                                                       | Blocks injected `<base>` tags.                                                                                                                                                                             |
| `object-src`                | `'none'`                                                       | No plugins (`<object>`, `<embed>`).                                                                                                                                                                        |
| `script-src`                | `'self' 'unsafe-inline' https://plausible.io`                  | Vite emits same-origin ES module bundles; `'unsafe-inline'` covers the Plausible init snippet and the demo-navigation banner's inline script, both in [`_partials/layout.html`](../_partials/layout.html). |
| `style-src`                 | `'self' 'unsafe-inline'`                                       | Required: shared [`_partials/layout.html`](../_partials/layout.html) uses an inline `<style>` block.                                                                                                       |
| `img-src`                   | `'self' data: blob:`                                           | Sprites/fonts from same origin; `blob:` for frame capture / download ([013-image-output](../src/013-image-output.js)).                                                                                     |
| `font-src`                  | `'self'`                                                       | Bitmap fonts under `/fonts/`.                                                                                                                                                                              |
| `connect-src`               | `'self'`                                                       | `fetch` for PNG and `.btfont` assets; WebGPU init stays same-origin.                                                                                                                                       |
| `media-src`                 | `'none'`                                                       | No `<audio>` / `<video>` in demos.                                                                                                                                                                         |
| `worker-src`                | `'self' blob:`                                                 | Reserved for worker/blob patterns used by capture and asset helpers.                                                                                                                                       |
| `child-src` / `frame-src`   | `'none'`                                                       | Demos do not embed nested browsing contexts.                                                                                                                                                               |
| `form-action`               | `'none'`                                                       | No form submissions.                                                                                                                                                                                       |
| `frame-ancestors`           | `https://vancura.dev https://*.framer.app https://blit386.dev` | Allows embedding in the Framer site, vancura.dev articles, and the Fumapress docs site ([blit386.dev](https://blit386.dev)), which iframes individual demos with `?embed` to hide the navigation banner.   |
| `upgrade-insecure-requests` | (enabled)                                                      | Upgrades subresource requests to HTTPS on the production host.                                                                                                                                             |

### Intentionally not in this pass

- `script-src` nonces / hashes – would require build-time CSP injection or moving all JS external (layout already
  external; not worth nonce plumbing for demos).
- `style-src` without `'unsafe-inline'` – would require extracting layout CSS to a file (separate refactor).
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` – not required for WebGPU here; may affect third-party
  embed debugging.
- `X-Frame-Options` – superseded by `frame-ancestors`; avoid conflicting duplicate framing policy.

## Verification

### Build

```bash
cd blit386-demos
pnpm run build
test -f dist/_headers
```

### Local preview (headers are not applied by Vite preview)

`vite preview` serves files but does not parse Cloudflare `_headers`. To exercise the real header rules locally:

```bash
pnpm run build
npx wrangler pages dev dist --port 8788
curl -sI 'http://127.0.0.1:8788/001-basics' | rg -i '^(content-security-policy|x-content-type-options|referrer-policy|permissions-policy):'
```

After deploy, use production `curl` (below) and browser smoke tests.

### Production

```bash
curl -sI 'https://demos.blit386.dev/001-basics' | rg -i '^(content-security-policy|x-content-type-options|referrer-policy|permissions-policy):'
```

Smoke-test in a browser:

1. [001-basics](https://demos.blit386.dev/001-basics) – WebGPU + sprite load.
2. [013-image-output](https://demos.blit386.dev/013-image-output) – Space triggers PNG download (`blob:`).
3. [023-crt-pipboy](https://demos.blit386.dev/023-crt-pipboy) – WebGPU post-process chain.
4. Embed check – demo iframe on [vancura.dev](https://vancura.dev) articles still loads (`frame-ancestors`).

Check the browser console for CSP violations after deploy.

## Related

- Parent hardening: security program.
- Runbook row:
  [`blit386/docs/security/security-runbook.md`](https://github.com/blit386/blit386/blob/main/docs/security/security-runbook.md)
  (deploy headers evidence).
