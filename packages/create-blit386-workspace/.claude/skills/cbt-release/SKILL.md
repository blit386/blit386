---
name: cbt-release
description:
  Publish @blit-tech/kit and create-blit-tech to npm following the workspace PUBLISHING.md procedure. Does not bump
  versions unless the user asks.
---

# Release (npm publish)

Guide a deliberate npm publish of `@blit-tech/kit` and `create-blit-tech`. This skill does **not** auto-publish or
auto-bump versions unless the user explicitly requests those steps.

Canonical procedure: workspace parent `PUBLISHING.md` (from this repo root: `../PUBLISHING.md` when the three repos
share the `_BLIT_TECH_` parent folder).

## Usage

```text
/cbt-release
```

## Golden rules (never skip)

1. **Always `pnpm publish`, never `npm publish`** - only pnpm rewrites `workspace:*` to a real version.
2. **Publish `@blit-tech/kit` before `create-blit-tech`** - the scaffolder depends on the kit.
3. **Versions are permanent** - bump before republishing; never reuse a published version.
4. **2FA:** publish one package at a time with a fresh `--otp` when required.

## Steps

### 1. Confirm readiness

Run from the `create-blit-tech` repository root:

```bash
pnpm run preflight
```

All checks must pass (format, lint, typecheck, spellcheck, knip, docs:links, build, test).

### 2. Confirm a clean git tree

`pnpm publish` refuses dirty trees. Commit and push first, or use `--no-git-checks` only if the user explicitly accepts
that risk.

### 3. Bump versions (skip only for the very first 0.1.0 release)

If releasing a new version:

```bash
cd packages/kit && npm version patch --no-git-tag-version && cd ../..
cd packages/create-blit-tech && npm version patch --no-git-tag-version && cd ../..
```

Use `minor` or `major` instead of `patch` when appropriate. Commit the version bumps.

Also check whether `BLIT_TECH_RANGE` in `packages/create-blit-tech/src/scaffold.ts` needs updating so new games pin a
newer `blit-tech` engine range.

### 4. Build and preflight again

```bash
pnpm install
pnpm -r build
pnpm run preflight
```

### 5. Publish the kit FIRST

```bash
pnpm --filter @blit-tech/kit publish --dry-run
pnpm --filter @blit-tech/kit publish    # add --otp=123456 if 2FA is on
```

### 6. Publish the scaffolder SECOND

```bash
pnpm --filter create-blit-tech publish --dry-run
```

In the dry-run output, confirm the manifest shows `"@blit-tech/kit": "<version>"`, **not** `"workspace:*"`. Then:

```bash
pnpm --filter create-blit-tech publish   # --otp=... if 2FA
```

### 7. Verify registry

```bash
npm view @blit-tech/kit version
npm view create-blit-tech version
```

### 8. Smoke test (after registry propagation)

```bash
cd /tmp
npm create blit-tech@latest smoke-test
cd smoke-test
npm install
npm run dev
npx blit doctor
```

## Troubleshooting

See **Troubleshooting** in `PUBLISHING.md` for 404 propagation lag, E401, dirty tree, version reuse (402), and scoped
package access issues.

## Report to the user

After a successful publish:

- Published versions for `@blit-tech/kit` and `create-blit-tech`
- Whether `BLIT_TECH_RANGE` or kit `content/docs/` were updated in the same release
- Reminder to tag the git commit if the user maintains release tags manually
