# create-blit386

[![create-blit386 on npm](https://img.shields.io/npm/v/create-blit386.svg?label=create-blit386)](https://www.npmjs.com/package/create-blit386)
[![@blit386/kit on npm](https://img.shields.io/npm/v/@blit386/kit.svg?label=kit)](https://www.npmjs.com/package/@blit386/kit)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

One command, and you have a little pixel game running in your browser. `create-blit386` writes a ready-to-go
[BLIT386](https://www.npmjs.com/package/blit386) project – a starter game, a working build, and docs – so you can spend
the first five minutes playing instead of wiring things up.

## Start a game in seconds

```bash
npm create blit386@latest my-game
cd my-game
npm run dev
```

A web address appears. Open it. That is your game, already running. Open `src/game.js` and start changing things – every
line has a comment that explains itself.

It works with npm, pnpm, yarn, or bun – the scaffolder quietly uses whichever one you ran it with.

## What you get

The wizard asks three quick questions – language (JavaScript or TypeScript), whether you want an AI assistant set up,
and whether to add a GitHub Actions CI workflow – plus the folder name, if you did not pass one on the command line.
Then it writes:

- A Catcher starter game – a tiny, complete, heavily commented game you can read top to bottom.
- A Vite project that builds and runs with one command.
- JavaScript by default, or TypeScript if you ask for it (`--ts`).
- Local docs and an `AGENTS.md`, so your editor's AI actually knows how the engine works.
- The `blit` CLI: `blit run`, `blit doctor`, `blit upgrade`, `blit migrate`, and `blit agents` for keeping assistant
  files current.
- Optional Claude or Cursor config, generated from the kit's canonical content – pick one in the wizard, or add it later
  with `npx blit agents add`. Claude gets `CLAUDE.md`, `.claude/rules/`, and a `.claude/skills/<name>/SKILL.md` for each
  game-author skill (add a sprite, play a sound, animate the palette, ...); Cursor gets `.cursor/rules/*.mdc`, the same
  skills as `.cursor/commands/*.md`, plus `.cursor/hooks.json` and `.cursor/hooks/`.
- Optional GitHub Actions CI (build + format check), if you say yes in the wizard.

## Never used Node.js before?

The command above needs Node.js – a free program that runs JavaScript on your computer. These instructions live here on
purpose: a brand-new project cannot teach you to install the thing it needs to exist. One-time setup:

1. Go to [nodejs.org](https://nodejs.org) and download the button marked LTS ("the stable one").
2. Install it like any other app: keep clicking Next or Continue.
3. Open a terminal (your editor has one built in – in Zed or VS Code, look for "Terminal" in the menu). If the editor
   was already open, quit and reopen it first so it notices Node.
4. Now run the three Start commands above, one line at a time.

### Send this to a friend

Starting someone else off? Copy and paste this:

> Want to make a little pixel game? First install Node.js: go to nodejs.org, download the LTS button, and install it
> like any app. Then open the terminal inside your editor and type these three lines, pressing Enter after each:
> `npm create blit386@latest my-game`, then `cd my-game`, then `npm run dev`. A web address appears – open it in your
> browser and you are playing your own game. Open `src/game.js` to change it; every line has a comment that explains
> itself.

## What is in this repo

A pnpm monorepo with two published packages:

- `create-blit386` (`packages/create-blit386`) – the `npm create blit386` scaffolder: the wizard and the project
  templates.
- `@blit386/kit` (`packages/kit`) – the canonical kit content in `content/` (`AGENTS.md`, the local `docs/`, the API
  rules, the game-author skills, the agent hooks, and `agents.config.json`) and the project-local `blit` CLI (`run`,
  `doctor`, `upgrade`, `migrate`, `agents sync`, `agents add`, `help`).

### Working on it

```bash
pnpm install
pnpm run build        # build both packages with tsup
pnpm run typecheck    # tsc --noEmit per package
pnpm run test         # pnpm -r test: node:test suites (scaffolder, env, codemod, hot-reload migrate)
pnpm run preflight    # format:check + lint + typecheck + spellcheck + knip + docs:links + build + test
```

The scaffolder suites read from `dist/`, so build before running them on their own (the kit's suite rebuilds itself via
a `pretest` script; `pnpm run preflight` builds first anyway).

CI runs the same checks on every push and pull request to `main`. Publishing to npm is a deliberate, manual step (it is
not automated here).

### Contributing

Pull requests are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first; everyone taking part is held to the
[Code of Conduct](CODE_OF_CONDUCT.md).

Every commit must carry a Developer Certificate of Origin sign-off – commit with `git commit -s` and a `Signed-off-by:`
trailer is added for you. A CI check enforces it, so an unsigned commit blocks the pull request.

## Related

- Docs: [blit386.dev](https://blit386.dev) – the full BLIT386 documentation site.
- Engine: [blit386](https://github.com/blit386/blit386) – the palette-first WebGPU retro engine these games run on
  ([npm](https://www.npmjs.com/package/blit386), [docs](https://blit386.dev)).
- Demos: [demos.blit386.dev](https://demos.blit386.dev) – 39 small, commented examples.

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [X](https://x.com/blit386)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## Made by

Built by Václav Vančura ([@vancura](https://github.com/vancura)) – one person, so far.

## License

ISC.
