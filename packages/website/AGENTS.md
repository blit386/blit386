# blit386-website (docs site) – agent quick start

Documentation site for [blit386.dev](https://blit386.dev): Fumapress on Waku (React 19 RSC), MDX via Fumadocs MDX,
Tailwind v4, TypeScript strict, deployed to Cloudflare Workers with Wrangler.

This file is a standalone quick start for tools that read `AGENTS.md` and not `CLAUDE.md`. For the documentation mirror,
Twoslash internals, and the full command routing table, [`CLAUDE.md`](CLAUDE.md) is canonical – read it before
non-trivial work. Shared monorepo conventions live in the repo root [`CLAUDE.md`](../../CLAUDE.md) and
[`AGENTS.md`](../../AGENTS.md).

## Tech stack

TypeScript strict. Biome owns `.ts` / `.tsx` / `.json` / `.css`, Prettier owns `.md` / `.mdx` / YAML – no ESLint here.
Package manager is pnpm 11.20.0; Node >= 22.18.0.

## Quick start

```bash
pnpm install                                   # from the repo root
pnpm --filter blit386-website run dev          # or: cd packages/website && pnpm run dev
pnpm --filter blit386-website run preflight    # format:check, typecheck, test, spellcheck, knip, build, sync:docs:check
```

`test` covers both suites: `node --test` over `scripts/**` and Vitest over `src/**`.

Use `pnpm run <script>` (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands. Production builds need
`CLOUDFLARE=1`, which `pnpm run build` already sets.

## Rules that matter most

- Never hand-edit the generated mirror under `content/docs/{api,guides,performance,reference}/` or
  `src/data/api-history.generated.json`. Edit the canonical source in `packages/blit386/docs/` and run
  `pnpm run sync:docs`.
- No MDX comments. Prettier formats `.mdx` with the Markdown parser, so remark reads `{/* ... */}` as emphasis and
  rewrites it to `{/_ ... _/}`, which renders as visible italic text on the page. Delete the note or make it real prose.
- Twoslash type-on-hover popups are gated on `!!process.env.CLOUDFLARE` (a memory workaround, not a build-mode check),
  so popups are absent from a plain `pnpm run dev` – use `pnpm run build && pnpm run start` to see the real thing.
- Documentation ships with the change – update `content/` and run `pnpm run docs:links` from the repo root when adding
  links.

## What is hand-authored vs. generated

Hand-authored: `content/index.mdx`, `content/blog/**`, and a handful of top-level `content/docs/` pages (`index.mdx`,
`getting-started.mdx`, `faq.mdx`). Everything under `content/docs/<section>/<topic>.mdx` (flat files, not folder
`index.mdx`) is generated from `packages/blit386/docs/` – see the rule above.

## Where to go next

[`CLAUDE.md`](CLAUDE.md) has the full "Where to Find Information" routing table, documentation-mirror mechanics,
Twoslash memory-constraint detail, and blog-media conventions.

Condensed, always-applicable agent rules also live in the root `.claude/rules/*.md`.
