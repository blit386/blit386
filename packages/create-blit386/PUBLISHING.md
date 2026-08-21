# Publishing

`blit386`, `@blit386/kit`, and `create-blit386` release in **lockstep**: one shared `x.y.z` version across all three,
bumped together by `scripts/bump-lockstep.mjs` (repo root). This file documents the publish steps for the two packages
published from here; the engine's own build-and-publish step is `pnpm run release` inside `packages/blit386` (see
`/release`). Both flows are one release: the engine publishes first, then this file's two packages.

| Package | npm name | Scope | What it is |
| --- | --- | --- | --- |
| `packages/kit` | `@blit386/kit` | scoped | The `blit` CLI plus the canonical `AGENTS.md` and game docs. |
| `packages/create-blit386` | `create-blit386` | unscoped | The `npm create blit386` scaffolder. Depends on the kit. |

## Semver policy: the engine anchors semver

Lockstep means one version number, but the three packages do not carry equal semver weight. The **engine anchors
semver**: a breaking change confined to the scaffolder CLI or to kit content is absorbed as a **minor**, not a major,
because a major would tell engine users their game code might break when it will not. Only a breaking change in the
`blit386` engine's own public API justifies a major bump.

This is the one place lockstep loses information – a major bump no longer means "the CLI changed its flags," it always
means "the engine broke compatibility." Treat that loss as intentional and keep this rule written down rather than
assumed; see the SemVer choice bullet in the pre-bump checklist below.

## Golden rules (read these first)

1. Do not publish kit content that documents a new engine API before that engine version is on npm. See "Release order:
   engine first" below. This is the one rule that can currently break real users' games. (Audio content needed `1.3.0`;
   hot-reload / `blit386/vite` / `BT.loadingAssetsCount` content needs `1.4.0`, which is live on npm.)
2. Always use `pnpm publish`, never `npm publish`. `create-blit386` depends on `@blit386/kit` via `workspace:*`, and
   only pnpm rewrites that to a real version number when publishing. `npm publish` would ship a broken
   `"@blit386/kit": "workspace:*"` dependency.
3. Publish `@blit386/kit` before `create-blit386`, and both only after the engine (`blit386`) is confirmed live on npm.
   The scaffolder depends on the kit, so the kit must exist on npm first; the kit's docs may describe engine API that
   must already be published (golden rule 1).
4. Versions are permanent. You can never reuse or overwrite a published version – bump the version before republishing.
   Every release publishes all three packages, including any with no changes since the last release – that is the
   accepted cost of lockstep, matching how Babel and Angular operate. Do not add logic to skip an unchanged package.
5. Release tags carry no `v` prefix (`1.2.0`, not `v1.2.0`). One tag per release, covering all three packages – there is
   only one tag series now that they share a version, matching every existing tag in the repo (`0.1.0`, `1.0.0`,
   `1.1.0`, `1.2.0`, `1.2.1`).
6. Publishing is manual-only. There is no CI publish workflow and no `NPM_TOKEN` secret – see "Publishing is
   manual-only" below for why. Every release is `pnpm publish` (or, for the engine, `pnpm run release`) from vancura's
   machine. With two-factor auth on, that means one package at a time, each needing a fresh one-time code (`--otp`).

## Publishing is manual-only

`create-blit386` used to publish via a tag-triggered GitHub Actions workflow (`.github/workflows/publish.yml`). That
workflow is deleted. The `1.2.1` release exposed that the `NPM_TOKEN` repository secret it depended on was missing – the
workflow ran, built, and then failed at the actual `npm publish` call with `ENEEDAUTH`. Rather than provision and
maintain that secret, the decision is to never publish from CI: every release is a manual `pnpm publish` run from
vancura's machine, following the procedure below. This is deliberate, not a temporary fallback – if you find yourself
wondering whether to re-add a publish workflow, don't.

Tags are still cut and pushed after a manual publish, exactly as before. They no longer trigger anything; they are
purely a marker in the repo history for which commit shipped which version.

## Release order: engine first

The `blit386` engine, `@blit386/kit`, and `create-blit386` version independently, but the kit's content _describes_ the
engine, so it can describe an engine that does not exist yet. Before publishing a kit release that documents new engine
API, confirm that engine version is already on npm:

```bash
npm view blit386 version
```

