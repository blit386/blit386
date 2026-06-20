---
name: demos-quick-format
description:
  Quickly format all code with Biome and Prettier, skipping the verification step. Use for a fast cleanup after edits or
  to fix formatting flagged by CI or a hook.
---

# Quick Format

Rapidly format all code files using the project's formatters. Streamlined version of `/demos-format` that skips
verification steps for maximum speed.

## Usage

```text
/demos-quick-format
```

## Steps

1. **Run formatters**

- Execute `pnpm run format` which runs:
  - Biome for JavaScript/JSON/CSS
  - Prettier for Markdown/YAML/Cursor rules (`.md`, `.mdx`, `.mdc`, `.yml`, `.yaml`)/Cursor rules (`.md`, `.mdx`,
    `.mdc`, `.yml`, `.yaml`)

2. **Brief confirmation**

- Report completion
- Note any files that couldn't be formatted (usually indicates syntax errors)

## When to Use

- Quick cleanup after manual edits
- Before running other checks
- When you know you just need formatting (not verification)
- To fix formatting issues reported by CI or hooks
