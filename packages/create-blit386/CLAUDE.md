# create-blit386

`npm create blit386@latest` – the BLIT386 game scaffolder CLI and templates. Depends on `@blit386/kit` for
generated-game content and the `blit` CLI; the two packages release in lockstep (one shared `x.y.z`) – see
[`packages/kit/CLAUDE.md`](../kit/CLAUDE.md) for the kit's own detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter create-blit386 run <script>` from the repo root).

## Scaffold flow

1. User runs `npm create blit386@latest` (or `pnpm create blit386`).
2. The CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistant
   (none / Claude / Cursor), optional CI.
3. Templates from `templates/` (`base/` plus the chosen language layer) are rendered with `{{placeholders}}`.
4. If an AI assistant was chosen, its config is generated from the kit IR (`generateClaudeAdapter` /
   `generateCursorAdapter` in `@blit386/kit/adapters`), rendering `{{placeholders}}` as it goes, and the scaffolder
   writes those `{ path, content }` pairs to disk. Claude gets `CLAUDE.md`, `.claude/rules/` (from `content/rules/`),
   `.claude/skills/<name>/SKILL.md` (from `content/skills/`), `.claude/settings.json` (hooks from
   `content/hooks.manifest.json`), and `.claude/hooks/` (from `content/hooks/`). Cursor gets `.cursor/rules/*.mdc`,
   `.cursor/commands/<name>.md` (the same skills with frontmatter stripped), `.cursor/hooks.json`, and
   `.cursor/hooks/shell-safety.sh`. Which files each adapter emits is declared in `content/agents.config.json` (all
   under `packages/kit/`).
5. Kit content (`AGENTS.md` + `docs/`) is copied **verbatim** – `copyFileSync` / `cpSync`, so `{{placeholder}}` tokens
   are NOT substituted there. Only templates, rules, and skills pass through `render()`. Prose in `AGENTS.md` and
   `docs/` must therefore spell out both language cases ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path, class, kit version, sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits.
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

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the scaffolder generate? | `src/scaffold.ts`, `templates/` |
| Template layout and rename rules | `.claude/rules/template-structure.md` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the `blit` CLI do, and how are agent files generated? | `packages/kit/CLAUDE.md` |
| Publishing / release | `PUBLISHING.md`, `/release kit`, `pnpm --filter create-blit386 run bump -- 1.3.0` (replace `1.3.0` with the target version) |
| Hot-reload delivery decision | `CREATE_BLIT386_DESIGN.md` (Hot reload section) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Contributing / DCO | root `CONTRIBUTING.md` |