If the kit ships first, every newly scaffolded game gets a skill or doc telling the player's AI assistant to call an
engine function that does not exist yet – the assistant will write code that throws, in a project aimed at a
twelve-year-old. The correct sequence is always: publish the engine (its own release process), confirm it is live, then
release the kit content that depends on it. This rule generalizes to every future engine API the kit documents, not just
audio.

## One-time setup

- Node.js >= 22.18.0 and pnpm 11.20.0 (this repo pins pnpm via `packageManager`).
- An npm account (`vancura`) that owns the free `blit386` organization – that org grants the `@blit386` scope.
- Log in and confirm:

  ```bash
  npm login
  npm whoami        # must print: vancura
  ```

- If you have 2FA enabled, have your authenticator app ready for OTP codes.

## Release procedure

Run everything from the repo root (`blit386/`) unless noted.

### 0. Pre-bump checklist

Walk this before choosing a version. Skip a row only when it truly does not apply.

- [ ] `git checkout main && git pull` – release from a clean, up-to-date `main`, not a stale feature branch.
- [ ] `git log "$(git describe --tags --abbrev=0)"..HEAD --oneline` – draft release-note bullets now (hand-written; see
      step 8). Split by package (engine, kit content / `blit` CLI, scaffolder/starter), plus migrations (`blit upgrade`
      / `blit migrate`) and maintainer-only.
- [ ] SemVer choice – the engine anchors semver (see "Semver policy" above): `patch` for fixes only; `minor` when you
      ship user-facing features, new kit docs/skills, or a breaking change confined to the CLI or kit content; `major`
      only for a breaking change in the engine's own public API, with a migration entry in
      `packages/kit/src/migrations/registry.ts`. All three packages always share one version.
- [ ] Engine-first – if kit `content/` documents new engine API, `npm view blit386 version` already satisfies it.
- [ ] Migrations – new upgrade paths registered and covered by kit tests when behavior for existing games changes.
- [ ] Templates – starter `vite.config`, Catcher examples, and optional CI still match what the kit docs teach.

### 1. Confirm the engine dependency is satisfied

If this release's kit content documents any engine API, that engine version must already be on npm. See "Release order:
engine first" above.

### 2. Bump versions

All three packages release in lockstep and must carry the same `x.y.z` version. Choose the version from the checklist
above, then set it in one shot from the repo root – do not run separate `npm version` commands per package (that is how
packages drift):

```bash
pnpm run bump -- 1.5.0 --dry-run  # preview only; replace 1.5.0 with the SemVer you chose
pnpm run bump -- 1.5.0            # write the lockstep bump
# equivalent: node scripts/bump-lockstep.mjs 1.5.0
```

One command updates six things in one pass: `packages/blit386/package.json`, `packages/blit386/src/core/BTAPI.ts`'s
`VERSION_MAJOR` / `VERSION_MINOR` / `VERSION_PATCH`, `packages/kit/package.json` (both its own `version` and its derived
`blit386.engineRange`), `packages/create-blit386/package.json`, and `packages/create-blit386/src/scaffold.ts`'s derived
`BLIT386_RANGE`. Neither derived range needs a manual edit – see "Versioning notes".

`create-blit386`'s dependency on the kit is `workspace:*`, so it automatically tracks the kit's new version – no manual
dependency edit needed.

### 3. Check locally, then land the bump through a PR

```bash
pnpm install
pnpm run test:bump-lockstep         # unit tests for the bump script itself
pnpm run format:check && pnpm run docs:links && pnpm run agents:check && pnpm run test:agent-config
pnpm run bump:check                 # engineRange / BLIT386_RANGE safety net
pnpm --filter blit386 run preflight
pnpm --filter @blit386/kit run typecheck && pnpm --filter @blit386/kit run test
pnpm --filter create-blit386 run typecheck && pnpm --filter create-blit386 run test
```

Neither `packages/kit` nor `packages/create-blit386` has its own combined `preflight` script – see `/preflight kit` (or
`create-blit386`) for the full per-package check breakdown.

`main` is protected: push a branch, open a PR, wait for checks, and merge it (`gh pr merge --merge`; squash merging is
disabled on the repository). The version bump has to be on `main` before you publish, because you publish (and later
tag) from the merged commit.

### 4. Publish

Run this from the merged `main` commit (checkout and pull first). This step assumes the engine (`blit386`) already
published from this same commit – `cd packages/blit386 && pnpm run release` – and `npm view blit386 version` confirms it
is live (golden rule 3).

