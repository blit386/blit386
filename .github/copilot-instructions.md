# BLIT386 – Copilot instructions

This repo is a pnpm workspace of five packages (`packages/blit386`, `demos`, `website`, `kit`, `create-blit386`); this
file covers the engine, `packages/blit386` – a palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit.
Pixel-perfect 2D rendering where primitives and sprites resolve through a shared indexed palette, with a Canvas 2D
software fallback. GitHub Copilot only reads root-level instruction files, so this is the one place to look regardless
of which package you're in; other packages carry their own `AGENTS.md` / `CLAUDE.md` with package-specific conventions.

This file is a pointer for GitHub Copilot. Root [`AGENTS.md`](../AGENTS.md) is the workspace quick start and
[`packages/blit386/CLAUDE.md`](../packages/blit386/CLAUDE.md) is canonical for the engine's architecture routing, API
conventions, and documentation rules – read them before non-trivial work.

## Hard rules

- No emoji anywhere – code, docs, commits, PR titles, errors, logs.
- Integer coordinates always – use `Vector2i` / `Rect2i` for rendering, never raw floats.
- Use the `BT` namespace – never access the internal `BTAPI` singleton directly from demo code.
- American English spelling – `color`, `optimization`, `canceled`, never British equivalents (see `CLAUDE.md` for
  spec-mandated exemptions).
- Conventional Commits format (`<type>(<scope>): <description>`) with DCO sign-off (`git commit -s`) on every commit.
- Package manager is pnpm, not npm or yarn.

## Where to go next

Root [`AGENTS.md`](../AGENTS.md) has the workspace's package table and points into each package's own docs.
[`packages/blit386/CLAUDE.md`](../packages/blit386/CLAUDE.md) has the "Where to Find Information" routing table, BT API
conventions, TypeScript file structure, and the engine's command list. The annotated `src/` architecture tree lives in
`packages/blit386/.claude/rules/architecture.md`.
