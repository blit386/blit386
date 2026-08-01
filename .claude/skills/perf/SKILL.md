---
name: perf
description:
  Add or update BLIT386 CPU benchmarks (`*.bench.ts`) and explain the CI benchmark workflow. Use when adding a benchmark
  for a new hot method or allocation pattern, or when a `perf`-labeled PR's benchmark comparison or regression threshold
  needs explaining. Applies to packages/blit386.
---

# Performance Testing

Use this skill when the task involves:

- adding or extending `*.bench.ts` files in `packages/blit386`
- benchmarking a new hot method or allocation pattern
- working on benchmark CI behavior

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
- use `pnpm run bench:json` when validating CI-facing output

## CI Behavior

CPU benchmark regression checks run in CI with the `perf` label.

- `main` pushes run `pnpm run bench:json` and refresh the stored baseline artifact
- PRs labeled `perf` run `pnpm run bench:json`
- CI compares against the latest successful `main` baseline artifact
- CI posts or updates a PR comment with the comparison table
- CI fails if any benchmark regresses by more than 25% (see `.github/workflows/ci.yml` `--threshold 25`)

New `*.bench.ts` files are picked up automatically on the next `main` baseline upload. No allowlist change is required.
After adding benchmarks for overlay work, label the PR `perf` if you want regression feedback before merge.

### Overlay palette grid benchmarks

| Benchmark file | What it measures |
| --- | --- |
| `src/assets/SpriteSheet.bench.ts` | `markPaletteIndicesInRect` on 8x8 glyph vs 64x64 sprite rects |
| `src/overlay/palette/PaletteView.bench.ts` | Full palette grid `draw()` for 16 vs 256 slots |

Use these when changing palette usage gating, swatch draw scratch reuse, or unique-index marking in `SpriteSheet`.
Compare locally with `pnpm run bench`; use `pnpm run bench:json` before opening a `perf`-labeled PR.

## References

- Read `packages/blit386/docs/performance-testing.md` for full documentation
- Read `.github/workflows/ci.yml` and `packages/blit386/scripts/compare-tier-1-benchmarks.mjs` for benchmark CI details
