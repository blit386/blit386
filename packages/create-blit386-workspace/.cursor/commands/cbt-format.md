# Format Code

Format every file in the create-blit386 monorepo and verify the result.

## Usage

```text
/cbt-format
```

## Steps

1. Run formatters
   - Execute `pnpm run format` from the repository root, which runs:
     - Biome for TypeScript/JavaScript/JSON (`.ts`, `.js`, `.json`, `.jsonc`)
     - Prettier for Markdown/YAML/Cursor rules (`.md`, `.mdx`, `.mdc`, `.yml`, `.yaml`)

2. Show what changed
   - Run `git diff --stat` to summarize the reformatted files

3. Verify formatting
   - Run `pnpm run format:check` to confirm all files pass
   - Report any files that still have formatting issues

## Formatter Configuration

| File Types                             | Tool     | Config               |
| -------------------------------------- | -------- | -------------------- |
| `.ts`, `.js`, `.json`, `.jsonc`        | Biome    | `biome.json`         |
| `.md`, `.mdx`, `.mdc`, `.yml`, `.yaml` | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: four spaces (two for JSON/YAML/Markdown)
- Line width: 120 characters
- Quotes: single quotes
- Semicolons: always
- Trailing commas: always

## Notes

- This repo has no ESLint; Biome handles linting. Use `pnpm run lint:fix` for lint auto-fixes beyond formatting.
- Files under `packages/create-blit386/templates/**` are scaffolder output but follow the same formatting rules.
