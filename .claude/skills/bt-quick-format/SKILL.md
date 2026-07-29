---
name: bt-quick-format
description:
  Quickly format all code with Biome and Prettier, skipping the format:check verification step. Use for a fast cleanup
  right after edits, or as a lightweight pre-step before other checks, when you don't need confirmation that formatting
  actually passed. If the result needs to be verified (before a commit or PR), use bt-format instead.
---

# Quick Format

Rapidly format all code files using the project's formatters – streamlined version of `/bt-format` that skips
verification steps for maximum speed.

## Usage

```text
/bt-quick-format
```

## Steps

1. Run formatters

- Execute `pnpm run format` (Biome for TS/JS/JSON/JSONC/CSS, Prettier for MD/YAML – see `/bt-format` for the full
  file-type table)

2. Brief confirmation

- Report completion
- Note any files that couldn't be formatted (usually indicate syntax errors)
