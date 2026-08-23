# BLIT386

[![CI](https://github.com/blit386/blit386/actions/workflows/ci.yml/badge.svg)](https://github.com/blit386/blit386/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/blit386.svg)](https://www.npmjs.com/package/blit386)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

BLIT386 is a palette-first retro game engine for the web, and this repository is the whole project – the engine, the
scaffolder that writes you a running game in one command, a few dozen commented demos, and the site that documents them.
Palette-first means you draw with numbered colors rather than RGBA pixels, so changing what color 3 _means_ recolors
everything drawn in it at once: a few bytes of palette upload, and water flows or the sky goes dark without a single
pixel being redrawn. TypeScript throughout, WebGPU where the browser has it, an automatic Canvas 2D fallback where it
does not.

![BLIT386 logo](https://github.com/blit386/blit386/raw/main/packages/blit386/assets/logo.png)

## Quick start

You do not need to know anything about this repository to start. One command writes a complete, running project:

```bash
npm create blit386@latest my-game
cd my-game
npm run dev
```

It works with npm, pnpm, yarn, or bun – whichever you ran it with. Open the address it prints, edit `src/game.js`, and
the page updates as you type. The generated project comes with a starter game, local documentation, and the `blit` CLI.

Already have a project and just want the engine in it? That path starts at
[`packages/blit386`](packages/blit386/README.md).

## What is in here

| Package | npm | What it is |
| --- | --- | --- |
| [`packages/blit386`](packages/blit386) | [`blit386`](https://www.npmjs.com/package/blit386) | The engine: palette, sprites, text, input, audio, seeded random, easing, post-process effects |
| [`packages/create-blit386`](packages/create-blit386) | [`create-blit386`](https://www.npmjs.com/package/create-blit386) | The scaffolder behind `npm create blit386@latest` |
| [`packages/kit`](packages/kit) | [`@blit386/kit`](https://www.npmjs.com/package/@blit386/kit) | What a generated game gets: starter docs, game-author skills, the `blit` CLI |
| [`packages/demos`](packages/demos) | not published | The examples running at demos.blit386.dev |
| [`packages/website`](packages/website) | not published | The docs site at blit386.dev |

The engine, the kit, and the scaffolder release together under one shared version number, so a scaffolded game always
gets a kit that matches the engine it pins.

## Where to go next

- [blit386.dev](https://blit386.dev) – the project site
- [blit386.dev/docs](https://blit386.dev/docs) – the full documentation, typeset and searchable
- [demos.blit386.dev](https://demos.blit386.dev) – dozens of small examples, running in your browser
- [awesome-blit386](https://github.com/blit386/awesome-blit386) – a curated list of games, tools, and resources

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## Contributing

BLIT386 is built by Václav Vančura ([@vancura](https://github.com/vancura)), and help is welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the checks, and the commit conventions, and read
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before taking part. Security reports have their own channel –
[SECURITY.md](SECURITY.md).

Working inside a single package? Each one has its own `README.md` covering what only it does.

## License

ISC – see [LICENSE](LICENSE).
