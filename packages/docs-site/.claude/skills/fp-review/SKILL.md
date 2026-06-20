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
3. Links point to stable URLs; engine API links go to blit386 GitHub docs
4. No emoji in content or strings
5. Config changes (`press.config.tsx`, `source.config.ts`) reflected in CLAUDE.md if behavior changed
6. Suggest `pnpm run preflight` before merge
