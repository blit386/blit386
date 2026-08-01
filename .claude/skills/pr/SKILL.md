---
name: pr
description:
  Create a pull request with automatic quality checks, a conventional commit, and the gh CLI. Use when the user wants to
  open a PR or push a branch for review. Takes a package argument (blit386, demos, docs-site, kit, create-blit386) to
  pick the right preflight gate and commit scope conventions.
---

# Create Pull Request

Create a pull request with automatic quality checks and a proper commit message.

## Usage

```text
/pr <package> Add sprite batching optimization
```

The description after the package argument becomes the commit subject.

## Steps

1. Verify branch

- Confirm the current branch is not `main` or `master`
- Run `git status` to see all changes (add `git ls-files --others --exclude-standard` too, to catch untracked files a
  diff alone misses)

2. Run quality checks

- Execute `/preflight <package>` (or the underlying `pnpm run preflight` / package-specific checks – see that skill)
- If any check fails, stop and report errors; don't proceed with failing checks

3. Review changes

- Run `git diff` to review all modifications
- Run `git log origin/main..HEAD` to see commits
- Verify changes align with the description

4. Create commit

- Stage relevant files with `git add`
- Generate a conventional commit message:
  - Format: `<type>(<scope>): <description>`
  - Types (commitlint-enforced): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
    `revert`. Subject lowercase, no trailing period, header at most 100 characters
  - Scopes are convention only, not enforced by commitlint – prefer one already used by that package's history (see the
    per-package list below)
- DCO sign-off: `git commit -s` (required on `blit386`, `kit`, `create-blit386`, `docs-site`; convention-only on `demos`
  – its history follows DCO but no hook or CI enforces `Signed-off-by` there)
- Include trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

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
- The current branch must not be `main` or `master`
- All quality checks must pass

## Per-package commit scopes

- `blit386`: `docs`, `audio`, `assets`, `overlay`, `core`, `api`, `ci`, `renderer`, `tests`, `utils`, `rules`,
  `release`, `security`, `input`, `deps` / `deps-dev`, `visual`, `camera` (rare/legacy: `examples`)
- `demos`: `demos` (most common – demo JS source), `ui` (shared UI kit), `assets`, `docs`, `skills`, `deps`
- `docs-site`: `content`, `ci`, `docs`, `deps`, `config`
- `kit` / `create-blit386`: no fixed convention beyond the general type enum – pick a scope that matches the changed
  area (`kit`, `scaffold`, `templates`, `cli`, `migrations`, `docs`, `deps`)
