# Security runbook

Deterministic security workflow for this monorepo's packages when MCP scanners are healthy, degraded, or unavailable.
Use with the `/security-run` skill and `pnpm run security:mcp-preflight`.

## Maintainers

| Role | Contact / owner | Notes |
| --- | --- | --- |
| Primary security | [@vancura](https://github.com/vancura) (`CODEOWNERS`) | Sole maintainer for this repo (May 2026). |
| Backup / escalation | _None_ (solo project) | No secondary on-call; treat delayed response as accepted project risk. |

Incident triage (solo maintainer):

1. Open or triage a [GitHub issue](https://github.com/blit386/blit386/issues): apply label `security` if that label
   exists in the repository and you have permission; if it does not exist, create the issue and add the label when you
   can edit repository labels. If you cannot create or label issues, contact [@vancura](https://github.com/vancura)
   (primary security owner) and record the incident in Linear.
2. Run [Package-native commands](#package-native-commands) for the affected package (`pnpm run security:audit`,
   `pnpm run preflight`).
3. Follow [dependency-policy.md](./dependency-policy.md) for CI failures or temporary risk acceptance.
4. Record findings using the [Report template](#report-template) (issue tracker or PR description).

Bus-factor evidence (optional): run the `security-ownership-map` skill and attach `summary.json` to hardening reviews. A
formal backup-owner process is intentionally not used; the Maintainers section above (including incident triage) is the
documented fallback instead of a fictional backup owner.

## When to run

- Before a comprehensive security assessment or hardening pass.
- Before `/deep-review` when security tooling is in scope.
- MCP governance audit, run in CI on every change to a tracked MCP config and monthly as a backstop (see
  [Periodic governance](#periodic-governance)).

## MCP preflight (required first step)

Agents must pass the session's MCP descriptor path (agent/tooling-specific; consult your agent's docs for its location).

```bash
cd <package-root>   # e.g. packages/blit386 or packages/demos

pnpm run security:mcp-preflight -- \
  --mcps-dir "<mcps-path>" \
  --repo-root . \
  --allow-fallback \
  --output-json security-reports/mcp-preflight-latest.json
```

Governance-only - `--mcps-dir` is not required here, since governance-only mode never reads it (it only scans static MCP
config files - see [What the governance gate accepts](#what-the-governance-gate-accepts)):

```bash
pnpm run security:mcp-preflight -- \
  --repo-root . \
  --governance-only \
  --include-user-config \
  --output-json security-reports/mcp-governance-$(date +%Y-%m).json
```

This same check runs automatically in CI (minus `--include-user-config`, which scans nothing on a runner) on every pull
request or push to `main` that touches a scanned config file or `mcp-preflight.mjs`, and monthly as a backstop, via
[`.github/workflows/mcp-governance-audit.yml`](../../../../.github/workflows/mcp-governance-audit.yml) - see
[Periodic governance](#periodic-governance).

Exit codes:

- `0` - proceed (critical MCP healthy, `--allow-fallback` with documented fallbacks, or - governance-only - no
  unaccepted shadow MCP entries and nothing unclassifiable or unreadable found).
- `1` - missing `--mcps-dir` (unless `--governance-only`, which never reads it), critical MCP down without
  `--allow-fallback`, or - governance-only - an unaccepted shadow MCP entry, an unclassifiable entry, or an unreadable
  config found (listed under `governance.blockingConfigs`). A nonexistent `--mcps-dir` is no longer fatal by itself:
  every registered security MCP is reported `absent`, and `--allow-fallback` governs whether that is acceptable - this
  is what lets a full MCP-session outage proceed deterministically instead of crashing before fallback logic runs.

### What the governance gate accepts

The gate scans the root `.mcp.json` and `mcp.json` (plus the parent directory's, and `$HOME`'s with
`--include-user-config`), and these tracked agent configs at `--repo-root`: `.cursor/mcp.json`,
`.agents/mcp_config.json`, `.gemini/settings.json` (all `mcpServers`), `opencode.json` (`mcp`), `.zed/settings.json`
(`context_servers`, whole-line `//` comments allowed) and `.codex/config.toml` (`[mcp_servers.<name>]` tables). The
workflow's path filter lists the same files.

Each server entry is classified, and it fails closed (BT-763):

- `runlayer-managed` only when the URL is `https:` and its parsed hostname is `runlayer.com` or a subdomain of it, or
  the command is the `runlayer` binary with `run` as its first argument. A URL or a shell script that merely mentions
  Runlayer is a shadow server.
- `shadow-remote` for a `url`, `serverUrl` or `httpUrl`; `shadow-stdio` for a `command` (a string plus `args`, or an
  argv array as OpenCode writes it).
- Unclassifiable, and blocking, when an entry has no URL and no command, two URL keys, or a URL and a command (of any
  type: an object `command`, as Zed writes it, counts).
- Unreadable, and blocking, when a config does not parse, its server key is not an object, or `.codex/config.toml` holds
  anything beyond plain table headers and single-line JSON-compatible `key = value` pairs (a trailing comment, a dotted
  or quoted key, a multi-line string, a repeated server table).

Never skip the preflight silently. If a tier is unavailable, run the fallback row from the matrix below and record it in
the report.

## Fallback matrix

| Capability | Primary MCP | Fallback (always available) |
| --- | --- | --- |
| Dependency / SCA | Opsera `security-scan`, JFrog | `pnpm run security:audit`, `pnpm run security:audit:prod` (per package); CI gate in this repo's [dependency-policy.md](./dependency-policy.md) |
| SAST / code patterns | Opsera, Semgrep MCP | `pnpm run lint` (eslint-plugin-security), targeted `rg` patterns (below), optional `semgrep --config auto` only if CLI is already installed (do not install) |
| Compliance | Opsera `compliance-audit` | Manual checklist below |
| Architecture | Opsera `architecture-analyze` | `security-threat-model` and `security-ownership-map` skills, if available in your agent's skill library |
| Supply chain metadata | JFrog MCP | `pnpm outdated --format json`, `npm view <pkg> version time.modified license` for key direct deps |
| MCP governance | - | `pnpm run security:mcp-preflight --governance-only` plus Runlayer MCP governance rules |

### SAST `rg` patterns (fallback)

Run from each package root when Semgrep/Opsera SAST is unavailable:

```bash
rg -n "innerHTML|outerHTML|insertAdjacentHTML|document\\.write\\(|eval\\(|new Function|postMessage\\(|localStorage|sessionStorage" src/
rg -n "CSP|Content-Security-Policy|X-Frame-Options|frame-ancestors|Referrer-Policy" .
```

## Compliance fallback checklist

When Opsera `compliance-audit` MCP is unavailable, gather evidence manually:

| Control area | Evidence source |
| --- | --- |
| Dependency vulnerabilities | `pnpm run security:audit`, `pnpm run security:audit:prod` - see [dependency-policy.md](./dependency-policy.md) |
| CI dependency gate | `.github/workflows/ci.yml` job Dependency Security Audit (moderate+, every PR and `main`) |
| Code quality / static checks | `pnpm run preflight`, `pnpm run lint` |
| Secrets in repo | `.gitignore`, hooks blocking `.env`; `rg` for hardcoded tokens (no secret values in reports) |
| CI integrity | `.github/workflows/*.yml` - pinned actions, least privilege |
| Deploy headers (demos) | `packages/demos/public/_headers`, `curl -I` on deployed URLs |
| Deploy headers (website) | `packages/website/public/_headers` plus the nonce'd CSP from `packages/website/src/csp-nonce.ts`; `curl -s -D - -o /dev/null https://blit386.dev/` must show a `nonce-` in `script-src` and no `'unsafe-inline'` (a GET, not `curl -I`) |
| Ownership / bus factor | [Maintainers](#maintainers) (solo); optional `security-ownership-map` skill output (`summary.json`) |
| MCP governance | `pnpm run security:mcp-preflight --governance-only` |

## Package-native commands

### blit386 (`packages/blit386`)

```bash
cd packages/blit386

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

### blit386-demos (`packages/demos`)

```bash
cd packages/demos

pnpm run security:mcp-preflight -- \
  --mcps-dir "<mcps>" \
  --repo-root . \
  --allow-fallback

pnpm run security:audit
pnpm audit --dev --audit-level=moderate
pnpm run preflight
pnpm run build
```

Note: `blit386-demos` has no `security:audit:prod` script - use `pnpm run security:audit` only for production-deps
coverage in that package, or run `pnpm audit --prod --audit-level=moderate` directly.

After toolchain or dependency upgrades, always run `pnpm run build` as a smoke test.

`packages/demos`'s own `security:mcp-preflight` script already resolves the canonical script at
`../blit386/scripts/security/mcp-preflight.mjs` - prefer `pnpm run security:mcp-preflight` from `packages/demos` over
invoking the script directly. If you do need to invoke it directly from `packages/demos`:

```bash
node ../blit386/scripts/security/mcp-preflight.mjs \
  --mcps-dir "<mcps>" \
  --repo-root . \
  --allow-fallback
```

## Periodic governance

[`.github/workflows/mcp-governance-audit.yml`](../../../../.github/workflows/mcp-governance-audit.yml) runs this
automatically from the repo root on every PR or push to `main` that touches a scanned config, and monthly as a
backstop - a failing run (red X in Actions) means an unaccepted shadow MCP entry, or an unclassifiable or unreadable
config, was found; that is the enforced check. The steps below are the same procedure run by hand, useful as an early
check or from inside an agent session:

1. Run governance-only preflight for both packages (use each package directory as `--repo-root`).
2. Run it once more with the monorepo root as `--repo-root` - `discoverMcpConfigPaths` only walks one level up, so a
   package-rooted run reaches `packages/`, never the repo root. Without this pass the tracked root `.mcp.json` and agent
   configs are never scanned:

   ```bash
   pnpm run security:mcp-preflight -- \
     --repo-root ../.. \
     --governance-only \
     --include-user-config \
     --output-json security-reports/mcp-governance-root-$(date +%Y-%m).json
   ```

3. Review shadow MCP flags against the accepted entries below. `summary.proceed` (and the script's exit code) already
   reflects this automatically - it is `false` whenever `governance.unacceptedShadowServers` or
   `governance.blockingConfigs` is non-empty - so this step is about deciding what to do with a failure, not detecting
   one by hand: migrate or remove every unmanaged server that is not listed there, per organizational policy.
4. Re-authenticate critical MCPs (Opsera) if status is `auth_required`.
5. Store reports under `security-reports/` (gitignored).

### Accepted MCP entries

The entry below is expected in the repo-root pass from step 2 and must not be migrated or removed under step 3.
Acceptance is bound to the whole row, not the name: a flagged server qualifies only when the name, URL, config path, and
classification all match. The same name pointing at a different URL, or appearing in a config the row does not name, is
a finding.

Every column is enforced automatically by `ACCEPTED_SHADOW_MCP_ENTRIES` in
[`packages/blit386/scripts/security/mcp-preflight.mjs`](../../scripts/security/mcp-preflight.mjs), so the standalone
governance audit fails on a different URL by itself. `PROJECT_MCP_SERVER_URL` in `scripts/lib/agent-config/mcp.mjs`
(`pnpm run agents:check`) pins the same URL in each config file. Both are hand-synced to this table - there is no shared
import between them.

| Server | URL | Declared in | Expected classification |
| --- | --- | --- | --- |
| `blit386-docs` | `https://blit386.dev/mcp` | any tracked config the gate scans at the repo root (root `.mcp.json` and the six agent configs), never a parent-directory or `$HOME` one | `shadow-remote` |

`shadow-remote` is the correct classification, not a finding: `isRunlayerManagedEntry` only exempts a `runlayer.com`
host or the `runlayer` binary, and this is our own first-party docs server (`packages/website/src/mcp-server.ts`,
discovery card at `packages/website/public/.well-known/mcp/server-card.json`). It is public, unauthenticated, and
read-only - it exposes `search_docs`, `get_doc_page`, and `get_docs_summary` over the published documentation and
carries no credentials. A clean run is a shadow count of seven - one per tracked config - whose entries each match the
whole row above - name, URL, config path, and classification together. Count and name alone are not enough to call it
clean.

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
- Accepted entries seen: <name, classification, config path per entry - must match the runbook's accepted row>
- Unaccepted shadow entries: <none, or name + classification + config path per entry>
- Config paths scanned: <list>
```

Report the three fields above and nothing else - no secrets, credentials, auth headers, or full MCP config bodies. Give
config paths repo-relative: the preflight prints them absolute, so a pasted report would otherwise carry the local
username. The accepted entry's URL is deliberately absent here; `pnpm run agents:check` is what verifies it, against a
pinned literal rather than a copy, so aiming the server at a new URL takes a deliberate edit to
`scripts/lib/agent-config/mcp.mjs`.

## Related docs

- [dependency-policy.md](./dependency-policy.md) - CI audit gate, severity threshold, refresh cadence
- [audit-exceptions.md](./audit-exceptions.md) - temporary GHSA acceptance playbook
- [developer-experience-guide.md](../developer-experience-guide.md) - script reference
- [reference-testing.md](../reference-testing.md) - preflight and CI smoke checks
