# Docs Sync Required

Ship MDX/README/CLAUDE updates with content and site behavior changes. Run `pnpm run docs:links` when adding links.

Public engine docs under `content/docs/**` are generated from `blit386/docs/` by `scripts/sync-docs-from-engine.mjs`:
never hand-edit them. Edit the canonical source in the engine repo, then run `pnpm run sync:docs`. See `CLAUDE.md`
(Documentation mirror) and `DOCUMENTATION_MIGRATION.md`.

Which docs publish, plus their URL, sidebar order, and subtitle, live in the engine repo's `blit386/docs/_sitemap.json`
manifest - not in this repo's script (it carries no per-page list). To add, remove, or reorder a published page, edit
that manifest and run `pnpm run sync:docs`.
