# blit386.dev Documentation Site

Source for [blit386.dev](https://blit386.dev) — the public documentation site for the
[BLIT386](https://github.com/blit386/blit386) palette-first WebGPU engine.

Built with [Fumapress](https://press.fumadocs.dev/), [Waku](https://waku.gg/), and [Fumadocs](https://fumadocs.dev/).

## Prerequisites

- Node.js >= 22.18.0
- pnpm 10.26.2 (`corepack enable` recommended)

## Development

```bash
pnpm install
pnpm run dev
```

Open the URL printed by Waku (typically `http://localhost:3000`).

## Quality checks

```bash
pnpm run preflight   # format, lint, typecheck, spellcheck, knip, links, build
```

## Production build and deploy

```bash
pnpm run build
pnpm run deploy      # requires wrangler login or CI secrets
```

Deploys to Cloudflare Workers project `blit386` (`blit386.dev`).

### First-time deploy setup

1. Create GitHub repo `blit386/blit386-dev-fumapress` and push this project
2. In Cloudflare dashboard: create Workers project **`blit386`**, map custom domain **`blit386.dev`**
3. Add GitHub repository secrets (same account as demos):
   - `CLOUDFLARE_API_TOKEN` — Workers deploy permission
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main` — CI builds with `CLOUDFLARE=1` and deploys via Wrangler

Local deploy (after `pnpm run build`):

```bash
pnpm run deploy   # wrangler deploy --config dist/server/wrangler.json --name blit386
```

## Content

Documentation lives in `content/` as MDX files. The public API and guide pages under `content/docs/**` are **generated**
from the canonical engine docs in the [blit386 repository](https://github.com/blit386/blit386) (`docs/`), which remains
the single source of truth. `scripts/sync-docs-from-engine.mjs` produces the mirror:

```bash
pnpm run sync:docs         # regenerate content/docs from ../blit386/docs
pnpm run sync:docs:check   # regenerate and fail if the mirror drifted (CI)
```

Never hand-edit a generated page — edit the engine source and re-run `sync:docs`. See
[`DOCUMENTATION_MIGRATION.md`](DOCUMENTATION_MIGRATION.md) for the full plan and source-to-URL map, and `CLAUDE.md`
(Documentation mirror) for the conventions. Contributor-only docs (developer experience guide, voice, tooling, security
runbook) are not mirrored and stay on GitHub in the [engine repo](https://github.com/blit386/blit386/tree/main/docs).
For interactive examples, visit [demos.blit386.dev](https://demos.blit386.dev).

**Coverage:** which docs publish, and their sidebar order, are defined by the engine repo's `blit386/docs/_sitemap.json`
manifest — not by this repo's script. Links to engine docs not in the manifest resolve to their GitHub source instead of
a site path, so the mirror never emits a dead `/docs/...` route; each upgrades to a site link automatically once the doc
is added. Expanding coverage means adding an entry to that manifest (in the engine repo) and re-running `sync:docs`; no
change to this repo's script is needed.

## Agent policy

See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for contributor and agent conventions.
