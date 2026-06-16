# Docs sync required

Condensed mirror of `.cursor/rules/docs-sync-required.mdc`.

- Documentation is part of the implementation, not a follow-up task.
- Public API changes: update relevant `docs/api-*.md` and related examples.
- Runtime behavior changes: update affected guides under `docs/` (including `docs/overlay.md` for overlay changes).
- Architecture changes: update `CLAUDE.md` architecture sections and the **Where to Find Information** table.
- Script or preflight changes: update `.claude/skills/*/SKILL.md` and affected `.cursor/rules/*.mdc` cross-references.
- Onboarding surface changes (`README.md` Quick Start, `bootstrap()` defaults, minimal demo shape): check sibling
  `create-blit386` templates, `@blit386/kit` docs, and pinned `blit386` version range.
- Update `README.md` only when quick start, prerequisites, features list, or compatibility is affected.
- If no docs update is needed, state why explicitly in the final response.
