---
name: cbt-review
description: Review current changes against project rules, conventions, and quality standards
---

# Code Review

Review changes against create-blit-tech conventions.

## Usage

```text
/cbt-review
```

## Checklist

1. **Conventions**
   - Read `CLAUDE.md` for repo rules
   - Scaffold templates use beginner-friendly JS comments
   - No emoji in code, docs, or user-facing strings
   - Named exports only in library TypeScript

2. **Scaffold changes**
   - Template placeholders render correctly (no leftover `{{tokens}}`)
   - Optional wizard flags copy the right `templates/optional/` trees
   - Generated `package.json` must not leak `workspace:*`

3. **Quality**
   - Run or suggest `pnpm run preflight` before approving
   - Docs updated when workflow or architecture changes

4. **Engine API names**
   - Generated game code uses public `BT` names from sibling repo `blit-tech`
