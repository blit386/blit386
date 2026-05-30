---
description: Run all quality checks (format, lint, spellcheck, knip, docs:links) before committing
---

# Preflight Checks

Run comprehensive quality checks before committing or pushing code.

## Usage

```text
/demos-preflight
```

## Steps

1. **Run all checks**
   - Execute `pnpm run preflight` which runs:
     - `format:check` - Verify all files are formatted
     - `lint` - Check for lint errors (ESLint)
     - `spellcheck` - Check spelling in code and docs
     - `knip` - Find unused exports and dependencies
     - `docs:links` - Verify Markdown links (README, docs/, skills)

2. **Report results**
   - If all checks pass: Confirm code is ready for commit
   - If any check fails: Report specific failures with file locations

3. **Suggest fixes**
   - For formatting issues: Suggest `pnpm run format`
   - For lint errors: Suggest `pnpm run lint:fix`
   - For spelling: Add words to `cspell.json` or fix typos
   - For dead links: Fix URLs or run `pnpm run docs:links` to see failures
   - For unused exports: Remove unused code or add to knip ignore
