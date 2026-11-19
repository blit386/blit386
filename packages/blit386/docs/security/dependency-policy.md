# Dependency security policy

Continuous dependency vulnerability gating for the `blit386` library repo.

## Severity gate

| Scope | Command | Fail threshold |
| --- | --- | --- |
| All dependencies (dev + prod) | `pnpm run security:audit` | Moderate and above |
| Production / runtime only | `pnpm run security:audit:prod` | Moderate and above |

Low and informational advisories do not fail CI or local gates.

CI runs both checks on every pull request and push to `main` via the Dependency Security Audit job in
[`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml).

## Local verification

```bash
cd blit386
pnpm install --frozen-lockfile
pnpm run security:audit
pnpm run security:audit:prod
```

`pnpm run security:audit` must match what CI runs. Do not rely on `pnpm audit --fix` alone before a release without
re-running both commands.

## Dependency refresh cadence

| Cadence | Mechanism |
| --- | --- |
| Automated (weekly) | [Renovate](https://docs.renovatebot.com/) - Monday before 06:00 Europe/Prague; `vulnerabilityAlerts` open PRs with the `security` label |
| Automated (monthly) | Renovate `lockFileMaintenance` - first day of the month |
| Manual (monthly) | Review `pnpm outdated`; run the [security runbook](./security-runbook.md) MCP preflight and audits |
| Per release | Run `pnpm run security:audit` and `pnpm run security:audit:prod` before tagging |

Patch updates for GitHub Actions and npm patches may automerge after 7 days (`minimumReleaseAge`), matching
[`pnpm-workspace.yaml`](../../../../pnpm-workspace.yaml)'s `minimumReleaseAge: 10080` (minutes) and
[`.npmrc`](../../../../.npmrc)'s `min-release-age=7` (days, for anyone running plain npm), per
[renovate.json](../../../../renovate.json). Minor and major updates require manual review.

### Renovate vs Dependabot

Dependabot stays enabled for security-only alerts and updates (no `.github/dependabot.yml`, so it does not open version
or GitHub Actions PRs). Renovate owns version bumps, grouping, automerge, and GitHub Actions digest pinning. That split
keeps the two systems from opening competing PRs for the same dependency.

Renovate commits are shaped for this repo's gates: lowercase subjects (`commitMessageAction: "update"`) for commitlint,
and the `:gitSignOff` preset for the DCO workflow. What Renovate leaves alone or limits:

- pnpm: only the root `packageManager` pin is bumped; workflow `pnpm` pins never are, so Actions PRs do not drift from
  `package.json`.
- Node moves by hand everywhere: workflow `node` pins, `.node-version`, and `engines.node`. `create-blit386`'s
  `engines.node` is the Node floor of every generated game, so it is never a dependency update.
- `pnpm-workspace.yaml` overrides get patch and minor bumps (in-major security fixes) but never majors: Renovate updates
  the target of a selector such as `undici@>=7.0.0 <7.30.1` without knowing the selector bounds it.

Renovate also covers the copies outside the workspace: the scaffolder's CI template and the kit's `copilot.ts` action
pins (grouped with the repo workflows), and the caret-ranged dependencies of the scaffolder's `package.json.tmpl` files
(a regex manager, grouped by package name with the workspace's own copies).

Renovate passes no release age to pnpm, and pnpm applies its own `minimumReleaseAge` to every package it resolves. A
bare name in `minimumReleaseAgeExclude` lets pnpm pick a days-old release whose exactly pinned sub-packages are not
exempt, and the lockfile update fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` - every failed "linting and formatting"
PR before BT-783 was that (`cspell`, `knip`).

BT-809 compared Renovate with Dependabot and a scheduled script and kept Renovate: Dependabot cannot read `*.tmpl` files
or a TypeScript constant, and has no lock file maintenance.

## Supply-chain settings

[`pnpm-workspace.yaml`](../../../../pnpm-workspace.yaml) sets `minimumReleaseAge` (7 days), `trustPolicy`, and related
pnpm 11 hardening - pnpm 11 only reads auth/registry settings from `.npmrc`, so this is the single home for all of it. A
security patch blocked by release age may be listed in `minimumReleaseAgeExclude` together with `overrides` in the same
file, as an exact `name@version` with a dated comment, and removed once it ages past the gate. A bare package name
exempts every future release of that package from the gate, so it is never used. Document the reason in the PR that
introduces the exclude or override.

## GitHub Actions pinning

Workflows under [`.github/workflows/`](../../../../.github/workflows/) pin third-party actions to a 40-character commit
SHA, with an optional trailing comment for the human-readable tag (for example `actions/checkout@<sha> # v6`). Mutable
`@vN` tags are not used in [`ci.yml`](../../../../.github/workflows/ci.yml) or
[`pr-checks.yml`](../../../../.github/workflows/pr-checks.yml).

Each job declares the minimum `permissions` it needs - for example `contents: read` for build-only jobs.

### Bumping pinned actions

Renovate extends `helpers:pinGitHubActionDigests`, so action references stay pinned to a 40-character commit SHA with a
trailing `# vN` comment, and routine bumps update the SHA and comment together.

| Path | Who updates SHAs |
| --- | --- |
| Routine | [Renovate](../../../../renovate.json) `github-actions` manager - grouped PRs, 7-day `minimumReleaseAge`, patch automerge, digest pinning |
| Manual | Resolve the release tag commit on the action repo, replace the SHA in the workflow, keep or update the `# vN` comment |

After any workflow edit, confirm the affected jobs still pass in CI (artifact upload, Codecov).

### npm publish provenance

Library releases use the local `pnpm run release` script (`pnpm run build && pnpm publish`). npm provenance
(`pnpm publish --provenance`) expects an OIDC-backed publish environment (typically a dedicated GitHub Actions release
workflow). That flow is not wired today; provenance would be a separate change if releases move into CI.

## Temporary risk acceptance

Do not merge with a failing audit unless the finding is formally accepted:

1. Open a [security risk acceptance](../../../../.github/ISSUE_TEMPLATE/security-risk-acceptance.yml) issue.
2. Record the GHSA in [audit-exceptions.md](./audit-exceptions.md).
3. Add the GHSA via the `--ignore <GHSA>` flag in the `security:audit` script in `package.json` (review and remove by
   the expiry date). Do not use `package.json`'s `pnpm` field - pnpm 11 does not read it at all; permanent exceptions
   belong in `audit.ignore` in [`pnpm-workspace.yaml`](../../../../pnpm-workspace.yaml) instead.

See [audit-exceptions.md](./audit-exceptions.md) for the full playbook.

## Related docs

- [security-runbook.md](./security-runbook.md) - MCP preflight, fallback matrix, maintainers / incident triage, report
  template
- [audit-exceptions.md](./audit-exceptions.md) - temporary GHSA acceptance playbook
- [developer-experience-guide.md](../developer-experience-guide.md) - script reference
