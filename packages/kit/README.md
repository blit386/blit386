# @blit386/kit

The kit behind [BLIT386](https://www.npmjs.com/package/blit386) game projects: the canonical AI/human docs plus the
`blit` helper CLI. You normally do not install this yourself -
[`create-blit386`](https://www.npmjs.com/package/create-blit386) adds it to a new game for you.

## What's inside

- The `blit` CLI – a small helper you run inside a BLIT386 game:
  - `blit run` – start the dev server and open the game.
  - `blit doctor` – check Node, git, and the installed `blit386` version.
  - `blit upgrade` – update `blit386` to the latest version, with a friendly nudge if your work is not under git. After
    a version change it checks your game for old API names and offers to update them for you (see `blit migrate`).
  - `blit migrate` – update old BLIT386 names in your game to the current ones. It previews the changes by default and
    only writes them when you add `--write`. Safe, unambiguous renames are applied; names that are too common to change
    automatically (like `equals`) are listed for you or your AI assistant to handle.
  - `blit agents sync` – refresh the AI-assistant files from the installed kit. It keeps your edits: kit-owned files you
    have not touched are updated in place, shared files (`AGENTS.md`, `CLAUDE.md`) get only their managed region
    rewritten, and a file you changed is three-way merged (or saved next to yours as `<file>.new`). Use `--check` to
    report drift without writing (CI-safe; `blit doctor` runs it too), or `--force [path...]` to take the kit version
    back. Once sync has merged your edits into a kit file, `--check` treats that file as settled – it will not keep
    reporting it as drifted.
  - `blit agents add <claude|cursor>` – set up the files for one AI assistant in a game that did not pick it at the
    start. It writes the new files and records them so `blit agents sync` keeps them fresh. It never overwrites a file
    you already have; if one is in the way it saves the kit version next to it as `<file>.new`.
  - `blit help` – list the commands.
- `content/` – everything a scaffolded project ships so a person or an AI assistant can learn the engine from inside the
  project: the canonical `AGENTS.md` and `docs/`, the engine API `rules/`, the game-author `skills/` (listed below), the
  agent `hooks/` plus `hooks.manifest.json`, and `agents.config.json`, which declares what each assistant's adapter
  emits.

## The game-author skills

Every scaffolded game gets these. Your AI assistant loads one on its own when the task calls for it – you do not have to
name them. In Claude Code they live in `.claude/skills/`; in Cursor they are slash commands in `.cursor/commands/`, so
there you can also invoke one by name (`/add-sprite`).

| Skill                 | What it is for                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `structure-a-game`    | The shape of a game: `configure`, `init`, `update`, `render` – and what the engine does not do for you |
| `run`                 | Start the dev server and see the game                                                                  |
| `fix`                 | The game crashes, shows a black screen, or behaves oddly                                               |
| `draw-shapes`         | Rectangles, lines, pixels, and clearing the screen                                                     |
| `add-sprite`          | Load a PNG sprite sheet and draw it, whole or frame by frame                                           |
| `add-text`            | Scores, labels, and titles with the built-in or a bitmap font                                          |
| `use-palette`         | Set up colors as numbered palette slots                                                                |
| `animate-the-palette` | Cycle, fade, flash, and swap colors for motion and mood                                                |
| `move-and-time`       | The frame clock, timers, cooldowns, and easing                                                         |
| `smooth-the-motion`   | Make movement look smooth instead of stepped, with `BT.renderAlpha`                                    |
| `scroll-with-camera`  | Scroll a world bigger than the screen, clamped to its bounds                                           |
| `read-keyboard`       | Keys, face buttons, typed text, and remapping                                                          |
| `read-pointer`        | Mouse, touch, and pen, up to four at once                                                              |
| `read-gamepad`        | Controllers: buttons, sticks, and triggers                                                             |
| `play-a-sound`        | Sound effects, music, volume, and why a game starts silent                                             |
| `design-a-sound`      | Build a custom sound from scratch when the presets are not right                                       |
| `add-crt-effect`      | Fullscreen post-process effects: CRT, scanlines, bloom, glitch (WebGPU only)                           |
| `show-debug-overlay`  | FPS, timings, your own values, and the palette grid                                                    |
| `keep-it-fast`        | The game stutters, drops frames, or sprites start vanishing                                            |
| `save-a-screenshot`   | Capture the frame as a PNG                                                                             |
| `share-the-game`      | Build it and put it online for other people to play                                                    |
| `migrate`             | Update the game's code after a BLIT386 upgrade renamed something                                       |

## Usage

Inside a project created by `create-blit386`:

```bash
npx blit run
npx blit doctor
npx blit upgrade
npx blit migrate
npx blit migrate --write
npx blit agents sync
npx blit agents add cursor
npx blit help
```

## Requirements

- Node.js 22.18.0 or newer.

## Learn more

- Docs: [blit386.dev](https://blit386.dev)
- Source and issues: [github.com/blit386/create-blit386](https://github.com/blit386/create-blit386)

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [X](https://x.com/blit386)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
