# blit386 CLAUDE.md is canonical

- Treat the repo-root `CLAUDE.md` as canonical for implementation in this repo; it is loaded automatically into every
  Claude Code session.
- Follow its API conventions (especially BT getters vs methods), command set, internal scoped naming, and docs-update
  rules. The annotated `src/` tree lives in `.claude/rules/architecture.md`.
- Subsystem guides: `docs/guide-overlay.md` (engine HUD), `docs/guide-hot-reload.md` (HMR), `docs/api-*.md` (public
  API), `docs/reference-deprecations.md` (aliases).
- `.claude/rules/*.md` holds the always-applied and glob-scoped agent policy for this repo.
- Do not invent alternate conventions when `CLAUDE.md` provides project-specific direction.
- Public API or behavior changes must include matching docs updates in `docs/` as described in `CLAUDE.md`.
- Keep performance-first and strict TypeScript standards from `CLAUDE.md` (no `any`, use type-only imports, integer
  coordinates where required).
