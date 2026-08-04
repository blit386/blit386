# create-blit386 – agent quick start

The BLIT386 game scaffolder CLI (`npm create blit386@latest`). Depends on `@blit386/kit`; this package, the kit, and the
`blit386` engine release in lockstep – see [`packages/kit/AGENTS.md`](../kit/AGENTS.md) for the kit's own quick start.

This file is a standalone quick start for tools that read `AGENTS.md` and not `CLAUDE.md`. For the full scaffold flow
and routing table, [`CLAUDE.md`](CLAUDE.md) is canonical – read it before non-trivial work. Shared monorepo conventions
live in the repo root [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md).

## Tech stack

TypeScript 5.9.3 (strict mode), built with tsup (ESM, Node 22), formatted with Biome + Prettier, linted with Biome,
spellchecked with cspell, dead code found with knip. Package manager is pnpm 11.20.0; Node >= 22.18.0.

## Quick start

```bash
pnpm install                             # from the repo root
pnpm --filter @blit386/kit run build     # kit must be built first; the test suite shells out to its dist/cli.js
pnpm --filter create-blit386 run build   # or: cd packages/create-blit386 && pnpm run build
pnpm --filter create-blit386 run test
```

Use `pnpm run <script>` (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands. See
`/preflight create-blit386` for the current state of the quality gate.

## Rules that matter most

- JavaScript by default in scaffolds – generated games are plain JS unless the user picks TypeScript (`--ts`).
- Beginner-friendly – scaffold output assumes no prior coding experience.
- Integer coordinates in generated games – `Vector2i` / `Rect2i` via blit386; use the `BT` namespace, never `BTAPI`.
- Named exports only in this package's own TypeScript; no default exports.

## Two different AGENTS.md files

This file is for agents working on **this package**. The file at `packages/kit/content/AGENTS.md` is the canonical kit
IR copied into every scaffolded game. Do not confuse the two, and do not edit the kit copy when the task is about this
package's own contributor docs.

## Where to go next

- [`CLAUDE.md`](CLAUDE.md) – full scaffold flow and the routing table.
- Root `CONTRIBUTING.md` – DCO and contribution guidelines.
- `PUBLISHING.md` – pnpm publish procedure for all three lockstep packages (`pnpm run bump -- 1.5.0` from the repo root,
  replacing `1.5.0` with the target version).

Condensed, always-applicable agent rules also live in the root `.claude/rules/*.md` and `.claude/rules/*.md` here
(Claude Code).
