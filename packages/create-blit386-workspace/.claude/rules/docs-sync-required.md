# Docs sync required

Condensed mirror of `.cursor/rules/docs-sync-required.mdc`.

- Docs and kit content are part of the implementation, not a follow-up task.
- Scaffold/template/CLI changes that affect generated games: update `packages/kit/content/` and template READMEs.
- `BT` API name or bootstrap usage changes: review kit `packages/kit/content/docs/*.md` and the kit rule sources
  `packages/kit/content/rules/blit-api-names.md` / `packages/kit/content/rules/blit-integer-coords.md`.
- `blit` CLI, adapter (`packages/kit/src/adapters.ts`), or `blit agents sync` changes: update both package READMEs and
  the design doc.
- `BLIT_TECH_RANGE` or preflight/script changes: update skills, `CLAUDE.md`, and cross-repo notes when relevant.
- blit-tech public API changes (sibling repo): audit kit docs and `packages/kit/content/rules/blit-api-names.md`.
- If no docs update is needed, state why explicitly in the final response.
