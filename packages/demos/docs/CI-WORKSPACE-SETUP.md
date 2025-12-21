# CI Workspace Setup

This document explains how the CI/CD pipeline handles the workspace dependency between Blit-Tech Demos and Blit-Tech.

## Problem

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
3. We want to avoid publishing Blit-Tech to npm until it's ready

## Solution: Recreate Workspace Structure in CI

All CI workflows recreate the exact workspace structure that exists locally by:

1. Cloning both repositories into the correct relative paths
2. Creating a `pnpm-workspace.yaml` at the root
3. Running `pnpm install` to link the workspace dependencies
4. Building Blit-Tech (as a trusted dependency)
5. Running checks **only on Blit-Tech Demos**

### Important: No Testing of Blit-Tech in CI

The Blit-Tech library has **its own CI pipeline** in the Blit-Tech repository.

In the Blit-Tech Demos workflows, we:

- ✅ Clone and build Blit-Tech (as a dependency)
- ❌ Do NOT run quality checks on Blit-Tech (linting, formatting, etc.)
- ❌ Do NOT run tests on Blit-Tech

We treat Blit-Tech as a **trusted, pre-tested dependency** that is already validated by its own CI.

### Workflow Pattern

Every job that needs to install dependencies follows this pattern:

```yaml
steps:
  - name: Checkout Blit-Tech library
    uses: actions/checkout@v6
    with:
      repository: vancura/blit-tech
      path: blit-tech

  - name: Checkout Blit-Tech Demos
    uses: actions/checkout@v6
    with:
      path: blit-tech-demos

  - name: Create workspace config
    run: |
      cat > pnpm-workspace.yaml << EOF
      packages:
        - 'blit-tech'
        - 'blit-tech-demos'
      EOF

  - name: Setup pnpm
    uses: pnpm/action-setup@v4

  - name: Setup Node.js
    uses: actions/setup-node@v6
    with:
      node-version: '20'
      cache: 'pnpm'

  - name: Install dependencies
    run: pnpm install --frozen-lockfile

  - name: Build Blit-Tech library (dependency - not tested here)
    run: |
      cd blit-tech
      pnpm build

  # Now both packages are available and linked
  # Run checks ONLY on Blit-Tech Demos
  - name: Check formatting (Blit-Tech Demos only)
    run: |
      cd blit-tech-demos
      pnpm format:check
```

## Affected Workflows

All workflows in `.github/workflows/` use this pattern:

- **ci.yml** - Code quality checks (format, lint, typecheck)
- **deploy.yml** - Build and deploy to Cloudflare Pages
- **pr-checks.yml** - PR commit linting

## Local Development

Local development remains unchanged. The workspace structure is already set up in the parent directory:

```text
_AMBILAB_/
├── pnpm-workspace.yaml
├── blit-tech/
└── blit-tech-demos/
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

## Alternative Approaches Considered

### 1. Git Submodules

**Rejected**: Adds complexity, difficult to manage across separate repos

### 2. npm link in CI

**Rejected**: Fragile, doesn't support frozen lockfile, caching issues

### 3. Publish to private npm registry

**Rejected**: Overhead of running private registry, not needed yet

### 4. Copy built files manually

**Rejected**: Loses type definitions, breaks TypeScript integration

## Future: Publishing to npm

When Blit-Tech is ready for npm publication:

1. Publish Blit-Tech to npm as a public package
2. Update `blit-tech-demos/package.json`:

   ```json
   {
     "dependencies": {
       "blit-tech": "^0.1.0"
     }
   }
   ```

3. Simplify CI workflows (no need to clone both repos)
4. Local development can still use workspace protocol if desired

## Troubleshooting

### CI Error: "Cannot find package 'blit-tech'"

**Cause**: Workspace structure not created before `pnpm install`

**Fix**: Ensure the workflow includes all three checkout/workspace steps before installing

### CI Error: "No matching version found for blit-tech@workspace:\*"

**Cause**: `pnpm-workspace.yaml` not created or packages not listed correctly

**Fix**: Verify the workspace config creation step runs and lists both packages

### Local Error: "Cannot find module 'blit-tech'"

**Cause**: Not running from within the workspace root

**Fix**: Ensure parent `pnpm-workspace.yaml` exists and lists both packages, then run `pnpm install` from the root
