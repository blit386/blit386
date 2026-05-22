---
description: Run MCP security preflight and documented fallbacks for blit-tech-demos security workflows.
---

# Security Run (blit-tech-demos)

Same deterministic security workflow as the library repo, with demos-specific paths. Canonical runbook and script live
in `blit-tech`.

## Usage

```text
/demos-security-run
```

## Steps

1. **MCP preflight (required)**

   ```bash
   pnpm run security:mcp-preflight -- \
     --mcps-dir "<cursor-project-mcps-path>" \
     --repo-root . \
     --allow-fallback \
     --output-json security-reports/mcp-preflight-latest.json
   ```

   Or via the library script:

   ```bash
   node ../blit-tech/scripts/security/mcp-preflight.mjs \
     --mcps-dir "<cursor-project-mcps-path>" \
     --repo-root . \
     --allow-fallback \
     --output-json security-reports/mcp-preflight-latest.json
   ```

2. **Repo-native checks**
   - `pnpm run security:audit`
   - `pnpm audit --prod --audit-level=moderate`
   - `pnpm audit --dev --audit-level=moderate`
   - `pnpm run preflight`
   - `pnpm run build` (after dependency/toolchain changes)

3. **MCP scans** — only when corresponding servers are `healthy` (see library runbook).

4. **Report** — use template in
   [blit-tech/docs/security/security-runbook.md](https://github.com/vancura/blit-tech/blob/main/docs/security/security-runbook.md).

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

- [blit-tech/docs/security/security-runbook.md](https://github.com/vancura/blit-tech/blob/main/docs/security/security-runbook.md)
- [blit-tech/.claude/skills/security-run/SKILL.md](https://github.com/vancura/blit-tech/blob/main/.claude/skills/security-run/SKILL.md)
