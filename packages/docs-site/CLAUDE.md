# blit386-dev-fumapress

Documentation site for [blit386.dev](https://blit386.dev), built with Fumapress, Waku, and Fumadocs.

## Tech Stack

- Framework: [Fumapress](https://press.fumadocs.dev/) 0.6.x on [Waku](https://waku.gg/) (React 19 RSC)
- Content: MDX via Fumadocs MDX (`content/`)
- Styling: Tailwind CSS v4 + Fumadocs/Fumapress presets
- Language: TypeScript 6 (strict)
- Package manager: pnpm 10.26.2
- Node: >= 22.18.0
- Deploy: Cloudflare Workers (Wrangler) to `blit386.dev`

## Where to Find Information

| Question                  | Where to look                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| How is content organized? | `content/`, optional `meta.json` per folder                                                                          |
| Site and plugin config?   | `press.config.tsx`                                                                                                   |
| MDX collection config?    | `source.config.ts`                                                                                                   |
| Waku / Vite plugins?      | `waku.config.ts`                                                                                                     |
| Global styles?            | `src/app.css`                                                                                                        |
| Generated MDX loader?     | `.source/` (gitignored; run `fumadocs-mdx` or `pnpm run typecheck`)                                                  |
| Engine API truth?         | Canonical source is `blit386/docs/`; public pages are generated into `content/docs/` (see below)                     |
| How is the mirror built?  | `scripts/sync-docs-from-engine.mjs` via `pnpm run sync:docs` (Documentation mirror below)                            |
| CI and deploy?            | `.github/workflows/ci.yml`                                                                                           |
| Script test coverage?     | `scripts/__tests__/*.test.mjs` (`node --test`, run via `pnpm run test`)                                              |
| Agent skills?             | `.claude/skills/` (`fp-*` prefix)                                                                                    |
| MCP server?               | `src/mcp-server.ts`, `public/.well-known/mcp/server-card.json`, `content/mcp-server.mdx`                             |
| Twoslash type-on-hover?   | `source.config.ts` (`defineConfig` with `rehypeCodeOptions`), `press.config.tsx` (`Popup` components), `src/app.css` |

## Architecture

```text
blit386-dev-fumapress/
  content/
    index.mdx                  Landing page (HomeHero, feature Cards, DemoShowcase, CommunityConnect)
    showcase.mdx               Projects built with the engine
    community.mdx              Where to ask, report, and follow
    mcp-server.mdx             MCP setup docs (flat file, served at /mcp-server)
    meta.json                  Root nav order
    blog/                      Blog posts + meta.json (own fumadocs-mdx collection)
    docs/
      index.mdx                Hand-written docs hub (page tables)
      getting-started.mdx      Hand-written
      faq.mdx                  Hand-written
      meta.json                Hand-written sidebar order
      api/ guides/ performance/ reference/
                               GENERATED mirror – flat `<topic>.mdx` files + a section meta.json
  press.config.tsx      Fumapress site config, plugins, MDX adapter, layouts, global <head>
  source.config.ts      Fumadocs MDX collections (docs + blog), Twoslash wiring
  waku.config.ts        Waku Vite plugins (fumapress, fumadocs-mdx, tailwind)
  src/app.css           Tailwind v4 + Fumadocs/Fumapress CSS imports
  src/components/       13 React components (see UI components below) + CSS modules
  src/data/
    site.ts             SITE_NAME (single source of truth for the brand string)
    authors.ts          Blog author metadata
    community.ts        Channel list rendered by CommunityConnect
    demos.ts            Flagship demo entries rendered by DemoShowcase
    api-history.ts      Typed loader over api-history.generated.json
    api-history.generated.json   GENERATED – copied from blit386/docs/_api-history.json (never hand-edit)
  src/feed.ts           Fumapress ServerPlugin – RSS feed at /feed.xml
  src/blog-post-date.ts Reads a post's `date` frontmatter (the framework's adapter cannot, see the file)
  src/mcp-server.ts     Fumapress ServerPlugin – JSON-RPC 2.0 MCP endpoint at /mcp
  src/markdown-negotiation.ts  Fumapress ServerPlugin – Accept: text/markdown content negotiation
  public/_headers       Cloudflare security headers
  public/webmcp.js      WebMCP browser-agent bridge, loaded from GLOBAL_HEAD
  public/demos/         Demo thumbnails (SVG placeholders) used by DemoShowcase
  public/.well-known/   Agent-discovery files (MCP server card, agent skills, api-catalog, auth)
  scripts/              Build/CI helpers (sync-docs-from-engine, watch-engine-docs, patch-wrangler,
                        patch-html-title, check-markdown-links) + __tests__/
  .source/              Generated by fumadocs-mdx (not committed)
  dist/                 Build output (public/ static + server/ worker)
```

Enabled plugins (all nine, chained in `press.config.tsx` `.plugins(...)`, in order):

| Plugin                      | What it does                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `flexsearchPlugin`          | Client-side search (static index – see `mode: 'static'` and the Worker CPU note) |
| `blogPlugin`                | `/blog`, `/blog/tags`, post pages; layouts come from `src/components/blog-*`     |
| `markdownNegotiationPlugin` | Local plugin – `Accept: text/markdown` negotiation (see Markdown for Agents)     |
| `llmsPlugin`                | `/llms.txt` plus `*.md` page variants (`autoRedirect: false`)                    |
| `sitemapPlugin`             | `sitemap.xml` with per-route priority/changefreq                                 |
| `mcpServerPlugin`           | Local plugin – JSON-RPC 2.0 MCP endpoint at `/mcp`                               |
| `feedPlugin`                | Local plugin – RSS 2.0 feed at `/feed.xml`                                       |
| `takumiPlugin`              | Open Graph images (Departure Mono + logo, inline styles only)                    |
| `linkValidationPlugin`      | Fails the build on broken internal links                                         |

Custom Waku pages: optional `src/pages/**/*.{ts,tsx}` (not used in scaffold).

## UI components

`src/components/` (all registered in the `fumadocsMdx({ getMdxComponents })` map in `press.config.tsx`, so MDX can use
them by name):

- Landing and marketing: `HomeHero`, `DemoShowcase` (flagship demo grid from `src/data/demos.ts`), `DemoEmbed` (embeds a
  single hosted demo in an iframe), `CommunityConnect` (channel list from `src/data/community.ts`).
- Version history: `Since` (an inline "since x.y.z" badge), `ApiAvailability` (a per-symbol availability table), and
  `PageChangelog` (what changed on this page, by release). All three read `src/data/api-history.ts`, a typed loader over
  `src/data/api-history.generated.json` – which the sync script copies verbatim from `blit386/docs/_api-history.json`.
  That JSON is generated: never hand-edit it, and never add a symbol to it here. Fix the engine repo and re-sync.
- Blog: `BlogLayout`, `BlogIndexPage`, `BlogPage`, `BlogTagsPage`/`BlogTagPage`, `AuthorByline` (authors from
  `src/data/authors.ts`).
- Chrome: `SidebarLogo`, `SidebarSocials`.

## Blog and feed

`content/blog/**` is a separate fumadocs-mdx collection (`source.config.ts`, `export const blog`) so it never mixes with
the docs collection – note the `files:` include list on `docs`, which exists because negation globs do not work in that
codegen. Posts carry `title`, `description`, `date`, and `author` frontmatter; `content/blog/meta.json` lists the posts.
`blogPlugin` renders the routes and `feedPlugin` (`src/feed.ts`) serves an RSS 2.0 feed at `/feed.xml`, linked from
every page via `<link rel="alternate">` in `GLOBAL_HEAD`.

## Global head

`GLOBAL_HEAD` in `press.config.tsx` injects the favicon, font preloads (self-hosted Departure Mono plus
`fonts.vancura.dev`), Plausible analytics, `public/webmcp.js` (the WebMCP browser-agent bridge), and the RSS
`<link rel="alternate">`. Per-page `<meta>` and JSON-LD are built in `meta.page(...)` in the same file.

## Content Conventions

- Doc files: `content/**/*.mdx` (or `.md`) with required frontmatter `title`; optional `description`, `icon`, `full`
- Sidebar: optional `meta.json` or `meta.yaml` per folder (`title`, `pages`, `root`, `icon`, …)
- Public engine docs under `content/docs/{api,guides,performance,reference}/` are generated from `blit386/docs/` (see
  Documentation mirror); never hand-edit a generated page. Hand-authored content lives outside the generator's output:
  `content/index.mdx`, `content/showcase.mdx`, `content/community.mdx`, `content/mcp-server.mdx`, `content/meta.json`,
  `content/blog/**`, and under `content/docs/`: `index.mdx`, `getting-started.mdx`, `faq.mdx`, and the root `meta.json`.
- No emoji in content, code, commits, or UI strings
- American English spelling in hand-authored content and source (`color`, `optimization`, `canceled`, `centered`, never
  the British equivalents). Exempt: literal third-party or spec-mandated names correctly spelled with a British `s` or
  `c` in their own spec (for example Web Audio's `AnalyserNode`/`createAnalyser`) – do not "fix" those. Generated pages
  under `content/docs/` inherit this from the canonical source in `blit386/docs/` (see blit386
  [CLAUDE.md](https://github.com/blit386/blit386/blob/main/CLAUDE.md), American English spelling) – fix the upstream
  source and re-run `pnpm run sync:docs`, never the mirror directly. Cursor:
  `.cursor/rules/american-english-spelling.mdc` (always applied in this repo).

## Documentation mirror

The public API and guide pages on this site are generated from the canonical engine docs. `blit386/docs/*.md` (engine
repo) is the single source of truth; `scripts/sync-docs-from-engine.mjs` reads the subset listed in the engine repo's
sitemap manifest (`blit386/docs/_sitemap.json`) and writes the matching MDX into `content/docs/`. The manifest – not
this script – owns which docs publish, their URL, sidebar order, and subtitle; the script carries no per-page knowledge.

- Run it: `pnpm run sync:docs` (formats output too). `pnpm run sync:docs:check` regenerates and then fails if
  `content/docs` drifted. It is a LOCAL check only: nothing in `.github/workflows/` runs it today, so mirror drift is
  not currently enforced in CI. Run it yourself after touching engine docs. The engine docs source resolves from
  `ENGINE_DOCS_DIR` (default sibling `../blit386/docs`), so the engine repo must be checked out next to this one.
- Generated, do not hand-edit: every `content/docs/<section>/<topic>.mdx` (flat files, not folder `index.mdx`) plus
  `src/data/api-history.generated.json`. The MDX pages carry a "generated" comment banner in their frontmatter; the
  section `meta.json` files are plain JSON and carry no banner but are generated all the same. To change any of them,
  edit the engine source and re-run `sync:docs`.
- What the generator does: drops the source H1 (title comes from it), drops a lead paragraph that duplicates the
  description, rewrites intra-doc links to site paths (`/docs/...`) and all other links to absolute GitHub URLs, adds
  frontmatter (`title`, `description`, `lastModified` from git, `editUrl` into the engine repo – both consumed by
  `docsPageLayout` in `press.config.tsx`), and copies `blit386/docs/_api-history.json` to
  `src/data/api-history.generated.json` for the version-history components.
- MDX components in engine docs: the engine `.md` sources may use Fumadocs components (`Callout`, `TypeTable`, `Steps`,
  `Tabs`, `Accordions`, `Cards`, `Files`, etc.). The generator passes PascalCase tags through verbatim and is MDX-aware:
  it escapes stray braces in prose but leaves JSX expression props (`type={{ ... }}`, `items={[ ... ]}`) intact inside
  component blocks. Any component the docs use must be registered in `press.config.tsx`
  (`fumadocsMdx({ getMdxComponents })`) – `Callout`, `Card`/`Cards`, and code blocks come from `defaultMdxComponents`;
  the rest are added explicitly there. Registering a new one means importing it from `fumadocs-ui/components/*` and
  adding it to that map. Note `Card href` is a JSX prop and is not link-rewritten, so engine docs must use site-absolute
  `/docs/...` href values.
- Adding a page: add an entry to `pages` in `blit386/docs/_sitemap.json` (the array order is the sidebar order; add the
  section to `sections` if it is new), then run `pnpm run sync:docs`. No change to this repo's script is needed.
  Contributor-only pages (developer experience, voice, tooling, `security/*`) are intentionally not mirrored – just
  leave them out of the manifest and they stay link-only on GitHub.

## Critical Rules

1. Documentation ships with changes – update `content/` and run `pnpm run docs:links` when adding links
2. Public engine docs are generated, not authored here – edit the canonical copy in `blit386/docs/`, then run
   `pnpm run sync:docs`. Never hand-edit a generated page under `content/docs/`. See Documentation mirror.
3. Use pnpm run – `pnpm run preflight`, not bare `pnpm preflight` (RTK hooks)
4. Conventional Commits + DCO – `git commit -s`
5. Cloudflare build – production builds require `CLOUDFLARE=1` (included in `pnpm run build`)

## Commands

```bash
pnpm run dev              # Local dev server
pnpm run build            # Production build (fumadocs-mdx + CLOUDFLARE=1 waku build)
pnpm run postbuild        # Runs automatically after build: patch-wrangler.mjs + patch-html-title.mjs
pnpm run start            # Preview production build via Wrangler (runs Cloudflare Worker locally)
pnpm run typecheck        # Generate MDX types + tsc --noEmit
pnpm run types:check      # Alias for typecheck
pnpm run lint             # Biome check
pnpm run lint:fix         # Biome auto-fix
pnpm run format           # Biome + Prettier
pnpm run format:check     # Verify formatting
pnpm run spellcheck       # cspell on content and src
pnpm run docs:links       # Markdown link checker
pnpm run sync:docs        # Regenerate content/docs from blit386/docs (engine repo)
pnpm run sync:docs:check  # Regenerate and fail if the mirror drifted (local only; not run in CI)
pnpm run sync:docs:watch  # Watch blit386/docs and re-sync on every change (run alongside pnpm run dev)
pnpm run knip             # Unused exports/deps
pnpm run knip:fix         # Unused exports/deps, auto-fix
pnpm run test             # Run scripts/__tests__ (node --test)
pnpm run test:watch       # Run scripts/__tests__ in watch mode
pnpm run security:audit        # pnpm audit, all deps (moderate+)
pnpm run security:audit:prod   # pnpm audit, production deps only (moderate+)
pnpm run preflight        # All quality checks + build (includes test)
pnpm run deploy           # Deploy to Cloudflare (requires build + wrangler auth)
```

## Toolchain

| File types                             | Tool     |
| -------------------------------------- | -------- |
| `.ts`, `.tsx`, `.json`, `.css`         | Biome    |
| `.md`, `.mdx`, `.mdc`, `.yml`, `.yaml` | Prettier |

No ESLint in this repo (Biome-only, like create-blit386).

## Git

- Conventional Commits: `<type>(<scope>): <description>`
- DCO sign-off required: `git commit -s`
- Scopes: `content`, `ci`, `docs`, `deps`, `config`
- `main` is protected – land changes via pull request

## Deploy

1. `pnpm run build` produces `dist/public/` (static) and `dist/server/` (Worker + `wrangler.json`)
2. `pnpm run deploy` runs `wrangler deploy --config dist/server/wrangler.json --name blit386`
3. CI deploys on push to `main` using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets

The Worker is named `blit386` (custom domain `blit386.dev`). The root `wrangler.jsonc` still carries
`"name": "blit386-dev-fumapress"`, but that value never reaches Cloudflare: both the local and the CI deploy pass
`--name blit386` explicitly, which overrides it. The root config exists for parity (notably `run_worker_first`); the
config actually deployed is `dist/server/wrangler.json`, regenerated by Waku on every build and then patched by
`scripts/patch-wrangler.mjs`.

## MCP Server

The site exposes a JSON-RPC 2.0 MCP endpoint at `/mcp` (streamable-HTTP, no auth) via a Fumapress `ServerPlugin` defined
in `src/mcp-server.ts` and registered in `press.config.tsx`.

Two tools:

- `search_docs` – full-text search via an in-process scan of the loader pages. Page title, description, and body text
  (extracted through the `core:get-text` adapter and cached per loader instance) are scored with `countMatches`,
  weighting heading (title + description) matches by `TITLE_WEIGHT` over body matches; results are filtered to a
  positive score, sorted descending, and capped at `MAX_RESULTS`. It deliberately avoids building a FlexSearch index
  in-process, which exceeds the Worker CPU limit (error 1102) – the same reason the site moved search to static mode
- `get_docs_summary` – returns `/llms.txt`

Agent discovery card: `public/.well-known/mcp/server-card.json`. User-facing setup docs: `content/mcp-server.mdx`
(served at `/mcp-server`).

## Markdown for Agents

The site supports `Accept: text/markdown` content negotiation via the `markdownNegotiationPlugin` ServerPlugin
(`src/markdown-negotiation.ts`, registered in `press.config.tsx`). A request to a canonical doc URL (for example
`/docs/getting-started`) with `Accept: text/markdown` returns the page as markdown
(`Content-Type: text/markdown; charset=utf-8`, plus an estimated `x-markdown-tokens` header); browsers without that
header still get HTML. The markdown matches the `*.md` variants generated by the `llms.txt` plugin (whose `autoRedirect`
is disabled so we return a direct 200 rather than a 302).

This requires `run_worker_first: true` on the assets config: Cloudflare serves pre-rendered static HTML before the
Worker runs (and matches assets by path only, ignoring `Accept`), so without it the Worker never sees canonical doc
requests. With the Worker running first, the plugin re-implements assets-first by forwarding non-negotiated requests to
the `ASSETS` binding. The deployed `dist/server/wrangler.json` is regenerated by Waku, so `scripts/patch-wrangler.mjs`
injects `run_worker_first` there (the root `wrangler.jsonc` carries it for parity). Cloudflare's managed "Markdown for
Agents" feature is not used: it needs the Pro+ tier and only rewrites origin HTML on proxied zones, not Worker-rendered
responses.

## Twoslash

The site uses `fumadocs-twoslash` to render type-on-hover popups and `// ^?` inline type callouts in code blocks tagged
` ```ts twoslash `. The transformer is wired in `source.config.ts` (`defineConfig` → `mdxOptions.rehypeCodeOptions`);
the popup UI components (`Popup`, `PopupContent`, `PopupTrigger`) are registered in `press.config.tsx`; the CSS ships
from `src/app.css` (`@import "fumadocs-twoslash/twoslash.css"`).

`throws: false` is set so blocks that fail TypeScript compilation fall back to plain syntax highlighting rather than
crashing the build. The canonical engine docs (`blit386/docs/`) are responsible for Twoslash correctness: every
` ```ts twoslash ` block there must be self-contained or use a `// ---cut---` preamble (see `blit386/CLAUDE.md`,
Twoslash in published docs). After editing engine docs, run `pnpm run sync:docs && pnpm run build` here to verify.

**Dev-mode skip (memory constraint):** The transformer is gated on `!!process.env.CLOUDFLARE` in `source.config.ts`.
`blit386.d.ts` is ~192 KB and imports WebGPU types; across the 35 MDX files in `content/` the TypeScript language
service accumulates over 4 GB during `waku dev` and the process OOMs. `NODE_ENV` is not a reliable signal because
`source.config.ts` is evaluated by the fumadocs-mdx Vite plugin before Vite writes `NODE_ENV=production` into the
process environment. `CLOUDFLARE=1` is set by `cross-env` in the build script, which is deterministic. Twoslash
therefore only runs during `pnpm run build`. Type-on-hover popups are absent in the local dev server – use
`pnpm run build && pnpm run start` to preview the full production build locally (served via Wrangler).

## Working with Claude

- After content or config changes, run `pnpm run preflight` before committing
- Update this file when architecture, scripts, or deploy flow changes
