# create-blit386

Scaffold a new [BLIT386](https://www.npmjs.com/package/blit386) game in seconds.

## Usage

```bash
npm create blit386@latest my-game
cd my-game
npm run dev
```

The scaffolder installs the dependencies for you, so there is no `npm install` step. (If you passed `--no-install`, run
your install command first.)

Works with npm, pnpm, yarn, or bun – the scaffolder uses whichever you ran it with.

## What you get

- A small, complete starter game (Catcher) with a comment on every line – JavaScript by default, or TypeScript with
  `--ts`.
- A ready-to-run Vite setup: `index.html`, `src/game.js` (or `src/game.ts`), and a dev server.
- Local guides (`docs/`) and an `AGENTS.md` so you – or an AI assistant – can learn the engine without leaving the
  project.
- The `blit` helper CLI (`npx blit run`, `npx blit doctor`, `npx blit upgrade`, `npx blit migrate`,
  `npx blit agents sync`), provided by [`@blit386/kit`](https://www.npmjs.com/package/@blit386/kit). It is a
  project-local bin, so invoke it through `npx`.

If you pick an AI assistant in the wizard, the scaffolder also generates its config (Claude: `CLAUDE.md` + `.claude/`
including `settings.json` hooks; Cursor: `.cursor/` including `hooks.json`) from the kit's canonical content, and
`npx blit agents sync` keeps it current. Did not pick one at the start? Run `npx blit agents add claude` or
`npx blit agents add cursor` later to set it up.

## Options

```bash
npm create blit386@latest my-game -- --yes         # skip the prompts (JavaScript, no AI files, no CI)
npm create blit386@latest my-game -- --ts          # use the TypeScript starter instead of JavaScript
npm create blit386@latest my-game -- --no-install  # do not install dependencies
npm create blit386@latest my-game -- --no-git      # do not initialize a git repository
```

Without an interactive terminal – an AI assistant or a CI job running the command – there is nobody to answer the
prompts, so the scaffolder behaves as if you passed `--yes` and says so once. `--ts` still applies. Pass `--yes`
yourself to silence the notice.

## Requirements

- Node.js 22.18.0 or newer.
- A modern browser. WebGPU is used when available; otherwise the engine falls back to Canvas 2D automatically, so the
  game always runs.

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
