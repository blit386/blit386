# BLIT386 - Copilot instructions

This repo is a pnpm workspace of five packages (`packages/blit386`, `demos`, `website`, `kit`, `create-blit386`). GitHub
Copilot only reads root-level instruction files, so this is the one place every contributor agent sees regardless of
which package they're touching; each package carries its own `AGENTS.md` / `CLAUDE.md` with package-specific conventions
\- read the nearest one before non-trivial work.

This file is a pointer for GitHub Copilot. Root [`AGENTS.md`](../AGENTS.md) is the workspace quick start, root
[`CLAUDE.md`](../CLAUDE.md) has the package table and shared monorepo conventions, and
[`packages/blit386/CLAUDE.md`](../packages/blit386/CLAUDE.md) is canonical for the engine's architecture routing, API
conventions, and documentation rules.

## Hard rules

- No emoji anywhere - code, docs, commits, PR titles, errors, logs.
- American English spelling - `color`, `optimization`, `canceled`, never British equivalents (see `CLAUDE.md` for
  spec-mandated exemptions).
- Conventional Commits format (`<type>(<scope>): <description>`) with DCO sign-off (`git commit -s`) on every commit.
- Package manager is pnpm, not npm or yarn.
- Formatting/lint ownership is per package, not repo-wide: `packages/website`, `packages/kit`, and
  `packages/create-blit386` are Biome-only (no ESLint); `packages/blit386` and `packages/demos` pair Biome with ESLint.
  Prettier always owns Markdown/MDX/YAML. Check the package's own `CLAUDE.md` before assuming a tool applies.
- In `packages/website`, everything under `content/docs/{api,guides,performance,reference}/`,
  `content/docs/build-a-game/`, and `src/data/api-history.generated.json` is generated - never hand-edit it. Edit the
  canonical copy (engine docs in `packages/blit386/docs/`; Build a Game pages from `packages/kit/content/`, the
  scaffolder templates, and the demos) and run `pnpm run sync:docs` in `packages/website` instead.
  [`packages/website/CLAUDE.md`](../packages/website/CLAUDE.md) maps generated against hand-authored files.
- Integer coordinates always in the engine - use `Vector2i` / `Rect2i` for rendering, never raw floats.
- Use the `BT` namespace in the engine - never access the internal `BTAPI` singleton directly from demo code.
