---
name: demos-pr
description:
  Create a pull request with automatic quality checks, a conventional commit, and the gh CLI. Use when the user wants to
  open a PR or push a branch for review.
---

# Create Pull Request

Create a pull request with automatic quality checks and proper commit message.

## Usage

```text
/demos-pr Add new demo for input handling
```

The description after `/demos-pr` becomes the commit subject.

## Steps

1. Verify branch

- Confirm current branch is not `main` or `master`
- Run `git status` to see all changes

2. Run quality checks

- Execute `pnpm run preflight` (all checks)
- If any check fails, stop and report errors
- Do not proceed with failing checks

3. Review changes

- Run `git diff` to review all modifications
- Run `git log origin/main..HEAD` to see commits
- Verify changes align with the description

4. Create commit

- Stage relevant files with `git add`
- Generate conventional commit message:
  - Format: `<type>(<scope>): <description>`
  - Types (enforced by `commitlint.config.js`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
    `ci`, `chore`, `revert`. Subject lowercase, no trailing period, header at most 100 characters
  - Scopes are optional and not enforced by commitlint. Use the ones this repo's history already uses:
    - `demos` – demo JS source (`src/NNN-name.js`), by far the most common scope
    - `ui` – the shared UI kit (`src/shared/ui*.js`)
    - `assets` – static assets in `public/` (sprites, fonts, audio, Cloudflare headers/redirects)
    - `docs` – documentation (`README.md`, `docs/`, `CLAUDE.md`)
    - `skills` – Claude/Cursor skills and rules (`.claude/`, `.cursor/`)
    - `deps` – dependency updates (Renovate uses this)
  - Only introduce a new scope when none of the above fits, and keep it a single lowercase word
- Create the commit with DCO sign-off: `git commit -s` (required; every commit in this repo's history uses it)
- Include trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

5. Push and create PR

- Push to remote: `git push -u origin HEAD`
- Create PR using `gh pr create` with:
  - Title matching commit message
  - Body with summary and test plan
  - Link to related issues if any

6. Return PR URL

- Display the GitHub PR URL for review

## Requirements

- `gh` CLI must be installed and authenticated
- Current branch must not be `main` or `master`
- All quality checks must pass
