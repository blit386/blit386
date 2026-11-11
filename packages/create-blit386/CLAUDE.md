# create-blit386

`pnpm create blit386@latest` - the BLIT386 game scaffolder CLI and templates. Depends on `@blit386/kit` for
generated-game content and the `blit` CLI; this package, the kit, and the `blit386` engine release in lockstep (one
shared `x.y.z`, anchored to the engine's semver) - see [`packages/kit/CLAUDE.md`](../kit/CLAUDE.md) for the kit's own
detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) - read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter create-blit386 run <script>` from the repo root).

## Scaffold flow

1. User runs `pnpm create blit386@latest` (or `npm create blit386@latest`).
2. The CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistants
   (multi-select: none, or any mix of Claude / Cursor / Antigravity / Codex / GitHub Copilot / Gemini CLI / OpenCode /
   Zed), optional CI.
3. Templates from `templates/` (`base/` plus the chosen language layer) are rendered with `{{placeholders}}`.
4. The chosen assistants' config comes from one kit call, `generateAgentFiles(kit, vars, agents)` from
   `@blit386/kit/adapters`; the scaffolder writes the returned `{ path, content }` pairs and never branches on an agent
   name. What each assistant gets: the table in [`packages/kit/README.md`](../kit/README.md#what-each-assistant-gets);
   how the adapters work: [`packages/kit/CLAUDE.md`](../kit/CLAUDE.md).
5. Kit content comes from `resolveKitRoot(import.meta.url)` (`@blit386/kit/adapters`) - the kit npm installed beside
   this package - and never from the kit's own `kitRoot()`, which answers "the kit containing me" and is the `blit`
   CLI's question, not the scaffolder's. That same resolved root supplies the `^x.y.z` pinned into every generated
   `package.json` and the exact version stamped into `.blit/manifest.json`. Full reasoning: `packages/kit/CLAUDE.md`.
   Generated `package.json` also gets a Corepack `packageManager` field (`name@version`) from the invoking manager's
   user agent (`packageManagerField` in `src/pkgManager.ts`). The version is the full exact semver, including a
   prerelease or build suffix. Scaffolding stops if that agent string has no exact version, so Corepack cannot auto-add
   a different pin on the first install. Bun scaffolds omit the field: Corepack accepts only npm, pnpm, and yarn.
   `AGENTS.md` and `docs/` are then emitted **verbatim**: `scaffold()` writes the `GeneratedFile` values that
   `agentsFile()` and `collectDocs()` return, with no `{{placeholder}}` substitution. Only templates, rules, and skills
   pass through `render()`. Prose in `AGENTS.md` and `docs/` must therefore spell out both language cases
   ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path, class, kit version, sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits. The `class` values come from `classifyFile()` in `@blit386/kit/adapters` - the same
   function `blit agents sync` / `add` use, not a local table. The manifest's own shape is `BlitManifest` from
   `@blit386/kit/adapters` as well - this package declares no local copy, so a field it stops emitting is a compile
   error rather than a manifest the kit silently reads as legacy.
7. Dependency install, then optional git init on a `main` branch (so the first commit carries the lockfile the optional
   CI workflow needs; a commit that fails, for example with no git identity, prints the `git config` hint), then
   next-steps output.

`blit agents sync` / `blit agents add` (the `blit` CLI, shipped by `packages/kit`) reuse the same generators in memory
rather than re-scaffolding to disk. Template layout and the rename rules (`gitignore` to `.gitignore`, `.tmpl` stripped)
are in [`.claude/rules/template-structure.md`](.claude/rules/template-structure.md).

## Critical rules

1. JavaScript by default in scaffolds - generated games are plain JS unless the user picks TypeScript (`--ts`)
2. Beginner-friendly - scaffold output assumes no prior coding experience
3. Integer coordinates - generated games use `Vector2i` / `Rect2i` via blit386
4. Use the `BT` namespace in generated game code, never `BTAPI`
5. Named exports only in this package's own TypeScript; no default exports
6. Literals that describe another package are derived or documented, never copied - `BLIT386_RANGE` in `src/scaffold.ts`
   is written by `scripts/bump-lockstep.mjs` (repo root) alongside `packages/kit`'s `blit386.engineRange`, verified by
   `pnpm run bump:check`, and `PUBLISHING.md` records the coupling. File classes and the generated-project paths
   (`CLAUDE.md`, `.claude/`, `.cursor/`, `docs/`) are not re-typed here at all - they are imported from
   `@blit386/kit/adapters`, as is the kit-root resolution itself (`resolveKitRoot`, not a local `createRequire` copy).
   Shared policy: root `.claude/rules/named-constants.md`

## Git scopes

Conventional Commits and DCO sign-off are root-level policy (see root `CLAUDE.md`). This package's scopes, by frequency
(`git log --format=%s -- packages/create-blit386`): `kit`, `create-blit386`, `repo`, `release`, `scaffold`, `deps`.
Prefer `create-blit386` for the CLI and templates; `release` is for lockstep version bumps.

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the scaffolder generate? | `src/scaffold.ts`, `templates/` |
| Template layout and rename rules | `.claude/rules/template-structure.md` |
| Starter game vs the empty skeleton `blit clean` writes | `templates/{js,ts}/src/game.*` (Catcher, with `testState()`) vs `packages/kit/content/templates/game.{js,ts}` - two files by design, see `.claude/rules/template-structure.md` |
| Optional CI workflow and why it has no pnpm pin | `templates/optional/ci/github/workflows/ci.yml` (Corepack + `packageManager`), `.claude/rules/template-structure.md` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the `blit` CLI do, and how are agent files generated? | `packages/kit/CLAUDE.md` |
| Which generated files the kit owns (sync classes) | `packages/kit/src/ownership.ts`, imported via `@blit386/kit/adapters` |
| How the scaffolder finds the installed kit, and the pin it writes | `resolveKitRoot` from `@blit386/kit/adapters`; the two resolution semantics are documented in `packages/kit/src/kit-root.ts` |
| Publishing / release | `PUBLISHING.md`, `/release`, `pnpm run bump -- 1.5.0` from the repo root (replace `1.5.0` with the target version) |
| Hot-reload delivery decision | `CREATE_BLIT386_DESIGN.md` (Hot reload section) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Lockstep version / range drift check | `pnpm run bump:check` (root `scripts/bump-lockstep.mjs --check`) |
| Contributing / DCO | root `CONTRIBUTING.md` |
