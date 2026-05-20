# CI Workspace Setup

This document explains how the CI pipeline handles the workspace dependency between Blit-Tech Demos and Blit-Tech.

## Context

The Blit-Tech Demos project depends on Blit-Tech using a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit-tech": "workspace:*"
  }
}
```

This works perfectly for local development but creates a challenge in CI:

1. Both projects are in **separate Git repositories**
2. CI workflows need to resolve the workspace dependency
3. This demos repo intentionally tracks a sibling workspace build of Blit-Tech

## Solution: Recreate Workspace Structure in CI

The CI workflow recreates the exact workspace structure that exists locally by:

1. Cloning both repositories into the correct relative paths
2. Creating a `pnpm-workspace.yaml` at the root
3. Running `pnpm install` to link the workspace dependencies
4. Building Blit-Tech (as a trusted dependency)
5. Running checks **only on Blit-Tech Demos**

### Important: No Testing of Blit-Tech in CI

The Blit-Tech library has **its own CI pipeline** in the Blit-Tech repository.

In the Blit-Tech Demos workflow, we:

- Clone and build Blit-Tech (as a dependency)
- Do NOT run quality checks on Blit-Tech (linting, formatting, etc.)
- Do NOT run tests on Blit-Tech

We treat Blit-Tech as a **trusted, pre-tested dependency** that is already validated by its own CI.

### Workflow Pattern

The setup is encapsulated in a composite action at `.github/actions/workspace-setup`. Every job that needs workspace
dependencies invokes it in two steps:

```yaml
steps:
  - name: Checkout for local actions
    uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    with:
      sparse-checkout: .github/actions
      sparse-checkout-cone-mode: false

  - name: Set up workspace
    uses: ./.github/actions/workspace-setup

  # Now both packages are available and linked.
  # Run checks ONLY on Blit-Tech Demos.
  - name: Check formatting (Blit-Tech Demos only)
    run: |
      cd blit-tech-demos
      pnpm format:check
```

The composite action performs these steps internally:

1. Checkout `vancura/blit-tech` into `blit-tech/`
2. Checkout the current repo into `blit-tech-demos/`
3. Write `pnpm-workspace.yaml` at the root listing both packages
4. Copy `blit-tech/pnpm-lock.yaml` to the root
5. Install pnpm and Node.js (with pnpm cache)
6. Run `pnpm install --no-frozen-lockfile`
7. Build the Blit-Tech library

## CI Job Flow

The single CI workflow (`.github/workflows/ci.yml`) uses this pattern across its jobs:

- **quality-checks** - Code quality (format, lint, spellcheck, knip)
- **build** - Build demos and upload artifacts
- **deploy** - Deploy to Cloudflare Pages (main branch only; depends on `build`)
- **docs-links** - Markdown link check on `README.md` (no workspace needed; runs only on main push after deploy)

## Local Development

Local development remains unchanged. The workspace structure is already set up in the parent directory:

```text
parent-dir/
  pnpm-workspace.yaml
  blit-tech/
  blit-tech-demos/
```

Hot reloading works perfectly with:

```bash
cd blit-tech-demos
pnpm dev:watch
```

This script uses `concurrently` to watch both projects:

- Watches Blit-Tech for changes and rebuilds automatically
- Runs Vite dev server for Blit-Tech Demos with HMR

## Why This Works

1. **No npm publish required** - Dependencies are linked via pnpm workspace protocol
2. **Identical to local** - CI uses the exact same workspace structure as development
3. **Fast builds** - pnpm workspace linking is instantaneous
4. **Type safety** - TypeScript resolves imports correctly in both environments
5. **Hot reload** - Local dev:watch script provides excellent DX

## Future Option: Switch Demos to npm Dependency

If this demos repo ever switches from `workspace:*` to an npm semver dependency:

1. Update `blit-tech-demos/package.json`:

   ```json
   {
     "dependencies": {
       "blit-tech": "^1.0.0"
     }
   }
   ```

2. Simplify CI workflow (no need to clone both repos)
3. Keep local workspace linking as an optional development setup if desired

## Troubleshooting

### CI Error: "Cannot find package 'blit-tech'"

**Cause**: Workspace structure not created before `pnpm install`

**Fix**: Ensure the workflow includes all checkout/workspace steps before installing

### CI Error: "No matching version found for blit-tech@workspace:\*"

**Cause**: `pnpm-workspace.yaml` not created or packages not listed correctly

**Fix**: Verify the workspace config creation step runs and lists both packages

### Local Error: "Cannot find module 'blit-tech'"

**Cause**: Not running from within the workspace root

**Fix**: Ensure parent `pnpm-workspace.yaml` exists and lists both packages, then run `pnpm install` from the root
