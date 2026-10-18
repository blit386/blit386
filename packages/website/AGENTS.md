# blit386-website (docs site) - agent entry point

Documentation site for [blit386.dev](https://blit386.dev): Fumapress on Waku (React 19 RSC), MDX via Fumadocs MDX,
Tailwind v4, TypeScript strict, deployed to Cloudflare Workers with Wrangler.

[`CLAUDE.md`](CLAUDE.md) is the canonical policy document for this package - read it before non-trivial work. It covers
the documentation mirror, the Content-Security-Policy and its nonce, the docs MCP server, the Twoslash gate, the test
runners, and the deploy and size limits. Shared monorepo conventions live in the repo root
[`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md). This file only restates what an agent must not get
wrong before opening `CLAUDE.md`.

## Quick start

```bash
pnpm install                                   # from the repo root
pnpm --filter blit386-website run dev          # or: cd packages/website && pnpm run dev
pnpm --filter blit386-website run preflight    # format:check, typecheck, test, spellcheck, knip, check:well-known-schemas, sync:docs:check
```

Use `pnpm run <script>` (not bare `pnpm <script>`) so the RTK hook can rewrite shell commands, with one exception: run
lint as `RTK_DISABLED=1 pnpm run lint`, because the hook turns it into a failing `eslint` call (this package uses
Biome).

## Rules that matter most

- Never hand-edit the generated mirror under `content/docs/{api,guides,performance,reference}/`,
  `content/docs/build-a-game/`, or `src/data/api-history.generated.json`. Edit the canonical source in
  `packages/blit386/docs/` (or `packages/kit/content/` for Build a Game) and run `pnpm run sync:docs`, after committing
  the source edit - the mirror's `lastModified` comes from git.
- No MDX comments. Prettier formats `.mdx` with the Markdown parser, so remark reads `{/* ... */}` as emphasis and
  rewrites it to `{/_ ... _/}`, which renders as visible italic text on the page.
- Documentation ships with the change - update `content/` and run `pnpm run docs:links` from the repo root when adding
  links.
- `public/_headers` holds a hand-written copy of the CSP in `src/csp.ts`; change `src/csp.ts` first and copy the line
  across (`src/csp.test.ts` fails if they differ).
