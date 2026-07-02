---
name: bt-preflight
description:
  Run all quality checks (format, lint, typecheck, spellcheck, knip, docs:links, sync:doc-banners:check, test:unit,
  test:declarations) before committing or pushing. Use when the user wants to verify the code is ready to commit or run
  every check at once.
---

# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/bt-preflight
```

## Prerequisites

- Node.js >=22.18.0 (`engines` in `package.json`)
- pnpm 10.26.2+ (`packageManager` in `package.json`)

## Steps

1. Run all checks

- Execute `pnpm run preflight` which runs:
  - `format:check` – Verify formatting (Biome for TS/JS/JSON/CSS, Prettier for MD/YAML)
  - `lint` – Check for lint errors (ESLint)
  - `typecheck` – Validate TypeScript types
  - `spellcheck` – Check spelling in code and docs
  - `knip` – Find unused exports and dependencies
  - `docs:links` – Verify Markdown links (all repo-root `*.md` / `*.mdx`)
  - `sync:doc-banners:check` – Verify the blit386.dev banner is current in every published doc
  - `test:unit` – Run all unit tests
  - `test:declarations` – Declaration tooling log checker tests

2. Report results

- If all checks pass: Confirm code is ready for commit
- If any check fails: Report specific failures with file locations

3. Suggest fixes

- For formatting issues: Suggest `pnpm run format`
- For lint errors: Suggest `pnpm run lint:fix`
- For type errors: Review the specific TypeScript issues
- For spelling: Add words to `cspell.json` or fix typos
- For dead links: Fix URLs or run `pnpm run docs:links` to see failures
- For unused exports: Remove unused code or add to knip ignore
