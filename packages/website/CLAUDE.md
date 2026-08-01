# blit386-dev-fumapress (docs site)

Documentation site for [blit386.dev](https://blit386.dev): Fumapress 0.6.x on Waku (React 19 RSC), MDX via Fumadocs MDX,
Tailwind v4, TypeScript strict, deployed to Cloudflare Workers with Wrangler. Biome owns `.ts` / `.tsx` / `.json` /
`.css`, Prettier owns `.md` / `.mdx` / YAML, and there is no ESLint here.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

Scripts are `pnpm run <script>` from this package's directory (or `pnpm --filter blit386-dev-fumapress run <script>`
from the repo root); `package.json` is the list and `pnpm run preflight` is the gating set (it includes the build).
Production builds require `CLOUDFLARE=1`, which `pnpm run build` already sets. Shell commands are rewritten by
`rtk hook claude` – prefer `rtk read` / `rtk grep` over native Read/Grep for exploration.

## Critical Rules

1. Public engine docs are generated, not authored here. Edit the canonical copy in `packages/blit386/docs/`, then run
   `pnpm run sync:docs`. Never hand-edit anything under `content/docs/{api,guides,performance,reference}/` or
   `src/data/api-history.generated.json`
2. Documentation ships with the change – update `content/` and run `pnpm run docs:links` when adding links
3. No MDX comments. Prettier formats `.mdx` with the Markdown parser, so remark reads `{/* … */}` as emphasis and
   rewrites it to `{/_ … _/}`, which renders as visible italic text on the page. Delete the note or make it real prose
4. Conventional Commits with DCO sign-off (`git commit -s`). Scopes: `content`, `ci`, `docs`, `deps`, `config`. `main`
   is protected – land changes via PR

## Where to Find Information

| Question | Where to look |
| --- | --- |
| Site and plugin config, layouts, global head, MDX component map | `press.config.tsx` |
| MDX collection config, Twoslash wiring | `source.config.ts` |
| Waku / Vite plugins | `waku.config.ts` |
| Generated MDX loader | `.source/` (gitignored; run `fumadocs-mdx` or `pnpm run typecheck`) |
| Engine API truth | `packages/blit386/docs/` in this monorepo – never this package |
| How the mirror is built | `scripts/sync-docs-from-engine.mjs` via `pnpm run sync:docs` |
| Script test coverage | `scripts/__tests__/*.test.mjs` (`node --test`, via `pnpm run test`) |
| MCP server | `src/mcp-server.ts`, `public/.well-known/mcp/server-card.json`, `content/mcp-server.mdx` |
| Cloudflare security headers | `public/_headers` |

Four Fumapress `ServerPlugin`s are local to this package rather than upstream: `markdownNegotiationPlugin`
(`src/markdown-negotiation.ts`), `mcpServerPlugin` (`src/mcp-server.ts`), `feedPlugin` (`src/feed.ts`), and the
`blog-post-date` helper (`src/blog-post-date.ts`, which exists because the framework's adapter cannot read a post's
`date` frontmatter). The rest of the chain in `press.config.tsx` is stock: flexsearch, blog, llms, sitemap, takumi OG
images, and link validation.

## What is hand-authored and what is generated

Hand-authored: `content/index.mdx`, `showcase.mdx`, `community.mdx`, `mcp-server.mdx`, the root `content/meta.json`,
`content/blog/**`, and under `content/docs/`: `index.mdx`, `getting-started.mdx`, `faq.mdx`, and the root `meta.json`.

Generated, never hand-edit: every `content/docs/<section>/<topic>.mdx` (flat files, not folder `index.mdx`), the section
`meta.json` files, and `src/data/api-history.generated.json`. The MDX pages carry a "generated" banner in frontmatter;
the section `meta.json` files carry no banner but are generated all the same.

Doc frontmatter: `title` required; `description`, `icon`, `full` optional. Sidebar order comes from an optional
`meta.json` / `meta.yaml` per folder. When hand-authored content links to API reference, use site-absolute paths
(`/docs/api/...`), never GitHub URLs – the published pages live here.

