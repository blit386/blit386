# @blit-tech/kit

The kit behind [Blit-Tech](https://www.npmjs.com/package/blit-tech) game projects: the canonical AI/human docs plus the
`blit` helper CLI. You normally do not install this yourself -
[`create-blit-tech`](https://www.npmjs.com/package/create-blit-tech) adds it to a new game for you.

## What's inside

- **The `blit` CLI** - a small helper you run inside a Blit-Tech game:
  - `blit run` - start the dev server and open the game.
  - `blit doctor` - check Node, git, and the installed `blit-tech` version.
  - `blit upgrade` - update `blit-tech` to the latest version, with a friendly nudge if your work is not under git.
  - `blit agents sync` - refresh the AI-assistant files from the installed kit. It keeps your edits: kit-owned files you
    have not touched are updated in place, shared files (`AGENTS.md`, `CLAUDE.md`) get only their managed region
    rewritten, and a file you changed is three-way merged (or saved next to yours as `<file>.new`). Use `--check` to
    report drift without writing (CI-safe; `blit doctor` runs it too), or `--force [path...]` to take the kit version
    back.
  - `blit agents add <claude|cursor>` - set up the files for one AI assistant in a game that did not pick it at the
    start. It writes the new files and records them so `blit agents sync` keeps them fresh. It never overwrites a file
    you already have; if one is in the way it saves the kit version next to it as `<file>.new`.
- **`content/`** - the canonical `AGENTS.md` and `docs/` that scaffolded projects ship, so a person or an AI assistant
  can learn the engine from inside the project.

## Usage

Inside a project created by `create-blit-tech`:

```bash
npx blit run
npx blit doctor
npx blit upgrade
npx blit agents sync
npx blit agents add cursor
```

## Requirements

- Node.js 22.18.0 or newer.

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
