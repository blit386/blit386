# blit386-dev-fumapress

Documentation website for [BLIT386](https://github.com/blit386/blit386), built with Fumapress, Waku, and Fumadocs.
Deploys to [blit386.dev](https://blit386.dev) via Cloudflare Workers.

## Stack

- [Waku](https://waku.gg/) - React Server Components framework
- [Fumapress](https://press.fumadocs.dev/) - opinionated Fumadocs preset
- [Fumadocs](https://fumadocs.dev/) - documentation framework
- Tailwind CSS, Biome, Prettier, cspell, knip, husky

## Commands

```bash
pnpm run dev            # Dev server (typically http://localhost:3000)
pnpm run build          # Production build (requires CLOUDFLARE=1 for Workers target)
pnpm run deploy         # Deploy to Cloudflare Workers (requires wrangler login or CI secrets)
pnpm run preflight      # format:check + lint + typecheck + spellcheck + knip + docs:links + build
pnpm run format         # Biome + Prettier (write)
pnpm run lint           # Biome check
pnpm run typecheck      # fumadocs-mdx + tsc --noEmit
pnpm run spellcheck     # cspell
pnpm run knip           # Unused exports/deps check
pnpm run docs:links     # Dead-link check (markdown-link-check)
```

## Content

MDX files live in `content/`. Each file maps to a URL path via the Fumapress/Fumadocs routing conventions.

## Code style

- 4-space indent, 120-char line width, single quotes, semicolons, trailing commas
- TypeScript strict mode, no `any`, type-only imports
- No emoji anywhere

## Shared rules

See the workspace-level `CLAUDE.md` one directory up for cross-repo conventions (commits, git workflow, security
checklist, etc.).
