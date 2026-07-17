---
name: demos-preflight
description:
  Run all quality checks (format, lint, spellcheck, knip, docs:links, build) before committing or pushing. Use when the
  user wants to verify the code is ready to commit or run every check at once.
---

# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/demos-preflight
```

## Prerequisites

- Node.js >= 22.18.0 (`engines` in `package.json`)
- pnpm (see `packageManager` in `package.json`)

## Steps

1. Run all checks

- Execute `pnpm run preflight` which runs:
  - `format:check` – Verify all files are formatted
  - `lint` – Check for lint errors (ESLint)
  - `spellcheck` – Check spelling in code and docs
  - `knip` – Find unused exports and dependencies
  - `docs:links` – Verify Markdown links (every `.md` / `.mdx` in the repo, including `README.md`, `docs/`, `.claude/`)
  - `build` – Confirm the production build succeeds (CI and Cloudflare Pages depend on this)

2. Report results

- If all checks pass: Confirm code is ready for commit
- If any check fails: Report specific failures with file locations

3. Suggest fixes

- For formatting issues: Suggest `pnpm run format`
- For lint errors: Suggest `pnpm run lint:fix`
- For spelling: Add words to `cspell.json` or fix typos
- For dead links: Fix URLs or run `pnpm run docs:links` to see failures
- For unused exports: Remove unused code or add to knip ignore
- For build failures: Check for missing imports, plugin errors, or broken asset references
