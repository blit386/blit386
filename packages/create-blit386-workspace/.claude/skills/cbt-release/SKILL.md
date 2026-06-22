---
name: cbt-release
description:
  Publish @blit386/kit and create-blit386 to npm following the workspace PUBLISHING.md procedure. Does not bump versions
  unless the user asks.
---

# Release (npm publish)

Guide a deliberate npm publish of `@blit386/kit` and `create-blit386`. This skill does not auto-publish or auto-bump
versions unless the user explicitly requests those steps.

Canonical procedure: workspace parent `PUBLISHING.md` (from this repo root: `../PUBLISHING.md` when the three repos
share the `_BLIT386_` parent folder).

## Usage

```text
/cbt-release
```

## Golden rules (never skip)

1. Always `pnpm publish`, never `npm publish` - only pnpm rewrites `workspace:*` to a real version.
2. Publish `@blit386/kit` before `create-blit386` - the scaffolder depends on the kit.
3. Versions are permanent - bump before republishing; never reuse a published version.
4. 2FA: publish one package at a time with a fresh `--otp` when required.

## Steps

### 1. Confirm readiness

Run from the `create-blit386` repository root:

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
cd packages/create-blit386 && npm version patch --no-git-tag-version && cd ../..
```

Use `minor` or `major` instead of `patch` when appropriate. Commit the version bumps.

Also check whether `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` needs updating so new games pin a newer
`blit386` engine range.

### 4. Build and preflight again

```bash
pnpm install
pnpm -r build
pnpm run preflight
```

### 5. Publish the kit FIRST

```bash
pnpm --filter @blit386/kit publish --dry-run
pnpm --filter @blit386/kit publish    # add --otp=123456 if 2FA is on
```

### 6. Publish the scaffolder SECOND

```bash
pnpm --filter create-blit386 publish --dry-run
```

In the dry-run output, confirm the manifest shows `"@blit386/kit": "<version>"`, not `"workspace:*"`. Then:

```bash
pnpm --filter create-blit386 publish   # --otp=... if 2FA
```

### 7. Verify registry

```bash
npm view @blit386/kit version
npm view create-blit386 version
```

### 8. Smoke test (after registry propagation)

```bash
cd /tmp
npm create blit386@latest smoke-test
cd smoke-test
npm install
npm run dev
npx blit doctor
```

## Troubleshooting

See Troubleshooting in `PUBLISHING.md` for 404 propagation lag, E401, dirty tree, version reuse (402), and scoped
package access issues.

## Report to the user

After a successful publish:

- Published versions for `@blit386/kit` and `create-blit386`
- Whether `BLIT386_RANGE` or kit `content/docs/` were updated in the same release
- Reminder to tag the git commit if the user maintains release tags manually
