# blit386-website (docs site)

Documentation site for [blit386.dev](https://blit386.dev): Fumapress 0.7.x on Waku (React 19 RSC), MDX via Fumadocs MDX,
Tailwind v4, TypeScript strict, deployed to Cloudflare Workers with Wrangler. Biome owns `.ts` / `.tsx` / `.json` /
`.css`, Prettier owns `.md` / `.mdx` / YAML, and there is no ESLint here.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

Scripts are `pnpm run <script>` from this package's directory (or `pnpm --filter blit386-website run <script>` from the
repo root); `package.json` is the list and `pnpm run preflight` is the gating set (it includes the build and, last of
all, the docs-mirror check – see Documentation mirror). Production builds require `CLOUDFLARE=1`, which `pnpm run build`
already sets. Shell commands are rewritten by `rtk hook claude` – prefer `rtk read` / `rtk grep` over native Read/Grep
for exploration.

## Critical Rules

1. Public engine docs are generated, not authored here. Edit the canonical copy in `packages/blit386/docs/`, then run
   `pnpm run sync:docs`. Never hand-edit anything under `content/docs/{api,guides,performance,reference}/` or
   `src/data/api-history.generated.json`
2. Documentation ships with the change – update `content/` and run `pnpm run docs:links` from the repo root when adding
   links. `docs:links` is a root-only script (it enumerates every tracked `*.md` / `*.mdx` file via `git ls-files`
   regardless of cwd); this package no longer carries its own copy
3. No MDX comments. Prettier formats `.mdx` with the Markdown parser, so remark reads `{/* … */}` as emphasis and
   rewrites it to `{/_ … _/}`, which renders as visible italic text on the page. Delete the note or make it real prose
4. Conventional Commits with DCO sign-off (`git commit -s`). Scopes: `content`, `ci`, `docs`, `deps`, `config`. `main`
   is protected – land changes via PR
5. Every `git` subprocess spawned from `scripts/` passes `env: gitEnv()` ([`scripts/git-env.mjs`](scripts/git-env.mjs)).
   These scripts run under `.husky/pre-push`, which exports `GIT_DIR` into every child; it outranks `cwd` and `-C`, so
   an unguarded `git init` in a fixture repo re-initializes the real one and writes `bare = true` into the shared
   `.git/config`, breaking git in the main checkout and every worktree. `scripts/__tests__/git-env.test.mjs` guards it

## Where to Find Information

| Question | Where to look |
| --- | --- |
| Site and plugin config, layouts, global head, MDX component map | `press.config.tsx` |
| MDX collection config, Twoslash wiring | `source.config.ts` |
| Waku / Vite plugins | `waku.config.ts` |
| Generated MDX loader | `.source/` (gitignored; run `fumadocs-mdx` or `pnpm run typecheck`) |
| Engine API truth | `packages/blit386/docs/` in this monorepo – never this package |
| How the mirror is built | `scripts/sync-docs-from-engine.mjs` via `pnpm run sync:docs` |
| How mirror drift is checked | `scripts/check-docs-sync.mjs` via `pnpm run sync:docs:check` (in `preflight` and in CI) |
| Script test coverage | `scripts/__tests__/*.test.mjs` (`node --test`, via `pnpm run test`) |
| Why every git subprocess passes `gitEnv()` | `scripts/git-env.mjs` |
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

`pnpm run sync:docs` regenerates and formats. `pnpm run sync:docs:check` fails on drift and **is enforced both locally
and in CI**: it is the last gate of `pnpm run preflight`, and the last step of the `quality-website` job in
`.github/workflows/ci.yml`, gated on the `website` path filter, which includes `packages/blit386/docs/**`. So editing an
engine doc without re-syncing fails the push and turns the pull request red. It runs last in both places because it
regenerates `content/docs` in the working tree – any gate after it would be reading regenerated rather than committed
content, which is also why CI puts it after the parallel join rather than inside it. The check diffs the working tree
against the index, so after re-syncing you must stage or commit the regenerated mirror before `preflight` goes green –
an unstaged `sync:docs` result still reads as drift. That costs nothing on a push, where everything is committed
already. The source resolves from `ENGINE_DOCS_DIR` (default `../blit386/docs`, which already resolves correctly to the
sibling `packages/blit386/docs` in this monorepo). `sync:docs:watch` re-syncs on every change alongside `pnpm run dev`.

That job checks out with `fetch-depth: 0`. The generator reads each page's `lastModified` with `git log --follow`, to
see past the commit that moved the engine into `packages/blit386/`, and `--follow` finds nothing on a shallow clone.

