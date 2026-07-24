# create-blit386 – agent quick start

Monorepo for the BLIT386 game scaffolder (`create-blit386`) and project kit (`@blit386/kit`).

This file is a standalone quick start for tools that read `AGENTS.md` and not `CLAUDE.md`. For scaffold flow, kit
content rules, adapter generation, and the full command list, [`CLAUDE.md`](CLAUDE.md) is canonical – read it before
non-trivial work.

## Packages

| Package                   | npm name         | Purpose                                           |
| ------------------------- | ---------------- | ------------------------------------------------- |
| `packages/create-blit386` | `create-blit386` | `npm create blit386@latest` CLI and templates     |
| `packages/kit`            | `@blit386/kit`   | Canonical kit content (the IR) and the `blit` CLI |

## Tech stack

TypeScript 5.9.3 (strict mode), built with tsup (ESM, Node 22), formatted with Biome + Prettier, linted with Biome,
spellchecked with cspell, dead code found with knip. Package manager is pnpm 10.26.2; Node >= 22.18.0.

## Quick start

```bash
pnpm install
pnpm run build              # Build both packages
pnpm run test               # Package node:test suites (scaffolder suites need a build first)
pnpm run preflight          # All quality gates before commit
```

Use `pnpm run <script>` (not bare `pnpm <script>`) so RTK hooks can rewrite shell commands. `pnpm run preflight` is the
single command to run before committing.

## Rules that matter most

- No emoji anywhere – code, docs, commits, PR titles, errors, logs.
- JavaScript by default in scaffolds – generated games are plain JS unless the user picks TypeScript (`--ts`).
- Beginner-friendly – scaffold output and kit docs assume no prior coding experience.
- Integer coordinates in generated games – `Vector2i` / `Rect2i` via blit386; use the `BT` namespace, never `BTAPI`.
- Named exports only in library TypeScript; no default exports.
- American English spelling – `color`, `optimization`, `canceled`, never the British equivalents.
- Package manager is pnpm, not npm or yarn.
- All commits require DCO sign-off (`git commit -s`); Conventional Commits format (`<type>(<scope>): <description>`).
- Documentation is part of every feature – update `CLAUDE.md` when workflow or architecture changes.

## Two different AGENTS.md files

This root file is for agents working on **this monorepo**. The file at `packages/kit/content/AGENTS.md` is the canonical
kit IR copied into every scaffolded game. Do not confuse the two, and do not edit the kit copy when the task is about
this repo's own contributor docs.

## Where to go next

- [`CLAUDE.md`](CLAUDE.md) – full scaffold flow, kit content vs engine docs checklist, and the routing table.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) – DCO and contribution guidelines.
- [`PUBLISHING.md`](PUBLISHING.md) – npm publish procedure for both packages.

Condensed, always-applicable agent rules also live in `.claude/rules/*.md` (Claude Code) and `.cursor/rules/*.mdc`
(Cursor).
