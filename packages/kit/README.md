# @blit386/kit

The kit behind [BLIT386](https://www.npmjs.com/package/blit386) game projects: the canonical AI/human docs plus the
`blit` helper CLI. You normally do not install this yourself -
[`create-blit386`](https://www.npmjs.com/package/create-blit386) adds it to a new game for you.

## What's inside

- The `blit` CLI - a small helper you run inside a BLIT386 game:
  - `blit run` - start the dev server and open the game.
  - `blit play` - play-test the game from the terminal: open it in the Chrome or Edge already installed, run steps (hold
    keys, wait, read the game's `testState()` or `window.__game.state()`, save frames), and print one JSON line per
    step. Needs `playwright-core` in the game (an optional peer dependency; the command prints the line that adds it).
  - `blit doctor` - check Node, git, `.gitattributes`, the installed `blit386` version against the range this kit was
    written for, kit-managed files that drifted (the same check as `blit agents sync --check`), and whether every set-up
    assistant has its docs-server config (it names the missing file and the assistants that need it).
  - `blit upgrade` - update `blit386` to the latest version, with a friendly nudge if your work is not under git. After
    a version change it checks your game for old API names and offers to update them for you (see `blit migrate`).
  - `blit migrate` - update old BLIT386 names in your game to the current ones, and (on blit386 1.4.0+) enable hot
    reload in `vite.config` when it is missing. It previews the changes by default and only writes them when you add
    `--write`. Safe, unambiguous renames are applied; names that are too common to change automatically (like `equals`)
    are listed for you or your AI assistant to handle.
  - `blit agents sync` - refresh the AI-assistant files from the installed kit. It keeps your edits: kit-owned files you
    have not touched are updated in place, shared files (`AGENTS.md`, `CLAUDE.md`) get only their managed region
    rewritten, and a file you changed is three-way merged (or saved next to yours as `<file>.new`). If a newer kit ships
    a file at a path where you already keep your own (say, a skill with the same name), sync leaves yours alone and
    saves the kit version as `<file>.new` - `--force` does not override this; rename or remove your file and sync again
    to take the kit version. Use `--check` to report drift without writing (CI-safe; `blit doctor` runs it too), or
    `--force [path...]` to take the kit version back. Once sync has merged your edits into a kit file, `--check` treats
    that file as settled - it will not keep reporting it as drifted.
  - `blit agents add <claude|cursor|antigravity|codex|copilot|gemini|opencode|zed>` - set up the files for one AI
    assistant in a game that did not pick it at the start. It writes the new files and records them so
    `blit agents sync` keeps them fresh. It never overwrites a file you already have; if one is in the way it saves the
    kit version next to it as `<file>.new`.
  - `blit clean` - replace `src/game.ts` (or `src/game.js`) with an empty skeleton: the same `init`/`update`/`render`
    shape, no drawing, no input handling, ready for your own code. No other project file is touched other than
    `.blit/manifest.json`'s tracked hash for it, kept in step so later drift checks do not flag the skeleton as
    modified. Warns before replacing a file that no longer matches what was scaffolded, and always asks first - add
    `--yes` to skip the prompt.
  - `blit help` - list the commands.
- `content/` - everything a scaffolded project ships so a person or an AI assistant can learn the engine from inside the
  project: the canonical `AGENTS.md` and `docs/`, the engine API `rules/`, the game-author `skills/` (listed below), and
  the agent `hooks/` plus `hooks.manifest.json`. Per-assistant file generation lives in `src/adapters/` and is exported
  as `@blit386/kit/adapters`, so the scaffolder and `blit agents sync` / `blit agents add` share one implementation; the
  paths it emits and their sync ownership classes are defined once in `src/ownership.ts`. The table below lists what
  each assistant gets.

### What each assistant gets

Every game gets `AGENTS.md` and `docs/` from the scaffolder, whatever assistants it picks. On top of that, per assistant
(the registry is `AGENT_SPECS` in `src/ownership.ts`; the generators are `AGENT_ADAPTERS` in `src/adapters.ts`):

| Assistant | Persona and rules | Skills | Hooks and guards | Docs MCP config |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` (managed region), `.claude/rules/*.md` | `.claude/skills/` | `.claude/settings.json` + `.claude/hooks/`: format-on-edit, shell guard, lock-file / `.env` guard, session-start bootstrap; `.claude/launch.json` (yours, written once) | `.mcp.json` (shared with Copilot), pre-approved in `settings.json` |
| Cursor | `.cursor/rules/*.mdc` | `.cursor/skills/` | `.cursor/hooks.json` + `.cursor/hooks/`: format-on-edit, shell guard (no pre-edit or session-start event) | `.cursor/mcp.json` |
| Antigravity | `AGENTS.md` | `.agents/skills/` (shared) | `.agents/hooks.json` + `.agents/hooks/`: all four, the bootstrap once per conversation | `.agents/mcp_config.json` |
| Codex | `AGENTS.md` | `.agents/skills/` (shared) | `.codex/hooks.json` + `.codex/hooks/`: all four; confirm-tier git commands are refused outright | `.codex/config.toml` |
| GitHub Copilot | `AGENTS.md` | `.agents/skills/` (shared) | `.github/hooks/blit.json` + `.github/hooks/`: all four through `copilot-hook.cjs`; `.github/workflows/copilot-setup-steps.yml` | `.mcp.json` (shared with Claude Code) |
| Gemini CLI | `AGENTS.md` (`context.fileName`) | `.agents/skills/` (shared) | `.gemini/settings.json` + `.gemini/hooks/`: all four; confirm-tier git commands are refused outright | `.gemini/settings.json` |
| OpenCode | `AGENTS.md` | `.agents/skills/` (shared) | `.opencode/plugins/kit-guard.ts` + `.opencode/hooks/`: shell guard, file guard, session-start bootstrap; `opencode.json` restates the guards as permissions and turns the formatters on | `opencode.json` |
| Zed | `AGENTS.md` (hard rules as instructions; `docs/zed.md` has a paste-in snippet for your own settings) | `.agents/skills/` (shared) | none - format on save in `.zed/settings.json` | `.zed/settings.json` |

"All four" is the manifest's set: format-on-edit, block-dangerous-shell, the lock-file / `.env` guard, and the
session-start bootstrap. Every guard is a thin entry over one shared `guard-core.cjs`, so the deny list (a hard reset, a
`checkout` onto paths, a forced `checkout` or `switch`, a `restore` onto the worktree, `clean`, `checkout-index -f`,
`read-tree --reset`, an inline `-c alias`) and the ask list (force push, a push that deletes remote branches or mirrors,
a push refspec or mirror mode set inline, `branch -D`, `stash drop/clear`) are the same in every assistant that can
enforce them.

Every assistant also gets a documentation-MCP config registering the `blit386-docs` server at `https://blit386.dev/mcp`,
so it can search the live docs. A few things the table cannot show:

- Trust prompts. Antigravity, Gemini CLI, Codex, GitHub Copilot, and Zed ignore the project's config until you trust the
  folder; Codex also runs each project hook only after you approve it in `/hooks` (again whenever a kit update changes
  it). OpenCode has no trust prompt, so its plugin runs the moment the folder opens - the plugin's header comment lists
  everything it does. Copilot's cloud agent cannot read an MCP server from the project, so add the docs server in the
  repository's Copilot settings. Claude Code does not prompt for the docs server once the folder is trusted: the kit
  pre-approves it in `.claude/settings.json`.
- Your edits. `opencode.json`, `.codex/config.toml`, `.gemini/settings.json`, and `.zed/settings.json` are yours to
  extend: `blit agents add` merges the kit's entries into a file you already have, and `blit agents sync` three-way
  merges your edits. Other kit-owned files such as `.claude/settings.json` and `.agents/hooks.json` keep your edits too;
  sync saves the kit version beside them as `<file>.new`.
- `.claude/launch.json` tells the Claude desktop app's built-in browser pane how to start the game (Vite on port 5173,
  through your package manager). That file is yours: the desktop app and other tools write into it, so
  `blit agents sync` and `blit agents add` create it only when it is missing and never change, merge, or `--force` an
  existing one.
- Zed's agent cannot take guardrails from project files, so the hard rules live in `AGENTS.md` as instructions, and
  `docs/zed.md` carries a snippet to paste into your own Zed settings for real enforcement. The Biome formatter needs
  Zed's Biome extension.

## The game-author skills

Every scaffolded game gets these. Your AI assistant loads one on its own when the task calls for it - you do not have to
name them. In Claude Code they live in `.claude/skills/<name>/SKILL.md`. In Cursor they live in
`.cursor/skills/<name>/SKILL.md`, with the same name and description, so Cursor loads one on its own too, and you can
still invoke one by name (`/add-sprite`). A game set up for several assistants ships each one's copy. Cursor also reads
`.claude/skills/`, so the same skill can show up twice there; both copies are the same text. Antigravity, Codex, GitHub
Copilot, Gemini CLI, OpenCode, Zed (and most other assistants) read one shared folder, `.agents/skills/<name>/SKILL.md`,
which the kit writes once whenever such an assistant is set up.

| Skill | What it is for |
| --- | --- |
| `structure-a-game` | The shape of a game: `configure`, `init`, `update`, `render` - and what the engine does not do for you |
| `run` | Start the dev server and see the game |
| `fix` | The game crashes, shows a black screen, or behaves oddly |
| `test-the-game` | Play-test the game in a browser: fixed seeds, key presses, and reading the game state |
| `ask-the-docs` | Look something up that the local `docs/` folder does not cover, using the live docs at blit386.dev |
| `use-hot-reload` | Keep playing while you edit code or assets (`blit386/vite`, `onHotReload`) |
| `use-dev-mode` | Gate debug HUDs, cheat keys, and verbose logging on `BT.isDevMode` |
| `draw-shapes` | Rectangles, lines, pixels, and clearing the screen |
| `add-sprite` | Load a PNG sprite sheet and draw it, whole or frame by frame |
| `draw-a-panel` | Panels, dialog boxes, buttons, and bars of any size from one small piece of art, with a nine-slice |
| `show-a-loading-screen` | Wait for sprites and audio with `BT.loadingAssetsCount` |
| `add-text` | Scores, labels, and titles with the built-in or a bitmap font |
| `use-palette` | Set up colors as numbered palette slots |
| `animate-the-palette` | Cycle, fade, flash, and swap colors for motion and mood |
| `move-and-time` | The frame clock, timers, cooldowns, easing curves, and `interpolate` |
| `use-random` | Dice, picks, shuffles, weighted drops, and seeds that replay the same game |
| `use-noise` | Terrain, caves, clouds, and procedural textures from noise and coordinate hashing |
| `smooth-the-motion` | Make movement look smooth instead of stepped, with `BT.renderAlpha` |
| `scroll-with-camera` | Scroll a world bigger than the screen, clamped to its bounds |
| `read-keyboard` | Keys, face buttons, typed text, and remapping |
| `read-pointer` | Mouse, touch, and pen, up to four at once |
| `read-gamepad` | Controllers: buttons, sticks, and triggers |
| `play-a-sound` | Sound effects, music, volume, and why a game starts silent |
| `design-a-sound` | Build a custom sound from scratch when the presets are not right |
| `add-crt-effect` | Fullscreen post-process effects: CRT, scanlines, bloom, glitch (WebGPU only) |
| `show-debug-overlay` | FPS, timings, your own values, the palette grid, audio volume meters, and renderer diagnostics |
| `keep-it-fast` | The game stutters, drops frames, or sprites start vanishing |
| `save-a-screenshot` | Capture the frame as a PNG |
| `share-the-game` | Build it and put it online for other people to play |
| `migrate` | Update the game's code after a BLIT386 upgrade (renames + enable hot reload) |

## Usage

Inside a project created by `create-blit386`:

```bash
npx blit run
npx blit play --help
npx blit doctor
npx blit upgrade
npx blit migrate
npx blit migrate --write
npx blit agents sync
npx blit agents add cursor
npx blit agents add antigravity
npx blit agents add codex
npx blit agents add copilot
npx blit agents add gemini
npx blit agents add opencode
npx blit agents add zed
npx blit clean
npx blit clean --yes
npx blit help
```

## Requirements

- Node.js 22.18.0 or newer.

## Versions

`@blit386/kit`, `create-blit386`, and the `blit386` engine share one version number and release together. The kit's
`package.json` carries two extra fields under `blit386`: `engineRange` is the engine range these guides and skills
describe (`blit doctor` compares it with the `blit386` you have installed and tells you when to update the kit or the
engine), and `docsReviewedAt` is the engine version the `docs/` pages were last reviewed against. A game pins the kit
and the engine it was scaffolded with; `blit upgrade` moves the engine, and a newer kit arrives like any other
dependency update, followed by `npx blit agents sync` to refresh the generated files.

## Learn more

- Docs: [blit386.dev](https://blit386.dev)
- Source: [packages/kit](https://github.com/blit386/blit386/tree/main/packages/kit)
- Issues: [github.com/blit386/blit386/issues](https://github.com/blit386/blit386/issues)

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
