---
name: bt-pr
description:
  Create a pull request with automatic quality checks, a conventional commit, and the gh CLI. Use when the user wants to
  open a PR or push a branch for review.
---

# Create Pull Request

Create a pull request with automatic quality checks, and a proper commit message.

## Usage

```text
/bt-pr Add sprite batching optimization
```

The description after `/bt-pr` becomes the commit subject.

## Steps

1. Verify branch

- Confirm the current branch is not `main` or `master`
- Run `git status` to see all changes

2. Run quality checks

- Execute `pnpm run preflight` (all checks)
- If any check fails, stop and report errors
- Don't proceed with failing checks

3. Review changes

- Run `git diff` to review all modifications
- Run `git log origin/main..HEAD` to see commits
- Verify changes align with the description

4. Create commit

- Stage relevant files with `git add`
- Generate a conventional commit message:
  - Format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
  - Scopes: `renderer`, `camera`, `assets`, `api`, `utils`, `ci`, `docs`
- Include trailers:
  - `Signed-off-by: ...` (DCO required)
  - `Co-Authored-By: Claude <noreply@anthropic.com>`

5. Push and create PR

- Push to remote: `git push -u origin HEAD`
- Create PR using `gh pr create` with:
  - Title matching the commit message
  - Body with summary and test plan
  - Link to related issues if any

6. Return PR URL

- Display the GitHub PR URL for review

## Requirements

- `gh` CLI must be installed and authenticated
- The current branch mustn't be `main` or `master`
- All quality checks must pass
- All commits must be signed off (DCO)
