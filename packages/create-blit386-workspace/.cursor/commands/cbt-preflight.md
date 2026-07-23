# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/cbt-preflight
```

## Prerequisites

- Node.js >= 22.18.0 (`engines` in `package.json`)
- pnpm (see `packageManager` in `package.json`)

## Steps

1. Run all checks

   Execute `pnpm run preflight` which runs:
   - `format:check` – Verify all files are formatted
   - `lint` – Biome check
   - `typecheck` – TypeScript check (all packages)
   - `spellcheck` – Check spelling in code and docs
   - `knip` – Find unused exports and dependencies
   - `docs:links` – Verify Markdown links
   - `agents:check` – `.agents/skills` symlink integrity
   - `sync:cursor-commands:check` – Cursor commands match Claude skills
   - `test:agent-config` – Unit tests for the agents check helpers
   - `test:cursor-commands` – Unit tests for the cursor-command sync helpers
   - `build` – Build both packages
   - `test` – `pnpm -r test`: package `node --test` suites (scaffolder, kit CLI, env, codemod)

2. Report results
   - If all checks pass: Confirm code is ready for commit
   - If any check fails: Report specific failures with file locations

3. Suggest fixes
   - Formatting: `pnpm run format`
   - Lint: `pnpm run lint:fix`
   - Spelling: Add words to `cspell.json` or fix typos
   - Dead links: Fix URLs or run `pnpm run docs:links`
   - Cursor command drift: `pnpm run sync:cursor-commands`
   - Broken `.agents/skills` symlink: recreate the symlink to `.claude/skills/<same-name>`
   - Unused exports: Remove unused code or update `knip.json`
