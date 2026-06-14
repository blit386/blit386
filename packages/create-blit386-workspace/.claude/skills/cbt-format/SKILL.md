---
name: cbt-format
description:
  Format all code with Biome and Prettier, then verify formatting passes. Use when the user asks to format, reformat, or
  clean up code style, or to fix a failing format check.
---

# Format Code

Format every file in the create-blit-tech monorepo and verify the result.

## Usage

```text
/cbt-format
```

## Steps

1. **Run formatters**

- Execute `pnpm run format` from the repository root, which runs:
  - Biome for TypeScript/JavaScript/JSON (`.ts`, `.js`, `.json`, `.jsonc`)
  - Prettier for Markdown/YAML (`.md`, `.mdx`, `.yml`, `.yaml`)

2. **Show what changed**

- Run `git diff --stat` to summarize the reformatted files

3. **Verify formatting**

- Run `pnpm run format:check` to confirm all files pass
- Report any files that still have formatting issues

## Formatter Configuration

| File Types                      | Tool     | Config               |
| ------------------------------- | -------- | -------------------- |
| `.ts`, `.js`, `.json`, `.jsonc` | Biome    | `biome.json`         |
| `.md`, `.mdx`, `.yml`, `.yaml`  | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: four spaces (two for JSON/YAML/Markdown)
- Line width: 120 characters
- Quotes: single quotes
- Semicolons: always
- Trailing commas: always

## Notes

- This repo has no ESLint; Biome handles linting. Use `pnpm run lint:fix` for lint auto-fixes beyond formatting.
- Files under `packages/create-blit-tech/templates/**` are scaffolder output but follow the same formatting rules.
