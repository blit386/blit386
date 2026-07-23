# Publishing

This repo publishes two packages to npm:

| Package                   | npm name         | Scope    | What it is                                                   |
| ------------------------- | ---------------- | -------- | ------------------------------------------------------------ |
| `packages/kit`            | `@blit386/kit`   | scoped   | The `blit` CLI plus the canonical `AGENTS.md` and game docs. |
| `packages/create-blit386` | `create-blit386` | unscoped | The `npm create blit386` scaffolder. Depends on the kit.     |

## Golden rules (read these first)

1. Do not publish kit content that documents a new engine API before that engine version is on npm. See "Release order:
   engine first" below. This is the one rule that can currently break real users' games. (Audio content needed `1.3.0`;
   hot-reload / `blit386/vite` / `BT.loadingAssetsCount` content needs `1.4.0`, which is live on npm.)
2. Always use `pnpm publish`, never `npm publish`. `create-blit386` depends on `@blit386/kit` via `workspace:*`, and
   only pnpm rewrites that to a real version number when publishing. `npm publish` would ship a broken
   `"@blit386/kit": "workspace:*"` dependency.
3. Publish `@blit386/kit` before `create-blit386`. The scaffolder depends on the kit, so the kit must exist on npm
   first.
4. Versions are permanent. You can never reuse or overwrite a published version – bump the version before republishing.
5. Release tags carry no `v` prefix (`1.2.0`, not `v1.2.0`), matching every existing tag in the repo (`0.1.0`, `1.0.0`,
   `1.1.0`, `1.2.0`, `1.2.1`).
6. Publishing is manual-only. There is no CI publish workflow and no `NPM_TOKEN` secret – see "Publishing is
   manual-only" below for why. Every release is `pnpm publish` from vancura's machine. With two-factor auth on, that
   means one package at a time, each needing a fresh one-time code (`--otp`).

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

- Node.js >= 22.18.0 and pnpm 10.26.2 (this repo pins pnpm via `packageManager`).
- An npm account (`vancura`) that owns the free `blit386` organization – that org grants the `@blit386` scope.
- Log in and confirm:
  ```bash
  npm login
  npm whoami        # must print: vancura
  ```
- If you have 2FA enabled, have your authenticator app ready for OTP codes.

## Release procedure

Run everything from the `create-blit386` repo root unless noted.

### 1. Confirm the engine dependency is satisfied

If this release's kit content documents any engine API, that engine version must already be on npm. See "Release order:
engine first" above.

### 2. Bump versions

Both packages release in lockstep and must carry the same version. Bump the version number without letting npm create
per-package git tags:

```bash
cd packages/kit && npm version minor --no-git-tag-version && cd ../..
cd packages/create-blit386 && npm version minor --no-git-tag-version && cd ../..
```

Use `patch` or `major` instead of `minor` as appropriate. `create-blit386`'s dependency on the kit is `workspace:*`, so
it automatically tracks the kit's new version – no manual edit needed.

Also check whether `packages/kit/package.json`'s `blit386.engineRange` and `packages/create-blit386/src/scaffold.ts`'s
`BLIT386_RANGE` need to move forward – see "Versioning notes" below. Both stay in sync with each other.

### 3. Check locally, then land the bump through a PR

```bash
pnpm install
pnpm run preflight    # format:check + lint + typecheck + spellcheck + knip + docs:links + agents:check + sync:cursor-commands:check + test:agent-config + test:cursor-commands + build + test
```

`main` is protected: push a branch, open a PR, wait for checks, and squash-merge it. The version bump has to be on
`main` before you tag, because the tag must point at the merged commit.

### 4. Publish

Run this from the merged `main` commit (checkout and pull first).

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

`pnpm publish` refuses to publish with uncommitted changes; commit first, or append `--no-git-checks`.

### 5. Tag the release

Tags carry no `v` prefix. Tag the commit on `main` you just published from:

```bash
git tag 1.3.0          # exactly the version you published
git push origin 1.3.0
```

This is a record, not a trigger – nothing listens for it.

### 6. Verify the registry

