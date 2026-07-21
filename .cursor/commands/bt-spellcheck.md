# Spellcheck

Run the project-wide spellcheck, then fix all reported errors.

## Usage

```text
/bt-spellcheck
```

## Steps

1. Run spellcheck

- Execute `pnpm run spellcheck` to check `src/**/*.{ts,md,mdx,mdc}`, `docs/**/*.{md,mdx,mdc}`, and `README.md`
- Capture the full error output

2. Analyze each error For every word flagged by cspell, determine if it is:

- A typo – a misspelled word in source code, comments, strings, or content
- A legitimate term – a technical term, brand name, abbreviation, or proper noun that cspell doesn't know

3. Fix typos in source files

- Open the file and fix the misspelled word in place
- Don't add typos to the dictionary

4. Add legitimate words to `cspell.json`

- Add the word to the `words` array in `cspell.json`
- Keep the array sorted alphabetically (case-insensitive)
- Don't add duplicates

5. Re-run spellcheck

- Execute `pnpm run spellcheck` again to confirm all errors are resolved
- If new errors appear, repeat from step 2

6. Format

- Run `/bt-format` to ensure all modified files are properly formatted

## Dictionary file

- Path: `cspell.json` (project root)
- Add words to the `words` array (not `userWords`)
- Keep the array sorted alphabetically

## Notes

- Files checked: `src/**/*.{ts,md,mdx,mdc}`, `docs/**/*.{md,mdx,mdc}`, `README.md` (see `package.json` `spellcheck`
  script)
- Compound words are allowed (`allowCompoundWords: true`)
