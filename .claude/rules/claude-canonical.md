# blit386 CLAUDE.md is canonical

Condensed mirror of `.cursor/rules/claude-canonical.mdc`.

- Treat the repo-root `CLAUDE.md` as canonical for implementation in this repo; it is loaded automatically into every
  Claude Code session.
- Follow its API conventions (especially BT getters vs methods), command set, internal scoped naming, and docs-update
  rules. The annotated `src/` tree lives in `.claude/rules/architecture.md` (Cursor: `.cursor/rules/architecture.mdc`).
- Subsystem guides: `docs/guide-overlay.md` (engine HUD), `docs/guide-hot-reload.md` (HMR), `docs/api-*.md` (public
  API), `docs/reference-deprecations.md` (aliases).
- Cursor-specific policy lives in `.cursor/rules/*.mdc` and `.cursor/hooks/`. This directory (`.claude/rules/`) holds
  paired mirrors of every Cursor rule basename (not only always-applied ones): some are full-policy twins
  (`bt-api-getters`, `internal-scoped-naming`, `ts-file-structure`, `architecture`), others are condensed summaries.
- Do not invent alternate conventions when `CLAUDE.md` provides project-specific direction.
- Public API or behavior changes must include matching docs updates in `docs/` as described in `CLAUDE.md`.
- Keep performance-first and strict TypeScript standards from `CLAUDE.md` (no `any`, use type-only imports, integer
  coordinates where required).
