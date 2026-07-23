---
name: cbt-test
description:
  Run the automated test suites and explain what testing exists here. Use when the user wants to run tests or verify the
  scaffolder, the kit CLI, or the codemod engine still work.
---

# Tests

This repo has three `node --test` suites, 37 cases in total. There is no Vitest suite, no Playwright suite, and no
top-level `tests/` directory – each package owns its own `test/` folder.

| Suite                                            | Cases | Covers                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/create-blit386/test/scaffold.test.mjs` | 20    | The scaffold path end to end (JS and TS), the non-TTY `--yes` fallback, optional CI and agent files, the `.blit/` ownership manifest, `blit agents sync` (drift, full sync, `--force`, note and merge preservation), `blit agents add` (including collision safety), and `blit migrate` preview + `--write` |
| `packages/create-blit386/test/env.test.mjs`      | 4     | `meetsNodeFloor`: the Node version floor guard, including pre-release and custom-floor strings                                                                                                                                                                                                              |
| `packages/kit/test/codemod.test.mjs`             | 13    | The migration registry and the anchored codemod engine behind `blit migrate`: auto-applied renames vs. names reported for review, receiver anchoring, idempotence, and registry field completeness                                                                                                          |

`pnpm run test` at the root is `pnpm -r test`, which runs all three package suites.

Root-level script tests (also part of `pnpm run preflight`, not part of `pnpm run test`):

| Script                          | File                                    | Covers                                                           |
| ------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `pnpm run test:agent-config`    | `scripts/check-agent-config.test.mjs`   | `.agents/skills` symlink integrity helpers                       |
| `pnpm run test:cursor-commands` | `scripts/sync-cursor-commands.test.mjs` | Frontmatter strip, link rewrite, command build, orphan detection |

Run them with those `pnpm run` scripts, or together via `pnpm run preflight`.

## Usage

```text
/cbt-test
```

## Prerequisites

- Node.js >= 22.18.0
- pnpm
- A build for the scaffolder suite – it shells out to two built artifacts and asserts both exist:
  `packages/create-blit386/dist/index.js` (the scaffold CLI itself) and `packages/kit/dist/cli.js` (used for the
  `agents sync` / `migrate` checks). The kit package rebuilds itself through a `pretest` script; the scaffolder package
  does not, so run `pnpm run build` first if either `dist/` is missing or stale.

## Steps

1. Build if needed

   Execute `pnpm run build` when `dist/` is missing or stale.

2. Run the suites

   Execute `pnpm run test` from the repository root. To run one package: `pnpm --filter @blit386/kit test` or
   `pnpm --filter create-blit386 test`.

3. Report results
   - If they pass: confirm the scaffolder, the kit CLI, and the codemod engine still behave.
   - If one fails: report the failing case and whether the break is in scaffold logic, templates, kit content, the
     adapters, or the migration registry.

## What the suites do not cover

- Visual regression of generated games – nothing renders a canvas.
- A real `npm install` or Vite build inside a generated project.
- npm publish or registry propagation.
- Some `agents sync` cases are skipped when git is unavailable (they need a three-way merge).

For full quality gates before commit, use `/cbt-preflight` instead.
