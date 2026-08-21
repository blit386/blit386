---
name: preflight
description:
  Run all quality checks for a package (format, lint, typecheck, spellcheck, knip, tests, build, and package-specific
  gates) before committing or pushing. Use when the user wants to verify code is ready to commit or run every check at
  once. Takes a package argument (blit386, demos, website, kit, create-blit386, or root).
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

## docs:links and agents:check are root-only

`docs:links` and `agents:check` are not package-scoped – each package's copy of the script
(`node ../../scripts/check-markdown-links.mjs`) always walks the whole repo from the root, regardless of which package's
`package.json` invoked it. They used to be listed in every package's `preflight` chain too, which meant
`.husky/pre-push` (per-package preflight dispatch, then the root-level pass) ran the same full-repo check 2–4 times on
one push – most of the "why does push take so long" feeling. They were removed from `packages/{blit386,demos,website}`'s
`preflight` scripts for that reason; run them explicitly (`pnpm run docs:links`, `pnpm run agents:check`) or via
`/preflight root` when checking a package in isolation. The root-level pass only runs when `PREFLIGHT_STATUS` is zero –
a failed package preflight makes `.husky/pre-push` skip `format:check`, `docs:links`, `agents:check`,
`check-dash-typography`, and `bump:check` entirely, so a push only exercises them once the per-package checks are clean.
That gating is local to pre-push: in CI, `quality-root` declares only `needs: changes`, so it runs regardless of whether
the per-package quality jobs pass.

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
- `sync:doc-banners:check` – blit386.dev banner freshness on every published doc
- `api:since:check` – every public export carries an `@since` tag
- `api:history:check` – `docs/_api-history.json` matches the source version tags
- `api:getters:check` – every public `BT.*` getter and method has a mention in `.claude/rules/bt-api-getters.md`
- `test:unit`, `test:declarations`, `test:agent-config`, `test:api-history`, `test:api-getters`, `test:compact-tables`,
  `test:shell-safety`, `test:security-preflight`

## packages/demos

`cd packages/demos && pnpm run preflight`, or `pnpm --filter blit386-demos run preflight`. Runs:

- `format:check` – Biome (JS/JSON/CSS) + Prettier (MD/YAML)
- `lint` – ESLint
- `test` – `node --test scripts/__tests__/*.test.mjs` (pure helper functions in `scripts/*.mjs`, not demo content)
- `spellcheck` – cspell over `src/**/*.{js,md,mdx}`, `docs/**/*.{md,mdx}`, `README.md`
- `knip` – unused exports and dependencies
- `check:demo-registry` – `DEMO_ORDER` / `VINTAGE_URLS` / `RETIRED_SLUGS` / `NAV_HIDDEN_SLUGS` / `src/*.js` consistency
- `check:demo-comment-links` – no `vancura.dev` links in `src/*.js` header comments, and every `blit386.dev/docs/...` /
  `demos.blit386.dev/<slug>` link there resolves against `_sitemap.json` / `DEMO_ORDER`
- `build` – production build succeeds (CI and Cloudflare Pages depend on this)

No unit tests for demo _content_ (`src/*.js`) by design – see `/test demos`.

## packages/website

`cd packages/website && pnpm run preflight`, or `pnpm --filter blit386-website run preflight`. Runs:

- `format:check` – Biome (lint + format) + Prettier
- `typecheck` – fumadocs-mdx + tsc
- `test` – `node --test scripts/__tests__/*.test.mjs`
- `spellcheck` – cspell on `content/` and `src/`
- `knip` – unused exports/deps
- `build` – `CLOUDFLARE=1 waku build`
- `sync:docs:check` – regenerates `content/docs` from `packages/blit386/docs/` and fails when the mirror drifted

`sync:docs:check` is deliberately last: it rewrites `content/docs` in the working tree, so any gate after it would be
reading regenerated rather than committed content. The `quality-website` CI job places it last for the same reason
(after its `wait-all:` join). If it fails, run `pnpm run sync:docs`, then **stage or commit** the result – the check
diffs the working tree against the index, so an unstaged regeneration still reads as drift. On a push, where everything
is committed, this never comes up.

