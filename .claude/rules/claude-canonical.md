# blit386 CLAUDE.md is canonical

Condensed mirror of `.cursor/rules/claude-canonical.mdc`.

- Treat the repo-root `CLAUDE.md` as canonical for implementation in this repo; it is loaded automatically into every
  Claude Code session.
- Follow its API conventions (especially BT getters vs methods), architecture map, command set, internal scoped naming,
  and docs-update rules.
- Subsystem guides: `docs/guide-overlay.md` (engine HUD), `docs/api-*.md` (public API), `docs/reference-deprecations.md`
  (aliases).
- Cursor-specific policy lives in `.cursor/rules/*.mdc` and `.cursor/hooks/`; this directory (`.claude/rules/`) holds
  condensed mirrors of the always-applied `.mdc` rules for Claude Code.
- Do not invent alternate conventions when `CLAUDE.md` provides project-specific direction.
- Public API or behavior changes must include matching docs updates in `docs/` as described in `CLAUDE.md`.
- Keep performance-first and strict TypeScript standards from `CLAUDE.md` (no `any`, use type-only imports, integer
  coordinates where required).