## Documentation mirror

`packages/blit386/docs/*.md` is the single source of truth. `scripts/sync-docs-from-engine.mjs` reads the subset listed
in the engine package's `docs/_sitemap.json` and writes matching MDX into `content/docs/`. **The manifest, not the
script, owns which docs publish, their URL, sidebar order, and subtitle** – the script carries no per-page knowledge, so
adding a page means editing the manifest in `packages/blit386` and re-running the sync, with no change here.

`pnpm run sync:docs` regenerates and formats. `pnpm run sync:docs:check` fails on drift, but it is a **local check only
– nothing in `.github/workflows/` runs it**, so mirror drift is not enforced in CI. Run it yourself after touching
engine docs. The source resolves from `ENGINE_DOCS_DIR` (default `../blit386/docs`, which already resolves correctly to
the sibling `packages/blit386/docs` in this monorepo). `sync:docs:watch` re-syncs on every change alongside
`pnpm run dev`.

What the generator does: drops the source H1 (the title comes from it), drops a lead paragraph duplicating the
description, rewrites intra-doc links to site paths (`/docs/...`) and everything else to absolute GitHub URLs, adds
frontmatter (`title`, `description`, `lastModified` from git, `editUrl` into the engine's GitHub path – both consumed by
`docsPageLayout`), and copies `packages/blit386/docs/_api-history.json` across.

MDX components: the generator passes PascalCase tags through verbatim and is MDX-aware, escaping stray braces in prose
while leaving JSX expression props (`type={{ ... }}`, `items={[ ... ]}`) intact. Any component the engine docs use must
be registered in `press.config.tsx` (`fumadocsMdx({ getMdxComponents })`) or the build breaks – `Callout`,
`Card`/`Cards`, and code blocks come from `defaultMdxComponents`; the rest are added explicitly. `Card href` is a JSX
prop and is **not** link-rewritten, so engine docs must use site-absolute `/docs/...` values.

Contributor-only engine pages (developer-experience-guide, documentation-and-versioning-guide, tooling, voice,
`security/*`, the docs README) are intentionally unmirrored – leaving them out of the manifest keeps them link-only on
GitHub.

The `Since`, `ApiAvailability`, and `PageChangelog` components all read `src/data/api-history.ts`, a typed loader over
the generated JSON. Never add a symbol to that JSON here; fix `packages/blit386` and re-sync.

## Twoslash

`fumadocs-twoslash` renders type-on-hover popups and `// ^?` callouts for blocks tagged ` ```ts twoslash `. Wired in
`source.config.ts`, popup components registered in `press.config.tsx`, CSS from `src/app.css`. `throws: false` means a
block that fails compilation degrades to plain highlighting instead of crashing the build. Correctness is
`packages/blit386`'s job – every twoslash block there must be self-contained or use a `// ---cut---` preamble.

Dev-mode skip (memory constraint): the transformer is gated on `!!process.env.CLOUDFLARE`. `blit386.d.ts` is ~192 KB and
imports WebGPU types; across the several dozen MDX files the TypeScript language service accumulates over 4 GB during
`waku dev` and OOMs. `NODE_ENV` is not a usable signal because `source.config.ts` is evaluated by the fumadocs-mdx Vite
plugin before Vite writes `NODE_ENV=production`. So Twoslash runs whenever `CLOUDFLARE` is truthy – in practice that
means `pnpm run build` (which sets `CLOUDFLARE=1`), or any other command launched with `CLOUDFLARE=1` in the
environment. Popups are absent from a plain `pnpm run dev` – use `pnpm run build && pnpm run start` to preview the real
thing.

## Markdown for Agents

`markdownNegotiationPlugin` serves a canonical doc URL as markdown when the request carries `Accept: text/markdown`
(`Content-Type: text/markdown; charset=utf-8` plus an estimated `x-markdown-tokens` header); browsers still get HTML.
The output matches the `*.md` variants from the llms.txt plugin, whose `autoRedirect` is disabled so we return a direct
200 rather than a 302.

