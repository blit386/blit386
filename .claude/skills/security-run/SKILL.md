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

Where `<package>` is `blit386` or `demos`. `website`, `kit`, and `create-blit386` have no MCP-backed security scanning –
run their `security:audit` script directly (see `/deep-review <package>` step 3) instead of this skill.

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

Then run it once more with the monorepo root as `--repo-root` (`--repo-root ../..` from a package directory), keeping
`--include-user-config` and writing to a distinct `--output-json` path so the repo-root report does not overwrite the
per-package one. `discoverMcpConfigPaths` only walks one level up, so a package-rooted run never reaches the repo root
and never scans the tracked root `.mcp.json`.

Review shadow MCP flags. Exactly one entry is accepted, and only when all four fields match: name `blit386-docs`,
classification `shadow-remote`, config path the repo-root `.mcp.json`, and URL `https://blit386.dev/mcp`. A shadow count
of one matching all four is a clean run; anything else – a different name, a different config path, or the same name
pointing elsewhere – is a finding, not an accepted entry. See "Accepted MCP entries" in the runbook.

The preflight report prints name, classification, and config path but not the URL, so the URL half is enforced
separately by `pnpm run agents:check` (`findProjectMcpFailures` in `scripts/check-agent-config.mjs`). It pins the
literal `https://blit386.dev/mcp` rather than just comparing the root `.mcp.json` against the website's discovery card,
so a coordinated edit aiming both files at another host fails CI too.

Report exactly the three fields the runbook's report template asks for – server name, classification, and config path –
and nothing else. Never output secrets, credentials, auth headers, or a full MCP config body. Rewrite config paths
repo-relative before pasting them anywhere: the preflight prints absolute paths, so a copied report otherwise leaks the
local username.

## References

- [docs/security/security-runbook.md](../../../packages/blit386/docs/security/security-runbook.md)
- `packages/blit386/scripts/security/mcp-preflight.mjs`
- Runlayer MCP governance rule (shadow MCP detection)
