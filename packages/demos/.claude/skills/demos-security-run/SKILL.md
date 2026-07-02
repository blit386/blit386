---
name: demos-security-run
description: Run MCP security preflight and documented fallbacks for blit386-demos security workflows.
---

# Security Run (blit386-demos)

Same deterministic security workflow as the library repo, with demos-specific paths. Canonical runbook and script live
in `blit386`.

## Usage

```text
/demos-security-run
```

## Steps

1. MCP preflight (required)

   ```bash
   pnpm run security:mcp-preflight -- \
     --mcps-dir "<cursor-project-mcps-path>" \
     --repo-root . \
     --allow-fallback \
     --output-json security-reports/mcp-preflight-latest.json
   ```

   Or via the library script:

   ```bash
   node ../blit386/scripts/security/mcp-preflight.mjs \
     --mcps-dir "<cursor-project-mcps-path>" \
     --repo-root . \
     --allow-fallback \
     --output-json security-reports/mcp-preflight-latest.json
   ```

2. Repo-native checks
   - `pnpm run security:audit`
   - `pnpm audit --prod --audit-level=moderate`
   - `pnpm audit --dev --audit-level=moderate`
   - `pnpm run preflight`
   - `pnpm run build` (after dependency/toolchain changes)

3. MCP scans – only when corresponding servers are `healthy` (see library runbook).

4. Report – use template in
   [blit386/docs/security/security-runbook.md](https://github.com/blit386/blit386/blob/main/docs/security/security-runbook.md).

## Periodic governance (monthly)

```bash
pnpm run security:mcp-preflight -- \
  --mcps-dir "<cursor-project-mcps-path>" \
  --repo-root . \
  --governance-only \
  --include-user-config \
  --output-json security-reports/mcp-governance-$(date +%Y-%m).json
```

## References

- [blit386/docs/security/security-runbook.md](https://github.com/blit386/blit386/blob/main/docs/security/security-runbook.md)
- [blit386/.claude/skills/bt-security-run/SKILL.md](https://github.com/blit386/blit386/blob/main/.claude/skills/bt-security-run/SKILL.md)
