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
  - `agents:check` – Verify agent config hasn't drifted (rules parity, skills symlinks, AGENTS.md <-> CLAUDE.md pointer)
  - `sync:doc-banners:check` – Verify the blit386.dev banner is current in every published doc
  - `sync:cursor-commands:check` – Verify `.cursor/commands/*.md` matches `.claude/skills/*/SKILL.md`
  - `api:since:check` – Verify every public export carries an `@since` tag
  - `api:history:check` – Verify `docs/_api-history.json` matches the source version tags
  - `test:unit` – Run all unit tests
  - `test:declarations` – Declaration tooling log checker tests
  - `test:agent-config` – Agent config drift checker tests
  - `test:cursor-commands` – Cursor commands drift checker tests

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