```bash
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

### 8. Publish the GitHub Release

```bash
gh release create 1.3.0 --title "Release 1.3.0" --notes-file <path to your written notes>
```

Release notes are hand-written, not generated from commit messages – see prior releases at
<https://github.com/blit386/create-blit386/releases> for style and structure.

## What gets published

- `@blit386/kit`: `dist/` (the built CLI) + `content/` (`AGENTS.md`, `docs/`, `skills/`, `rules/`, `hooks/`,
  `agents.config.json`, `hooks.manifest.json`) + `README.md` + `LICENSE`.
- `create-blit386`: `dist/` (the built scaffolder) + `templates/` (`base/`, `js/`, `ts/`, `optional/`) + `README.md` +
  `LICENSE`.

Each package's `files` field controls this, and each has a `prepack` script that rebuilds `dist/` automatically on
publish – so a stale or missing build cannot ship. `README.md` and `LICENSE` are always included by npm.

Everything under the kit's `content/` is copied into every scaffolded game. That is why the release-order rule matters:
publishing the kit publishes the instructions an AI assistant will follow inside a real child's project.

## Versioning notes

- Follow SemVer. Both packages are past 1.0 (currently `1.2.1`) and real users – including kids – depend on them, so
  breaking changes need a major bump and a migration entry (`packages/kit/src/migrations/registry.ts`, surfaced by
  `blit migrate` / `blit upgrade`).
- Both packages release in lockstep on the same version.
- To make the scaffolder tolerate kit patch releases without a re-publish, change `create-blit386`'s dependency from
  `workspace:*` to `workspace:^` (it then publishes as `^x.y.z` instead of an exact pin).
- The generated game's pinned engine version lives in `packages/create-blit386/src/scaffold.ts` (`const BLIT386_RANGE`,
  currently `^1.4.0`). It is a caret range, so it already admits future patch/minor engine releases within the same
  major – only bump it when new games must start on an engine version the current range excludes. The kit version
  written into generated projects is read automatically from the kit's own `package.json`.
- `packages/kit/package.json` declares `blit386.engineRange` (currently `^1.4.0`), the engine range the kit's docs
  describe. `blit doctor` compares it against the installed engine via `satisfiesCaretRange()`
  (`packages/kit/src/env.ts`) and reports drift. This is not the same thing as `BLIT386_RANGE`: `engineRange` is checked
  against an already-installed engine on an existing project, so it must be bumped the moment the kit's own content
  documents a newer engine API – leaving it stale makes `blit doctor` report a false "compatible" for a project that has
  synced in docs describing API it doesn't have yet. `BLIT386_RANGE` only affects what a fresh scaffold's `package.json`
  pins, and `npm install` always resolves that to the latest version satisfying the range regardless of its exact floor
  – bump it to match `engineRange` for consistency, but it is not the field doing the safety-critical work.

## Troubleshooting

- `npm view ... 404` right after publishing a brand-new scope. Normal CDN propagation lag (a first publish to a new
  scope can take a few minutes, occasionally up to ~15). The npmjs.com website shows the package sooner than the read
  API. Wait and retry – do not republish (the version is already taken).
- `E401 Unauthorized` on `npm whoami` or publish: run `npm login`.
- `EOTP` / "This operation requires a one-time password": pass `--otp=<code>` from your authenticator app. If the
  browser-based auth URL npm prints is redacted or unusable in your current terminal (some sandboxed/relayed shells
  redact anything that looks like an auth token), run the publish command in a plain, unproxied terminal instead.
- pnpm refuses to publish (working tree not clean / not on the publish branch): commit and push first, or add
  `--no-git-checks`.
- `You cannot publish over the previously published versions`: bump the version; versions cannot be reused.
- `402 Payment Required` / package went private: ensure the scoped package is public (`--access public`; it is set in
  `publishConfig`). Free orgs can only publish public packages.
- `ERR_PNPM_NO_GLOBAL_BIN_DIR` (only when running `pnpm link --global`, not publish): run `pnpm setup`, open a new
  terminal, and try again. For a global `blit` during development, `npm link` from `packages/kit` works without setup.
