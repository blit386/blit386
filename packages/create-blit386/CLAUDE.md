# create-blit386 and @blit386/kit

This file is shared verbatim between `packages/create-blit386` and `packages/kit` – they release in lockstep (one shared
`x.y.z`) and were a single nested monorepo before this repo absorbed them, so they are documented together. Change one
copy, then copy it to the other, the same way the compact-tables plugin mirror works elsewhere in this repo.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

| Package | npm name | Purpose |
| --- | --- | --- |
| `packages/create-blit386` | `create-blit386` | `npm create blit386@latest` CLI and templates |
| `packages/kit` | `@blit386/kit` | Canonical kit content (the IR) and the `blit` CLI |

The `blit` CLI is a project-local bin inside every generated game: `blit run`, `blit doctor`, `blit upgrade`,
`blit migrate`, `blit agents sync` / `blit agents add`, `blit help`.

Scripts are `pnpm run <script>` from each package's own directory (or `pnpm --filter @blit386/kit run <script>` /
`pnpm --filter create-blit386 run <script>` from the repo root). Markdown tables are compact by design via the shared
root `scripts/prettier-plugin-compact-tables.mjs` – never hand-align one. Generated games get the same setup from
`templates/base/`.

## Scaffold flow

1. User runs `npm create blit386@latest` (or `pnpm create blit386`).
2. The CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistant
   (none / Claude / Cursor), optional CI.
3. Templates from `packages/create-blit386/templates/` (`base/` plus the chosen language layer) are rendered with
   `{{placeholders}}`.
4. If an AI assistant was chosen, its config is generated from the kit IR (`generateClaudeAdapter` /
   `generateCursorAdapter` in `@blit386/kit/adapters`), rendering `{{placeholders}}` as it goes, and the scaffolder
   writes those `{ path, content }` pairs to disk. Claude gets `CLAUDE.md`, `.claude/rules/` (from `content/rules/`),
   `.claude/skills/<name>/SKILL.md` (from `content/skills/`), `.claude/settings.json` (hooks from
   `content/hooks.manifest.json`), and `.claude/hooks/` (from `content/hooks/`). Cursor gets `.cursor/rules/*.mdc`,
   `.cursor/commands/<name>.md` (the same skills with frontmatter stripped), `.cursor/hooks.json`, and
   `.cursor/hooks/shell-safety.sh`. Which files each adapter emits is declared in `content/agents.config.json`.
5. Kit content (`AGENTS.md` + `docs/`) is copied **verbatim** – `copyFileSync` / `cpSync`, so `{{placeholder}}` tokens
   are NOT substituted there. Only templates, rules, and skills pass through `render()`. Prose in `AGENTS.md` and
   `docs/` must therefore spell out both language cases ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path, class, kit version, sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits.
7. Optional git init, dependency install, next-steps output.

`blit agents sync` / `blit agents add` reuse the same generators in memory rather than re-scaffolding to disk. Template
layout and the rename rules (`gitignore` to `.gitignore`, `.tmpl` stripped) are in
`packages/create-blit386/.claude/rules/template-structure.md`.

## Critical rules

1. JavaScript by default in scaffolds – generated games are plain JS unless the user picks TypeScript (`--ts`)
2. Beginner-friendly – scaffold output and kit docs assume no prior coding experience
3. Integer coordinates – generated games use `Vector2i` / `Rect2i` via blit386
4. Use the `BT` namespace in generated game code, never `BTAPI`
5. Named exports only in library TypeScript; no default exports
6. Documentation is part of every feature – update this file when workflow or architecture changes

Git: Conventional Commits (`<type>(<scope>): <description>`) with DCO sign-off on every commit (`git commit -s`).

Skills live in the root `.claude/skills/` with symlinks in the root `.agents/skills/`; `pnpm run agents:check` gates
symlink drift in preflight.

## Kit content vs engine docs

Generated games receive `AGENTS.md`, eight beginner docs from `packages/kit/content/docs/` (`getting-started`, `basics`,
`drawing`, `input`, `palette`, `audio`, `hot-reload`, `when-something-breaks`), and the game-author skills in
`packages/kit/content/skills/`. These are not copies of the engine's full `docs/` tree – they teach the starter game and
point to GitHub for deep API reference.

