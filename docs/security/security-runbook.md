# Security runbook

Deterministic security workflow for BLIT386 repos when MCP scanners are healthy, degraded, or unavailable. Use with the
`/security-run` skill and `pnpm run security:mcp-preflight`.

## Maintainers

| Role                | Contact / owner                                       | Notes                                                                  |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Primary security    | [@vancura](https://github.com/vancura) (`CODEOWNERS`) | Sole maintainer for `blit386` and `blit386-demos` (May 2026).          |
| Backup / escalation | _None_ (solo project)                                 | No secondary on-call; treat delayed response as accepted project risk. |

**Incident triage (solo maintainer):**

1. Open or triage a [GitHub issue](https://github.com/blit386/blit386/issues): apply label `security` if that label
   exists in the repository and you have permission; if it does not exist, create the issue and add the label when you
   can edit repository labels. If you cannot create or label issues, contact [@vancura](https://github.com/vancura)
   (primary security owner) and record the incident in Linear.
2. Run [Repo-native commands](#repo-native-commands) for the affected repo (`pnpm run security:audit`,
   `pnpm run preflight`).
3. Follow [dependency-policy.md](./dependency-policy.md) for CI failures or temporary risk acceptance.
4. Record findings using the [Report template](#report-template) (issue tracker or PR description).

Bus-factor evidence (optional): run the `security-ownership-map` skill and attach `summary.json` to hardening reviews. A
formal backup-owner process is intentionally not used; the **Maintainers** section above (including incident triage) is
the documented fallback instead of a fictional backup owner.

## When to run

- Before a comprehensive security assessment or hardening pass.
- Before `/deep-review` when security tooling is in scope.
- Monthly MCP governance audit (see [Periodic governance](#periodic-governance-monthly)).

## MCP preflight (required first step)

Agents must pass the Cursor project MCP descriptor path from the session (for example
`~/.cursor/projects/<workspace-id>/mcps`).

```bash
cd <repo-root>   # blit386: directory containing this repo's package.json

pnpm run security:mcp-preflight -- \
  --mcps-dir "<cursor-project-mcps-path>" \
  --repo-root . \
  --allow-fallback \
  --output-json security-reports/mcp-preflight-latest.json
```

Governance-only (monthly):

```bash
pnpm run security:mcp-preflight -- \
  --mcps-dir "<cursor-project-mcps-path>" \
  --repo-root . \
  --governance-only \
  --include-user-config \
  --output-json security-reports/mcp-governance-$(date +%Y-%m).json
```

Exit codes:

- `0` — proceed (critical MCP healthy, or `--allow-fallback` with documented fallbacks).
- `1` — missing `--mcps-dir`, invalid path, or critical MCP down without `--allow-fallback`.

Never skip the preflight silently. If a tier is unavailable, run the fallback row from the matrix below and record it in
the report.

## Fallback matrix

| Capability            | Primary MCP                   | Fallback (always available)                                                                                                                                  |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency / SCA      | Opsera `security-scan`, JFrog | `pnpm run security:audit`, `pnpm run security:audit:prod` (per repo); CI gate in blit386 [dependency-policy.md](./dependency-policy.md)                      |
| SAST / code patterns  | Opsera, Semgrep MCP           | `pnpm run lint` (eslint-plugin-security), targeted `rg` patterns (below), optional `semgrep --config auto` only if CLI is already installed (do not install) |
| Compliance            | Opsera `compliance-audit`     | Manual checklist below                                                                                                                                       |
| Architecture          | Opsera `architecture-analyze` | `security-threat-model` and `security-ownership-map` skills under `~/.codex/skills/`                                                                         |
| Supply chain metadata | JFrog MCP                     | `pnpm outdated --format json`, `npm view <pkg> version time.modified license` for key direct deps                                                            |
| MCP governance        | —                             | `pnpm run security:mcp-preflight --governance-only` plus Runlayer MCP governance rules                                                                       |

### SAST `rg` patterns (fallback)

Run from each repo root when Semgrep/Opsera SAST is unavailable:

```bash
rg -n "innerHTML|outerHTML|insertAdjacentHTML|document\\.write\\(|eval\\(|new Function|postMessage\\(|localStorage|sessionStorage" src/
rg -n "CSP|Content-Security-Policy|X-Frame-Options|frame-ancestors|Referrer-Policy" .
```

## Compliance fallback checklist

When Opsera `compliance-audit` MCP is unavailable, gather evidence manually:

| Control area                 | Evidence source                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dependency vulnerabilities   | `pnpm run security:audit`, `pnpm run security:audit:prod` — see [dependency-policy.md](./dependency-policy.md) |
| CI dependency gate           | `.github/workflows/ci.yml` job **Dependency Security Audit** (moderate+, every PR and `main`)                  |
| Code quality / static checks | `pnpm run preflight`, `pnpm run lint`                                                                          |
| Secrets in repo              | `.gitignore`, hooks blocking `.env`; `rg` for hardcoded tokens (no secret values in reports)                   |
| CI integrity                 | `.github/workflows/*.yml` — pinned actions, least privilege                                                    |
| Deploy headers (demos)       | `blit386-demos/public/_headers`, `curl -I` on deployed URLs                                                    |
| Ownership / bus factor       | [Maintainers](#maintainers) (solo); optional `security-ownership-map` skill output (`summary.json`)            |
| MCP governance               | `pnpm run security:mcp-preflight --governance-only`                                                            |

## Repo-native commands

### blit386

```bash
cd <repo-root>   # or: cd "$PWD" after cloning blit386

pnpm run security:mcp-preflight -- --mcps-dir "<mcps>" --repo-root . --allow-fallback
pnpm run security:audit
pnpm run security:audit:prod
pnpm audit --dev --audit-level=moderate
pnpm run preflight
```

Key direct dependencies for supply-chain spot checks: `vite`, `typescript`, `eslint`, `vitest`, `happy-dom`.

```bash
npm view vite version time.modified license
npm view typescript version time.modified license
```

### blit386-demos

```bash
cd <repo-root>   # blit386-demos: directory containing this repo's package.json

pnpm run security:mcp-preflight -- \
  --mcps-dir "<mcps>" \
  --repo-root . \
  --allow-fallback

pnpm run security:audit
pnpm audit --dev --audit-level=moderate
pnpm run preflight
pnpm run build
```

Note: **`blit386-demos` has no `security:audit:prod` script** — use `pnpm run security:audit` only for production-deps
coverage in that repo, or run `pnpm audit --prod --audit-level=moderate` directly.

After toolchain or dependency upgrades, always run `pnpm run build` as a smoke test.

Demos can invoke the canonical preflight script from the library repo (prefer `pnpm run security:mcp-preflight` when the
sibling layout matches `package.json`). If invoking the script directly, set `<blit386-root>` to the blit386 repo path
(or export `BLIT386_ROOT` and use `"$BLIT386_ROOT"`):

```bash
node "<blit386-root>/scripts/security/mcp-preflight.mjs" \
  --mcps-dir "<mcps>" \
  --repo-root . \
  --allow-fallback

# Example: export BLIT386_ROOT=/path/to/blit386
# node "$BLIT386_ROOT/scripts/security/mcp-preflight.mjs" --mcps-dir "<mcps>" --repo-root . --allow-fallback
```

## Periodic governance (monthly)

1. Run governance-only preflight for **both** repos (use each repo as `--repo-root`).
2. Review shadow MCP flags; migrate or remove unmanaged servers per organizational policy.
3. Re-authenticate critical MCPs (Opsera) if status is `auth_required`.
4. Store reports under `security-reports/` (gitignored).

## Report template

Use this structure in agent output or issue/PR comments:

```md
## Security run report

### MCP preflight

- Opsera: <status>
- JFrog: <status>
- Semgrep: <status>
- Fallbacks used: <list>

### blit386

- security:audit: <pass/fail summary>
- prod audit: <pass/fail>
- preflight: <pass/fail>

### blit386-demos

- security:audit: <pass/fail summary>
- prod audit: <pass/fail>
- preflight: <pass/fail>
- build: <pass/fail>

### Governance

- Shadow MCPs: <count / none>
- Config paths scanned: <list>
```

## Related docs

- [dependency-policy.md](./dependency-policy.md) — CI audit gate, severity threshold, refresh cadence
- [audit-exceptions.md](./audit-exceptions.md) — temporary GHSA acceptance playbook
- [developer-experience-guide.md](../developer-experience-guide.md) — script reference
- [testing.md](../testing.md) — preflight and CI smoke checks
