# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/preflight <package>
```

Where `<package>` is one of `blit386`, `demos`, `website`, `kit`, `create-blit386`, or `root`.

## Prerequisites

- Node.js >= 22.18.0 (`engines` in the root `package.json`)
- pnpm 12.18.0 (`packageManager` in the root `package.json`)

## format:check, docs:links, agents:check, sync:cursor-commands:check, and sync:maintainer-agents:check are root-only

They walk the whole repo whichever `package.json` invokes them, so no package `preflight` chain runs them (and neither
does `audit:modules:check`, `spellcheck:kit` or `test:root`); `format:check` left the blit386, demos and website chains
for the same reason in BT-783. Run them directly or via `/preflight root`. `.husky/pre-push` runs them once, after the
package preflights pass (see `/preflight root` below); in CI, `quality-root` has no `needs` and runs regardless.

## Steps

1. Run the package's preflight gate (see the per-package breakdown below)
2. Report results - if all checks pass, confirm the package is ready for commit; if any check fails, report specific
   failures with file locations
3. Suggest fixes - formatting: `/format <package>`; lint errors: the package's `lint:fix`; type errors: review the
   TypeScript diagnostics; spelling: add words to `cspell.json` or fix typos; dead links: `pnpm run docs:links`; unused
   exports: remove dead code or extend the relevant `knip.json` workspace entry

## packages/blit386

`cd packages/blit386 && pnpm run preflight`, or `pnpm --filter blit386 run preflight`. Runs:

- `lint` - ESLint
- `typecheck` - TypeScript strict
- `spellcheck` - cspell over `src/**/*.{ts,md,mdx}`, `docs/**/*.{md,mdx}`, `README.md`
- `knip` - unused exports and dependencies
- `sync:doc-banners:check` - blit386.dev banner freshness on every published doc
- `api:since:check` - every public export carries an `@since` tag
- `api:history:check` - `docs/_api-history.json` matches the source version tags
- `api:getters:check` - every public `BT.*` getter is listed under "Prefer getters" and every method under "Keep as
  methods" in `.claude/rules/bt-api-getters.md`, and neither list names a removed member
- `api:deprecations:check` - `docs/reference-deprecations.md` matches the kit's migration registry
  (`scripts/gen-deprecations.mjs --check`)
- `system-font:check` - `src/assets/fonts/systemFontData.ts` matches `assets/system-font.png` and the extra-chars list
  (`scripts/convert-system-font.mjs --check`)
- `splash-logo:check` - `src/splash/logoData.ts` matches `assets/splash-logo.png`, compared as parsed rows, not bytes
  (`scripts/convert-splash-logo.mjs --check`)
- `test:unit`, `test:declarations`, `test:agent-config`, `test:api-history`, `test:api-getters`,
  `test:api-deprecations`, `test:bench-compare`, `test:check-bench-coverage`, `test:compact-tables`, `test:bmfont`,
  `test:system-font`, `test:splash-logo`, `test:spellcheck-coverage`, `test:security-preflight`

## packages/demos

`cd packages/demos && pnpm run preflight`, or `pnpm --filter blit386-demos run preflight`. Runs:

- `lint` - ESLint
- `test` - `node --test` over `scripts/__tests__`, `plugins/__tests__`, `src/shared/__tests__`, and `_shots/__tests__`
  (pure helpers, the shared UI kit, and the `/shots` page - not demo content); builds `packages/blit386/dist/` first via
  `../../scripts/ensure-engine-built.mjs` when it is missing or stale
- `spellcheck` - cspell over `src/**/*.{js,md,mdx}`, `docs/**/*.{md,mdx}`, `plugins/**`, `scripts/**`, `_partials/**`,
  `_shots/**`, the root-level `*.{md,mdx}`, `CLAUDE.md`, and `AGENTS.md`
- `knip` - unused exports and dependencies
- `check:demo-registry` - `DEMO_ORDER` / `VINTAGE_URLS` / `RETIRED_SLUGS` / `src/*.js` consistency
- `check:demo-comment-links` - no `vancura.dev` links in `src/*.js` header comments, and every `blit386.dev/docs/...` /
  `demos.blit386.dev/<slug>` link there resolves against `_sitemap.json` / `DEMO_ORDER`, including a docs link's
  `#fragment` against the page's heading ids (`scripts/lib/heading-anchors.mjs`)

The production build is not part of `preflight` - CI's `build-demos` job gates it. Run `pnpm run build` by hand to check
it locally.

No unit tests for demo _content_ (`src/*.js`) by design - see `/test demos`.

## packages/website

`cd packages/website && pnpm run preflight`, or `pnpm --filter blit386-website run preflight`. Runs:

- `typecheck` - fumadocs-mdx + tsc
- `test` - `test:scripts` (`node --test scripts/__tests__/*.test.mjs`) then `test:unit:coverage` (Vitest over
  `src/**/*.test.ts`, the Worker plugins); builds the engine first via `../../scripts/ensure-engine-built.mjs`
- `spellcheck` - cspell over `content/**/*.{md,mdx}`, `src/**/*.{ts,tsx}`, the package's root `*.{md,mdx}`, and
  `CLAUDE.md`
- `knip` - unused exports/deps
- `check:well-known-schemas` - every agent-facing `.well-known` file (agent-skills index, MCP server card, api-catalog
  linkset, OAuth discovery documents) has the shape its spec requires
- `sync:docs:check` - regenerates `content/docs` from `packages/blit386/docs/` and fails when the mirror drifted

Not in `preflight` (CI's `build-website` job runs them, in this order): `build` (`CLOUDFLARE=1 waku build`),
`check:deploy-size` (fails when any `dist/public` file exceeds Cloudflare's 25 MiB per-asset limit or the Worker upload
exceeds its 51 MiB budget), and `check:well-known-urls`. Run them by hand for a change that touches the build output.

`sync:docs:check` is deliberately last: it rewrites `content/docs` in the working tree, so any gate after it would be
reading regenerated rather than committed content. The `quality-website` CI job places it last for the same reason
(after its `wait-all:` join). If it fails, run `pnpm run sync:docs`, then **stage or commit** the result - the check
diffs the working tree against the index, so an unstaged regeneration still reads as drift. On a push, where everything
is committed, this never comes up.

That job does not lint this package - its `lint` is `biome check .`, which the repo-wide `pnpm run format:check` in
`quality-root` and the pre-push root pass already cover.

No MCP security preflight here (unlike `blit386` - see `/security-run`).

Preflight runs under `.husky/pre-push`, which git invokes with `GIT_DIR` exported. It outranks both `cwd` and `-C`, so
any git subprocess a preflight step spawns for some other directory silently acts on the repo being pushed from instead
\- `git init` in a fixture repo then writes `bare = true` into the shared `.git/config` and breaks git in every
checkout. The hook clears git's `--local-env-vars` before dispatching, and every git call a script spawns, in any
package, must pass `env: gitEnv()` ([`scripts/lib/git-env.mjs`](../../scripts/lib/git-env.mjs)). Guarded by
`scripts/lib/git-env.test.mjs`.

## packages/kit and packages/create-blit386

`pnpm --filter @blit386/kit run preflight` runs `typecheck` (the CLI and `content/hooks`), `knip`, and `test` (whose
`pretest` builds the kit first). `pnpm --filter create-blit386 run preflight` runs `typecheck`, `knip`, builds the kit
(the scaffolder's tests import its `dist/`), builds the scaffolder, then runs `test`. These mirror the `quality-kit` /
`build-test-kit` and `quality-scaffolder` / `build-test-scaffolder` CI jobs.

Neither package defines `format:check`, `spellcheck`, or `docs:links`; the root pass covers them (`format:check`,
`spellcheck:kit`, `docs:links`, `agents:check`, `bump:check` for the lockstep versions and the derived `engineRange` /
`BLIT386_RANGE` pair).

See `/test kit` (or `create-blit386`) for the full suite breakdown and `/kit-audit` for the drift checklist that a
preflight run does not cover.

## root

Files outside every package (root `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.husky/`, root `scripts/*.mjs`, root configs).
No combined `preflight` script exists at root; run what does:

- `pnpm run format:check` - Biome + Prettier across the whole tree
- `pnpm run docs:links` - Markdown link checker
- `pnpm run agents:check` - skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings, root
  `.mcp.json` (declared server, URL parity with the website discovery card, `.gitignore` negation), cursor rules parity,
  cursor `.mcp.json`, and the maintainer dogfood configs for Antigravity/Codex/Gemini/Copilot/OpenCode
- `pnpm run sync:cursor-commands:check` - checks `.cursor/commands/*.md` for drift against `.claude/skills/*/SKILL.md`
- `pnpm run sync:maintainer-agents:check` - checks Antigravity/Codex/Gemini/Copilot/OpenCode dogfood files for byte
  drift against the kit adapters (`scripts/sync-maintainer-agents.mjs`)
- `pnpm run bump:check` - lockstep drift: re-derives every version and caret range from `packages/blit386/package.json`
  and fails when a checked-in value differs
- `pnpm run spellcheck:kit` - cspell over `packages/kit`, `packages/create-blit386`, and `.claude/skills`, which have no
  package spellcheck of their own
- `pnpm run test:root` - every root `scripts/**/*.test.mjs` suite (the checkers above, the sync scripts, the build
  locks, `bump-lockstep`, spellcheck coverage). `quality-root` in CI runs the same script

`.husky/pre-push` dispatches each changed package's own `preflight` script: it diffs the base ref against the pushed
tip, maps each changed path under `packages/*` to its package directory, and runs
`pnpm --filter "...{dir}" --if-present run preflight` once per directory (that package plus its dependents) - committed
changes only, so uncommitted files never widen the scope. Pushing more than one ref at once (`git push origin a b`) has
no single diff range to scope by, so that case - and a push whose base ref cannot be resolved at all - falls back to
running every package's preflight instead of only the changed ones, which can block the push on an unrelated package.
Only if the dispatch succeeds does the hook then run these root-level checks unconditionally on every push, since the
per-package dispatch only looks at files under `packages/*` and would otherwise miss a root-only change entirely.
`bump:check` (BT-317) also runs in `quality-root` in `.github/workflows/ci.yml`, so a lockstep drift fails both the push
and CI, on top of the existing per-commit gates below.

Before any of that, `.husky/pre-push` scans the commits being pushed and rejects a placeholder identity (see
`.husky/check-author.sh`) on either the author or the committer, so a rebase or cherry-pick under a sandbox `user.*`
override is caught too. For a new remote branch the range is `<sha> --not --remotes` (only commits no remote has yet),
not the whole history.
