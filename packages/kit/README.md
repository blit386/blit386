# @blit386/kit

The kit behind [BLIT386](https://www.npmjs.com/package/blit386) game projects: the canonical AI/human docs plus the
`blit` helper CLI. You normally do not install this yourself -
[`create-blit386`](https://www.npmjs.com/package/create-blit386) adds it to a new game for you.

## What's inside

- The `blit` CLI - a small helper you run inside a BLIT386 game:
  - `blit run` - start the dev server and open the game.
  - `blit doctor` - check Node, git, and the installed `blit386` version.
  - `blit upgrade` - update `blit386` to the latest version, with a friendly nudge if your work is not under git. After
    a version change it checks your game for old API names and offers to update them for you (see `blit migrate`).
  - `blit migrate` - update old BLIT386 names in your game to the current ones. It previews the changes by default and
    only writes them when you add `--write`. Safe, unambiguous renames are applied; names that are too common to change
    automatically (like `equals`) are listed for you or your AI assistant to handle.
  - `blit agents sync` - refresh the AI-assistant files from the installed kit. It keeps your edits: kit-owned files you
    have not touched are updated in place, shared files (`AGENTS.md`, `CLAUDE.md`) get only their managed region
    rewritten, and a file you changed is three-way merged (or saved next to yours as `<file>.new`). Use `--check` to
    report drift without writing (CI-safe; `blit doctor` runs it too), or `--force [path...]` to take the kit version
    back. Once sync has merged your edits into a kit file, `--check` treats that file as settled - it will not keep
    reporting it as drifted.
  - `blit agents add <claude|cursor>` - set up the files for one AI assistant in a game that did not pick it at the
    start. It writes the new files and records them so `blit agents sync` keeps them fresh. It never overwrites a file
    you already have; if one is in the way it saves the kit version next to it as `<file>.new`.
- `content/` - the canonical `AGENTS.md` and `docs/` that scaffolded projects ship, so a person or an AI assistant can
  learn the engine from inside the project.

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
```

## Requirements

- Node.js 22.18.0 or newer.

## Learn more

- Docs: [blit386.dev](https://blit386.dev)
- Source and issues: [github.com/blit386/create-blit386](https://github.com/blit386/create-blit386)

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
