---
name: cbt-preflight
description:
  Run all quality checks (format, lint, typecheck, spellcheck, knip, docs:links, build, test) before committing or
  pushing. Use when the user wants to verify the code is ready to commit or run every check at once.
---

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
   - `format:check` - Verify all files are formatted
   - `lint` - Biome check
   - `typecheck` - TypeScript check (all packages)
   - `spellcheck` - Check spelling in code and docs
   - `knip` - Find unused exports and dependencies
   - `docs:links` - Verify Markdown links
   - `build` - Build both packages
   - `test` - Scaffold smoke test

2. Report results
   - If all checks pass: Confirm code is ready for commit
   - If any check fails: Report specific failures with file locations

3. Suggest fixes
   - Formatting: `pnpm run format`
   - Lint: `pnpm run lint:fix`
   - Spelling: Add words to `cspell.json` or fix typos
   - Dead links: Fix URLs or run `pnpm run docs:links`
   - Unused exports: Remove unused code or update `knip.json`
