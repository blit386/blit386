---
paths:
  [src/render/**/*.ts, src/input/**/*.ts, src/overlay/**/*.ts, src/core/**/*.ts, src/assets/**/*.ts, src/utils/**/*.ts]
---

# Benchmark coverage for hot paths

These six directories are the engine's per-frame hot paths – the software renderer, input polling, the overlay, the `BT`
facade and game loop (`src/core/`), and the sprite/font/palette/math helpers those paths lean on. A 2026 performance
audit found concrete hot-path problems in several of them. Coverage today is uneven: `src/utils/`, `src/assets/`, and
the overlay's `src/overlay/palette/` already have `*.bench.ts` files; `src/render/`, `src/input/`, and `src/core/` do
not yet.

When a change here adds a new hot method, a materially different allocation pattern, or a meaningfully different code
path in an existing one:

- extend the colocated `*.bench.ts` if one already exists for the file you touched
- add one (`<File>.bench.ts` next to the source) if none exists yet and the change is worth guarding
- before opening a PR, run the local baseline/compare loop: `pnpm run bench:baseline` on `main`, `pnpm run bench:json`
  on the branch, then `pnpm run bench:compare` – paste `benchmark-comparison.md` into the PR description if it flags a
  regression worth discussing

CI does not run or gate on benchmarks – this is a self-reported discipline, not an automated one. A pre-push hook
(`scripts/check-bench-coverage.mjs`) prints a reminder, and never fails the push, when a push touches these six
directories without touching any `*.bench.ts` file; its `HOT_PATH_DIRS` list and this file's `paths:` glob are meant to
name the same six directories, so update both together.

Full workflow, benchmark-writing rules, and the CI-removal rationale: `docs/performance-testing.md`, the `/perf` skill.
