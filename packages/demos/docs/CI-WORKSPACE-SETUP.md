# CI Workspace Setup

This document explains how the CI pipeline handles the workspace dependency between BLIT386 Demos and BLIT386.

## Context

The BLIT386 Demos project depends on BLIT386 using a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit386": "workspace:*"
  }
}
```

This works perfectly for local development but creates a challenge in CI:

1. Both projects are in **separate Git repositories**
2. CI workflows need to resolve the workspace dependency
3. This demos repo intentionally tracks a sibling workspace build of BLIT386

## Solution: Recreate Workspace Structure in CI

The CI workflow recreates the exact workspace structure that exists locally by:

1. Cloning both repositories into the correct relative paths
2. Creating a `pnpm-workspace.yaml` at the root
3. Running `pnpm install` to link the workspace dependencies
4. Building BLIT386 (as a trusted dependency)
5. Running checks **only on BLIT386 Demos**

### Important: No Testing of BLIT386 in CI

The BLIT386 library has **its own CI pipeline** in the BLIT386 repository.

In the BLIT386 Demos workflow, we:

- Clone and build BLIT386 (as a dependency)
- Do NOT run quality checks on BLIT386 (linting, formatting, etc.)
- Do NOT run tests on BLIT386

We treat BLIT386 as a **trusted, pre-tested dependency** that is already validated by its own CI.

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
  # Run checks ONLY on BLIT386 Demos.
  - name: Check formatting (BLIT386 Demos only)
    run: |
      cd blit386-demos
      pnpm run format:check
```

The composite action performs these steps internally:

1. Checkout `blit386/blit386` into `blit386/`
2. Checkout the current repo into `blit386-demos/`
3. Write `pnpm-workspace.yaml` at the root listing both packages
4. Copy `blit386/pnpm-lock.yaml` to the root
5. Install pnpm and Node.js (with pnpm cache)
6. Run `pnpm install --no-frozen-lockfile`
7. Build the BLIT386 library

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
  blit386/
  blit386-demos/
```

Hot reloading works perfectly with:

```bash
cd blit386-demos
pnpm run dev:watch
```

This script uses `concurrently` to watch both projects:

- Watches BLIT386 for changes and rebuilds automatically
- Runs Vite dev server for BLIT386 Demos with HMR

## Why This Works

1. **No npm publish required** - Dependencies are linked via pnpm workspace protocol
2. **Identical to local** - CI uses the exact same workspace structure as development
3. **Fast builds** - pnpm workspace linking is instantaneous
4. **Type safety** - TypeScript resolves imports correctly in both environments
5. **Hot reload** - Local dev:watch script provides excellent DX

## Future Option: Switch Demos to npm Dependency

If this demos repo ever switches from `workspace:*` to an npm semver dependency:

1. Update `blit386-demos/package.json`:

   ```json
   {
     "dependencies": {
       "blit386": "^1.0.0"
     }
   }
   ```

2. Simplify CI workflow (no need to clone both repos)
3. Keep local workspace linking as an optional development setup if desired

## Troubleshooting

### CI Error: "Cannot find package 'blit386'"

**Cause**: Workspace structure not created before `pnpm install`

**Fix**: Ensure the workflow includes all checkout/workspace steps before installing

### CI Error: "No matching version found for blit386@workspace:\*"

**Cause**: `pnpm-workspace.yaml` not created or packages not listed correctly

**Fix**: Verify the workspace config creation step runs and lists both packages

### Local Error: "Cannot find module 'blit386'"

**Cause**: Not running from within the workspace root

**Fix**: Ensure parent `pnpm-workspace.yaml` exists and lists both packages, then run `pnpm install` from the root
