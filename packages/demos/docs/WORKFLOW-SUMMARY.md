# Workflow Summary

This document provides a quick overview of the CI/CD workflow in Blit-Tech Demos.

## Key Principle

The workflow **tests and checks Blit-Tech Demos only**. The Blit-Tech library is treated as a **trusted, pre-tested
dependency** that has its own CI pipeline in the Blit-Tech repository.

## CI Workflow (`ci.yml`)

**Triggers:** Push to `main`, Pull Requests

Workspace setup is shared across jobs via the composite action at `.github/actions/workspace-setup` (see
`CI-WORKSPACE-SETUP.md`).

**Jobs:**

### 1. quality-checks

Runs all quality checks on Blit-Tech Demos:

- Format check (Biome + Prettier)
- Lint (ESLint)
- Spell check (cspell)
- Unused exports check (knip)

### 2. docs-links

Runs a Markdown link check against `README.md` using `gaurav-nelson/github-action-markdown-link-check`. Does not need
the workspace.

### 3. build (depends on quality-checks)

- Builds Blit-Tech library (as dependency)
- Builds Blit-Tech Demos
- Uploads build artifacts (`demos-dist`, 7-day retention, compression level 9)

### 4. deploy (depends on build and docs-links, main branch only)

- Downloads build artifacts
- Deploys to Cloudflare Pages via `cloudflare/wrangler-action`

## Workspace Structure in CI

The workflow recreates the local workspace structure:

```text
(GitHub Actions workspace root)
  pnpm-workspace.yaml          # Created at runtime
  blit-tech/                   # Cloned from vancura/blit-tech
    (built as dependency)
  blit-tech-demos/             # Cloned from current repo
    (tested and deployed)
```

This allows the `workspace:*` dependency to resolve correctly.

## Command Cheat Sheet

All quality checks run from Blit-Tech Demos directory:

```bash
cd blit-tech-demos
pnpm format:check    # Biome + Prettier formatting
pnpm lint            # ESLint
pnpm spellcheck      # cspell
pnpm knip            # Unused exports
pnpm build           # Vite build
```

## Why This Approach?

1. **Separation of concerns** - Each repo has its own CI
2. **Efficiency** - Don't re-test already-tested code
3. **Clear ownership** - Blit-Tech is responsible for its own quality
4. **Faster CI** - Skip unnecessary checks
5. **Maintainability** - Changes to Blit-Tech CI don't affect demos

## Related Documentation

- [CI-WORKSPACE-SETUP.md](CI-WORKSPACE-SETUP.md) - Detailed explanation of the workspace setup
