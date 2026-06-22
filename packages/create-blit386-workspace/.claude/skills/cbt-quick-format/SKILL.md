---
name: cbt-quick-format
description:
  Quickly format all code with Biome and Prettier, skipping the verification step. Use for a fast cleanup after edits or
  to fix formatting flagged by CI or a hook.
---

# Quick Format

Rapidly format all code files using the project's formatters - streamlined version of `/cbt-format` that skips
verification steps for maximum speed.

## Usage

```text
/cbt-quick-format
```

## Steps

1. Run formatters

   Execute `pnpm run format` which runs:
   - Biome for TypeScript/JavaScript/JSON
   - Prettier for Markdown/YAML/Cursor rules (`.md`, `.mdx`, `.mdc`, `.yml`, `.yaml`)

2. Brief confirmation
   - Report completion
   - Note any files that could not be formatted (usually indicate syntax errors)

## When to Use

- A quick cleanup after manual edits
- Before running other checks
- When you know you just need formatting (not verification)
- To fix formatting issues reported by CI or hooks
