---
name: cbt-release
description:
  Publish @blit386/kit and create-blit386 to npm following the workspace PUBLISHING.md procedure (tag-driven CI is the
  normal path; manual pnpm publish is the fallback). Does not bump versions unless the user asks.
---

# Release (npm publish)

Guide a deliberate release of `@blit386/kit` and `create-blit386`. This skill does not auto-bump versions, open PRs,
push tags, or publish by hand unless the user explicitly requests those steps.

Canonical procedure: workspace parent `PUBLISHING.md` (from this repo root: `../PUBLISHING.md` when the three repos
share the `_BLIT386_` parent folder). This skill mirrors it — if they ever disagree, `PUBLISHING.md` wins and this skill
is stale.

## Usage

```text
/cbt-release
```

## Golden rules (never skip)

1. **Engine first.** If this release's kit content documents a new engine API (for example audio –
   `content/docs/audio.md`, the `play-a-sound` / `design-a-sound` skills), that `blit386` version must already be on npm
   (`npm view blit386 version`) before the kit ships it. Publishing kit docs/skills ahead of the engine sends a
   twelve-year-old's AI assistant instructions for an API that does not exist yet.
2. Always `pnpm publish`, never `npm publish` – only pnpm rewrites `workspace:*` to a real version. (CI already does
   this correctly; this matters most for the manual fallback.)
3. Publish `@blit386/kit` before `create-blit386` – the scaffolder depends on the kit.
4. Versions are permanent – bump before republishing; never reuse a published version. Both packages release in lockstep
   on the same version number.
5. Release tags carry no `v` prefix (`1.2.0`, not `v1.2.0`).

## Normal path: tag-driven CI

`.github/workflows/publish.yml` does the actual publishing on a version-tag push. You bump, merge, and tag – you do not
run `pnpm publish` yourself on this path.

### 1. Confirm the engine dependency is satisfied

See golden rule 1. If nothing new in this release documents a new engine API, skip straight to step 2.

### 2. Bump versions

```bash
cd packages/kit && npm version patch --no-git-tag-version && cd ../..
cd packages/create-blit386 && npm version patch --no-git-tag-version && cd ../..
```

Use `minor` or `major` instead of `patch` when appropriate – both packages must land on the same version.

Also check whether `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` and `blit386.engineRange` in
`packages/kit/package.json` need updating so new games pin a newer `blit386` engine range, and stay honest with what the
kit docs describe.

### 3. Check locally, then land the bump through a PR

```bash
pnpm install
pnpm run preflight    # format:check + lint + typecheck + spellcheck + knip + docs:links + build + test
```

`main` is protected: push a branch, open a PR, wait for checks, and squash-merge it. The version bump has to be on
`main` before you tag, because the tag must point at the merged commit.

### 4. Tag the merged commit and push the tag

```bash
git checkout main && git pull
git tag 1.2.1          # exactly the version in both package.json files, no `v` prefix
git push origin 1.2.1
```

Pushing the tag triggers the publish workflow. Tag pushes are allowed even though branch pushes to `main` are not.

### 5. Watch the workflow

```bash
gh run watch          # or: gh run list --workflow=publish.yml
```

If "Verify package versions match tag" fails, the tag and the `package.json` versions disagree: delete the tag
(`git push --delete origin <tag>`), fix the versions through another PR, and re-tag.

### 6. Verify the registry

```bash
npm view @blit386/kit version
npm view create-blit386 version
```

### 7. Smoke test (once the registry has propagated)

```bash
cd /tmp
npm create blit386@latest smoke-test
cd smoke-test
npm install
npm run dev
npx blit doctor
```

## Fallback: publishing by hand

Use only when CI cannot do it (workflow broken, npm token expired, an emergency re-publish). Same rules apply – engine
first, kit first, `pnpm publish` always, versions permanent.

```bash
pnpm run preflight
# commit, push (pnpm publish refuses a dirty tree; --no-git-checks only with explicit user sign-off)

pnpm --filter @blit386/kit publish --dry-run
pnpm --filter @blit386/kit publish            # add --otp=123456 if 2FA is on

pnpm --filter create-blit386 publish --dry-run
# confirm the dry-run manifest shows "@blit386/kit": "<version>", not "workspace:*"
pnpm --filter create-blit386 publish          # --otp=... if 2FA
```

Then verify the registry and smoke test exactly as in steps 6–7 above, and still push the version tag afterwards so the
repo history records the release (the workflow will find both versions already on npm and skip).

## Troubleshooting

See Troubleshooting in `PUBLISHING.md` for the tag-pattern gotcha (no `v` prefix), 404 propagation lag, E401, dirty
tree, version reuse (402), and scoped package access issues.

## Report to the user

After a successful release:

- Published versions for `@blit386/kit` and `create-blit386`, and which path was used (tag-driven CI vs. manual)
- Whether the engine-first gate applied, and what `npm view blit386 version` showed
- Whether `BLIT386_RANGE` / `blit386.engineRange` or kit `content/docs/` were updated in the same release
- Confirmation the release tag (no `v` prefix) is pushed and points at the merged `main` commit
