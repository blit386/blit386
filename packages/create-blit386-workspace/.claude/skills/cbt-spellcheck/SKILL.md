---
name: cbt-spellcheck
description:
  Run cspell across the project, fix typos, and add legitimate words to the dictionary. Use when the user wants to
  spellcheck, fix spelling, or resolve cspell failures.
---

# Spellcheck

Run the project-wide spellcheck, then fix all reported errors.

## Usage

```text
/cbt-spellcheck
```

## Steps

1. **Run spellcheck**

   Execute `pnpm run spellcheck` to check `packages/*/src/**/*.ts`, kit `content/**/*.md`, `README.md`, and `CLAUDE.md`.
   Capture the full error output.

2. **Analyze each error**

   For every word flagged by cspell, determine if it is:
   - **A typo** - a misspelled word in source code, comments, strings, or content
   - **A legitimate term** - a technical term, brand name, abbreviation, or proper noun that cspell does not know

3. **Fix typos in source files**
   - Open the file and fix the misspelled word in place
   - Do not add typos to the dictionary

4. **Add legitimate words to `cspell.json`**
   - Add the word to the `words` array in `cspell.json`
   - Keep the array sorted alphabetically (case-insensitive)
   - Do not add duplicates

5. **Re-run spellcheck**

   Execute `pnpm run spellcheck` again to confirm all errors are resolved. If new errors appear, repeat from step 2.

6. **Format**

   Run `/cbt-format` to ensure all modified files are properly formatted.

## Dictionary file

- Path: `cspell.json` (project root)
- Add words to the `words` array (not `userWords`)
- Keep the array sorted alphabetically

## Notes

- Template files under `packages/create-blit-tech/templates/**` are ignored by cspell (see `ignorePaths` in
  `cspell.json`)
- Compound words are allowed (`allowCompoundWords: true`)
