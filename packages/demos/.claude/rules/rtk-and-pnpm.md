# RTK and pnpm

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (Development Commands).

Package scripts: always `pnpm run <script>` (e.g. `pnpm run preflight`). Bare `pnpm preflight` skips RTK rewrite.
Built-ins without `run`: `pnpm install`, `pnpm audit`, `pnpm exec`, `pnpm add`, `pnpm --filter …`.

Cursor `.cursor/hooks.json` runs `rtk hook cursor` on Shell; Claude Code uses `rtk hook claude` on Bash. Prefer shell +
RTK (`rtk read`, `rtk grep`, `git`, `pnpm run …`) over native Read/Grep for exploration. Full policy:
`~/.claude/RTK.md`.

Cursor: `.cursor/rules/rtk-and-pnpm.mdc` (always applied in this repo).
