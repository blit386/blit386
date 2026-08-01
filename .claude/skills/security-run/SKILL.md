---
name: security-run
description:
  Run MCP security preflight, governance checks, and documented fallbacks for BLIT386 security workflows. Use before
  comprehensive security scans or hardening passes, or whenever MCP security-scanner availability (Opsera, JFrog,
  Semgrep) is uncertain and scans still need to happen via a documented fallback. Takes a package argument (blit386 or
  demos – the only two packages with MCP-backed security scanning).
---

# Security Run

Deterministic security workflow for the monorepo. Use before comprehensive security scans, hardening passes, or when MCP
scanner availability is uncertain.

## Usage

```text
/security-run <package>
```

Where `<package>` is `blit386` or `demos`. `docs-site`, `kit`, and `create-blit386` have no MCP-backed security scanning
– run their `security:audit` script directly (see `/deep-review <package>` step 3) instead of this skill.

## Prerequisites

- The session's MCP descriptor path (`mcps` folder for the active workspace; agent/tooling-specific)
- Node.js and pnpm per `packages/blit386/package.json`

## Steps

1. MCP preflight (required)

- Read tool schemas before any MCP tool calls (per environment rules)
- Run from `packages/blit386` (canonical script location for both packages):

  ```bash
  pnpm run security:mcp-preflight -- \
    --mcps-dir "<mcps-path>" \
    --repo-root . \
    --allow-fallback \
    --output-json security-reports/mcp-preflight-latest.json
  ```

  For `demos`, either run from `packages/blit386` with `--repo-root ../demos`, or `cd packages/demos` and run with
  `--repo-root .`:
  `node ../blit386/scripts/security/mcp-preflight.mjs --mcps-dir "<mcps-path>" --repo-root . --allow-fallback ...`.

- Record each security MCP status: `healthy`, `auth_required`, `errored`, or `absent`
- If Opsera (`plugin-opsera-devsecops-opsera`) is not `healthy`, do not skip scans; continue with fallbacks from
  [docs/security/security-runbook.md](../../../packages/blit386/docs/security/security-runbook.md)

2. Repo-native checks (per package)

- `pnpm run security:audit`
- `pnpm audit --prod --audit-level=moderate`
- `pnpm audit --dev --audit-level=moderate`
- `/preflight <package>`
- `demos` only: `pnpm run build` after dependency/toolchain changes

3. Optional MCP-backed scans (only when healthy)

- Opsera: `architecture-analyze`, `security-scan`, `compliance-audit` (inspect plugin tool schemas first)
- JFrog / Semgrep: only when server status is `healthy`

4. Cross-package (when assessing both)

- Repeat step 2 for the other package, using the same `--mcps-dir` for both

5. Report

- Emit the report template from the runbook
- List every fallback executed and why

## Periodic governance (monthly)

Run once per month for each package:

```bash
pnpm run security:mcp-preflight -- \
  --mcps-dir "<mcps-path>" \
  --repo-root . \
  --governance-only \
  --include-user-config \
  --output-json security-reports/mcp-governance-$(date +%Y-%m).json
```

Review shadow MCP flags. Do not output secrets or full MCP config values (server names only).

## References

- [docs/security/security-runbook.md](../../../packages/blit386/docs/security/security-runbook.md)
- `packages/blit386/scripts/security/mcp-preflight.mjs`
- Runlayer MCP governance rule (shadow MCP detection)
