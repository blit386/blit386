# Security Run

Deterministic security workflow for `blit386` and cross-repo assessments. Use before comprehensive security scans,
hardening passes, or when MCP scanner availability is uncertain.

## Usage

```text
/bt-security-run
```

## Prerequisites

- Cursor MCP descriptor path from the session (`mcps` folder for the active workspace).
- Node.js and pnpm per repo `package.json`.

## Steps

1. MCP preflight (required)

- Read tool schemas before any MCP tool calls (per environment rules).
- Run:

  ```bash
  pnpm run security:mcp-preflight -- \
    --mcps-dir "<cursor-project-mcps-path>" \
    --repo-root . \
    --allow-fallback \
    --output-json security-reports/mcp-preflight-latest.json
  ```

- Record each security MCP status: `healthy`, `auth_required`, `errored`, or `absent`.
- If Opsera (`plugin-opsera-devsecops-opsera`) is not `healthy`, do not skip scans; continue with fallbacks from
  [docs/security/security-runbook.md](../../docs/security/security-runbook.md).

2. Repo-native checks (this repo)

- `pnpm run security:audit`
- `pnpm audit --prod --audit-level=moderate`
- `pnpm audit --dev --audit-level=moderate`
- `pnpm run preflight`

3. Optional MCP-backed scans (only when healthy)

- Opsera: `architecture-analyze`, `security-scan`, `compliance-audit` (inspect plugin tool schemas first).
- JFrog / Semgrep: only when server status is `healthy`.

4. Cross-repo (when assessing both repos)

- Repeat step 2 in `blit386-demos` using paths from the runbook.
- Use the same `--mcps-dir` for both repos.

5. Report

- Emit the report template from the runbook.
- List every fallback executed and why.

## Periodic governance (monthly)

Run once per month for each repo:

```bash
pnpm run security:mcp-preflight -- \
  --mcps-dir "<cursor-project-mcps-path>" \
  --repo-root . \
  --governance-only \
  --include-user-config \
  --output-json security-reports/mcp-governance-$(date +%Y-%m).json
```

Review shadow MCP flags. Do not output secrets or full MCP config values (server names only).

## References

- [docs/security/security-runbook.md](../../docs/security/security-runbook.md)
- `scripts/security/mcp-preflight.mjs`
- Runlayer MCP governance rule (shadow MCP detection)
