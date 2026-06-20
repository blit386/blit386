---
name: fp-preflight
description:
  Run all quality checks (format, lint, typecheck, spellcheck, knip, docs:links, build) before committing or pushing.
  Use when the user wants to verify the docs site is ready to commit.
---

# Preflight Checks

Run comprehensive quality checks before committing or pushing.

## Usage

```text
/fp-preflight
```

## Prerequisites

- Node.js >= 22.18.0
- pnpm 10.26.2+

## Steps

1. Run `pnpm run preflight`:
   - `format:check` — Biome + Prettier
   - `lint` — Biome
   - `typecheck` — fumadocs-mdx + tsc
   - `spellcheck` — cspell on content and src
   - `knip` — unused exports/deps
   - `docs:links` — Markdown link checker
   - `build` — CLOUDFLARE=1 waku build

2. Report results; suggest `pnpm run format`, `pnpm lint:fix`, or cspell dictionary updates on failure.
