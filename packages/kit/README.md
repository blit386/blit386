# @blit-tech/kit

The kit behind [Blit-Tech](https://www.npmjs.com/package/blit-tech) game projects: the canonical AI/human docs plus the
`blit` helper CLI. You normally do not install this yourself -
[`create-blit-tech`](https://www.npmjs.com/package/create-blit-tech) adds it to a new game for you.

## What's inside

- **The `blit` CLI** - a small helper you run inside a Blit-Tech game:
  - `blit run` - start the dev server and open the game.
  - `blit doctor` - check Node, git, and the installed `blit-tech` version.
  - `blit upgrade` - update `blit-tech` to the latest version, with a friendly nudge if your work is not under git.
  - `blit agents` - set up files for a specific AI assistant (coming in a later version).
- **`content/`** - the canonical `AGENTS.md` and `docs/` that scaffolded projects ship, so a person or an AI assistant
  can learn the engine from inside the project.

## Usage

Inside a project created by `create-blit-tech`:

```bash
npx blit run
npx blit doctor
npx blit upgrade
```

## Requirements

- Node.js 22.18.0 or newer.

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
