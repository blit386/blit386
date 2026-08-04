---
name: preflight
description:
  Run all quality checks for a package (format, lint, typecheck, spellcheck, knip, docs:links, tests, build, and
  package-specific gates) before committing or pushing. Use when the user wants to verify code is ready to commit or run
  every check at once. Takes a package argument (blit386, demos, website, kit, create-blit386, or root).
---

# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/preflight <package>
```

Where `<package>` is one of `blit386`, `demos`, `website`, `kit`, `create-blit386`, or `root`.

## Prerequisites

- Node.js >= 22.18.0 (`engines` in the root `package.json`)
- pnpm 11.20.0 (`packageManager` in the root `package.json`)

## Steps

1. Run the package's preflight gate (see the per-package breakdown below)
2. Report results – if all checks pass, confirm the package is ready for commit; if any check fails, report specific
   failures with file locations
3. Suggest fixes – formatting: `/format <package>`; lint errors: the package's `lint:fix`; type errors: review the
   TypeScript diagnostics; spelling: add words to `cspell.json` or fix typos; dead links: `pnpm run docs:links`; unused
   exports: remove dead code or extend the relevant `knip.json` workspace entry

## packages/blit386

`cd packages/blit386 && pnpm run preflight`, or `pnpm --filter blit386 run preflight`. Runs:

- `format:check` – Biome (TS/JS/JSON/CSS) + Prettier (MD/YAML)
- `lint` – ESLint
- `typecheck` – TypeScript strict
- `spellcheck` – cspell over `src/**/*.{ts,md,mdx}`, `docs/**/*.{md,mdx}`, `README.md`
- `knip` – unused exports and dependencies
- `docs:links` – Markdown link checker
- `agents:check` – agent config drift (rules parity, skills symlinks, AGENTS.md <-> CLAUDE.md pointer)
- `sync:doc-banners:check` – blit386.dev banner freshness on every published doc
- `api:since:check` – every public export carries an `@since` tag
- `api:history:check` – `docs/_api-history.json` matches the source version tags
- `test:unit`, `test:declarations`, `test:agent-config`, `test:api-history`, `test:compact-tables`, `test:shell-safety`,
  `test:security-preflight`

## packages/demos

`cd packages/demos && pnpm run preflight`, or `pnpm --filter blit386-demos run preflight`. Runs:

- `format:check` – Biome (JS/JSON/CSS) + Prettier (MD/YAML)
- `lint` – ESLint
- `spellcheck` – cspell over `src/**/*.{js,md,mdx}`, `docs/**/*.{md,mdx}`, `README.md`
- `knip` – unused exports and dependencies
- `docs:links` – Markdown link checker
- `check:demo-registry` – `DEMO_ORDER` / `VINTAGE_URLS` / `RETIRED_SLUGS` / `NAV_HIDDEN_SLUGS` / `src/*.js` consistency
- `build` – production build succeeds (CI and Cloudflare Pages depend on this)

No unit tests here by design – see `/test demos`.

## packages/website

`cd packages/website && pnpm run preflight`, or `pnpm --filter blit386-website run preflight`. Runs:

- `format:check` – Biome + Prettier
- `lint` – Biome
- `typecheck` – fumadocs-mdx + tsc
- `test` – `node --test scripts/__tests__/*.test.mjs`
- `spellcheck` – cspell on `content/` and `src/`
- `knip` – unused exports/deps
- `docs:links` – Markdown link checker
- `build` – `CLOUDFLARE=1 waku build`

No MCP security preflight here (unlike `blit386` – see `/security-run`).

## packages/kit and packages/create-blit386

Neither package has its own combined `preflight` script post-monorepo-merge (the old `create-blit386-workspace` root
that provided it – `format`, `lint`, `spellcheck`, `knip`, `docs:links`, `agents:check`, and the `test:agent-config` /
`test:bump-lockstep` / `test:compact-tables` / `test:shell-safety` package tests – was retired in BT-404; unifying it is
tracked as follow-up tooling work, not part of this skill). Until that lands, run the checks that do exist for each
package, plus the root-wide ones that already cover both:

- Root-wide, covers both packages: `pnpm run format:check`, `pnpm run docs:links`, `pnpm run agents:check`
- Per package: `pnpm --filter @blit386/kit run typecheck` / `pnpm --filter @blit386/kit run test`, and
  `pnpm --filter create-blit386 run typecheck` / `pnpm --filter create-blit386 run test`
- `pnpm run build` inside each package directory when `dist/` is missing or stale (the test suites shell out to built
  artifacts)

See `/test kit` (or `create-blit386`) for the full suite breakdown and `/kit-audit` for the drift checklist that a
preflight run does not cover.

## root

Files outside every package (root `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.husky/`, root `scripts/*.mjs`, root configs).
No combined `preflight` script exists at root; run what does:

- `pnpm run format:check` – Biome + Prettier across the whole tree
- `pnpm run docs:links` – Markdown link checker
- `pnpm run agents:check` – skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings
- `pnpm run test:agent-config` – unit tests for the `agents:check` script itself
- `pnpm run test:bump-lockstep` – unit tests for `scripts/bump-lockstep.mjs`, the lockstep version-bump script covering
  `blit386`, `@blit386/kit`, and `create-blit386` (see `/release`)

This is also what `.husky/pre-push` runs unconditionally on every push, since pnpm's per-package `--filter` dispatch
only looks at files under `packages/*` and would otherwise miss a root-only change entirely.
