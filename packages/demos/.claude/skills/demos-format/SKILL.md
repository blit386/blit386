---
name: demos-format
description:
  Format all code with Biome and Prettier, then verify formatting passes. Use when the user asks to format, reformat, or
  clean up code style, or to fix a failing format check.
---

# Format Code

Format all code files using the project's formatters and verify results.

## Usage

```text
/demos-format
```

## Steps

1. Run formatters

- Execute `pnpm run format` which runs:
  - Biome for JavaScript/JSON/CSS
  - Prettier for Markdown/YAML/Cursor rules (`.md`, `.mdx`, `.mdc`, `.yml`, `.yaml`)

2. Show what changed

- Run `git diff --stat` to show summary of reformatted files
- List the number of files modified

3. Verify formatting

- Run `pnpm run format:check` to confirm all files pass
- Report any files that still have formatting issues

## Formatter Configuration

| File Types                               | Tool     | Config               |
| ---------------------------------------- | -------- | -------------------- |
| `.js`, `.cjs`, `.mjs`, `.json`, `.jsonc` | Biome    | `biome.json`         |
| `.css`                                   | Biome    | `biome.json`         |
| `.md`, `.mdx`, `.mdc`, `.yml`, `.yaml`   | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: 4 spaces (2 for JSON/YAML examples)
- Line width: 120 characters
- Quotes: Single quotes
- Semicolons: Always
- Trailing commas: Always
