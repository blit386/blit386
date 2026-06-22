---
name: bt-test
description:
  Run the test suite - unit, coverage, watch, visual regression, or a single file. Use when the user wants to run tests
  or check coverage.
---

# Run Tests

Run the test suite with various options.

## Usage

```text
/bt-test              # Run all unit tests
/bt-test coverage     # Run with coverage report (80% threshold)
/bt-test watch        # Run in watch mode
/bt-test visual       # Run visual regression tests (requires Chrome with WebGPU)
/bt-test <file>       # Run tests for a specific file
```

## Steps

1. Determine test scope from the user’s arguments:

- No arguments: Run `pnpm run test:unit` (all Vitest tests)
- `coverage`: Run `pnpm run test:unit:coverage` (with coverage thresholds)
- `watch`: Run `pnpm run test:unit:watch` (interactive watch mode)
- `visual`: Run `pnpm run test:visual` (Playwright visual regression)
- File path: Run `pnpm exec vitest run <path>`

2. Report results

- If all tests pass: Confirm success with pass count
- If tests fail: Report specific failures with file locations and assertion details
- If coverage: Report coverage percentages vs. 80% threshold

3. Suggest fixes for failures

- For assertion errors: Show expected vs. actual values
- For type errors in tests: Check test imports and types
- For coverage gaps: Identify untested functions/branches
- For visual regression: Suggest `pnpm run test:visual:update` if change is intentional

## Test Conventions

- Test files are colocated: `src/utils/Vector2i.test.ts` next to `Vector2i.ts`
- Visual tests are in `tests/visual/`
- Use `describe`/`it` from vitest (not `test`)
- Follow the same code style as the source (four-space indent, single quotes, semicolons)
- No emoji in test descriptions