**`lastModified` is always at most one commit behind, and that is by design, not a mistake to chase.** It comes from
`git log` on the engine source doc, so a sync run before that doc's edit is committed embeds the _previous_ commit's
date. Editing `packages/blit386/docs/…`, committing, then running `pnpm run sync:docs` narrows the window, but cannot
close it: root CLAUDE.md's squash-merge policy collapses a PR's commits into one new commit with a new SHA and author
date on `main`, and that commit does not exist yet when `sync:docs` runs, however carefully source and mirror commits
are ordered within the PR. `pnpm run sync:docs:check` ([`scripts/check-docs-sync.mjs`](scripts/check-docs-sync.mjs))
regenerates the mirror and inspects the diff: a change confined to `lastModified` lines passes – it self-corrects the
next time anything syncs that page – and any other change (title, description, editUrl, body) still fails the build.

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

`blit386` is a `workspace:*` devDependency (BT-414), not a pinned npm version – Twoslash resolves its type declarations
from `packages/blit386/dist`, so a doc can reference and validate unreleased engine API before it ships, and the engine
must be built (`pnpm --filter blit386 run build`) before this package's `build` in every CI/deploy job that runs one.
Because `throws: false` swallows a failing block into plain highlighting rather than an error, a regression here is
silent. `grep -c twoslash-hover "dist/public/docs/<page>/index.html"` after a build (`<page>` is a placeholder, e.g.
`api/random`; keep it quoted or the shell reads `<`/`>` as redirection) is only a page-wide smoke check, not proof a
specific block typechecked – a page with several blocks can show a nonzero count while one block still silently failed
(see BT-427). To confirm one block specifically, grep the built HTML for a distinctive identifier from that block's
source and check whether it renders as a hoverable `twoslash-hover` token instead of plain syntax-highlighted text.

Dev-mode skip (memory constraint): the transformer is gated on `!!process.env.CLOUDFLARE`. `blit386.d.ts` is ~192 KB and
imports WebGPU types; across the several dozen MDX files the TypeScript language service accumulates over 4 GB during
`waku dev` and OOMs. `NODE_ENV` is not a usable signal because `source.config.ts` is evaluated by the fumadocs-mdx Vite
plugin before Vite writes `NODE_ENV=production`. So Twoslash runs whenever `CLOUDFLARE` is truthy – in practice that
means `pnpm run build` (which sets `CLOUDFLARE=1`), or any other command launched with `CLOUDFLARE=1` in the
environment. Popups are absent from a plain `pnpm run dev` – use `pnpm run build && pnpm run start` to preview the real
thing.

## Dependency pins

`fumapress` and `waku` are the only dependencies here pinned to an exact version instead of a caret range. That is
deliberate and must stay: **`fumapress` declares `waku` as an exact-version peer dependency, not a range**, so a caret
on either side lets pnpm resolve a pair the framework does not support.

Every row is an exact pin, not a range – including the prerelease ones, so "beta.8 or newer" is never satisfied by
beta.9. Verified against the registry on 2026-08-08; `npm view fumapress@0.7.3 peerDependencies.waku` is the check –
swap the version to re-verify any other row.

| fumapress | required `waku` peer |
| --- | --- |
| 0.6.2 | `1.0.0-beta.3` |
| 0.6.3 – 0.7.3 | `1.0.0-beta.6` |
| 1.0.0-beta.1 | `1.0.0-beta.8` |
| 1.0.0-beta.2 | `1.0.0-beta.8` |

`1.0.0-beta.1` and `1.0.0-beta.2` are the only 1.0.0 prereleases published so far (there is no `beta.0`); a later beta
may pin a different waku, so re-check rather than assuming the pattern holds.

The current pair is `fumapress@0.7.3` + `waku@1.0.0-beta.6` (BT-455) – the newest peer-correct combination on the 0.x
line. Both packages share one Renovate group for the same reason; do not split them back apart, or Renovate proposes a
fumapress bump and a waku bump as two PRs, neither installable on its own.

**Do not move `waku` past beta.6 while `fumapress` is on 0.7.x.** waku beta.8 is sanctioned only by `fumapress` 1.0.0
beta.1 or beta.2, and nothing published sanctions beta.9 at all. That release is a rewrite rather than a bump: it
renames `ServerPlugin` to `PressPlugin` and `ConfigContext` to `AppShape`, and moves layouts onto the config object. All
four local plugins in `src/` plus every `createDocsLayoutPage` and `createRootLayout` call in `press.config.tsx` would
need reworking.

Two behavioral changes came in with 0.7.x and are already absorbed. Takumi went v1 to v2 (0.7.2), which re-tuned the
WebP encoder – OG cards are roughly 55% smaller with pixel-identical output, so **file size is not a validity signal
across that boundary; check geometry (1200x630) instead**. Base UI replaced Radix (0.7.0), which is why `waku.config.ts`
no longer carries an `optimizeDeps.include` workaround for `use-sync-external-store`: the 0.7.0 Vite plugin auto-detects
those CJS deps, and the twoslash popups are now Base UI triggers.

