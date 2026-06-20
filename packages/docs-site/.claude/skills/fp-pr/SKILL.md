---
name: fp-pr
description:
  Create a pull request with preflight checks, conventional commit, and gh CLI. Use when opening a PR for the docs site.
---

# Create Pull Request

## Usage

```text
/fp-pr Add getting started page
```

## Steps

1. Confirm branch is not `main`
2. Run `pnpm run preflight`; stop on failure
3. Review `git diff` and `git log origin/main..HEAD`
4. Stage, commit with conventional message + DCO + Co-Authored-By trailer
5. `git push -u origin HEAD` and `gh pr create`
6. Return PR URL

Scopes: `content`, `ci`, `docs`, `deps`, `config`
