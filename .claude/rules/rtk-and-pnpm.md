# RTK and pnpm

Condensed mirror of `.cursor/rules/rtk-and-pnpm.mdc`.

- Package scripts: **`pnpm run <script>`** only (e.g. `pnpm run preflight`). Bare `pnpm preflight` skips the RTK
  rewrite.
- **`pnpm run preflight`** runs: `format:check`, `lint`, `typecheck`, `spellcheck`, `knip`, `docs:links`,
  `agents:check`, `sync:doc-banners:check`, `sync:cursor-commands:check`, `api:since:check`, `api:history:check`,
  `test:unit`, `test:declarations`, `test:agent-config`, `test:cursor-commands`, `test:api-history`,
  `test:security-preflight`.
- Built-ins without `run`: `pnpm install`, `pnpm audit`, `pnpm exec`, `pnpm add`, `pnpm --filter …`.
- Claude Code: `PreToolUse` → `rtk hook claude` on the Bash matcher; `PostToolUse` on Edit/MultiEdit/Write runs Biome
  and Prettier formatting, then a cspell check (see `.claude/settings.json`).
- Prefer shell + RTK (`rtk read`, `rtk grep`, `git`, `pnpm run …`) over native Read/Grep for exploration.
- Full policy: `~/.claude/RTK.md`.
