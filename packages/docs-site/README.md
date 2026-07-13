# blit386.dev Documentation Site

Source for [blit386.dev](https://blit386.dev) – the public documentation site for the
[BLIT386](https://github.com/blit386/blit386) palette-first WebGPU engine.

Built with [Fumapress](https://press.fumadocs.dev/), [Waku](https://waku.gg/), and [Fumadocs](https://fumadocs.dev/),
styled with [Tailwind CSS](https://tailwindcss.com) v4, written in TypeScript 6 (strict), and deployed to Cloudflare
Workers.

## What the site does

Beyond rendering MDX, the site ships a few things worth knowing about:

- Full engine API reference and guides, generated from the engine repo (see [Content](#content) below).
- Twoslash type-on-hover popups in TypeScript code blocks (production builds only – see `CLAUDE.md`, Twoslash).
- An MCP server at `/mcp` so AI assistants can search the docs; setup instructions live on the site at `/mcp-server`.
- `Accept: text/markdown` content negotiation: any canonical doc URL returns clean markdown to agents that ask for it,
  and `/llms.txt` summarizes the whole site.
- A blog at `/blog` with an RSS feed at `/feed.xml`.
- Showcase and community pages, plus embedded live demos from [demos.blit386.dev](https://demos.blit386.dev).
- Version-history badges on API pages (a "since" badge, an availability table, and a per-page changelog), driven by the
  engine's API history data.
- Client-side search, Open Graph image generation, and a sitemap.

## Prerequisites

- Node.js >= 22.18.0
- pnpm 10.26.2 (`corepack enable` recommended)
- The engine repo checked out as a sibling directory (`../blit386`) if you intend to run `sync:docs` – see
  [Content](#content)

## Development

```bash
pnpm install
pnpm run dev
```

Open the URL printed by Waku (typically `http://localhost:3000`).

## Quality checks

```bash
pnpm run preflight   # format:check, lint, typecheck, test, spellcheck, knip, docs:links, build
```

## Production build and deploy

```bash
pnpm run build
pnpm run deploy      # requires wrangler login or CI secrets
```

CI builds with `CLOUDFLARE=1` and deploys on every push to `main`. Deploys go to the Cloudflare Worker named `blit386`
(custom domain `blit386.dev`).

### What the deploy needs

- GitHub repository secrets `CLOUDFLARE_API_TOKEN` (Workers deploy permission) and `CLOUDFLARE_ACCOUNT_ID`, consumed by
  the `deploy` job in `.github/workflows/ci.yml`.
- `dist/server/wrangler.json`: the config actually deployed. Waku regenerates it on every build and
  `scripts/patch-wrangler.mjs` (run by `postbuild`) injects `run_worker_first` into it.
- The root `wrangler.jsonc` is kept for parity and local reference only. Its `"name": "blit386-dev-fumapress"` is not
  what the Worker is called: both `pnpm run deploy` and CI pass `--name blit386`, which overrides it.

## Content

Documentation lives in `content/` as MDX files. The public API, guide, performance, and reference pages under
`content/docs/` are generated from the canonical engine docs in the
[blit386 repository](https://github.com/blit386/blit386) (`docs/`), which remains the single source of truth.
`scripts/sync-docs-from-engine.mjs` produces the mirror:

```bash
pnpm run sync:docs         # regenerate content/docs from ../blit386/docs
pnpm run sync:docs:check   # regenerate and fail if the mirror drifted
pnpm run sync:docs:watch   # watch blit386/docs and re-sync on every change (run alongside pnpm run dev)
```

The engine docs directory resolves from `ENGINE_DOCS_DIR` and defaults to the sibling `../blit386/docs`.
`sync:docs:check` is a local check: no workflow in `.github/workflows/` runs it today, so mirror drift is not enforced
by CI – run it yourself after changing engine docs.

Never hand-edit a generated page – edit the engine source and re-run `sync:docs`. The same applies to
`src/data/api-history.generated.json`, which the script copies from the engine repo. See `CLAUDE.md` (Documentation
mirror) for the conventions. For interactive examples, visit [demos.blit386.dev](https://demos.blit386.dev).

Coverage: which docs publish, and their sidebar order, are defined by the engine repo's `blit386/docs/_sitemap.json`
manifest – not by this repo's script. Links to engine docs not in the manifest resolve to their GitHub source instead of
a site path, so the mirror never emits a dead `/docs/...` route; each upgrades to a site link automatically once the doc
is added. Expanding coverage means adding an entry to that manifest (in the engine repo) and re-running
`pnpm run sync:docs`; no change to this repo's script is needed.

Contributor-only engine docs are intentionally left out of the manifest and stay on GitHub in the
[engine repo](https://github.com/blit386/blit386/tree/main/docs): `developer-experience-guide.md`,
`documentation-and-versioning-guide.md`, `tooling.md`, `voice.md`, `security/security-runbook.md`,
`security/dependency-policy.md`, `security/audit-exceptions.md`, and the docs `README.md`.

## Commit conventions

Commits must be signed off under the Developer Certificate of Origin (`git commit -s`); `.github/workflows/dco.yml`
enforces it on every pull request. Commit messages follow Conventional Commits.

## Credits

- [Departure Mono](https://departuremono.com) by Helena Zhang – font used for headings and UI chrome throughout the
  site, licensed under the [SIL Open Font License](public/fonts/DepartureMono-LICENSE.txt)

## Agent policy

See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for project and agent conventions.
