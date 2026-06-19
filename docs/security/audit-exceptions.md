# Audit exceptions playbook

Use this when a **moderate or higher** advisory cannot be remediated immediately and CI must stay green with explicit
risk acceptance.

## When to use

- Upstream has no patched release yet.
- A major toolchain bump is required and is scheduled on a tracked issue.
- `pnpm.overrides` are insufficient and the only alternative is a documented temporary ignore.

Do **not** use exceptions for low-severity findings (CI does not gate on them).

## Process

1. **Open a risk-acceptance issue** using the
   [security risk acceptance template](../../.github/ISSUE_TEMPLATE/security-risk-acceptance.yml).
2. **Link a remediation issue** (Linear or GitHub) with an owner and target date.
3. **Add the GHSA** to the `security:audit` script in `package.json`:

   ```json
   "security:audit": "pnpm audit --audit-level=moderate --ignore GHSA-xxxx-xxxx-xxxx"
   ```

   Note: `pnpm.auditConfig.ignoreGhsas` does not work in pnpm 10.x; use the `--ignore` CLI flag instead.

4. **Record the exception** in the table below (one row per GHSA).
5. **Set a review-by date** (default: 30 days; extend only with written rationale in the issue).
6. **Remove on expiry** — remove the `--ignore <GHSA>` flag from the `security:audit` script, clear the table row, and
   close the acceptance issue.

## Active exceptions

| GHSA                                                                     | Package / path             | Severity | Accepted   | Review by  | Remediation issue                                                    | Owner   |
| ------------------------------------------------------------------------ | -------------------------- | -------- | ---------- | ---------- | -------------------------------------------------------------------- | ------- |
| [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | `esbuild@0.25.12` via vite | high     | 2026-06-14 | 2026-06-21 | upgrade esbuild override to ^0.28.1 after minimum-release-age passes | vancura |

## Technical notes

- Prefer `pnpm.overrides` and direct dependency upgrades over `ignoreGhsas` when a patched version exists.
- If `minimum-release-age` in [`.npmrc`](../../.npmrc) blocks a security patch, add the package to
  `minimum-release-age-exclude[]` in the same PR as the override and document why.
- `pnpm.auditConfig.ignoreGhsas` in `package.json` does not work in pnpm 10.x. Use the `--ignore <GHSA>` flag in the
  `security:audit` script instead.
- After any exception, still run `pnpm run security:audit:prod` — production dependencies must remain clean unless
  explicitly documented otherwise.

## Related docs

- [dependency-policy.md](./dependency-policy.md) — when an exception is allowed and the CI audit gate
- [security-runbook.md](./security-runbook.md) — monthly security runs and incident triage
