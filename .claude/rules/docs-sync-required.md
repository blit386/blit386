---
paths:
  [
    packages/*/src/**,
    packages/*/docs/**/*.md,
    packages/*/content/**,
    packages/*/templates/**,
    packages/*/scripts/**,
    packages/*/package.json,
    packages/*/.claude/rules/**,
    README.md,
    CLAUDE.md,
    packages/*/CLAUDE.md,
    .claude/skills/**/SKILL.md,
    .claude/hooks/**,
    .claude/settings.json,
    .husky/**,
  ]
---

# Docs sync required

Documentation is part of the implementation, not a follow-up step, in every package of this monorepo.

- Behavior, API, or workflow changes: update the affected docs (guides, README, API reference) in the same change that
  makes the change, not a later cleanup pass.
- Public API changes in a published library (`packages/blit386`, `@blit386/kit`): update the relevant reference docs and
  examples; a new or changed public symbol needs the versioning discipline described in that package's own rules
  (`.claude/rules/bt-api-getters.md` for `packages/blit386`'s `@since` / `docs/_api-history.json` workflow).
- Adding, removing, or renaming a published doc page: update whatever manifest or navigation config governs that
  package's docs site or README in the same change.
- Architecture or structural changes: update that package's own architecture notes or rule files and the "Where to Find
  Information" table in its `CLAUDE.md`.
- Script, hook, or preflight changes: update the matching `.claude/skills/*/SKILL.md`.
- Onboarding surface changes (a `README.md` Quick Start, a scaffolder default, a minimal example shape): check every
  downstream package that documents or generates from that surface – `packages/create-blit386` templates, `packages/kit`
  docs, and any pinned version range.
- Update a package's `README.md` only when its quick start, prerequisites, features list, or compatibility claims are
  affected.
- If no docs update is needed, state why explicitly in the final response.

Each package's own `CLAUDE.md` and `.claude/rules/` describe the concrete documentation mechanics for that package
(doc-site sync scripts, MDX conventions, versioning tags, kit-content drift) – follow those for the how; this file is
the shared why.
