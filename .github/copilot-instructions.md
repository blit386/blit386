# BLIT386 – Copilot instructions

A palette-first WebGPU retro engine for TypeScript, inspired by RetroBlit. Pixel-perfect 2D rendering where primitives
and sprites resolve through a shared indexed palette, with a Canvas 2D software fallback.

This file is a pointer for GitHub Copilot. [`AGENTS.md`](../AGENTS.md) is the standalone quick start and
[`CLAUDE.md`](../CLAUDE.md) is canonical for full architecture, API conventions, and documentation rules – read them
before non-trivial work.

## Hard rules

- No emoji anywhere – code, docs, commits, PR titles, errors, logs.
- Integer coordinates always – use `Vector2i` / `Rect2i` for rendering, never raw floats.
- Use the `BT` namespace – never access the internal `BTAPI` singleton directly from demo code.
- American English spelling – `color`, `optimization`, `canceled`, never British equivalents (see `CLAUDE.md` for
  spec-mandated exemptions).
- Conventional Commits format (`<type>(<scope>): <description>`) with DCO sign-off (`git commit -s`) on every commit.
- Package manager is pnpm, not npm or yarn.

## Where to go next

[`AGENTS.md`](../AGENTS.md) has the tech stack, quick-start commands, and the rest of the most-important rules.
[`CLAUDE.md`](../CLAUDE.md) has the full architecture map, the "Where to Find Information" routing table, BT API
conventions, TypeScript file structure, and the complete command list.
