# @blit386/kit – agent quick start

Canonical kit content (the IR) and the `blit` CLI, shipped into every scaffolded game. Depends on nothing published by
`create-blit386`, but the two packages release in lockstep – see
[`packages/create-blit386/AGENTS.md`](../create-blit386/AGENTS.md) for the scaffolder's own quick start.

This file is a standalone quick start for tools that read `AGENTS.md` and not `CLAUDE.md`. For kit content vs engine
docs, the drift checklist, and the routing table, [`CLAUDE.md`](CLAUDE.md) is canonical – read it before non-trivial
work. Shared monorepo conventions live in the repo root [`CLAUDE.md`](../../CLAUDE.md) and
[`AGENTS.md`](../../AGENTS.md).

## Tech stack

TypeScript 5.9.3 (strict mode), built with tsup (ESM, Node 22), formatted with Biome + Prettier, linted with Biome,
spellchecked with cspell, dead code found with knip. Package manager is pnpm 10.26.2; Node >= 22.18.0.

## Quick start

```bash
pnpm install                        # from the repo root
pnpm --filter @blit386/kit run build   # or: cd packages/kit && pnpm run build
pnpm --filter @blit386/kit run test    # scaffolder-facing suites need create-blit386 built too
```

Use `pnpm run <script>` (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands. See `/preflight kit` for the
current state of the quality gate.

## Rules that matter most

- Beginner-friendly – kit docs and skills assume no prior coding experience.
- Integer coordinates in generated games – `Vector2i` / `Rect2i` via blit386; use the `BT` namespace, never `BTAPI`.
- Named exports only in this package's own TypeScript; no default exports.
- Kit content must be self-contained – reference only `packages/blit386` and other local kit files, never
  `packages/demos`.

## Two different AGENTS.md files

This file is for agents working on **this package**. The file at `content/AGENTS.md` (inside this same package) is the
canonical kit IR copied into every scaffolded game. Do not confuse the two, and do not edit the kit copy when the task
is about this package's own contributor docs.

## Where to go next

- [`CLAUDE.md`](CLAUDE.md) – kit content vs engine docs, the drift checklist, and the routing table.
- Root `CONTRIBUTING.md` – DCO and contribution guidelines.
- `packages/create-blit386/PUBLISHING.md` – npm publish procedure for both packages
  (`pnpm --filter create-blit386 run bump -- <x.y.z>` for lockstep).

Condensed, always-applicable agent rules also live in the root `.claude/rules/*.md`.