Revisit trigger: when `fumapress` 1.0.0 goes stable, or when BT-440 lands test coverage over `src/**`, whichever comes
first. Until then a framework bump has no automated safety net, so verify by diffing a real build against a baseline
captured on the old pins – per-page `twoslash-hover` counts, `dist/server/wrangler.json` assertions (`run_worker_first`,
`nodejs_compat`, `vars.BLIT386_CHANNEL`), `/mcp` `tools/list` plus an actual `search_docs` call,
`Accept: text/markdown`, `/feed.xml` item count, and the `next`-channel headers. A green typecheck proves almost nothing
here.

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

Output goes under `public/media/<section>/<post-slug>/` (for example `public/media/blog/hot-reload-release-1-4-0/`). The
`/media/` prefix is deliberate: `public/_headers` serves `/media/*` with a one-year immutable `Cache-Control`, and a
`/blog/*` rule would also have matched the post HTML routes. The post-slug path segment is the cache key – a new post
gets a new directory, never a new file added to an existing one. Raw `.mov` sources stay local (`captures/` is
gitignored) and this package has no Git LFS.

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
`wrangler deploy --config dist/server/wrangler.json --name blit386`. `.github/workflows/deploy.yml` runs two jobs
against this package, both using the org-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, each building
the site itself rather than reusing `ci.yml`'s artifact (a tag-triggered job cannot reuse artifacts from a
push-triggered `ci.yml` run):

- `deploy-website` deploys to the `blit386` Worker (`blit386.dev`) on a release tag push (`x.y.z`, no `v` prefix, no
  prerelease suffix) or a manual `workflow_dispatch`.
- `deploy-website-next` deploys to the `blit386-next` Worker (`next.blit386.dev`) on every push to `main`, no path
  filter. It sets `BLIT386_CHANNEL=next` on the build step, which makes `press.config.tsx` render the unreleased-work
  banner, add `<meta name="robots" content="noindex">`, and point canonical/OG/sitemap URLs at `next.blit386.dev`
  instead of production – all baked into the static HTML once during the build (`process.env.BLIT386_CHANNEL`, Node
  context). `src/channel-headers.ts` sets `X-Robots-Tag: noindex` and serves a disallow-all `robots.txt` the same way,
  but reads `c.env.BLIT386_CHANNEL` at **request time** instead: that module's top level re-runs inside the deployed
  Worker on every cold start (to rebuild the Fumapress plugin list), where `process.env.BLIT386_CHANNEL` is not the CI
  build step's shell value – confirmed locally with `wrangler dev`, where relying on the build-time value silently never
  set the header at all. `scripts/patch-wrangler.mjs` injects `vars.BLIT386_CHANNEL: 'next'` into
  `dist/server/wrangler.json` for exactly this reason.

The Worker is named `blit386` (custom domain `blit386.dev`); the preview Worker is `blit386-next` (custom domain
`next.blit386.dev`). The root `wrangler.jsonc` also declares `"name": "blit386"`, but that value never actually reaches
Cloudflare – both deploy paths pass `--name` explicitly. The root config exists for parity (notably `run_worker_first`);
the config actually deployed is `dist/server/wrangler.json`, regenerated by Waku on every build and then patched by
`scripts/patch-wrangler.mjs`.

Both Workers run with `observability.enabled: true` (BT-441), so Workers Logs captures every invocation – the only way
to see a runtime error on `blit386.dev`'s `/mcp` JSON-RPC endpoint or the markdown-negotiation path without reproducing
it locally. Same injection story as `run_worker_first`: `scripts/patch-wrangler.mjs` sets it on the generated
`dist/server/wrangler.json`, and the root `wrangler.jsonc` carries it only for parity. Query logs via the Cloudflare
dashboard (Workers & Pages -> `blit386` or `blit386-next` -> Logs) or
`pnpm --filter blit386-website exec wrangler tail <worker-name>` – running through the workspace `exec` invokes the
pinned local `wrangler` devDependency rather than whatever a bare `wrangler` on `PATH` resolves to.

All four `cloudflare/wrangler-action` steps in `.github/workflows/deploy.yml` (`deploy-demos`, `deploy-website`,
`deploy-demos-next`, `deploy-website-next`) pin the same `wranglerVersion` and set the same `packageManager: pnpm`, even
though only the two `deploy-website*` jobs strictly need the version pinned – so a deploy always runs the same wrangler
as local `pnpm run deploy` / `pnpm run start`, not whatever `wrangler-action` defaults to. That pin must match this
package's `wrangler` devDependency exactly; a Renovate bump to one without the other silently drifts the two apart.
