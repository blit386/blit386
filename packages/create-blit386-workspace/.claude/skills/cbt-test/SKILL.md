---
name: cbt-test
description:
  Run the scaffold smoke test and explain what automated testing exists here. Use when the user wants to run tests or
  verify the scaffolder still produces a working project.
---

# Tests

This repo has one automated test: a scaffold smoke test that verifies `npm create blit386` output builds and runs. There
is no Vitest suite, Playwright suite, or `tests/` directory.

## Usage

```text
/cbt-test
```

## Prerequisites

- **Node.js** >= 22.18.0
- **pnpm**
- A successful build (`pnpm run build`) - the smoke test imports from `dist/`

## Steps

1. **Build both packages**

   Execute `pnpm run build` if `dist/` is missing or stale.

2. **Run the smoke test**

   Execute `pnpm run test` from the repository root.

3. **Report results**
   - If the test passes: confirm the scaffolder and kit CLI still produce a working project
   - If it fails: report the failure output and whether the break is in scaffold logic, templates, or kit content

## What the smoke test covers

- Wizard/scaffold path writes expected files
- Generated project resolves `blit386` and `@blit386/kit`
- The Catcher starter game builds under Vite

## What it does not cover

- Visual regression of generated games
- Every wizard option combination (CI opt-in, Cursor/Claude adapters)
- npm publish or registry propagation

For full quality gates before commit, use `/cbt-preflight` instead.