```bash
git checkout main && git pull
```

Publish the KIT FIRST (the scaffolder depends on it):

```bash
pnpm --filter @blit386/kit publish --dry-run   # preview the file list and version
pnpm --filter @blit386/kit publish             # add --otp=123456 if 2FA is on
```

The kit is scoped, but `publishConfig.access: public` (in its `package.json`) keeps it a free, public package. Add
`--access public` explicitly if you want to be certain.

Publish the SCAFFOLDER SECOND:

```bash
pnpm --filter create-blit386 publish --dry-run
```

In the dry-run output, confirm the manifest shows `"@blit386/kit": "<version>"`, not `"workspace:*"`. That rewrite is
the entire reason for using `pnpm publish`. Then:

```bash
pnpm --filter create-blit386 publish           # --otp=... if 2FA
```

`create-blit386` is unscoped, so it is public by default – no `--access` flag needed.

`pnpm publish` refuses to publish with uncommitted changes. Commit the release changes first – publish and tag from that
same commit, never from a dirty tree.

### 5. Tag the release

Tags carry no `v` prefix. One tag covers all three packages – tag the commit on `main` you published all three from:

```bash
git tag 1.5.0          # exactly the version you published (example)
git push origin 1.5.0
```

This is a record, not a trigger for these two packages – nothing listens for it here. It IS a trigger for the docs and
demos site production deploys (`deploy.yml`, tag pattern `[0-9]+.[0-9]+.[0-9]+`), which is exactly why there is only one
tag series: a kit- or scaffolder-only release still deploys the sites, which is correct now that a single tag means "the
whole release."

### 6. Verify the registry

```bash
npm view blit386 version
npm view @blit386/kit version
npm view create-blit386 version
```

### 7. Smoke test (once the registry has propagated – see Troubleshooting)

```bash
cd /tmp
npm create blit386@latest smoke-test
cd smoke-test
npm install      # resolves @blit386/kit from npm
npm run dev      # plays the Catcher starter game
npx blit doctor  # should report blit386 installed and the kit-engine range compatible
```

`blit doctor`'s "blit386 X.Y.Z is compatible with this kit (^X.Y.Z)" line is a good live check that an `engineRange`
bump from step 2 actually took effect.

When the release touches agents or hot reload, spend two extra minutes:

- Scaffold once with Claude or Cursor selected and confirm the generated agent files look right (for Claude: hooks under
  `.claude/` / `settings.json`; for Cursor: `.cursor/commands` and hooks).
- Run `npx blit agents sync` on the smoke project and confirm it reports clean (or only expected drift).
- If the starter ships `blit386/vite`, edit a `render()` line and confirm hot reload without a full page reload.

For existing games (not the fresh smoke scaffold): release notes should mention `npx blit upgrade` / `npx blit migrate`
when the kit ships a migration (for example enabling the Vite hot-reload plugin). Fresh scaffolds already get the new
defaults; upgrades are how older projects catch up.

### 8. Publish the GitHub Release

One release, one `RELEASE.md`, grouped by package (engine / kit / scaffolder) – see `/release`, which generates it.
Always `--latest`; with one tag series there is no `--latest=false` case:

```bash
gh release create 1.5.0 --title "1.5.0" --notes-file RELEASE.md --latest
```

Release notes are hand-written, not generated verbatim from commit messages – draft from the `git log` you captured in
step 0 and match the style of prior releases at <https://github.com/blit386/blit386/releases>.

## What gets published

- `@blit386/kit`: `dist/` (the built CLI) + `content/` (`AGENTS.md`, `docs/`, `skills/`, `rules/`, `hooks/`,
  `hooks.manifest.json`) + `README.md` + `LICENSE`.
- `create-blit386`: `dist/` (the built scaffolder) + `templates/` (`base/`, `js/`, `ts/`, `optional/`) + `README.md` +
  `LICENSE`.

Each package's `files` field controls this, and each has a `prepack` script that rebuilds `dist/` automatically on
publish – so a stale or missing build cannot ship. `README.md` and `LICENSE` are always included by npm.

Everything under the kit's `content/` is copied into every scaffolded game. That is why the release-order rule matters:
publishing the kit publishes the instructions an AI assistant will follow inside a real child's project.

## Versioning notes

