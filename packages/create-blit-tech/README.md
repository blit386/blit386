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

- A small, complete starter game (Catcher) with a comment on every line - JavaScript by default, or TypeScript with
  `--ts`.
- A ready-to-run Vite setup: `index.html`, `src/game.js` (or `src/game.ts`), and a dev server.
- Local guides (`docs/`) and an `AGENTS.md` so you - or an AI assistant - can learn the engine without leaving the
  project.
- The `blit` helper CLI (`npx blit run`, `npx blit doctor`, `npx blit upgrade`, `npx blit agents sync`), provided by
  [`@blit-tech/kit`](https://www.npmjs.com/package/@blit-tech/kit). It is a project-local bin, so invoke it through
  `npx`.

If you pick an AI assistant in the wizard, the scaffolder also generates its config (Claude: `CLAUDE.md` + `.claude/`;
Cursor: `.cursor/`) from the kit's canonical content, and `npx blit agents sync` keeps it current. Did not pick one at
the start? Run `npx blit agents add claude` or `npx blit agents add cursor` later to set it up.

## Options

```bash
npm create blit-tech@latest my-game -- --yes         # skip the prompts (JavaScript, no AI files)
npm create blit-tech@latest my-game -- --ts          # use the TypeScript starter instead of JavaScript
npm create blit-tech@latest my-game -- --no-install  # do not install dependencies
npm create blit-tech@latest my-game -- --no-git      # do not initialize a git repository
```

## Requirements

- Node.js 22.18.0 or newer.
- A modern browser. WebGPU is used when available; otherwise the engine falls back to Canvas 2D automatically, so the
  game always runs.

## License

ISC. Copyright (c) Václav Vančura. See [LICENSE](./LICENSE).
