# Fumapress Content

MDX frontmatter required (`title`, `description`). Public engine docs under `content/docs/**` are generated from
`blit386/docs/` by `scripts/sync-docs-from-engine.mjs` (`pnpm run sync:docs`) - never hand-edit them; edit the engine
source instead. Generated pages rewrite intra-doc links to site paths (`/docs/...`); contributor-only pages stay
link-only on GitHub. No emoji.
