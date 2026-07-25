# Security headers (Cloudflare Pages)

Deployed demos are static assets on [demos.blit386.dev](https://demos.blit386.dev/): HTML, JS, sprite PNGs, `.btfont`
bitmap fonts, the Departure Mono web font (used by the navigation banner), Pragmata Pro for the demo source panel, and
`.wav` audio clips. HTTP response headers are defined in [`public/_headers`](../public/_headers) and copied into `dist/`
at build time.

## Baseline

| Header                    | Value (summary)                   | Why                                                                                                 |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`  | `nosniff`                         | Stops MIME-type sniffing on scripts and assets.                                                     |
| `Referrer-Policy`         | `strict-origin-when-cross-origin` | Limits referrer leakage on cross-origin navigation while keeping same-origin context.               |
| `Permissions-Policy`      | Disables unused browser features  | Reduces attack surface (camera, mic, geolocation, payment, USB, etc.). Demos do not use these APIs. |
| `Content-Security-Policy` | See below                         | Defense-in-depth for script, style, asset, and embedding policy.                                    |

### Content-Security-Policy directives

| Directive                   | Policy                                                                | Compatibility note                                                                                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`               | `'self'`                                                              | Fallback for unspecified fetch types.                                                                                                                                                                                                                                                                                        |
| `base-uri`                  | `'self'`                                                              | Blocks injected `<base>` tags.                                                                                                                                                                                                                                                                                               |
| `object-src`                | `'none'`                                                              | No plugins (`<object>`, `<embed>`).                                                                                                                                                                                                                                                                                          |
| `script-src`                | `'self' 'unsafe-inline' https://plausible.io`                         | Vite emits same-origin ES module bundles ([`_partials/demo-shell.js`](../_partials/demo-shell.js), demo entries); `'unsafe-inline'` covers the first-paint shell/embed stamp and the embed-only demo `import()` snippet in [`_partials/layout.html`](../_partials/layout.html). Plausible loads from `https://plausible.io`. |
| `style-src`                 | `'self' 'unsafe-inline'`                                              | Required: shared [`_partials/layout.html`](../_partials/layout.html) uses an inline `<style>` block.                                                                                                                                                                                                                         |
| `img-src`                   | `'self' data: blob:`                                                  | Sprites/fonts from same origin; `blob:` for frame capture / download ([image-output](../src/image-output.js)).                                                                                                                                                                                                               |
| `font-src`                  | `'self' https://fonts.vancura.dev`                                    | Same-origin bitmap fonts and Departure Mono under `/fonts/`; Pragmata Pro for the source panel is loaded from `fonts.vancura.dev` (see [`styles/demo-source.css`](../styles/demo-source.css)).                                                                                                                               |
| `connect-src`               | `'self' https://plausible.io`                                         | `fetch` for PNG, `.btfont`, and `.wav` audio assets (the engine decodes audio through Web Audio, so audio loads are governed here, not by `media-src`); WebGPU init stays same-origin; Plausible analytics.                                                                                                                  |
| `media-src`                 | `'none'`                                                              | Correct today, but read the note below before adding audio or video markup.                                                                                                                                                                                                                                                  |
| `worker-src`                | `'self' blob:`                                                        | Reserved for worker/blob patterns used by capture and asset helpers.                                                                                                                                                                                                                                                         |
| `child-src` / `frame-src`   | `'self'`                                                              | Same-origin only: the persistent shell loads each demo in an iframe (`?embed&source`) so demo swaps can discard the engine instance (no teardown API). External nested frames stay blocked.                                                                                                                                  |
| `form-action`               | `'none'`                                                              | No form submissions.                                                                                                                                                                                                                                                                                                         |
| `frame-ancestors`           | `'self' https://vancura.dev https://*.framer.app https://blit386.dev` | `'self'` is required so the persistent shell can iframe the same demo (`?embed` / `?embed&source`). Also allows embedding in the Framer site, vancura.dev articles, and the Fumapress docs site ([blit386.dev](https://blit386.dev)).                                                                                        |
| `upgrade-insecure-requests` | (enabled)                                                             | Upgrades subresource requests to HTTPS on the production host.                                                                                                                                                                                                                                                               |

### `media-src 'none'` and the audio demos

The demos do play sound – see [audio-basics](../src/audio-basics.js), [music](../src/music.js),
[audio-buses](../src/audio-buses.js), [synth-toy](../src/synth-toy.js), and the `.wav` files under `public/audio/` – yet
`media-src` is still `'none'`, and that is not a contradiction.

`media-src` governs `<audio>` and `<video>` elements. The engine has neither: `AudioClip.load()` fetches the `.wav` file
and hands the bytes to Web Audio's `decodeAudioData()`, producing an in-memory buffer played through an `AudioContext`.
That request is a plain `fetch`, so it is governed by `connect-src 'self'`. Synthesized clips (`AudioClip.synth()`) do
not fetch anything at all.

The consequence for future work: the moment a demo (or the engine) introduces an `<audio>` / `<video>` element, or
routes an element through `createMediaElementSource()`, this CSP will silently block it and the demo will be mute with
only a console CSP violation to explain why. Change `media-src` to `'self'` in [`public/_headers`](../public/_headers)
in the same change, and update the table above.

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
curl -sI 'https://demos.blit386.dev/basics' | rg -i '^(content-security-policy|x-content-type-options|referrer-policy|permissions-policy):'
```

Smoke-test in a browser:

1. [basics](https://demos.blit386.dev/basics) – shell iframe loads (`frame-ancestors` must include `'self'`); WebGPU +
   source panel uses Pragmata Pro from `fonts.vancura.dev` (no CSP `font-src` violation in the console).
2. [image-output](https://demos.blit386.dev/image-output) – Space triggers PNG download (`blob:`).
3. [crt-pipboy](https://demos.blit386.dev/crt-pipboy) – WebGPU post-process chain.
4. Embed check – demo iframe on [vancura.dev](https://vancura.dev) articles and [blit386.dev](https://blit386.dev) docs
   still loads (`frame-ancestors`).

Check the browser console for CSP violations after deploy.

## Related

- Security runbook (the parent hardening program, in the engine repo):
  [`blit386/docs/security/security-runbook.md`](https://github.com/blit386/blit386/blob/main/docs/security/security-runbook.md)
  – the deploy-headers row records the evidence for this page.
- [CI-WORKSPACE-SETUP.md](CI-WORKSPACE-SETUP.md) – CI jobs, GitHub Actions SHA pinning, and the Renovate policy.
