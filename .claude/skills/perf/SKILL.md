---
name: perf
description:
  Add or update BLIT386 CPU benchmarks (`*.bench.ts`) and explain the local baseline/compare workflow. Use when adding a
  benchmark for a new hot method or allocation pattern, or when a benchmark comparison or regression threshold needs
  explaining. Applies to packages/blit386.
---

# Performance Testing

Use this skill when the task involves:

- adding or extending `*.bench.ts` files in `packages/blit386`
- benchmarking a new hot method or allocation pattern
- working on the local baseline/compare workflow

For visual correctness verification (not performance), use `/test blit386 visual` – see the Visual Regression Tests
section in `packages/blit386/CLAUDE.md`.

## CPU Benchmarks

Use Vitest bench for isolated hot paths that can run in Node.

Examples:

- vector math
- color conversion
- rect intersection
- glyph lookup and text measurement
- render-pipeline helper methods that do not require a browser
- overlay palette grid draw (`PaletteView.bench.ts`)
- sprite or glyph palette usage marking (`SpriteSheet.bench.ts`)

Commands (from `packages/blit386`):

```bash
pnpm run bench
pnpm run bench:json
```

Rules:

- colocate benchmarks as `*.bench.ts` next to the source
- compare meaningful alternatives in the same file
- prefer realistic hot-path inputs
- use `pnpm run bench:json` when preparing a result for `bench:compare`

## Local Baseline/Compare Workflow

Benchmarks run locally only – CI does not run or gate on benchmarks (GitHub-hosted runners are too noisy for a useful
regression threshold).

- on a clean checkout of `main`: `pnpm run bench:baseline`, which writes `benchmark-baseline.json`
- on the feature branch: `pnpm run bench:json`, which writes `benchmark-results.json`
- `pnpm run bench:compare` runs `scripts/compare-tier-1-benchmarks.mjs` against those two files with a 25% regression
  threshold and writes `benchmark-comparison.json` / `benchmark-comparison.md`; it exits nonzero on a regression or a
  missing benchmark
- paste `benchmark-comparison.md` into the PR description by hand when the change is performance-sensitive

New `*.bench.ts` files are picked up automatically the next time someone captures a baseline. No allowlist change is
required. Recommend quiet-machine discipline (close heavy apps, stay plugged in, repeat a marginal run) since local runs
replace the CI gate.

### Coverage reminder

`.claude/rules/bench-coverage.md` auto-loads when editing `src/render/`, `src/input/`, `src/overlay/`, `src/core/`,
`src/assets/`, or `src/utils/` – the engine's per-frame hot paths – and reminds you to add or extend a `*.bench.ts`
alongside a meaningful change there. `scripts/check-bench-coverage.mjs` backs that up at push time: the `pre-push` hook
runs it and prints a reminder (never fails the push) when a push touches one of those directories without touching any
`*.bench.ts` file.

### Overlay palette grid benchmarks

| Benchmark file | What it measures |
| --- | --- |
| `src/assets/SpriteSheet.bench.ts` | `markPaletteIndicesInRect` on 8x8 glyph vs 64x64 sprite rects |
| `src/overlay/palette/PaletteView.bench.ts` | Full palette grid `draw()` for 16 vs 256 slots |

Use these when changing palette usage gating, swatch draw scratch reuse, or unique-index marking in `SpriteSheet`.
Compare locally with `pnpm run bench`; run the baseline/compare workflow above before opening a PR for overlay work.

## References

- Read `packages/blit386/docs/performance-testing.md` for full documentation
- Read `packages/blit386/scripts/compare-tier-1-benchmarks.mjs` for the comparison logic
