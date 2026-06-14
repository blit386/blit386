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

1. **Verify branch**

- Confirm current branch is not `main` or `master`
- Run `git status` to see all changes

2. **Run quality checks**

- Execute `pnpm run preflight` (all checks)
- If any check fails, stop and report errors
- Do not proceed with failing checks

3. **Review changes**

- Run `git diff` to review all modifications
- Run `git log origin/main..HEAD` to see commits
- Verify changes align with the description

4. **Create commit**

- Stage relevant files with `git add`
- Generate conventional commit message:
  - Format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
  - Scopes:
    - `examples` - demo JS source (`src/NNN-name.js`)
    - `plugin` - virtual-demos plugin and demo-registry (`plugins/`)
    - `assets` - static assets in `public/` (sprites, fonts, Cloudflare headers/redirects)
    - `ci` - GitHub Actions and CI config
    - `docs` - documentation
    - `config` - tooling config (Vite, Biome, ESLint, etc.)
    - `deps` - dependency updates
- Include trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

5. **Push and create PR**

- Push to remote: `git push -u origin HEAD`
- Create PR using `gh pr create` with:
  - Title matching commit message
  - Body with summary and test plan
  - Link to related issues if any

6. **Return PR URL**

- Display the GitHub PR URL for review

## Requirements

- `gh` CLI must be installed and authenticated
- Current branch must not be `main` or `master`
- All quality checks must pass
