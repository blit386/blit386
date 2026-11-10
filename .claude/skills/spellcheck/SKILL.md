---
name: spellcheck
description:
  Run cspell across a package, fix typos, and add legitimate words to the dictionary. Use when the user wants to
  spellcheck, fix spelling, or resolve cspell failures. Takes a package argument (blit386, demos, website, kit,
  create-blit386).
---

# Spellcheck

Run the package's spellcheck, then fix all reported errors.

## Usage

```text
/spellcheck <package>
```

## Steps

1. Run spellcheck

- `blit386`: `pnpm run spellcheck` checks `src/**/*.{ts,md,mdx}`, `docs/**/*.{md,mdx}`, `README.md`
- `demos`: `pnpm run spellcheck` checks `src/**/*.{js,md,mdx}`, `docs/**/*.{md,mdx}`, `plugins/**`, `scripts/**`,
  `_partials/**`, `_shots/**`, the package's root `*.{md,mdx}`, `CLAUDE.md`, and `AGENTS.md`. Files outside those paths
  (`.claude/**`) aren't covered by the script - lint-staged spellchecks staged Markdown and skill files, but not JSON or
  YAML config files; check one by hand with `pnpm exec cspell <path>`
- `website`: `pnpm run spellcheck` checks `content/**/*.{md,mdx}`, `src/**/*.{ts,tsx}`, the package's root `*.{md,mdx}`,
  and `CLAUDE.md`
- `website` also checks its three hand-authored `content/docs/*.mdx` pages; the generated mirror under
  `content/docs/*/**` is excluded in `cspell.json`
- `kit` / `create-blit386`: no package-local script; run `pnpm run spellcheck:kit` from the repo root. It checks every
  code and Markdown file in `packages/kit` and `packages/create-blit386` (templates excluded) plus `.claude/skills/**`,
  and runs in CI's `quality-root` and the pre-push root pass
- Capture the full error output

2. Analyze each error

For every word flagged by cspell, determine if it is:

- A typo - a misspelled word in source code, comments, strings, or content
- A legitimate term - a technical term, brand name, abbreviation, or proper noun cspell doesn't know
- A fragment - a non-word piece of prose (a split identifier, a hyphenated half-word, a truncated token). Reword the
  source so the fragment disappears; never add a fragment to the dictionary

3. Fix typos in source files

- Open the file and fix the misspelled word in place
- Don't add typos to the dictionary

4. Add legitimate words to `cspell.json`

- Add the word to the `words` array in the root `cspell.json` (not `userWords`)
- Keep the array sorted alphabetically (case-insensitive); don't add duplicates

5. Re-run spellcheck

- Re-run the same command to confirm all errors are resolved
- If new errors appear, repeat from step 2

6. Format

- Run `/format <package>` to ensure all modified files are properly formatted

## Dictionary file

- Path: `cspell.json` (repo root, shared by every package)
- Add words to the `words` array; keep it sorted alphabetically
- Compound words are allowed (`allowCompoundWords: true`)

## Per-package notes

- `create-blit386`: files under `packages/create-blit386/templates/**` are ignored by cspell (`ignorePaths`)
