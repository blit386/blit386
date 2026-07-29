---
name: bt-format
description:
  Format all code with Biome and Prettier and verify the result with format:check. Use when the user wants formatting
  done and confirmed – before a commit or PR, when a format check has failed in CI or a hook, or any time the result
  needs to be trustworthy rather than just fast. For a no-verification quick pass, use bt-quick-format instead.
---

# Format Code

Format all code files using the project's formatters and verify results.

## Usage

```text
/bt-format
```

## Steps

1. Run formatters

- Execute `pnpm run format` which runs:
  - Biome for TypeScript/JavaScript/JSON/JSONC/CSS (`.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`, `.jsonc`,
    `.css`)
  - Prettier for Markdown/YAML (`.md`, `.mdx`, `.yml`, `.yaml`)

2. Show what changed

- Run `git diff --stat` to show summary of reformatted files
- List the number of files modified

3. Verify formatting

- Run `pnpm run format:check` to confirm all files pass
- Report any files that still have formatting issues

## Formatter Configuration

| File Types | Tool | Config |
| --- | --- | --- |
| `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`, `.jsonc` | Biome | `biome.json` |
| `.css` | Biome | `biome.json` |
| `.md`, `.mdx`, `.mdc`, `.yml`, `.yaml` | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: four spaces (two for JSON/YAML/Markdown)
- Line width: 120 characters
- Quotes: Single quotes
- Semicolons: Always
- Trailing commas: Always
