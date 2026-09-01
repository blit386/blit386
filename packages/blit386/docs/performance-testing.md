# Performance Testing

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/performance/testing, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

BLIT386 has CPU micro-benchmarks for hot methods. This guide explains when to use them, how to add a new benchmark, and
how to compare results against a baseline locally.

## Overview

BLIT386 uses Vitest bench for CPU micro-benchmarks. These measure isolated methods, hot loops, cache lookups, math
helpers, and allocation patterns.

For visual correctness (not performance), use the visual regression tests: `pnpm run test:visual`. They run Playwright
with Chromium + WebGPU and produce PNG snapshots. See [Testing](reference-testing.md) for details.

### When to use CPU benchmarks

Use CPU benchmarks when you want to measure a single method, hot loop, cache lookup, math helper, allocation pattern, or
batching helper in isolation.

Examples:

- `Vector2i.add()` vs. `Vector2i.addInPlace()`
- `Color32.toFloat32Array()` vs. `Color32.writeToFloat32Array()`
- `BitmapFont.measureText()` cold vs. warm cache
- `Rect2i.isContainingXY()` vs. `Rect2i.isContaining()`

## CPU benchmarks

CPU benchmarks are implemented with Vitest bench and colocated next to the source as `*.bench.ts` files.

Current benchmark files:

- `src/utils/Vector2i.bench.ts`
- `src/utils/Color32.bench.ts`
- `src/utils/Rect2i.bench.ts`
- `src/assets/BitmapFont.bench.ts`
- `src/assets/Palette.bench.ts`
- `src/assets/PaletteEffect.bench.ts`
- `src/assets/SpriteSheet.bench.ts`
- `src/assets/SystemFont.bench.ts`
- `src/core/GameLoop.bench.ts`
- `src/input/GamepadInput.bench.ts`
- `src/overlay/Overlay.bench.ts`
- `src/overlay/palette/PaletteView.bench.ts`
- `src/render/PrimitivePipeline.bench.ts`
- `src/render/SoftwareRenderer.bench.ts`
- `src/render/SpritePipeline.bench.ts`

### Overlay palette grid

These benchmarks guard perf follow-ups for the live palette swatch grid:

| File | Cases |
| --- | --- |
| `SpriteSheet.bench.ts` | `markPaletteIndicesInRect` on 8×8 glyph vs. 64 × 64 sprite rects |
| `PaletteView.bench.ts` | Palette grid `draw()` for 16 vs. 256 slots |

They run in the same Vitest bench suite as the rest of the repo and are included in `benchmark-results.json` when you
run `pnpm run bench:json`. No separate registration step is required.

### Engine hot paths (2026 performance audit)

These benchmarks were added ahead of the engine-wide performance optimization pass, so each optimization PR can quote a
measured before/after improvement:

| File | What it measures |
| --- | --- |
| `render/SoftwareRenderer.bench.ts` | Canvas 2D fallback raster loops: sprite blit (8×8 vs. 32×32), bitmap text (20 vs. 200 chars), full-screen rect fill, a diagonal line, and an empty frame's clear + present |
| `render/PrimitivePipeline.bench.ts` | CPU-side vertex batch filling for pixels, rects, and Bresenham lines, plus `reset()` batch teardown |
| `render/SpritePipeline.bench.ts` | CPU-side sprite and bitmap-text batch filling, including per-quad UV computation and `reset()` |
| `input/GamepadInput.bench.ts` | A realistic per-frame query mix (button/axis reads plus `endFrame()`), and `poll()` / `endFrame()` in isolation |
| `assets/Palette.bench.ts` | `get()` vs. `getRef()` color lookup, and `toFloat32ArrayInto()` GPU staging |
| `core/GameLoop.bench.ts` | Steady-state dropped-frame detection scan over the 60-sample ring buffer |
| `overlay/Overlay.bench.ts` | `buildOverlayLayoutPlan()`, overlay label composition, and `TimingChart.draw()` with tagged samples |

### Metrics

CPU benchmarks report ops/sec. Higher numbers are better.

If one benchmark shows:

- `20,000,000 ops/sec`

and another shows:

- `10,000,000 ops/sec`

the first one is roughly twice as fast.

### Why this is the default choice

CPU benchmarks are:

- faster to run locally
- easier to write
- easier to reason about
- already wired into the local baseline/compare workflow described below

If you add a new hot method and want regression protection, this is the first tool to use.

## Adding a new CPU benchmark

If you add a new method and it can run without a browser, start here.

### File location

Create or extend a `*.bench.ts` file near the code being measured.

Examples:

```text
src/utils/MyType.bench.ts
src/render/SpritePipeline.bench.ts
```

### Basic structure

```ts twoslash
// @filename: MyType.ts
export declare class MyType {
  newMethod(): void;
  oldMethod(): void;
}
// @filename: MyType.bench.ts
// ---cut---
import { bench, describe } from 'vitest';

import { MyType } from './MyType';

describe('MyType hot paths', () => {
  const instance = new MyType();

  bench('newMethod()', () => {
    instance.newMethod();
  });

  bench('oldMethod()', () => {
    instance.oldMethod();
  });
});
```

