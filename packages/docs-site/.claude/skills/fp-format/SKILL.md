---
name: fp-format
description:
  Format all code with Biome and Prettier, then verify formatting passes. Use when the user asks to format or fix style.
---

# Format Code

## Usage

```text
/fp-format
```

## Steps

1. Run `pnpm run format` (Biome for TS/JSON/CSS; Prettier for MD/MDX/MDC/YAML)
2. Run `git diff --stat` to show changes
3. Run `pnpm run format:check` to verify
