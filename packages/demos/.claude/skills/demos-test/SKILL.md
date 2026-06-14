---
name: demos-test
description:
  Explain that blit-tech-demos has no automated tests and how to verify demos by hand instead. Use when the user asks to
  run, write, or find tests in this repo.
---

# Tests

There are no automated tests in `blit-tech-demos`. Do not look for `pnpm run test`, `vitest`, or a `tests/` directory -
none of these exist here.

## Usage

```text
/demos-test
```

## Why no tests

Demos are interactive, visual, and authored for a single developer. Correctness is verified by:

1. Running the dev server (`pnpm run dev`) and opening the demo in a browser
2. The production build (`pnpm run build`) - a build failure surfaces broken imports or plugin errors
3. Preflight checks (`pnpm run preflight`) - lint, format, spellcheck, knip, docs:links

Automated unit or E2E tests would require a headless WebGPU runtime (not broadly available) and would largely duplicate
what the library's own test suite (`blit-tech`) already covers.

## What to do instead

- **Verify a new demo works**: `pnpm run dev`, open `/demos/<slug>.html`, exercise the demo manually
- **Confirm no build regression**: `pnpm run build`
- **Check code quality**: `/demos-preflight` or `/demos-review`
- **Full pre-push audit**: `/demos-deep-review`