The whole of `packages/kit/content/` is the shipped IR, not just `AGENTS.md` + `docs/`: it also carries `rules/`,
`skills/` (21 game-author capability skills plus the `run`, `fix`, and `migrate` workflow skills),
`hooks/shell-safety.sh` + `hooks.manifest.json`, and `agents.config.json`. Skills and rules are discovered by directory
scan in `packages/kit/src/adapters.ts` – adding a skill folder is enough, nothing registers it by name.

Kit content must be self-contained. Skills and docs may reference only `packages/blit386` (the engine) and other local
kit files. Do not reference the `packages/demos` package, its demo slugs, or its URLs – that package may be archived in
favor of kit-based demos, and shipped content must not break with it.

The engine has no physics, collision, entity, or scene system. Say so; do not invent one. What the kit does teach:
drawing (primitives, sprites, text), palette and effects, input (keyboard, pointer, gamepad), timing, audio (bus mixer,
`AudioClip`, procedural synth – engine 1.3.0), hot reload / `blit386/vite` / asset hot-replace / `BT.loadingAssetsCount`
(engine 1.4.0), the debug overlay, screenshots, and WebGPU-only post-process effects.

### Drift is the standing risk here

Nothing syncs these packages from `packages/blit386` automatically. The kit docs and shipped skills are hand-authored
beginner prose, so they go stale silently when the engine changes. Shipping an engine feature is the trigger to come
here – review in the same pass, not later. Run `/kit-audit` to walk the checklist. Also check `BLIT386_RANGE` in
`packages/create-blit386/src/scaffold.ts` when new games should pin a newer engine version.

| Kit file | Review when |
| --- | --- |
| `content/docs/getting-started.md` | Install/run flow, `npx blit run` / `doctor`, first-edit hot reload |
| `content/docs/basics.md` | `configure()`, loop timing getters, bootstrap flow, orientation, `loadingAssetsCount` |
| `content/docs/drawing.md` | `BT.clear`, primitives, text APIs |
| `content/docs/input.md` | `BT.isDown`, edges, keyboard, pointer, gamepad, scroll-capture / touch-action |
| `content/docs/palette.md` | `paletteCreate`, slots, `Color32` |
| `content/docs/audio.md` | `AudioClip`, `BT.synthPreset`, buses, the unlock rule |
| `content/docs/hot-reload.md` | `blit386/vite`, swap tiers, `onHotReload`, asset hot-replace |
| `content/docs/when-something-breaks.md` | Common errors, `await`, palette slot 0, silent audio, hot-reload surprises |
| `content/AGENTS.md` | Overall game shape, hard rules, doc routing, hot-reload tiers |
| `content/rules/blit-api-names.md` | `BT` getters, configure flags, wake lock, `onHotReload` / never `registerHotReload` |
| `content/rules/blit-integer-coords.md` | Integer-coordinate rule (`Vector2i` / `Rect2i`) |
| `content/skills/use-hot-reload/SKILL.md` | Swap tiers, `onHotReload`, vite plugin opt-in for older games |
| `content/skills/*/SKILL.md` | Other game-author skills; each demonstrates a slice of the `BT` surface |
| `content/hooks/shell-safety.sh` | Shell commands the hook blocks in a generated game (Cursor + Claude protocols) |
| `content/hooks.manifest.json` | Canonical hook intent; Cursor `hooks.json` and Claude `settings.json` derive from it |
| `content/agents.config.json` | Which files each adapter (claude / cursor) emits |

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the scaffolder generate? | `packages/create-blit386/src/scaffold.ts`, `templates/` |
| What does the `blit` CLI do? | `packages/kit/src/cli.ts`, `packages/kit/README.md` |
| How are agent files generated? | `packages/kit/src/adapters.ts`; scaffold writes them to disk |
| What do `blit agents sync` / `add` do? | `packages/kit/src/commands/agents.ts` (drift `--check` + write path, `runAddAgent`) |
| How do API migrations / codemods work? | `packages/kit/src/migrations/` (registry + codemod engine), `commands/migrate.ts` |
| Sync ownership model / manifest | `.blit/manifest.json` (classes + `vars`), `packages/kit/src/commands/agents.ts` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| Hot-reload delivery decision | `packages/create-blit386/CREATE_BLIT386_DESIGN.md` (Hot reload section) |
| Publishing / release | `packages/create-blit386/PUBLISHING.md`, `/release kit`, `pnpm run bump -- <x.y.z>` |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Contributing / DCO | root `CONTRIBUTING.md` |