### What to compare

Good benchmark comparisons usually measure one meaningful tradeoff:

- new method vs. previous method
- allocating vs. in-place
- small input vs. large input
- cold cache vs. warm cache
- vector argument vs. raw `x, y` argument

### Benchmark design rules

- keep the benchmark focused on one hot behavior
- use realistic inputs, not absurd synthetic values unless stress testing is intentional
- compare alternatives in the same file so the relative result is obvious
- prefer stable setup outside the `bench(...)` callback
- if mutation is involved, reset state inside the benchmark or in setup so each iteration is valid

### Run CPU benchmarks

```bash
pnpm run bench
pnpm run bench:json
```

`pnpm run bench` gives the terminal report.

`pnpm run bench:json` writes `benchmark-results.json`, the machine-readable file the local compare workflow reads.

## Commands

```bash
pnpm run bench           # Run all CPU benchmarks
pnpm run bench:json      # Run benchmarks and write benchmark-results.json
pnpm run bench:baseline  # Run benchmarks and write benchmark-baseline.json
pnpm run bench:compare   # Compare benchmark-results.json against benchmark-baseline.json
```

### Which command should I use?

- New hot method: `pnpm run bench`
- Capturing a baseline on `main` before starting perf work: `pnpm run bench:baseline`
- Machine-readable result for a feature branch: `pnpm run bench:json`
- Comparing a feature branch against the captured baseline: `pnpm run bench:compare`

## Local baseline/compare workflow

Benchmarks run locally only. GitHub-hosted CI runners share CPU, have no GPU, and their run-to-run variance regularly
crosses a useful regression threshold, so CI does not gate on benchmark results.

<Steps>

<Step>

### Check out `main` and capture a baseline

```bash
git checkout main
pnpm run bench:baseline
```

This writes `benchmark-baseline.json`.

</Step>

<Step>

### Switch to the feature branch and run benchmarks

```bash
git checkout <feature-branch>
pnpm run bench:json
```

This writes `benchmark-results.json`.

</Step>

<Step>

### Compare against the baseline

```bash
pnpm run bench:compare
```

This runs `scripts/compare-tier-1-benchmarks.mjs` with a 25% regression threshold (matching the previous CI gate),
writing `benchmark-comparison.json` and `benchmark-comparison.md`. The command exits nonzero if any benchmark regresses
by more than 25% or a benchmark present in the baseline is missing from the current run.

</Step>

<Step>

### Paste the result into the PR when relevant

`benchmark-comparison.md` renders the same table CI used to post as a PR comment. Paste it into the PR description by
hand when the change is performance-sensitive.

</Step>

</Steps>

### What the comparison contains

`benchmark-comparison.md` includes:

- benchmark name
- baseline ops/sec
- current ops/sec
- delta percent
- pass/fail status

### Quiet-machine discipline

Local runs replace the CI gate, so run-to-run noise matters more than it used to:

- close other heavy applications before benchmarking
- run on a plugged-in machine, not on battery
- repeat a run that looks marginal before trusting it

### Coverage reminder

Nothing forces a benchmark to exist for a given hot path, so a change can slip through with no coverage to compare
against. A pre-push hook (`scripts/check-bench-coverage.mjs`) prints a reminder, never a failure, when a push touches
the renderer, input, overlay, core, assets, or utils directories without touching any `*.bench.ts` file. An agent rule
(`.claude/rules/bench-coverage.md`) covers the same directories for anyone using an AI coding assistant on this repo.

## Recommended workflow for new performance work

If you add a new sprite operation, follow this order:

<Steps>

<Step>

### Write the code clearly first

</Step>

<Step>

### Add a CPU benchmark

If the method can run in Node.

</Step>

<Step>

### Run `pnpm run bench` locally

Compare the new method against the old behavior or an alternative implementation.

</Step>

<Step>

### Capture a baseline on `main`, then compare

Follow the [local baseline/compare workflow](#local-baselinecompare-workflow) above: `pnpm run bench:baseline` on
`main`, `pnpm run bench:json` on the feature branch, then `pnpm run bench:compare`.

</Step>

<Step>

### Open a PR

Paste `benchmark-comparison.md` into the PR description if the change is performance-sensitive.

</Step>

</Steps>

For overlay palette usage or grid draw changes, include the baseline/compare steps so `SpriteSheet.bench.ts` and
`PaletteView.bench.ts` are compared against `main`.

### Best default

If you are unsure where to start, use CPU benchmarking with Vitest bench. It is simple, fast, and already supported by
the local baseline/compare workflow.

## See also

<Cards>
  <Card title="Testing" href="/docs/reference/testing">Unit, integration, and visual test tiers.</Card>
  <Card title="Performance Best Practices" href="/docs/performance/best-practices">When and how to optimize hot paths.</Card>
  <Card title="Developer Experience" href="https://github.com/blit386/blit386/blob/main/docs/developer-experience-guide.md">pnpm run bench and the local baseline/compare workflow.</Card>
</Cards>
