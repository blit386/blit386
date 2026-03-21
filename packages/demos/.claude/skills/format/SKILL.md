---
description: Format all code files using Biome and Prettier, then verify formatting passes
---

# Format Code

Format all code files using the project's formatters and verify results.

## Usage

```text
/format
```

## Steps

1. **Run formatters**
   - Execute `pnpm format` which runs:
     - Biome for TypeScript/JavaScript/JSON/CSS
     - Prettier for Markdown/YAML

2. **Show what changed**
   - Run `git diff --stat` to show summary of reformatted files
   - List the number of files modified

3. **Verify formatting**
   - Run `pnpm format:check` to confirm all files pass
   - Report any files that still have formatting issues

## Formatter Configuration

| File Types                     | Tool     | Config               |
| ------------------------------ | -------- | -------------------- |
| `.ts`, `.tsx`, `.js`, `.json`  | Biome    | `biome.json`         |
| `.css`                         | Biome    | `biome.json`         |
| `.md`, `.mdx`, `.yml`, `.yaml` | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: 4 spaces (2 for JSON/YAML/Markdown)
- Line width: 120 characters
- Quotes: Single quotes
- Semicolons: Always
- Trailing commas: Always
