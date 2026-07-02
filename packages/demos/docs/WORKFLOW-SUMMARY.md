# Workflow Summary

This document provides a quick overview of the CI workflow in BLIT386 Demos.

## Key Principle

The workflow validates the BLIT386 Demos repository only. The BLIT386 library is treated as a trusted, pre-tested
dependency that has its own CI pipeline in the BLIT386 repository.

## CI Workflow (`ci.yml`)

Triggers: Push to `main`, Pull Requests

Workspace setup is shared across jobs via the composite action at `.github/actions/workspace-setup` (see
`CI-WORKSPACE-SETUP.md`).

Jobs:

### 1. quality-checks

Runs all quality checks on BLIT386 Demos:

- Format check (Biome + Prettier)
- Lint (ESLint)
- Spell check (cspell)
- Unused exports check (knip)

### 2. build (depends on quality-checks)

- Builds BLIT386 library (as dependency)
- Builds BLIT386 Demos
- Uploads build artifacts (`demos-dist`, 7-day retention, compression level 9)

### 3. deploy (depends on build, main branch only)

- Downloads build artifacts
- Deploys to Cloudflare Pages via `cloudflare/wrangler-action`

### 4. docs-links (depends on deploy, main branch only)

Runs a Markdown link check against `README.md` using `gaurav-nelson/github-action-markdown-link-check`. Does not need
the workspace. This job does not run for pull requests.

## Workspace Structure in CI

The workflow recreates the local workspace structure:

```text
(GitHub Actions workspace root)
  pnpm-workspace.yaml          # Created at runtime
  blit386/                   # Cloned from blit386/blit386
    (built as dependency)
  blit386-demos/             # Cloned from current repo
    (tested and deployed)
```

This allows the `workspace:*` dependency to resolve correctly.

## Command Cheat Sheet

All quality checks run from BLIT386 Demos directory:

```bash
cd blit386-demos
pnpm run format:check    # Biome + Prettier formatting
pnpm run lint            # ESLint
pnpm run spellcheck      # cspell
pnpm run knip            # Unused exports
pnpm run build           # Vite build
```

## Why This Approach?

1. Separation of concerns – Each repo has its own CI
2. Efficiency – Don't re-test already-tested code
3. Clear ownership – BLIT386 is responsible for its own quality
4. Faster CI – Skip unnecessary checks
5. Maintainability – Changes to BLIT386 CI don't affect demos

## GitHub Actions pinning

Third-party actions in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and
[`.github/actions/workspace-setup/action.yml`](../.github/actions/workspace-setup/action.yml) are pinned to a
40-character commit SHA, with a trailing `# vN` comment for the release tag they were resolved from. Mutable `@vN`
references are not used.

| Path    | Who refreshes pins                                                                             |
| ------- | ---------------------------------------------------------------------------------------------- |
| Routine | [Renovate](../renovate.json) `github-actions` manager – grouped PRs,                           |
|         | 3-day `minimumReleaseAge`, patch automerge                                                     |
| Manual  | Resolve the tag to a commit on the action repository                                           |
|         | (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`), replace the SHA, update the `# vN` comment |

After changing pins, confirm CI still passes (workspace setup, artifact upload/download, Cloudflare deploy, README link
check on `main`).

## Related Documentation

- [CI-WORKSPACE-SETUP.md](CI-WORKSPACE-SETUP.md) – Detailed explanation of the workspace setup
