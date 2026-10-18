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
  (`.claude/**`, config files) aren't covered by the script - lint-staged spellchecks them when staged for a commit;
  check one by hand with `pnpm exec cspell <path>`
- `website`: `pnpm run spellcheck` checks `content/**/*.{md,mdx}`, `src/**/*.{ts,tsx}`, the package's root `*.{md,mdx}`,
  and `CLAUDE.md`
- `kit` / `create-blit386`: no package-local `spellcheck` script yet (the combined one lived in the retired
  `create-blit386-workspace` root and covered `packages/*/src/**/*.ts`, `packages/*/README.md`,
  `packages/kit/content/**/*.md`, `.claude/skills/**/*.md`, `.claude/rules/**/*.md`, and the repo-root Markdown files
  together). Until a replacement script lands, run `pnpm exec cspell <path>` directly against the files you changed
- Capture the full error output

2. Analyze each error

For every word flagged by cspell, determine if it is:

- A typo - a misspelled word in source code, comments, strings, or content
- A legitimate term - a technical term, brand name, abbreviation, or proper noun cspell doesn't know

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
