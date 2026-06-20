# RTK and pnpm

- Package scripts: **`pnpm run <script>`** only (e.g. `pnpm run preflight`). Bare `pnpm preflight` skips RTK rewrite.
- Built-ins without `run`: `pnpm install`, `pnpm audit`, `pnpm exec`, `pnpm add`, `pnpm --filter …`.
- Claude Code: `PreToolUse` → `rtk hook claude` on Bash; `PostToolUse` → Biome + Prettier + cspell on Edit/Write.
- Prefer shell + RTK (`rtk read`, `rtk grep`, `git`, `pnpm run …`) over native Read/Grep for exploration.
- Full policy: `~/.claude/RTK.md`.
