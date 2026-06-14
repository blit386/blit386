# create-blit-tech

Monorepo for the Blit-Tech game scaffolder and project kit.

## Packages

| Package                     | npm name           | Purpose                                               |
| --------------------------- | ------------------ | ----------------------------------------------------- |
| `packages/create-blit-tech` | `create-blit-tech` | `npm create blit-tech@latest` CLI and templates       |
| `packages/kit`              | `@blit-tech/kit`   | Canonical `AGENTS.md`, local docs, and the `blit` CLI |

## Tech stack

- **Language:** TypeScript 5.9.3 (strict)
- **Build:** tsup (ESM, Node 22)
- **Formatting:** Biome (TS/JS/JSON) + Prettier (MD/YAML)
- **Linting:** Biome (no ESLint in this repo)
- **Package manager:** pnpm 10.26.2
- **Node:** >= 22.18.0

## Commands

Run from the repository root:

```bash
pnpm run build          # Build both packages
pnpm run typecheck      # TypeScript check (all packages)
pnpm run lint           # Biome check
pnpm run lint:fix       # Biome auto-fix
pnpm run format         # Format all files
pnpm run format:check   # Verify formatting
pnpm run spellcheck     # cspell
pnpm run knip           # Dead code / unused exports
pnpm run docs:links     # Markdown link checker
pnpm run test           # Scaffold smoke test (requires build first)
pnpm run preflight      # All quality checks before commit
pnpm run security:audit # Dependency audit (moderate+)
```

Use **`pnpm run <script>`** (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands.

## Scaffold flow

1. User runs `npm create blit-tech@latest` (or `pnpm create blit-tech`).
2. CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistant
   (none / Claude / Cursor), optional CI.
3. Templates from `packages/create-blit-tech/templates/` (`base/` + the chosen language layer) are rendered with
   `{{placeholders}}`.
4. If an AI assistant was chosen, its config is generated from the kit IR (`generateClaudeAdapter` /
   `generateCursorAdapter` in `src/scaffold.ts`): `CLAUDE.md` + `.claude/`, or `.cursor/`.
5. Kit content (`AGENTS.md` + `docs/`) is copied from `@blit-tech/kit/content/`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path / class / kit version / sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits.
7. Optional git init, dependency install, next-steps output.

## Template layout

```text
packages/create-blit-tech/templates/
  base/           # index.html, vite.config.js, README, .editorconfig, biome.json ({{entryFile}}/{{gameFile}} placeholders)
  js/             # package.json.tmpl, jsconfig.json, src/game.js
  ts/             # package.json.tmpl, tsconfig.json, src/game.ts (same Catcher game, typed)
  optional/
    ci/           # GitHub Actions workflow (wizard opt-in)
```

The Claude and Cursor configs are no longer static templates: they are generated at scaffold time from the kit IR
(`packages/kit/content/`) by the adapters in `src/scaffold.ts`. `blit agents sync` regenerates the same output via the
generate-to-memory copies in `packages/kit/src/adapters.ts`.

## Critical rules

1. **No emoji** in code, docs, commits, or user-facing strings
2. **JavaScript by default in scaffolds** — generated games are plain JS unless the user picks TypeScript (`--ts`)
3. **Beginner-friendly** — scaffold output and kit docs assume no prior coding experience
4. **Integer coordinates** — generated games use `Vector2i` / `Rect2i` via blit-tech
5. **Use `BT` namespace** in generated game code — never `BTAPI`
6. **Named exports only** in library TypeScript; no default exports
7. **Documentation is part of every feature** — update this file when workflow or architecture changes

## Git

- Conventional Commits: `<type>(<scope>): <description>`
- DCO sign-off required: `git commit -s`
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

## Agent skills

Skills live in `.claude/skills/` (Zed symlinks in `.agents/skills/`):

- `cbt-preflight` — run all quality checks
- `cbt-format` — format and verify
- `cbt-quick-format` — format only, no verification
- `cbt-review` — review changes against project rules
- `cbt-pr` — create a pull request with checks
- `cbt-spellcheck` — fix cspell errors and extend the dictionary
- `cbt-test` — run the scaffold smoke test
- `cbt-release` — npm publish procedure (`../PUBLISHING.md` in the local workspace layout)

## Kit content vs engine docs

Generated games receive `AGENTS.md` and six beginner docs from `packages/kit/content/docs/` (`getting-started`,
`basics`, `drawing`, `input`, `palette`, `when-something-breaks`). They are **not** copies of blit-tech's full `docs/`
tree — they teach the starter game and point to GitHub for deep API reference.

When blit-tech public API or naming changes in the sibling repo, audit these kit files for stale examples:

| Kit file                                | Review when                                        |
| --------------------------------------- | -------------------------------------------------- |
| `content/docs/getting-started.md`       | Install/run flow, `npx blit run` / `doctor`        |
| `content/docs/basics.md`                | `configure()`, loop timing getters, bootstrap flow |
| `content/docs/drawing.md`               | `BT.clear`, primitives, text APIs                  |
| `content/docs/input.md`                 | `BT.isDown`, edges, keyboard, pointer, gamepad     |
| `content/docs/palette.md`               | `paletteCreate`, slots, `Color32`                  |
| `content/docs/when-something-breaks.md` | Common errors, `await`, palette slot 0, `doctor`   |
| `content/AGENTS.md`                     | Overall game shape, hard rules, doc routing        |
| `content/rules/blit-api-names.md`       | Configure `is*` flags, input hold/edge naming      |
| `content/rules/blit-integer-coords.md`  | Integer-coordinate rule (`Vector2i` / `Rect2i`)    |

Also check `BLIT_TECH_RANGE` in `packages/create-blit-tech/src/scaffold.ts` when new games should pin a newer engine
version.

## Where to find information

| Question                             | Where to look                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| What does the scaffolder generate?   | `packages/create-blit-tech/src/scaffold.ts`, `templates/`                                    |
| What does `blit` CLI do?             | `packages/kit/src/cli.ts`, `packages/kit/README.md`                                          |
| How are agent files generated?       | `src/scaffold.ts` (scaffold time), `packages/kit/src/adapters.ts` (sync, generate-to-memory) |
| What does `blit agents sync` do?     | `packages/kit/src/commands/agents.ts` (drift `--check` + full write path), design doc 4.10   |
| What does `blit agents add` do?      | `packages/kit/src/commands/agents.ts` (`runAddAgent`), design doc 4.5                        |
| Sync ownership model / manifest      | `.blit/manifest.json` (classes + `vars`), design doc 4.10                                    |
| Engine API names for generated games | sibling repo `blit-tech/CLAUDE.md`, `docs/api-core.md`                                       |
| Cursor hooks and rules               | `.cursor/hooks.json`, `.cursor/rules/`                                                       |
| Contributing / DCO                   | `CONTRIBUTING.md`                                                                            |
