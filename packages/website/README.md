# blit386.dev Documentation Site

Source for [blit386.dev](https://blit386.dev) – the public documentation site for the
[BLIT386](https://github.com/blit386/blit386) palette-first WebGPU engine.

Built with [Fumapress](https://press.fumadocs.dev/), [Waku](https://waku.gg/), and [Fumadocs](https://fumadocs.dev/),
styled with [Tailwind CSS](https://tailwindcss.com) v4, written in TypeScript 6 (strict), and deployed to Cloudflare
Workers.

## What the site does

Beyond rendering MDX, the site ships a few things worth knowing about:

- Full engine API reference and guides, generated from `packages/blit386` (see [Content](#content) below).
- Twoslash type-on-hover popups in TypeScript code blocks (on in production builds; `pnpm run dev:twoslash` enables them
  locally, one page at a time – see `CLAUDE.md`, Twoslash).
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
- pnpm 11.20.0 (`corepack enable` recommended)
- This is a package within the `blit386` monorepo; `pnpm install` at the repo root sets up the whole workspace,
  including `packages/blit386` needed to run `sync:docs` – see [Content](#content)

## Development

```bash
pnpm install
pnpm run dev
```

Open the URL printed by Waku (typically `http://localhost:3000`).

## Quality checks

```bash
pnpm run preflight   # format:check, typecheck, test, spellcheck, knip, build, sync:docs:check
```

`test` runs two suites: `test:scripts` (`node --test` over `scripts/**`) and `test:unit` (Vitest over `src/**`, the
Worker plugins), the second with coverage thresholds. Run either alone, or `pnpm run test:unit:watch` while working on
`src/`.

`sync:docs:check` runs last because it regenerates `content/docs` in the working tree – see [Content](#content). After
re-syncing, stage or commit the result before re-running: the check diffs the working tree against the index. Markdown
link checking is not part of this gate: `docs:links` is a root-only script (it enumerates every tracked `*.md` / `*.mdx`
via `git ls-files` regardless of the directory it runs in), so run `pnpm run docs:links` from the repo root. CI runs it
once in the `quality-root` job.

## Production build and deploy

```bash
pnpm run build
pnpm run deploy      # requires wrangler login or CI secrets
```

CI builds with `CLOUDFLARE=1`. A release tag push (`x.y.z`) or manual `workflow_dispatch` deploys to the production
Cloudflare Worker named `blit386` (custom domain `blit386.dev`); a plain push to `main` instead deploys to the
`blit386-next` preview Worker (`next.blit386.dev`).

### What the deploy needs

- GitHub repository secrets `CLOUDFLARE_API_TOKEN` (Workers deploy permission) and `CLOUDFLARE_ACCOUNT_ID`, consumed by
  the `deploy-website` and `deploy-website-next` jobs in `.github/workflows/deploy.yml`.
- `dist/server/wrangler.json`: the config actually deployed. Waku regenerates it on every build and
  `scripts/patch-wrangler.mjs` (run by `postbuild`) injects `run_worker_first` and `observability.enabled: true` into
  it.
- The root `wrangler.jsonc` is kept for parity and local reference only. Its `"name": "blit386"` value never reaches
  Cloudflare either: both `pnpm run deploy` and CI pass `--name blit386` explicitly, which overrides it.

## Content

Documentation lives in `content/` as MDX files. The public API, guide, performance, and reference pages under
`content/docs/` are generated from the canonical engine docs in [`packages/blit386/docs/`](../blit386/docs), which
remains the single source of truth. `scripts/sync-docs-from-engine.mjs` produces the mirror:

```bash
pnpm run sync:docs         # regenerate content/docs from ../blit386/docs
pnpm run sync:docs:check   # regenerate and fail if the mirror drifted
pnpm run sync:docs:watch   # watch packages/blit386/docs and re-sync on every change (run alongside pnpm run dev)
```

The engine docs directory resolves from `ENGINE_DOCS_DIR` and defaults to the sibling package path `../blit386/docs`.
`sync:docs:check` is enforced in two places, both as the last step: `pnpm run preflight` here, and the `quality-website`
job in `.github/workflows/ci.yml`. It goes last because it regenerates `content/docs` in the working tree, so any check
that ran after it would be reading regenerated rather than committed content.

Never hand-edit a generated page – edit the engine source and re-run `sync:docs`. The same applies to
`src/data/api-history.generated.json`, which the script copies from `packages/blit386`. See `CLAUDE.md` (Documentation
mirror) for the conventions. For interactive examples, visit [demos.blit386.dev](https://demos.blit386.dev).

Coverage: which docs publish, and their sidebar order, are defined by `packages/blit386/docs/_sitemap.json` – not by
this package's script. Links to engine docs not in the manifest resolve to their GitHub source instead of a site path,
so the mirror never emits a dead `/docs/...` route; each upgrades to a site link automatically once the doc is added.
Expanding coverage means adding an entry to that manifest (in `packages/blit386`) and re-running `pnpm run sync:docs`;
no change to this package's script is needed.

Contributor-only engine docs are intentionally left out of the manifest and stay on GitHub in
[`packages/blit386/docs/`](https://github.com/blit386/blit386/tree/main/packages/blit386/docs):
`developer-experience-guide.md`, `documentation-and-versioning-guide.md`, `tooling.md`, `voice.md`,
`security/security-runbook.md`, `security/dependency-policy.md`, `security/audit-exceptions.md`, and the docs
`README.md`.

## Commit conventions

Commits must be signed off under the Developer Certificate of Origin (`git commit -s`); `.github/workflows/dco.yml`
enforces it on every pull request. Commit messages follow Conventional Commits.

## Credits

- [Departure Mono](https://departuremono.com) by Helena Zhang – font used for headings and UI chrome throughout the
  site, licensed under the [SIL Open Font License](public/fonts/DepartureMono-LICENSE.txt)

## Agent policy

See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for project and agent conventions.
