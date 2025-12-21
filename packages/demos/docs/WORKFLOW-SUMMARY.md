# Workflow Summary

This document provides a quick overview of all CI/CD workflows in Blit-Tech Demos.

## Key Principle

All workflows **test and check Blit-Tech Demos only**. The Blit-Tech library is treated as a **trusted, pre-tested
dependency** that has its own CI pipeline in the Blit-Tech repository.

## Workflows

### 1. CI (`ci.yml`)

**Triggers:** Push to `main`, Pull Requests  
**Purpose:** Code quality checks for Blit-Tech Demos

**Jobs:**

- `quality` - Runs format, lint, typecheck, and spellcheck on Blit-Tech Demos only
- `test` - Placeholder for future tests (currently disabled)

**What it does:**

- ✅ Clones both repos and creates workspace
- ✅ Builds Blit-Tech (as dependency)
- ✅ Runs all quality checks on Blit-Tech Demos
- ❌ Does NOT test Blit-Tech

### 2. Deploy (`deploy.yml`)

**Triggers:** Push to `main`, Pull Requests (deploys only on main push)  
**Purpose:** Build and deploy to Cloudflare Pages

**Jobs:**

- `quality` - Same as CI (format, lint, typecheck on Blit-Tech Demos)
- `build-library` - Builds Blit-Tech and uploads artifact
- `build-demos` - Builds Blit-Tech Demos using the library artifact
- `deploy` - Deploys to Cloudflare Pages (main branch only)

**What it does:**

- ✅ Quality checks on Blit-Tech Demos only
- ✅ Builds both projects
- ✅ Deploys demos to Cloudflare Pages
- ❌ Does NOT test Blit-Tech

### 3. PR Checks (`pr-checks.yml`)

**Triggers:** Pull Requests  
**Purpose:** Validate PR conventions

**Jobs:**

- `commitlint` - Validates commit messages in Blit-Tech Demos PR
- `docs-links` - Checks documentation links

**What it does:**

- ✅ Validates conventional commits for Blit-Tech Demos
- ✅ Checks markdown links in Blit-Tech Demos
- ❌ Does NOT check Blit-Tech commits

### 4. Changeset Check (`changeset-check.yml`)

**Triggers:** Pull Requests  
**Purpose:** Ensure changesets are present for version tracking

**Jobs:**

- `changeset` - Verifies changeset exists for Blit-Tech Demos PR

**What it does:**

- ✅ Checks for changeset in Blit-Tech Demos
- ✅ Allows skip via `skip-changeset` label
- ❌ Does NOT check Blit-Tech changesets

## Workspace Structure in CI

All workflows recreate the local workspace structure:

```text
(GitHub Actions workspace root)
├── pnpm-workspace.yaml          # Created at runtime
├── blit-tech/                   # Cloned from vancura/blit-tech
│   └── (built as dependency)
└── blit-tech-demos/             # Cloned from current repo
    └── (tested and deployed)
```

This allows the `workspace:*` dependency to resolve correctly.

## Command Cheat Sheet

All quality checks run from Blit-Tech Demos directory:

```bash
cd blit-tech-demos
pnpm format:check    # Biome + Prettier formatting
pnpm lint            # ESLint
pnpm typecheck       # TypeScript
pnpm spellcheck      # cspell
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
- [Blit-Tech CI](https://github.com/vancura/blit-tech/.github/workflows/) - Library's own CI workflows
