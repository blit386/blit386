# create-blit386

`pnpm create blit386@latest` - the BLIT386 game scaffolder CLI and templates. Depends on `@blit386/kit` for
generated-game content and the `blit` CLI; this package, the kit, and the `blit386` engine release in lockstep (one
shared `x.y.z`, anchored to the engine's semver) - see [`packages/kit/CLAUDE.md`](../kit/CLAUDE.md) for the kit's own
detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) - read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter create-blit386 run <script>` from the repo root).

## Scaffold flow

1. User runs `pnpm create blit386@latest` (or `npm create blit386@latest`).
2. The CLI prompts for folder name, language (JavaScript or TypeScript; `--ts` skips the prompt), optional AI assistants
   (multi-select: none, or any mix of Claude / Cursor / Antigravity / Gemini CLI / OpenCode / Zed), optional CI.
3. Templates from `templates/` (`base/` plus the chosen language layer) are rendered with `{{placeholders}}`.
4. The chosen AI assistants' config is generated from the kit IR in one call, `generateAgentFiles(kit, vars, agents)`
   from `@blit386/kit/adapters`, which dispatches through the kit's agent registry (`AGENT_ADAPTERS`, keyed by
   `AgentKind` - the wizard's labels and hints come from it too), renders `{{placeholders}}` as it goes, and adds the
   shared `.agents/skills/` folder once when any chosen assistant reads it (Antigravity, Gemini CLI, OpenCode, and Zed
   do; Claude and Cursor keep private copies). The scaffolder writes those `{ path, content }` pairs to disk and never
   branches on an agent name. Choosing several installs each tree. Claude gets `CLAUDE.md`, `.claude/rules/` (from
   `content/rules/`), `.claude/skills/<name>/SKILL.md` (from `content/skills/`), `.claude/settings.json` (hooks from
   `content/hooks.manifest.json`), and `.claude/hooks/` (from `content/hooks/`) - including `shell-safety.cjs` (the
   destructive-git guard, shared with Cursor) and `protect-files.cjs` (the lock-file / `.env` guard), both fail-closed
   over the `guard-core.cjs` they require, a SessionStart hook (`.claude/hooks/session-start.sh`) that installs
   dependencies and runs `blit doctor` when a fresh remote/web session starts - and `.claude/launch.json`, the Claude
   desktop app's preview-server config (Vite on port 5173 through the chosen package manager), which is user-owned: no
   `.blit/base/` copy, and sync never rewrites it. Cursor gets `.cursor/rules/*.mdc`, `.cursor/skills/<name>/SKILL.md`
   (the same skills, frontmatter kept), `.cursor/hooks.json`, `.cursor/hooks/format-file.cjs`, and
   `.cursor/hooks/shell-safety.cjs` plus the `guard-core.cjs` it requires - Cursor has no SessionStart-equivalent event,
   so it does not get the bootstrap hook, and no pre-edit event, so it does not get the lock-file / `.env` guard
   (`protect-files.cjs`). Each adapter also emits a documentation-MCP config registering the `blit386-docs` server at
   `https://blit386.dev/mcp`: Claude gets `.mcp.json`, Cursor gets `.cursor/mcp.json`, Gemini CLI gets an `mcpServers`
   entry in `.gemini/settings.json`, and Antigravity gets `.agents/mcp_config.json`. Antigravity also gets
   `.agents/hooks.json` (hook groups named `blit-<id>`, from the manifest's `antigravity` keys) and `.agents/hooks/`
   (`antigravity-guard.cjs` over `guard-core.cjs`, `format-file.cjs`, and the once-per-conversation
   `antigravity-bootstrap.cjs`, because Antigravity has no session-start event); it owns those exact paths, never the
   bare `.agents/` prefix. Gemini CLI gets `.gemini/settings.json` and `.gemini/hooks/` - no `GEMINI.md`
   (`context.fileName` points it at `AGENTS.md`), no private skills (it reads `.agents/skills/`), and no
   `.gemini/policies/` (workspace policies do not work). The settings file carries the docs server, the persona pointer,
   and four hooks, with timeouts in milliseconds; its hook entries are `protect-files.cjs` and the Node
   `shell-guard.cjs` over `guard-core.cjs` (both exit 2 to block, since Gemini lets a call through on any other exit),
   `format-file.cjs`, and the session-start script. Gemini CLI ignores `.gemini/settings.json` in an untrusted folder,
   so `AGENTS.md` tells the user to trust it. `blit agents add gemini` structurally merges into an existing
   `.gemini/settings.json` instead of colliding (`sync` is what three-way merges). Zed gets `.zed/settings.json`
   (kit-owned, merged with the user's own settings by `add` and by `sync`): `format_on_save`, Biome as the JavaScript,
   TypeScript, and JSON formatter, and `context_servers.blit386-docs` - no `agent` key (project settings have none;
   `agent.tool_permissions` is user-settings only), no hooks, and never a `.rules` / `.cursorrules` / `.windsurfrules` /
   `.clinerules` file (Zed reads only the first match, which would hide `AGENTS.md`). Its persona and lock-file / `.env`
   rules are `AGENTS.md` prose. The Claude, Cursor, and Gemini entries differ on purpose - Claude Code skips a remote
   entry that has a `url` but no `type`, for Cursor a `type` marks a local stdio server, and for Gemini CLI `url` means
   SSE, so streamable HTTP is `httpUrl` (Antigravity accepts only `serverUrl`). Every path an adapter emits is built
   from `packages/kit/src/ownership.ts`, the single source both packages classify against. Within `.claude/hooks/` /
   `.cursor/hooks/`, which specific scripts land in a given project is decided by `content/hooks.manifest.json` - only a
   script one of that adapter's own hook entries actually references gets copied, together with any sibling `.cjs` it
   `require()`s (all under `packages/kit/`). OpenCode gets `opencode.json` (a `formatter` entry per tool - Biome for
   code and JSON, Prettier for Markdown and YAML, each pinned to its own extensions - a `permission` map for lock files,
   `.env` files and destructive git commands, and the remote `blit386-docs` entry under `mcp`), the plugin
   `.opencode/plugins/kit-guard.ts` (it asks the guard core in `.opencode/hooks/guard-core.cjs` before each tool call
   and runs `.opencode/hooks/session-start.sh` on `session.created`), and the shared `.agents/skills/` folder. OpenCode
   has no trust gate, so the plugin runs the moment the folder opens. `opencode.json` is kit-owned but user-extendable:
   `blit agents add opencode` merges it key by key (a user value the kit disagrees with is never overridden), and `sync`
   three-way merges it. The permission lists restate the guard core's policy as globs, and
   `packages/kit/test/opencode.test.mjs` pins the two together.
5. Kit content comes from `resolveKitRoot(import.meta.url)` (`@blit386/kit/adapters`) - the kit npm installed beside
   this package - and never from the kit's own `kitRoot()`, which answers "the kit containing me" and is the `blit`
   CLI's question, not the scaffolder's. That same resolved root supplies the `^x.y.z` pinned into every generated
   `package.json` and the exact version stamped into `.blit/manifest.json`. Full reasoning: `packages/kit/CLAUDE.md`.
   Generated `package.json` also gets a Corepack `packageManager` field (`name@version`) from the invoking manager's
   user agent (`packageManagerField` in `src/pkgManager.ts`). The version is the full exact semver, including a
   prerelease or build suffix. Scaffolding stops if that agent string has no exact version, so Corepack cannot auto-add
   a different pin on the first install. Bun scaffolds omit the field: Corepack accepts only npm, pnpm, and yarn.
   `AGENTS.md` and `docs/` are then emitted **verbatim**: `scaffold()` writes the `GeneratedFile` values that
   `agentsFile()` and `collectDocs()` return, with no `{{placeholder}}` substitution. Only templates, rules, and skills
   pass through `render()`. Prose in `AGENTS.md` and `docs/` must therefore spell out both language cases
   ("`src/game.js` (or `src/game.ts`)"), never `{{gameFile}}`.
6. `scaffold()` writes the ownership manifest `.blit/manifest.json` (path, class, kit version, sha256, plus the
   scaffold-time template `vars`) and pristine `.blit/base/` copies, so `blit agents sync` can update kit files later
   without clobbering user edits. The `class` values come from `classifyFile()` in `@blit386/kit/adapters` - the same
   function `blit agents sync` / `add` use, not a local table. The manifest's own shape is `BlitManifest` from
   `@blit386/kit/adapters` as well - this package declares no local copy, so a field it stops emitting is a compile
   error rather than a manifest the kit silently reads as legacy.
7. Optional git init, dependency install, next-steps output.

`blit agents sync` / `blit agents add` (the `blit` CLI, shipped by `packages/kit`) reuse the same generators in memory
rather than re-scaffolding to disk. Template layout and the rename rules (`gitignore` to `.gitignore`, `.tmpl` stripped)
are in [`.claude/rules/template-structure.md`](.claude/rules/template-structure.md).

## Critical rules

1. JavaScript by default in scaffolds - generated games are plain JS unless the user picks TypeScript (`--ts`)
2. Beginner-friendly - scaffold output assumes no prior coding experience
3. Integer coordinates - generated games use `Vector2i` / `Rect2i` via blit386
4. Use the `BT` namespace in generated game code, never `BTAPI`
5. Named exports only in this package's own TypeScript; no default exports
6. Literals that describe another package are derived or documented, never copied - `BLIT386_RANGE` in `src/scaffold.ts`
   is written by `scripts/bump-lockstep.mjs` (repo root) alongside `packages/kit`'s `blit386.engineRange`, verified by
   `pnpm run bump:check`, and `PUBLISHING.md` records the coupling. File classes and the generated-project paths
   (`CLAUDE.md`, `.claude/`, `.cursor/`, `docs/`) are not re-typed here at all - they are imported from
   `@blit386/kit/adapters`, as is the kit-root resolution itself (`resolveKitRoot`, not a local `createRequire` copy).
   Shared policy: root `.claude/rules/named-constants.md`

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the scaffolder generate? | `src/scaffold.ts`, `templates/` |
| Template layout and rename rules | `.claude/rules/template-structure.md` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the `blit` CLI do, and how are agent files generated? | `packages/kit/CLAUDE.md` |
| Which generated files the kit owns (sync classes) | `packages/kit/src/ownership.ts`, imported via `@blit386/kit/adapters` |
| How the scaffolder finds the installed kit, and the pin it writes | `resolveKitRoot` from `@blit386/kit/adapters`; the two resolution semantics are documented in `packages/kit/src/kit-root.ts` |
| Publishing / release | `PUBLISHING.md`, `/release`, `pnpm run bump -- 1.5.0` from the repo root (replace `1.5.0` with the target version) |
| Hot-reload delivery decision | `CREATE_BLIT386_DESIGN.md` (Hot reload section) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Lockstep version / range drift check | `pnpm run bump:check` (root `scripts/bump-lockstep.mjs --check`) |
| Contributing / DCO | root `CONTRIBUTING.md` |
