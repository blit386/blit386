# blit386 (engine) – agent quick start

A palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit. Pixel-perfect 2D rendering where primitives
and sprites resolve through a shared indexed palette, with a Canvas 2D software fallback.

This file is a standalone quick start for tools that read `AGENTS.md` and not `CLAUDE.md`. For architecture routing, API
conventions, and documentation rules, [`CLAUDE.md`](CLAUDE.md) is canonical – read it before non-trivial work. Shared
monorepo conventions live in the repo root [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md).

## Tech stack

TypeScript 5.9.3 (strict mode), built with Vite + vite-plugin-dts, formatted with Biome + Prettier, linted with ESLint,
spellchecked with cspell, dead code found with knip. Package manager is pnpm; Node >= 22.18.0.

## Quick start

```bash
cd packages/blit386
pnpm install                 # from the repo root
pnpm run build               # Build the library
pnpm run test                # Run unit tests
pnpm run preflight           # All quality gates (format, lint, typecheck, spellcheck, knip, docs, tests, ...)
```

`pnpm run preflight` is the single command to run before committing – it combines every check CI runs except visual
regression tests (`/test blit386 visual`, run separately when renderer output can change).

## Rules that matter most

- Integer coordinates always – use `Vector2i` / `Rect2i` for rendering, never raw floats.
- Use the `BT` namespace – never access the internal `BTAPI` singleton directly from demo code.
- No `any` types – use `unknown` or a proper type; type-only imports (`import type { ... }`).
- Named exports only – no default exports.
- Performance first – minimize allocations in `update()`/`render()`, reuse buffers, batch draws.
- Documentation is part of every feature: a public API change updates the relevant `docs/api-*.md`; a behavior change
  updates the affected `docs/` guide. Never treat docs as a follow-up step.

## Where to go next

[`CLAUDE.md`](CLAUDE.md) has the full architecture map, the "Where to Find Information" routing table, BT API
conventions (getters vs methods, boolean naming), TypeScript file structure, and the complete command list. Condensed,
always-applicable agent rules also live in `.claude/rules/*.md`.

1.4.0 surface highlights:

- [Hot Reload guide](docs/guide-hot-reload.md) – `blit386/vite` plugin, hot-swap tiers, and asset hot-replace.
- [API: Assets](docs/api-assets.md#loading-assets) – `BT.loadingAssetsCount` and asset loading progress.
