# @blit386/kit

Canonical kit content (the IR) and the `blit` CLI, shipped into every game scaffolded by `create-blit386`. This package,
`create-blit386`, and the `blit386` engine release in lockstep (one shared `x.y.z`, anchored to the engine's semver) -
see [`packages/create-blit386/CLAUDE.md`](../create-blit386/CLAUDE.md) for the scaffolder's own detail.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) - read together with this file.

TypeScript strict, built with tsup, Biome for lint and format (no ESLint here), pnpm, Node >= 22.18.0. Scripts are
`pnpm run <script>` from this package's directory (or `pnpm --filter @blit386/kit run <script>` from the repo root).

The `blit` CLI is a project-local bin inside every generated game: `blit run`, `blit play`, `blit doctor`,
`blit upgrade`, `blit migrate`, `blit agents sync` / `blit agents add`, `blit clean`, `blit help`.

## Kit content vs engine docs

Generated games receive `AGENTS.md`, nine beginner docs from `content/docs/` (`getting-started`, `basics`, `drawing`,
`input`, `palette`, `random`, `audio`, `hot-reload`, `when-something-breaks`), and the game-author skills in
`content/skills/`. These are not copies of the engine's full `docs/` tree - they teach the starter game and route
anything deeper to the live documentation at blit386.dev: the `blit386-docs` MCP server (`search_docs`, `get_doc_page`,
`get_docs_summary`), `https://blit386.dev/llms.txt`, or any doc page fetched with `Accept: text/markdown`. GitHub is the
last resort, for when the documentation itself falls short.

`content/` is also published to blit386.dev under `/docs/build-a-game/` by
`packages/website/scripts/sync-kit-pages.mjs`, for agents with no scaffolded project. After editing anything in
`content/` (or bumping the version), run `pnpm run sync:docs` in `packages/website` and commit the result - its CI job
fails on a stale mirror.

The whole of `content/` is the shipped IR, not just `AGENTS.md` + `docs/`: it also carries `rules/`, `skills/` (24
game-author capability skills plus the `run`, `fix`, `test-the-game`, `migrate`, and `ask-the-docs` workflow skills),
the scripts in `hooks/` + `hooks.manifest.json`. Skills and rules are discovered by directory scan in `src/adapters.ts`
\- adding a skill folder is enough, nothing registers it by name. Claude Code gets each skill as
`.claude/skills/<name>/SKILL.md` with the frontmatter kept. Cursor gets the same file as
`.cursor/skills/<name>/SKILL.md`, frontmatter kept, so it loads the skill from the description and still answers
`/name`. Most other agents read one shared folder, `.agents/skills/<name>/SKILL.md` (`SHARED_SKILLS_DIR`), so the kit
emits it once (`generateSharedSkills`) while at least one set-up agent has `readsSharedSkills` in its registry entry.
Antigravity, Codex, Gemini CLI, OpenCode, and Zed set that flag (Zed's adapter ships only `.zed/settings.json`; the
skills come from the shared folder). Claude Code does not read the shared folder and Cursor is unverified, so both keep
their private copies, and a game with none of the five has no `.agents/skills/`. Antigravity's own files sit beside the
shared folder at exact paths (`.agents/hooks.json`, `.agents/hooks/`, `.agents/mcp_config.json`) - never claim the bare
`.agents/` prefix. `test/skills-frontmatter.test.mjs` enforces the cross-agent limits every skill must meet: `name`
lowercase-hyphen, at most 64 characters, equal to its folder; `description` at most 1024 characters; a flat layout. The
two always-on convention files in `content/rules/` stay `.cursor/rules/*.mdc`; they are not skills.

Kit content must be self-contained. Skills and docs may reference only `packages/blit386` (the engine) and other local
kit files. Do not reference the `packages/demos` package, its demo slugs, or its URLs - that package may be archived in
favor of kit-based demos, and shipped content must not break with it.

The engine has no physics, collision, entity, or scene system. Say so; do not invent one. What the kit does teach:
drawing (primitives, sprites, text), palette and effects, input (keyboard, pointer, gamepad), timing and easing, audio
(bus mixer, `AudioClip`, procedural synth - engine 1.3.0), hot reload / `blit386/vite` / asset hot-replace /
`BT.loadingAssetsCount` (engine 1.4.0), `BT.isDevMode` dev/release detection, `BT.random` and the noise/hash world
generation surface, and the exposure-curve palette fade (engine 1.5.0), the debug overlay, screenshots, and WebGPU-only
post-process effects.

### Drift is the standing risk here

Nothing syncs this package from `packages/blit386` automatically. The kit docs and shipped skills are hand-authored
beginner prose, so they go stale silently when the engine changes. Shipping an engine feature is the trigger to come
here - review in the same pass, not later. Run `/kit-audit` to walk the checklist. `BLIT386_RANGE` in
`packages/create-blit386/src/scaffold.ts` needs no manual check - `pnpm run bump:check` (repo root) verifies it against
`blit386.engineRange` on every push and in CI.

`scripts/check-kit-docs-drift.mjs` (repo root) automates a coarse, page-level version of this table's triggers for
`content/docs/*.md` only, comparing `packages/blit386/docs/_api-history.json` against `blit386.docsReviewedAt`
(`package.json`) and, on `push` to `main` or weekly, filing/updating a Linear tracking issue
(`.github/workflows/kit-docs-drift.yml`). It does not replace this table or `/kit-audit`, and does not cover
`content/skills/*` or the other kit files below.

| Kit file | Review when |
| --- | --- |
| `content/docs/getting-started.md` | Install/run flow, `npx blit run` / `doctor`, first-edit hot reload |
| `content/docs/basics.md` | `configure()`, loop timing getters, bootstrap flow, orientation, `loadingAssetsCount`, the splash and its off switch, `BT.isReducedMotionPreferred` / `onReducedMotionChange` |
| `content/docs/drawing.md` | `BT.clear`, primitives, text APIs |
| `content/docs/input.md` | `BT.isDown`, edges, keyboard, pointer, gamepad, scroll-capture / touch-action |
| `content/docs/palette.md` | `paletteCreate`, slots, `Color32`, `Palette.fillBlock`, the two whole-screen fades |
| `content/docs/random.md` | `BT.random` / `BT.randomSeed`, seeding a run, noise and hash world generation |
| `content/docs/audio.md` | `AudioClip`, `BT.synthPreset`, buses, the unlock rule |
| `content/docs/hot-reload.md` | `blit386/vite`, swap tiers, `onHotReload`, asset hot-replace, `BT.isDevMode` |
| `content/docs/when-something-breaks.md` | Common errors, `await`, palette slot 0, silent audio, hot-reload surprises, `window.BT` console debugging |
| `content/AGENTS.md` | Overall game shape, hard rules, doc routing, hot-reload tiers |
| `content/rules/blit-api-names.md` | `BT` getters, configure flags, wake lock, `onHotReload` / `onReducedMotionChange` / `testState`, never `registerHotReload` |
| `content/rules/blit-integer-coords.md` | Integer-coordinate rule (`Vector2i` / `Rect2i`) |
| `content/skills/use-hot-reload/SKILL.md` | Swap tiers, `onHotReload`, vite plugin opt-in for older games |
| `content/skills/use-dev-mode/SKILL.md` | `BT.isDevMode` resolution order, cheat-key / debug-HUD gating examples, what dev mode turns on (`window.BT`, F9 capture), the `testState()` hook and `BT.testState()` envelope |
| `content/skills/show-a-loading-screen/SKILL.md` | `BT.loadingAssetsCount`, per-sheet status, and how the splash already covers `init()` |
| `content/skills/use-random/SKILL.md` | `BT.random` / `BT.randomSeed`, `Random` methods, state and stream helpers |
| `content/skills/use-noise/SKILL.md` | `hash*` functions, `ValueNoise` / `PerlinNoise` / `SimplexNoise`, fBm defaults |
| `content/skills/move-and-time/SKILL.md` | Clock getters, `Timer`, the `EasingFunction` curve list, `interpolate` |
| `content/skills/animate-the-palette/SKILL.md` | Cycle / fade / exposure fade / flash / swap, `highlightLead`, building a fade target with `fillBlock` |
| `content/skills/test-the-game/SKILL.md` | The `?nosplash` / `?backend=software` URL flags, `window.BT`, `BT.captureFrame`, the starters' `window.__game` shape, `BT.testState()`, and `?seed=` handling, or `blit play`'s steps and options (`src/commands/play.ts`) |
| `content/skills/ask-the-docs/SKILL.md` | The docs MCP tool set, `llms.txt`, or the site's markdown negotiation changes |
| `content/skills/*/SKILL.md` | Other game-author skills; each demonstrates a slice of the `BT` surface |
| `content/hooks/shell-safety.cjs` | Claude's `PreToolUse` or Cursor's `beforeShellExecution` payload shape or block protocol changes. One Node entry for both agents over `guard-core.cjs` (shipped beside it): only `hook_event_name == "PreToolUse"` means Claude, the command is the first `command` / `raw_command` string anywhere in the payload, and an unreadable payload denies in both protocols. Policy changes go in `guard-core.cjs`, not here |
| `content/hooks/format-file.cjs` | The starter's `format` script changes which tool owns which file type (`packages/create-blit386/templates/*/package.json.tmpl`), or the Claude `PostToolUse` / Cursor `afterFileEdit` / Antigravity `PostToolUse` / Codex `PostToolUse` payload shape changes. Codex sends no file path: the paths come from the `apply_patch` text in `tool_input.command` (`patchPaths`), resolved against the payload's `cwd` |
| `content/hooks/guard-core.cjs` | The lock-file / `.env` rule (`isProtectedPath`) or the shell policy (`isDangerousCommand`; its case table, `test/shell-cases.mjs`, drives both `test/guard-core.test.mjs` and the `shell-safety.cjs` entry test, so add a case there with every policy change). Shared by every agent's hook entry, each of which owns its own payload shape and block protocol; `failClosed` + `parsePayload` turn an unreadable request into a deny. `patchPaths` reads the file paths out of Codex's `apply_patch` text (`*** Add File:` / `Update File:` / `Delete File:` / `Move to:`); its cases in `test/guard-core.test.mjs` are real patch text - extend them when Codex's patch grammar (`codex-rs/core/assets/tools/apply_patch.lark`) changes |
| `content/hooks/codex-guard.cjs` | Codex's `PreToolUse` payload (`tool_name` `Bash` / `apply_patch`, both with `tool_input.command`) or block protocol changes (exit 2 with a non-empty stderr; every other outcome, an empty stderr included, lets the call through). One script with a `shell` / `patch` argument; `shell` also checks the files of an `apply_patch` heredoc, which reaches the Bash hook, not the apply_patch one. The confirm tier blocks because Codex rejects an `ask`. The `.codex/hooks.json` commands wrap it: `sh -c`, so a fish or other non-POSIX login shell still parses them; a walk up from `$PWD` to the project, because Codex runs hooks in the session directory with no project variable; and any exit other than 0 or 2 turned into exit 2 with a message. Each hook's one-time `/hooks` approval is keyed by event and position and hashes the command, so changing or reordering a Codex block makes every user approve it again. The approval never covers the script's contents, and the walk-up runs the nearest `.codex/hooks/codex-guard.cjs` above the session directory, so a copy planted in a subdirectory would run instead - no wider than what anyone who can write the real script already has, but do not describe the approval as vetting the scripts. The confirm tier's message is Codex-specific (ask the user to run the command), since a yes cannot unblock it. The mode names are also in the manifest's `codex` commands; renaming one side fails `test/codex-adapter.test.mjs` |
| `content/hooks/antigravity-guard.cjs`, `antigravity-bootstrap.cjs` | Antigravity's payload (`toolCall.args.TargetFile` / `CommandLine`, `conversationId`, `workspacePaths`) or reply protocol (`decision` / `reason`, `injectSteps`) changes; docs at antigravity.google/docs/hooks. The guard is one script with a `files` / `shell` argument and denies on any error, and answers `ask` (never `allow`, which Antigravity treats as auto-approval) for a call it has no objection to; `PreInvocation` handlers sit directly under the event, not in a matcher group; the bootstrap runs once per conversation through a temp-dir marker because Antigravity has no session-start event |
| `content/hooks/protect-files.cjs` | Claude's `PreToolUse` payload shape changes. A thin wrapper over `guard-core.cjs` (shipped beside it because it `require()`s it). Fails closed: an unreadable payload, or one with no `tool_input.file_path`, blocks the edit (Claude Code and Gemini CLI, whose `write_file\|replace` payload has the same `tool_input.file_path` and exit-2 protocol; Cursor has no pre-edit event) |
| `content/hooks/shell-guard.cjs` | Gemini CLI's `BeforeTool` payload (`tool_input.command`) or exit-2 block protocol changes. Gemini sets and expands `$GEMINI_PROJECT_DIR` itself (verified in `hookRunner.ts`), so the manifest commands are portable. Thin wrapper over `guard-core.cjs`; the confirm tier blocks too because Gemini has no ask answer; fails closed. It is not `shell-safety.cjs`: that entry tells Claude from Cursor by `hook_event_name === "PreToolUse"`, so a Gemini `BeforeTool` payload would get Cursor's stdout JSON with exit 0, which Gemini treats as allow |
| `content/hooks/session-start.sh` | Dependency install + `blit doctor` checkup a fresh remote/web session runs (Claude Code's SessionStart hook and OpenCode's `session.created` plugin handler; Cursor has no SessionStart-equivalent event) Gemini CLI also runs it as a `SessionStart` hook: its plain stdout is delivered as a system message (`hookRunner.ts` wraps non-JSON exit-0 output), so it is left on stdout, and the `cd ... && VAR=... sh` command is POSIX-only, as Claude's is (Gemini runs hooks through PowerShell on Windows, where the bootstrap fails without blocking the session). Codex runs it as a `SessionStart` `startup` hook through `$SHELL -lc`, and its stdout becomes model context - so does anything the user's login profile prints |
| `content/hooks/opencode-kit-guard.ts` | OpenCode's plugin API changes (`tool.execute.before`, `event`, tool argument names - `filePath`, `patchText`) or the guard core's verdict shape does. Runs on folder open with no trust prompt, so keep it minimal and keep its header comment true. Rendered with `{{pmInstall}}` into `.opencode/plugins/kit-guard.ts`; tested by loading the generated file in `test/opencode.test.mjs` |
| `src/adapters.ts` (`OPENCODE_PERMISSION`) | The guard core's lock-file / `.env` rule or shell policy changes - the permission lists restate it as globs, and `test/opencode.test.mjs` runs one case table through both. Remember last match wins |
| `content/hooks.manifest.json` | Canonical hook intent; the `antigravity` and `codex` commands repeat their guard's mode argument (`files` / `shell`, `shell` / `patch`), which JSON cannot import - rename it in the guard script too; Cursor `hooks.json`, Claude `settings.json`, and Antigravity `.agents/hooks.json` derive from it (`antigravity` key per hook). An `opencode` block names the plugin event and the `hooks/` scripts the plugin loads (it is not a command) A `gemini` key carries the Gemini CLI event, matcher, and a timeout in milliseconds, and `.gemini/settings.json` derives from it. A `codex` key has Claude's shape and `.codex/hooks.json` derives from it (only a `hooks` key - Codex skips a hooks file with any unknown field). |
| `src/adapters.ts` (docs-MCP config, `MCP_SERVER_ENTRY`; Gemini's `httpUrl` entry inside `buildGeminiSettings`; Codex's TOML table in `codexConfigFile`) | `packages/website/public/.well-known/mcp/server-card.json` changes name, URL, or transport |
| `src/adapters.ts` (`generateZedAdapter`, `.zed/settings.json`) | Zed's settings keys change (`format_on_save`, the `formatter.language_server` shape, `context_servers`), or Zed starts honoring an `agent` key from project settings (then guardrails become shippable - see the hard-rule snippet in `content/AGENTS.md`) |
| `src/adapters.ts` (`generateCodexAdapter`) and `src/commands/agents.ts` (`tryMergeCodexConfig`) | Codex's `config.toml` keys (`[mcp_servers.<name>]`, `url`), or `.codex/rules/` leaves experimental / `.codex/environments/environment.toml` gets a documented schema (both deliberately not emitted today). The `add` merge is text, not TOML: it appends the kit's one table when the file never names the server, keeps an exact copy, and collides on anything else |
| `src/adapters.ts` (`launchConfigFile`, `.claude/launch.json`) | The starter's dev port or `server.open` (`packages/create-blit386/templates/base/vite.config.js`), a new package manager, or the Claude desktop app's `launch.json` fields change |

While auditing, confirm every skill directory appears in the skills table in `README.md` - that is the only human-facing
list of what ships, and it has no automated guard.

## Critical rules

1. Beginner-friendly - kit docs and skills assume no prior coding experience
2. Integer coordinates - generated games use `Vector2i` / `Rect2i` via blit386
3. Use the `BT` namespace in generated game code, never `BTAPI`
4. Named exports only in this package's own TypeScript; no default exports
5. `blit386.engineRange` in `package.json` is derived, not hand-edited - `scripts/bump-lockstep.mjs` (repo root) writes
   it together with `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts`, and `pnpm run bump:check` fails the
   build when either drifts. `blit386.docsReviewedAt` is the opposite case - hand-set only, bumped by whoever actually
   reviewed `content/docs/*.md` against a new engine release; no script writes it, `scripts/check-kit-docs-drift.mjs`
   (repo root) only reads it. Any other literal this package uses to describe the engine or the scaffolder follows the
   same derive-or-document discipline: file classes and generated-project paths live once in `src/ownership.ts`, and the
   `.blit/manifest.json` path and shape live once in `src/manifest.ts` - both of which `create-blit386` imports through
   `@blit386/kit/adapters`. The manifest is written by two packages and read by one, so its declaration is authored once
   (`BlitManifest`) and the reader's leniency toward manifests from older scaffolders is _derived_ from it
   (`ReadBlitManifest`), never hand-maintained as a second interface. Same discipline, one boundary further out:
   `MCP_SERVER_NAME` and `MCP_SERVER_URL` in `src/adapters.ts` are a documented copy of
   `packages/website/public/.well-known/mcp/server-card.json`, which this package cannot import;
   `test/mcp-config.test.mjs` compares the two, so the copy fails loudly instead of drifting. See root
   `.claude/rules/named-constants.md` for the shared policy
6. Never re-derive the kit's package root at a call site - `src/kit-root.ts` holds the only implementation of each of
   the two answers, and they are not interchangeable. See below

## Two ways to find the kit root, and which one you want

`src/kit-root.ts` is the single home for both. Picking the wrong one is silently wrong rather than broken, so the choice
is worth a moment:

| Question | Function | Who asks it |
| --- | --- | --- |
| Which kit contains this running code? | `kitRoot()` | The `blit` CLI, which ships inside a game's `node_modules` and must read its own `content/`; `src/env.ts`'s `package.json` readers |
| Which kit does the caller's package depend on? | `resolveKitRoot(import.meta.url)` | `create-blit386`, which copies that kit's `content/` into a new game and pins its version in the generated `package.json` |

Both are re-exported from `src/adapters.ts`, this package's only published subpath. They point at the same directory in
a normal install and diverge under bundling, `pnpm link`, and hoisting - which is why there is one implementation of
each rather than one of either.

`kitRoot()` walks up to the nearest `package.json` named `@blit386/kit` **on purpose**. Do not "simplify" it back to
`new URL('../package.json', import.meta.url)`: that is only correct for a module emitted at `dist/` root, and tsup also
emits `dist/migrations/*.js` a level down and splits shared code into `chunk-*.js` whose placement is an esbuild
implementation detail. The walk also turns "bundled into another package" from a wrong answer into a thrown error.
`test/kit-root.test.mjs` covers both, including a guard that fails if the hardcoded-depth idiom reappears anywhere in
`dist/`.

## Where to find information

| Question | Where to look |
| --- | --- |
| What does the `blit` CLI do? | `src/cli.ts`, `README.md` |
| How are agent files generated? | `src/adapters.ts`; every path it emits is built from `src/ownership.ts`, and the scaffolder writes them to disk |
| Docs-MCP config shipped into games | `MCP_SERVER_ENTRY` in `src/adapters.ts`, path per agent in `AGENT_SPECS[kind].mcpConfig`; canonical server definition lives in `packages/website` |
| Which agents exist, and how to add one | The registry: `AGENT_SPECS` in `src/ownership.ts` (label, setup hint, private paths, MCP config path, `readsSharedSkills`) plus `AGENT_ADAPTERS` in `src/adapters.ts` (the generator). Scaffold, `sync`, and `add` all go through `generateAgentFiles`, never a per-agent branch |
| What do `blit agents sync` / `add` do? | `src/commands/agents.ts` (drift `--check` + write path, `runAddAgent`) |
| How do API migrations / codemods work? | `src/migrations/` (registry + codemod engine), `src/commands/migrate.ts` |
| Sync ownership model / manifest | `src/manifest.ts` (where the manifest lives and what shape it has), `src/commands/agents.ts` (the read/reconcile/write algorithm) |
| Which files the kit owns, and the paths it writes into a game | `src/ownership.ts` - shared with `create-blit386` via `@blit386/kit/adapters` |
| How the kit finds its own root, and how the scaffolder finds the installed kit | `src/kit-root.ts` - `kitRoot()` vs `resolveKitRoot()`, both re-exported from `src/adapters.ts` |
| Engine API names for generated games | `packages/blit386/CLAUDE.md`, `packages/blit386/docs/api-core.md` |
| What does the scaffolder generate? | `packages/create-blit386/CLAUDE.md` |
| Publishing / release | `packages/create-blit386/PUBLISHING.md`, `/release`, `pnpm run bump -- 1.5.0` from the repo root (replace `1.5.0` with the target version) |
| Maintainer agent-config drift check | `scripts/check-agent-config.mjs` (root) |
| Lockstep version / range drift check | `pnpm run bump:check` (root `scripts/bump-lockstep.mjs --check`) |
| Kit docs drift check + Linear filing | `scripts/check-kit-docs-drift.mjs`, `scripts/report-kit-docs-drift.mjs` (root), `.github/workflows/kit-docs-drift.yml` |
| Contributing / DCO | root `CONTRIBUTING.md` |
