# create-blit-tech

Scaffold a new [Blit-Tech](https://www.npmjs.com/package/blit-tech) game in seconds.

## Usage

```bash
npm create blit-tech@latest my-game
cd my-game
npm install
npm run dev
```

Works with npm, pnpm, yarn, or bun - the scaffolder uses whichever you ran it with.

## What you get

- A small, complete starter game (Catcher) in plain JavaScript, with a comment on every line.
- A ready-to-run Vite setup: `index.html`, `src/game.js`, and a dev server.
- Local guides (`docs/`) and an `AGENTS.md` so you - or an AI assistant - can learn the engine without leaving the
  project.
- The `blit` helper CLI (`blit run`, `blit doctor`, `blit upgrade`), provided by
  [`@blit-tech/kit`](https://www.npmjs.com/package/@blit-tech/kit).

## Options

```bash
npm create blit-tech@latest my-game -- --yes         # skip the prompts (JavaScript, no AI files)
npm create blit-tech@latest my-game -- --no-install  # do not install dependencies
npm create blit-tech@latest my-game -- --no-git      # do not initialize a git repository
```

## Requirements

- Node.js 22.18.0 or newer.
- A modern browser. WebGPU is used when available; otherwise the engine falls back to Canvas 2D automatically, so the
  game always runs.

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