This requires `run_worker_first: true` on the assets config. Cloudflare otherwise serves pre-rendered static HTML before
the Worker runs and matches assets by path alone, ignoring `Accept`, so the Worker would never see canonical doc
requests. With the Worker first, the plugin re-implements assets-first by forwarding non-negotiated requests to the
`ASSETS` binding. Waku regenerates `dist/server/wrangler.json` on every build, so `scripts/patch-wrangler.mjs` injects
`run_worker_first` there; the root `wrangler.jsonc` carries it only for parity. Cloudflare's managed "Markdown for
Agents" feature is not used – it needs Pro+ and only rewrites origin HTML on proxied zones, not Worker-rendered
responses.

## MCP server

A JSON-RPC 2.0 endpoint at `/mcp` (streamable-HTTP, no auth), with two tools: `search_docs` and `get_docs_summary`
(which returns `/llms.txt`). `search_docs` scans loader pages in-process and scores title and description matches above
body matches. It deliberately does **not** build a FlexSearch index in-process – that exceeds the Worker CPU limit
(error 1102), the same reason site search runs in static mode.

## Blog media

Short screen captures are self-hosted, not embedded from a video platform.
`pnpm run encode:video -- <input> --out <dir>` produces the three files `VideoEmbed` expects: `<name>.av1.mp4`,
`<name>.h264.mp4`, and a lossless `<name>.webp` poster. The encoder is tuned for flat pixel art – AV1 `scm=1`
screen-content mode, x264 `-tune animation`, and a crop rather than a scale to reach even dimensions, so nothing is
resampled. Audio is stripped. Both codec levels are pinned so the `codecs=` strings in `src/components/video-embed.tsx`
stay exact; `scripts/__tests__/encode-video.test.mjs` guards that and the file-suffix contract.

Output goes under `public/media/<section>/<version>/`. The `/media/` prefix is deliberate: `public/_headers` serves
`/media/*` with a one-year immutable `Cache-Control`, and a `/blog/*` rule would also have matched the post HTML routes.
The version path segment is the cache key – re-encoding means a new directory, never a new file in the same one. Raw
`.mov` sources stay local (`captures/` is gitignored) and this package has no Git LFS.

Three `_headers` entries exist for this and must not be tightened back: `media-src 'self'` in the CSP (it was `'none'`,
which blocks all playback), plus `autoplay=(self)` and `fullscreen=(self)` in `Permissions-Policy`. Clips autoplay muted
and loop, but `controls` is always rendered – a loop over five seconds needs a pause affordance (WCAG 2.2.2). An inline
script beside the element cancels autoplay under `prefers-reduced-motion: reduce`, since CSS cannot and a client
component could only act after hydration.

Keep clips short; treat a few megabytes as the ceiling. A direct `ASSETS`-binding response does **not** honor Range
requests – verified against both `pnpm run start` and production, where a `Range:` GET returns `200` with the full body
and no `Accept-Ranges`. That follows from `run_worker_first: true`: the Worker forwards to the `ASSETS` binding, and
that response carries no range support. Once Cloudflare's edge cache holds the object, though, a cache hit may still be
served as `206 Partial Content` for a Range request – that is normal edge-cache behavior independent of what the origin
supports, and not something this package controls. A viewer therefore cannot reliably seek past what has buffered on a
cache miss – a non-issue for a 20-second autoplay loop, a real one for a multi-minute clip. `-movflags +faststart` is
what keeps playback starting early regardless. Cloudflare's per-file static-asset limit is 25 MiB.

## Deploy

`pnpm run build` produces `dist/public/` and `dist/server/`; `pnpm run deploy` runs
`wrangler deploy --config dist/server/wrangler.json --name blit386`. CI deploys on push to `main` using
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

The Worker is named `blit386` (custom domain `blit386.dev`). The root `wrangler.jsonc` still says
`"name": "blit386-dev-fumapress"`, but that value never reaches Cloudflare – both deploy paths pass `--name blit386`
explicitly. The root config exists for parity (notably `run_worker_first`); the config actually deployed is
`dist/server/wrangler.json`, regenerated by Waku on every build and then patched by `scripts/patch-wrangler.mjs`.
