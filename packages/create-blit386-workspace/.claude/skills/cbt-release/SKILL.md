---
name: cbt-release
description:
  Publish @blit386/kit and create-blit386 to npm following the workspace PUBLISHING.md procedure. Publishing is
  manual-only (pnpm publish from vancura's machine) -- there is no CI publish workflow. Does not bump versions unless
  the user asks.
---

# Release (npm publish)

Guide a deliberate release of `@blit386/kit` and `create-blit386`. This skill does not auto-bump versions, open PRs,
push tags, or publish unless the user explicitly requests those steps.

Canonical procedure: workspace parent `PUBLISHING.md` (from this repo root: `../PUBLISHING.md` when the three repos
share the `_BLIT386_` parent folder). This skill mirrors it — if they ever disagree, `PUBLISHING.md` wins and this skill
is stale.

## Usage

```text
/cbt-release
```

## Publishing is manual-only

There is no `.github/workflows/publish.yml` and no `NPM_TOKEN` secret. Nothing publishes on a tag push. Every release is
`pnpm publish` run by hand from vancura's machine, after `npm login` locally. This is a deliberate policy (2026-07-14,
see `../PUBLISHING.md` in the local workspace layout, or this repo's release history) after the tag-driven workflow
failed with `ENEEDAUTH` on the `1.2.1` release because the `NPM_TOKEN` secret was missing — rather than re-provision it,
CI publishing was removed outright. Do not suggest re-adding a publish workflow or an `NPM_TOKEN` secret.

Tags are still cut and pushed after a manual publish, purely as a release marker in the repo history — they trigger
nothing.

## Golden rules (never skip)

1. **Engine first.** If this release's kit content documents a new engine API (for example audio –
   `content/docs/audio.md`, the `play-a-sound` / `design-a-sound` skills), find the exact engine version that content
   requires (check its own version callouts, e.g. `audio.md`'s "Sound arrived in blit386 1.3.0" – don't assume
   `BLIT386_RANGE` / `blit386.engineRange` are current, they may still lag behind and are only bumped in step 2 below),
   then confirm via `npm view blit386 version` that the published version already satisfies it. Publishing kit
   docs/skills ahead of the engine sends a twelve-year-old's AI assistant instructions for an API that does not exist
   yet.
2. Always `pnpm publish`, never `npm publish` – only pnpm rewrites `workspace:*` to a real version.
3. Publish `@blit386/kit` before `create-blit386` – the scaffolder depends on the kit.
4. Versions are permanent – bump before republishing; never reuse a published version. Both packages release in lockstep
   on the same version number.
5. Release tags carry no `v` prefix (`1.2.0`, not `v1.2.0`).
6. `engineRange` (kit `package.json`) and `BLIT386_RANGE` (scaffolder) are not the same mechanism. `engineRange` feeds
   `blit doctor`'s compatibility check against an _already-installed_ engine on an existing project — leaving it stale
   makes `blit doctor` report a false "compatible" once the kit's own content documents newer engine API than the range
   admits. `BLIT386_RANGE` only affects what a fresh scaffold pins, and `npm install` always resolves that to the latest
   version satisfying the range regardless of the exact floor. Bump both together for consistency, but `engineRange` is
   the one doing safety-critical work.

## Procedure

### 1. Confirm the engine dependency is satisfied

See golden rule 1. If nothing new in this release documents a new engine API, skip straight to step 2.

### 2. Bump versions

```bash
cd packages/kit && npm version patch --no-git-tag-version && cd ../..
cd packages/create-blit386 && npm version patch --no-git-tag-version && cd ../..
```

Use `minor` or `major` instead of `patch` when appropriate – both packages must land on the same version.

Also check whether `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` and `blit386.engineRange` in
`packages/kit/package.json` need updating (see golden rule 6).

### 3. Check locally, then land the bump through a PR

```bash
pnpm install
pnpm run preflight    # format:check + lint + typecheck + spellcheck + knip + docs:links + build + test
```

`main` is protected: push a branch, open a PR, wait for checks, and squash-merge it. The version bump has to be on
`main` before you publish, because you publish from the merged commit.

### 4. Publish

```bash
git checkout main && git pull
npm whoami   # must print: vancura -- run `npm login` first if not

pnpm --filter @blit386/kit publish --dry-run
pnpm --filter @blit386/kit publish            # add --otp=123456 if 2FA is on

pnpm --filter create-blit386 publish --dry-run
# confirm the dry-run manifest shows "@blit386/kit": "<version>", not "workspace:*"
pnpm --filter create-blit386 publish          # --otp=... if 2FA
```

`pnpm publish` refuses a dirty tree — commit first, or pass `--no-git-checks` only with explicit user sign-off.

If the browser-based OTP auth URL npm prints is redacted or unusable in the current terminal (some sandboxed/relayed
shells redact anything that looks like an auth token), have the user run the publish command in a plain, unproxied
terminal instead, or provide a 6-digit code from their authenticator app for `--otp=`.

### 5. Tag the release

```bash
git tag 1.2.1          # exactly the version you just published, no `v` prefix
git push origin 1.2.1
```

This is a record, not a trigger — nothing listens for it.

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

`blit doctor`'s "blit386 X.Y.Z is compatible with this kit (^X.Y.Z)" line is a good live check that the `engineRange`
bump from step 2 actually took effect.

### 8. Publish the GitHub Release

Release notes are hand-written, not generated from commit messages. Draft them from the merged PRs since the last tag,
matching the style of prior releases at `https://github.com/blit386/create-blit386/releases`, then:

```bash
gh release create 1.2.1 --title "Release 1.2.1" --notes-file <path>
```

## Troubleshooting

See Troubleshooting in `PUBLISHING.md` for the tag-pattern gotcha (no `v` prefix), 404 propagation lag, E401, EOTP,
dirty tree, version reuse (402), and scoped package access issues.

## Report to the user

After a successful release:

- Published versions for `@blit386/kit` and `create-blit386`
- Whether the engine-first gate applied, and what `npm view blit386 version` showed
- Whether `BLIT386_RANGE` / `blit386.engineRange` or kit `content/docs/` were updated in the same release
- Confirmation the release tag (no `v` prefix) is pushed and points at the merged `main` commit, and that the GitHub
  Release is published
