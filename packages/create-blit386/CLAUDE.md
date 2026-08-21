# create-blit386

`pnpm create blit386@latest` – the BLIT386 game scaffolder CLI and templates. Depends on `@blit386/kit` for
generated-game content and the `blit` CLI; this package, the kit, and the `blit386` engine release in lockstep (one
shared `x.y.z`, anchored to the engine's semver) – see [`packages/kit/CLAUDE.md`](../kit/CLAUDE.md) for the kit's own
detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter create-blit386 run <script>` from the repo root).

## Scaffold flow

1. User runs `pnpm create blit386@latest` (or `npm create blit386@latest`).
2. The CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistant
   (none / Claude / Cursor), optional CI.
3. Templates from `templates/` (`base/` plus the chosen language layer) are rendered with `{{placeholders}}`.
4. If an AI assistant was chosen, its config is generated from the kit IR (`generateClaudeAdapter` /
   `generateCursorAdapter` in `@blit386/kit/adapters`), rendering `{{placeholders}}` as it goes, and the scaffolder
   writes those `{ path, content }` pairs to disk. Claude gets `CLAUDE.md`, `.claude/rules/` (from `content/rules/`),
   `.claude/skills/<name>/SKILL.md` (from `content/skills/`), `.claude/settings.json` (hooks from
   `content/hooks.manifest.json`), and `.claude/hooks/` (from `content/hooks/`) – including a SessionStart hook
   (`.claude/hooks/session-start.sh`) that installs dependencies and runs `blit doctor` when a fresh remote/web session
   starts. Cursor gets `.cursor/rules/*.mdc`, `.cursor/commands/<name>.md` (the same skills with frontmatter stripped),
   `.cursor/hooks.json`, and `.cursor/hooks/shell-safety.sh` – Cursor has no SessionStart-equivalent event, so it does
   not get the bootstrap hook. Each adapter also emits a documentation-MCP config registering the `blit386-docs` server
   at `https://blit386.dev/mcp`: Claude gets `.mcp.json` and Cursor gets `.cursor/mcp.json`. The two entries differ by
   one key on purpose – Claude Code skips a remote entry that has a `url` but no `type`, while for Cursor a `type` marks
   a local stdio server. Every path an adapter emits is built from `packages/kit/src/ownership.ts`, the single source
   both packages classify against; `content/agents.config.json` is a descriptive summary of the same set, read by no
   code. Within `.claude/hooks/` / `.cursor/hooks/`, which specific scripts land in a given project is decided by
   `content/hooks.manifest.json` – only a script one of that adapter's own hook entries actually references gets copied
   (all under `packages/kit/`).
5. Kit content (`AGENTS.md` + `docs/`) is copied **verbatim** – `copyFileSync` / `cpSync`, so `{{placeholder}}` tokens
   are NOT substituted there. Only templates, rules, and skills pass through `render()`. Prose in `AGENTS.md` and
   `docs/` must therefore spell out both language cases ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path, class, kit version, sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits. The `class` values come from `classifyFile()` in `@blit386/kit/adapters` – the same
   function `blit agents sync` / `add` use, not a local table.
7. Optional git init, dependency install, next-steps output.

`blit agents sync` / `blit agents add` (the `blit` CLI, shipped by `packages/kit`) reuse the same generators in memory
rather than re-scaffolding to disk. Template layout and the rename rules (`gitignore` to `.gitignore`, `.tmpl` stripped)
are in [`.claude/rules/template-structure.md`](.claude/rules/template-structure.md).

## Critical rules

1. JavaScript by default in scaffolds – generated games are plain JS unless the user picks TypeScript (`--ts`)
2. Beginner-friendly – scaffold output assumes no prior coding experience
3. Integer coordinates – generated games use `Vector2i` / `Rect2i` via blit386
4. Use the `BT` namespace in generated game code, never `BTAPI`
5. Named exports only in this package's own TypeScript; no default exports
6. Literals that describe another package are derived or documented, never copied – `BLIT386_RANGE` in `src/scaffold.ts`
   is written by `scripts/bump-lockstep.mjs` (repo root) alongside `packages/kit`'s `blit386.engineRange`, verified by
   `pnpm run bump:check`, and `PUBLISHING.md` records the coupling. File classes and the generated-project paths
   (`CLAUDE.md`, `.claude/`, `.cursor/`, `docs/`) are not re-typed here at all – they are imported from
   `@blit386/kit/adapters`. Shared policy: root `.claude/rules/named-constants.md`

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the scaffolder generate? | `src/scaffold.ts`, `templates/` |
| Template layout and rename rules | `.claude/rules/template-structure.md` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the `blit` CLI do, and how are agent files generated? | `packages/kit/CLAUDE.md` |
| Which generated files the kit owns (sync classes) | `packages/kit/src/ownership.ts`, imported via `@blit386/kit/adapters` |
| Publishing / release | `PUBLISHING.md`, `/release`, `pnpm run bump -- 1.5.0` from the repo root (replace `1.5.0` with the target version) |
| Hot-reload delivery decision | `CREATE_BLIT386_DESIGN.md` (Hot reload section) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Lockstep version / range drift check | `pnpm run bump:check` (root `scripts/bump-lockstep.mjs --check`) |
| Contributing / DCO | root `CONTRIBUTING.md` |