- Follow SemVer, anchored to the engine (see "Semver policy" above). All three packages are past 1.0 and real users –
  including kids – depend on them, so an engine-breaking change needs a major bump and a migration entry
  (`packages/kit/src/migrations/registry.ts`, surfaced by `blit migrate` / `blit upgrade`). There is no default bump
  size – choose `patch` / `minor` / `major` from the pre-bump checklist, then pass the resulting `x.y.z` to
  `pnpm run bump`.
- All three packages release in lockstep on the same version. `scripts/bump-lockstep.mjs` lives at the repo root (not
  inside this package – it reaches across `packages/*`, so a scaffolder-scoped location was the wrong shape) and updates
  all three `package.json` files plus every derived constant in one pass – not the monorepo root `package.json`, which
  stays at its own private `0.0.0`.
- To make the scaffolder tolerate kit patch releases without a re-publish, change `create-blit386`'s dependency from
  `workspace:*` to `workspace:^` (it then publishes as `^x.y.z` instead of an exact pin).
- The generated game's pinned engine version lives in `packages/create-blit386/src/scaffold.ts` (`const BLIT386_RANGE`).
  It is a caret range, so it already admits future patch/minor engine releases within the same major. The kit version
  written into generated projects is read automatically from the kit's own `package.json`.
- `packages/kit/package.json` declares `blit386.engineRange`, the engine range the kit's docs describe. `blit doctor`
  compares it against the installed engine via `satisfiesCaretRange()` (`packages/kit/src/env.ts`) and reports drift.
  This is not the same thing as `BLIT386_RANGE`: `engineRange` is checked against an already-installed engine on an
  existing project, while `BLIT386_RANGE` only affects what a fresh scaffold's `package.json` pins.
- Both `engineRange` and `BLIT386_RANGE` are **derived**, not hand-edited: `pnpm run bump -- x.y.0` sets both to
  `^x.y.0` (major.minor from the lockstep version, patch pinned to `0`) automatically. `pnpm run bump:check`
  (`scripts/bump-lockstep.mjs --check`) re-derives every lockstep value from `packages/blit386/package.json` and exits
  non-zero on any mismatch; it runs in CI's `quality-root` job and in `.husky/pre-push`, so a hand edit, a bad merge, or
  a cherry-pick between releases fails loudly instead of shipping. Neither range needs a checklist row of its own – this
  is the concrete payoff of lockstep versioning (BT-410).
- Kit doc content (`packages/kit/content/docs/*.md`) can go stale even when `engineRange` is correct, if the engine
  gains or changes public API within an already-covered range. `packages/kit/package.json`'s `blit386.docsReviewedAt`
  marks the engine version the docs were last hand-reviewed against; `scripts/check-kit-docs-drift.mjs` (repo root)
  compares it to `packages/blit386/docs/_api-history.json`, and `.github/workflows/kit-docs-drift.yml` runs
  `scripts/report-kit-docs-drift.mjs`, which files or updates a Linear tracking issue when they diverge – advisory only,
  never a blocking CI check. Bump `docsReviewedAt` once you have actually reviewed the flagged docs (BT-293).

## Troubleshooting

- `npm view ... 404` right after publishing a brand-new scope. Normal CDN propagation lag (a first publish to a new
  scope can take a few minutes, occasionally up to ~15). The npmjs.com website shows the package sooner than the read
  API. Wait and retry – do not republish (the version is already taken).
- `E401 Unauthorized` on `npm whoami` or publish: run `npm login`.
- `EOTP` / "This operation requires a one-time password": pass `--otp=<code>` from your authenticator app. If the
  browser-based auth URL npm prints is redacted or unusable in your current terminal (some sandboxed/relayed shells
  redact anything that looks like an auth token), run the publish command in a plain, unproxied terminal instead.
- pnpm refuses to publish (working tree not clean / not on the publish branch): commit and push first – publish only
  from a clean tree on the release commit.
- `You cannot publish over the previously published versions`: bump the version; versions cannot be reused.
- `402 Payment Required` / package went private: ensure the scoped package is public (`--access public`; it is set in
  `publishConfig`). Free orgs can only publish public packages.
- `ERR_PNPM_NO_GLOBAL_BIN_DIR` (only when running `pnpm link --global`, not publish): run `pnpm setup`, open a new
  terminal, and try again. For a global `blit` during development, `npm link` from `packages/kit` works without setup.
