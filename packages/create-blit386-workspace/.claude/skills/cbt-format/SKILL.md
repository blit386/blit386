---
name: cbt-format
description: Format all code files using Biome and Prettier, then verify formatting passes
---

# Format Code

Format all files in the create-blit-tech monorepo.

## Usage

```text
/cbt-format
```

## Steps

1. Run `pnpm run format` — Biome formats TS/JS/JSON; Prettier formats MD/YAML
2. Run `pnpm run format:check` to verify
3. Report any remaining issues

## Notes

- TS/JS/JSON use Biome; Markdown and YAML use Prettier
- Use `pnpm run lint:fix` for lint auto-fixes beyond formatting