That job does not lint this package – its `lint` is `biome check .`, which the repo-wide `pnpm run format:check` in
`quality-root` already covers. Local `format:check` here still runs Biome, so preflight loses nothing.

No MCP security preflight here (unlike `blit386` – see `/security-run`).

Preflight runs under `.husky/pre-push`, which git invokes with `GIT_DIR` exported. It outranks both `cwd` and `-C`, so
any git subprocess a preflight step spawns for some other directory silently acts on the repo being pushed from instead
– `git init` in a fixture repo then writes `bare = true` into the shared `.git/config` and breaks git in every checkout.
The hook clears git's `--local-env-vars` before dispatching, and every git call in `packages/website/scripts/` must pass
`env: gitEnv()` ([`packages/website/scripts/git-env.mjs`](../../../packages/website/scripts/git-env.mjs)); the same
scrub is inline in `packages/blit386/scripts/gen-api-history.test.mjs`. Guarded by
`packages/website/scripts/__tests__/git-env.test.mjs`.

## packages/kit and packages/create-blit386

Neither package has its own combined `preflight` script post-monorepo-merge (the old `create-blit386-workspace` root
that provided it – `format`, `lint`, `spellcheck`, `knip`, `docs:links`, `agents:check`, and the `test:agent-config` /
`test:bump-lockstep` / `test:compact-tables` / `test:shell-safety` package tests – was retired in BT-404; unifying it is
tracked as follow-up tooling work, not part of this skill). Until that lands, run the checks that do exist for each
package, plus the root-wide ones that already cover both:

- Root-wide, covers both packages: `pnpm run format:check`, `pnpm run docs:links`, `pnpm run agents:check`,
  `pnpm run check-dash-typography`, `pnpm run bump:check` (lockstep versions and the derived `engineRange` /
  `BLIT386_RANGE` pair)
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
- `pnpm run check-dash-typography` – en-dash-only rule (root CLAUDE.md, "Shared conventions") over every tracked
  `.ts`/`.tsx`/`.js`/`.cjs`/`.mjs`/`.md`/`.mdx` file
- `pnpm run bump:check` – lockstep drift: re-derives every version and caret range from `packages/blit386/package.json`
  and fails when a checked-in value differs

`.husky/pre-push` dispatches each changed package's own `preflight` script
(`pnpm --filter "...[ref]" --if-present run preflight`), then – only if that succeeds – runs these five root-level
checks unconditionally on every push, since pnpm's per-package `--filter` dispatch only looks at files under
`packages/*` and would otherwise miss a root-only change entirely. `check-dash-typography` (BT-461) and `bump:check`
(BT-317) also run in `quality-root` in `.github/workflows/ci.yml`, so a repo-wide dash-typography regression or a
lockstep drift fails both the push and CI, on top of the existing per-commit gates below.

The following are not part of that pre-push gate – run them directly when auditing. All four do run in CI, so a
regression they would catch surfaces on the PR rather than at push time:

- `pnpm run test:agent-config` – unit tests for the `agents:check` script itself. Runs in `quality-root` in
  `.github/workflows/ci.yml`, which is gated only on the run not being a label event
- `pnpm run test:dash-typography` – unit tests for `check-dash-typography.mjs`. Also runs in `quality-root`, alongside
  the repo-wide `check-dash-typography` run described above
- `pnpm run test:bump-lockstep` – unit tests for `scripts/bump-lockstep.mjs`, the lockstep version-bump script covering
  `blit386`, `@blit386/kit`, and `create-blit386` (see `/release`). Runs in `build-test-scaffolder`, the one CI job that
  exercises it – and that job is path-filtered, so it only fires when the `scaffolder` or `shared` filter matches
- `pnpm run test:shell-safety` – unit tests for `.claude/hooks/shell-safety.sh`. Runs in `quality-root`, and
  `.claude/**` is in the `shared` path filter (BT-439)
