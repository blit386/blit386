# Dependency security policy

Continuous dependency vulnerability gating for the `blit386` library repo.

## Severity gate

| Scope                         | Command                        | Fail threshold         |
| ----------------------------- | ------------------------------ | ---------------------- |
| All dependencies (dev + prod) | `pnpm run security:audit`      | **Moderate** and above |
| Production / runtime only     | `pnpm run security:audit:prod` | **Moderate** and above |

Low and informational advisories do **not** fail CI or local gates.

CI runs both checks on every pull request and push to `main` via the **Dependency Security Audit** job in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

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

| Cadence                 | Mechanism                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated (weekly)**  | [Renovate](https://docs.renovatebot.com/) — Monday before 06:00 Europe/Prague; `vulnerabilityAlerts` open PRs with the `security` label |
| **Automated (monthly)** | Renovate `lockFileMaintenance` — first day of the month                                                                                 |
| **Manual (monthly)**    | Review `pnpm outdated`; run the [security runbook](./security-runbook.md) MCP preflight and audits                                      |
| **Per release**         | Run `pnpm run security:audit` and `pnpm run security:audit:prod` before tagging                                                         |

Patch updates for GitHub Actions and npm patches may automerge per [renovate.json](../../renovate.json). Minor and major
updates require manual review.

## Supply-chain settings

[`.npmrc`](../../.npmrc) enables `minimum-release-age` (7 days) and related pnpm 10 hardening. Security-patched packages
blocked by release age may be listed in `minimum-release-age-exclude[]` together with `pnpm.overrides` in
[`package.json`](../../package.json). Document the reason in the PR that introduces the exclude or override.

## GitHub Actions pinning

Workflows under [`.github/workflows/`](../../.github/workflows/) pin third-party actions to a **40-character commit
SHA**, with an optional trailing comment for the human-readable tag (for example `actions/checkout@<sha> # v6`). Mutable
`@vN` tags are not used in [`ci.yml`](../../.github/workflows/ci.yml) or
[`pr-checks.yml`](../../.github/workflows/pr-checks.yml).

Each job declares the **minimum** `permissions` it needs (for example `contents: read` for build-only jobs; the
benchmark job adds `actions: read` and `pull-requests: write` only where artifact lookup and PR comments require it).

### Bumping pinned actions

| Path        | Who updates SHAs                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **Routine** | [Renovate](../../renovate.json) `github-actions` manager — grouped PRs, 3-day `minimumReleaseAge`, patch automerge    |
| **Manual**  | Resolve the release tag commit on the action repo, replace the SHA in the workflow, keep or update the `# vN` comment |

After any workflow edit, confirm the affected jobs still pass in CI (artifact upload, Codecov, benchmark baseline
lookup, PR benchmark comments).

### npm publish provenance

Library releases use the local `pnpm run release` script (`pnpm run build && pnpm publish`). **npm provenance**
(`pnpm publish --provenance`) expects an OIDC-backed publish environment (typically a dedicated GitHub Actions release
workflow). That flow is not wired today; provenance would be a separate change if releases move into CI.

## Temporary risk acceptance

Do not merge with a failing audit unless the finding is formally accepted:

1. Open a [security risk acceptance](../../.github/ISSUE_TEMPLATE/security-risk-acceptance.yml) issue.
2. Record the GHSA in [audit-exceptions.md](./audit-exceptions.md).
3. Add the GHSA to `pnpm.auditConfig.ignoreGhsas` in `package.json` (review and remove by the expiry date).

See [audit-exceptions.md](./audit-exceptions.md) for the full playbook.

## Related docs

- [security-runbook.md](./security-runbook.md) — MCP preflight, fallback matrix, maintainers / incident triage, report
  template
- [audit-exceptions.md](./audit-exceptions.md) — temporary GHSA acceptance playbook
- [developer-experience-guide.md](../developer-experience-guide.md) — script reference
