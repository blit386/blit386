---
name: fp-review
description:
  Review changes against project rules, MDX conventions, and link integrity. Use before opening a PR on the docs site.
---

# Review Changes

## Usage

```text
/fp-review
```

## Checklist

1. Run `git diff` and `git status`
2. MDX pages have `title` frontmatter; descriptions where helpful
3. Links point to stable URLs; engine API links go to site paths (`/docs/api/...`, `/docs/guides/...`) for anything in
   the engine's `docs/_sitemap.json` manifest. Only unmirrored contributor docs (developer experience guide,
   documentation and versioning guide, tooling, voice, security) link to GitHub
4. No hand-edits to generated files: `content/docs/{api,guides,performance,reference}/**` and
   `src/data/api-history.generated.json` come from `pnpm run sync:docs`
5. No emoji in content or strings
6. Config changes (`press.config.tsx`, `source.config.ts`) reflected in CLAUDE.md if behavior changed
7. Suggest `pnpm run preflight` before merge
