# create-blit386

Monorepo for the BLIT386 game scaffolder and project kit.

## Packages

| Package                   | npm name         | Purpose                                           |
| ------------------------- | ---------------- | ------------------------------------------------- |
| `packages/create-blit386` | `create-blit386` | `npm create blit386@latest` CLI and templates     |
| `packages/kit`            | `@blit386/kit`   | Canonical kit content (the IR) and the `blit` CLI |

The `blit` CLI (a project-local bin inside every generated game): `blit run`, `blit doctor`, `blit upgrade`,
`blit migrate`, `blit agents sync` / `blit agents add`, `blit help`.

## Tech stack

- Language: TypeScript 5.9.3 (strict)
- Build: tsup (ESM, Node 22)
- Formatting: Biome (TS/JS/JSON) + Prettier (MD/YAML)
- Linting: Biome (no ESLint in this repo)
- Package manager: pnpm 10.26.2
- Node: >= 22.18.0

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
pnpm run test           # All node:test suites (pnpm -r test; scaffolder suites need a build first)
pnpm run preflight      # All quality checks before commit
pnpm run security:audit # Dependency audit (moderate+)
```

Use `pnpm run <script>` (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands.

## Scaffold flow

1. User runs `npm create blit386@latest` (or `pnpm create blit386`).
2. CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistant
   (none / Claude / Cursor), optional CI.
3. Templates from `packages/create-blit386/templates/` (`base/` + the chosen language layer) are rendered with
   `{{placeholders}}`.
4. If an AI assistant was chosen, its config is generated from the kit IR (`generateClaudeAdapter` /
   `generateCursorAdapter` in `src/scaffold.ts`), rendering `{{placeholders}}` as it goes. Claude gets `CLAUDE.md` +
   `.claude/rules/` (from `content/rules/`) + `.claude/skills/<name>/SKILL.md` (from `content/skills/`). Cursor gets
   `.cursor/rules/*.mdc`, `.cursor/commands/<name>.md` (the same skills, frontmatter stripped), `.cursor/hooks.json`
   (built from `content/hooks.manifest.json`), and `.cursor/hooks/shell-safety.sh` (from `content/hooks/`). Which files
   each adapter emits is declared in `content/agents.config.json`.
5. Kit content (`AGENTS.md` + `docs/`) is copied verbatim from `@blit386/kit`'s `content/`. `AGENTS.md` and `docs/` are
   copied byte-for-byte (`copyFileSync` / `cpSync`), so `{{placeholder}}` tokens are NOT substituted in them – only
   rules and skills pass through `render()`. Prose in `AGENTS.md` / `docs/` must therefore spell out both language cases
   ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path / class / kit version / sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits.
7. Optional git init, dependency install, next-steps output.

## Template layout

```text
packages/create-blit386/templates/
  base/           # index.html, vite.config.js, README, editorconfig, biome.json.tmpl, gitignore,
                  #   public/.gitkeep ({{entryFile}}/{{gameFile}} placeholders)
  js/             # package.json.tmpl, jsconfig.json, src/game.js
  ts/             # package.json.tmpl, tsconfig.json, src/game.ts (same Catcher game, typed)
  optional/
    ci/           # GitHub Actions workflow (wizard opt-in)
```

`gitignore` and `editorconfig` are renamed to `.gitignore` / `.editorconfig` on copy (`mapOutputName`); `.tmpl` is
stripped.

The Claude and Cursor configs are no longer static templates: they are generated at scaffold time from the kit IR
(`packages/kit/content/`) by the adapters in `src/scaffold.ts`. `blit agents sync` regenerates the same output via the
generate-to-memory copies in `packages/kit/src/adapters.ts`.

## Critical rules

1. No emoji in code, docs, commits, or user-facing strings
2. JavaScript by default in scaffolds – generated games are plain JS unless the user picks TypeScript (`--ts`)
3. Beginner-friendly – scaffold output and kit docs assume no prior coding experience
4. Integer coordinates – generated games use `Vector2i` / `Rect2i` via blit386
5. Use `BT` namespace in generated game code – never `BTAPI`
6. Named exports only in library TypeScript; no default exports
7. Documentation is part of every feature – update this file when workflow or architecture changes
8. American English spelling – `color`, `optimization`, `canceled`, never the British equivalents. Exempt: literal
   third-party or spec-mandated names correctly spelled with a British `s`/`c` in their own spec (for example Web
   Audio's `AnalyserNode`/`createAnalyser`) – do not "fix" those. See `.claude/rules/american-english-spelling.md` /
   `.cursor/rules/american-english-spelling.mdc`.

## Git

- Conventional Commits: `<type>(<scope>): <description>`
- DCO sign-off required: `git commit -s`
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

## Agent skills

Skills live in `.claude/skills/` (Zed symlinks in `.agents/skills/`):

- `cbt-preflight` – run all quality checks
- `cbt-format` – format and verify
- `cbt-quick-format` – format only, no verification
- `cbt-review` – review changes against project rules
- `cbt-pr` – create a pull request with checks
- `cbt-spellcheck` – fix cspell errors and extend the dictionary
- `cbt-test` – run the node:test suites (scaffolder, env, codemod)
- `cbt-release` – npm publish procedure (`./PUBLISHING.md`)
- `cbt-kit-audit` – re-audit shipped kit docs and skills against the current engine API (see Kit content vs engine docs)

## Kit content vs engine docs

Generated games receive `AGENTS.md`, eight beginner docs from `packages/kit/content/docs/` (`getting-started`, `basics`,
`drawing`, `input`, `palette`, `audio`, `hot-reload`, `when-something-breaks`), and the game-author skills in
`packages/kit/content/skills/` (emitted as `.claude/skills/<name>/SKILL.md` and `.cursor/commands/<name>.md`; the skills
table in `packages/kit/README.md` lists them). They are not copies of blit386's full `docs/` tree – they teach the
starter game and point to GitHub for deep API reference.

The whole of `packages/kit/content/` is the shipped IR, not just `AGENTS.md` + `docs/`: it also carries `rules/` (2
files), `skills/` (24 directories – 21 game-author capability skills plus the `run`, `fix`, and `migrate` workflow
skills), `hooks/shell-safety.sh` + `hooks.manifest.json`, and `agents.config.json`. Skills and rules are discovered by
directory scan in `scaffold.ts` / `adapters.ts` – adding a skill folder is enough, nothing registers it by name.

Kit content must be self-contained. Skills and docs may reference only `blit386` (the engine) and other local kit files
(`docs/*.md`, `AGENTS.md`). Do not reference the `blit386-demos` repo (demo slugs like `029-snake-game`, or demo URLs) –
that repo may be archived in favor of kit-based demos, and shipped content must not break with it. (The demos live at
`demos.blit386.dev`; the old `blit386-demos.vancura.dev` host is dead.)

Engine API surface the kit teaches: drawing (primitives, sprites, text), palette (+ effects), input (keyboard, pointer,
gamepad), timing, audio (bus mixer, `AudioClip`, procedural synth – engine 1.3.0), hot reload / `blit386/vite` / asset
hot-replace / `BT.loadingAssetsCount` (engine 1.4.0), the debug overlay, screenshots, and WebGPU-only post-process
effects. The engine has no physics, collision, entity, or scene system: say so, and do not invent one.

When blit386 public API or naming changes in the sibling repo, audit these kit files for stale examples:

| Kit file                                 | Review when                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `content/docs/getting-started.md`        | Install/run flow, `npx blit run` / `doctor`, first-edit hot reload                       |
| `content/docs/basics.md`                 | `configure()`, loop timing getters, bootstrap flow, orientation, `loadingAssetsCount`    |
| `content/docs/drawing.md`                | `BT.clear`, primitives, text APIs                                                        |
| `content/docs/input.md`                  | `BT.isDown`, edges, keyboard, pointer, gamepad, scroll-capture / touch-action            |
| `content/docs/palette.md`                | `paletteCreate`, slots, `Color32`                                                        |
| `content/docs/audio.md`                  | `AudioClip`, `BT.synthPreset`, buses, the unlock rule                                    |
| `content/docs/hot-reload.md`             | `blit386/vite`, swap tiers, `onHotReload`, asset hot-replace                             |
| `content/docs/when-something-breaks.md`  | Common errors, `await`, palette slot 0, silent audio, hot-reload surprises, `doctor`     |
| `content/AGENTS.md`                      | Overall game shape, hard rules, doc routing, hot-reload tiers                            |
| `content/rules/blit-api-names.md`        | `BT` getters, configure flags, wake lock, `onHotReload` / never call `registerHotReload` |
| `content/rules/blit-integer-coords.md`   | Integer-coordinate rule (`Vector2i` / `Rect2i`)                                          |
| `content/skills/use-hot-reload/SKILL.md` | Swap tiers, `onHotReload`, vite plugin opt-in for older games                            |
| `content/skills/*/SKILL.md`              | Other game-author skills; each demonstrates a slice of the `BT` surface                  |
| `content/hooks/shell-safety.sh`          | Shell commands the hook blocks in a generated game                                       |
| `content/hooks.manifest.json`            | Canonical hook intent; the Cursor `hooks.json` is generated from it                      |
| `content/agents.config.json`             | Which files each adapter (claude / cursor) emits                                         |

Also check `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` when new games should pin a newer engine
version.

Shipping an engine feature is the trigger to come here. Nothing syncs this repo from `blit386` automatically: the kit
docs and the shipped game-author skills are hand-authored beginner prose, so they drift silently when the engine
changes. When you add or rename public API in the sibling `blit386` repo, review this repo in the same pass, not later:
the kit docs in the table above, the shipped skills in `packages/kit/content/skills/` (for example `use-palette`,
`use-hot-reload`, `read-gamepad`, `add-crt-effect`, `show-debug-overlay`) which demonstrate engine APIs the same way the
docs do and stale the same way, and `BLIT386_RANGE`. Run `/cbt-kit-audit` to walk this checklist.

## Where to find information

| Question                               | Where to look                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| What does the scaffolder generate?     | `packages/create-blit386/src/scaffold.ts`, `templates/`                                      |
| What does `blit` CLI do?               | `packages/kit/src/cli.ts`, `packages/kit/README.md`                                          |
| How are agent files generated?         | `src/scaffold.ts` (scaffold time), `packages/kit/src/adapters.ts` (sync, generate-to-memory) |
| What does `blit agents sync` do?       | `packages/kit/src/commands/agents.ts` (drift `--check` + full write path)                    |
| What does `blit agents add` do?        | `packages/kit/src/commands/agents.ts` (`runAddAgent`)                                        |
| How do API migrations / codemods work? | `packages/kit/src/migrations/` (registry + codemod engine), `commands/migrate.ts`            |
| Sync ownership model / manifest        | `.blit/manifest.json` (classes + `vars`), `packages/kit/src/commands/agents.ts`              |
| Engine API names for generated games   | sibling repo `blit386/CLAUDE.md`, `docs/api-core.md`                                         |
| Cursor hooks and rules                 | `.cursor/hooks.json`, `.cursor/rules/`                                                       |
| Hot-reload delivery decision           | `CREATE_BLIT386_DESIGN.md` (Hot reload section)                                              |
| Contributing / DCO                     | `CONTRIBUTING.md`                                                                            |
