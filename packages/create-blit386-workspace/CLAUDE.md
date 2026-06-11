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
2. CLI prompts for folder name, language (JS only in v0.1), optional AI assistant, optional CI.
3. Templates from `packages/create-blit-tech/templates/` are rendered with `{{placeholders}}`.
4. Kit content (`AGENTS.md` + `docs/`) is copied from `@blit-tech/kit/content/`.
5. Optional git init, dependency install, next-steps output.

## Template layout

```text
packages/create-blit-tech/templates/
  base/           # index.html, vite.config.js, README, .editorconfig, biome.json
  js/             # package.json.tmpl, jsconfig.json, src/game.js
  optional/
    ci/           # GitHub Actions workflow (wizard opt-in)
    cursor/       # .cursor/rules for generated games
    claude/       # CLAUDE.md for generated games
```

## Critical rules

1. **No emoji** in code, docs, commits, or user-facing strings
2. **Plain JavaScript in scaffolds** — generated games use JS (TS templates are future work)
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

Skills live in `.claude/skills/`:

- `cbt-preflight` — run all quality checks
- `cbt-format` — format and verify
- `cbt-review` — review changes against project rules
- `cbt-pr` — create a pull request with checks

## Where to find information

| Question                             | Where to look                                             |
| ------------------------------------ | --------------------------------------------------------- |
| What does the scaffolder generate?   | `packages/create-blit-tech/src/scaffold.ts`, `templates/` |
| What does `blit` CLI do?             | `packages/kit/src/cli.ts`, `packages/kit/README.md`       |
| Engine API names for generated games | sibling repo `blit-tech/CLAUDE.md`, `docs/api-core.md`    |
| Cursor hooks and rules               | `.cursor/hooks.json`, `.cursor/rules/`                    |
| Contributing / DCO                   | `CONTRIBUTING.md`                                         |
