# Format Code

Format code files using the project's formatters and verify results.

## Usage

```text
/format <package>
```

Where `<package>` is one of `blit386`, `demos`, `website`, `kit`, `create-blit386`, or `root` (files outside every
package: root `README.md`, `CLAUDE.md`, `.claude/`, `.github/`, root configs). Omit the argument to format the whole
repo tree from root.

## Steps

1. Run formatters

- Whole repo (no argument, or `root`): `pnpm run format` from the repository root - Biome across every package (`.ts`,
  `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`, `.jsonc`, `.css`) plus Prettier for Markdown/MDX/YAML/MDC (`.md`,
  `.mdx`, `.mdc`, `.yml`, `.yaml`) repo-wide.
- A single package: `pnpm --filter <name> run format` (`blit386`, `blit386-demos`, `blit386-website`, or the package's
  own `name` field), or `cd packages/<dir> && pnpm run format`. `kit` and `create-blit386` have no package-local
  `format` script yet - their files are covered by the root-wide run above.

2. Show what changed

- Run `git diff --stat` to show a summary of reformatted files
- List the number of files modified

3. Verify formatting (skip only for a throwaway quick pass right after edits - never before a commit or PR)

- Whole repo: `pnpm run format:check`. A single package: `pnpm --filter <name> run format:check` (root-level
  `format:check` also covers `kit` / `create-blit386`).
- Report any files that still have formatting issues

## Formatter Configuration

| File Types | Tool | Config |
| --- | --- | --- |
| `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`, `.jsonc`, `.css` | Biome | `biome.json` |
| `.md`, `.mdx`, `.mdc`, `.yml`, `.yaml` | Prettier | `prettier.config.js` |

## Formatting Rules

- Indent: four spaces (two for JSON/YAML/Markdown)
- Line width: 120 characters
- Quotes: single quotes
- Semicolons: always
- Trailing commas: always in code; never in JSON/JSONC (`biome.json` sets `json.formatter.trailingCommas: none`)

## Per-package notes

- `packages/demos`: plain JavaScript, no `.ts`/`.tsx` files to format.
- `packages/website`: MDX is Prettier's Markdown parser, so never leave an MDX comment (`{/* ... */}`) in hand-authored
  content - it renders as visible italic text.
- `packages/create-blit386`: files under `templates/**` are scaffolder output but follow the same formatting rules.
- ESLint runs in `packages/blit386` and `packages/demos` (see `/preflight <package>` for the `lint` step); every other
  package relies on Biome alone for both lint and format.
