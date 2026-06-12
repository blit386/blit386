# create-blit-tech

Scaffolder and kit for [Blit-Tech](https://www.npmjs.com/package/blit-tech) games. This monorepo holds two published
packages:

- **`create-blit-tech`** (`packages/create-blit-tech`) - the `npm create blit-tech` scaffolder. Asks a couple of quick
  questions, then writes a ready-to-run game project.
- **`@blit-tech/kit`** (`packages/kit`) - the canonical AI docs (`AGENTS.md` + local `docs/`) plus the project-local
  `blit` CLI (`run`, `doctor`, `upgrade`).

## Quick start (for users)

```bash
npm create blit-tech@latest my-game
cd my-game
npm install
npm run dev
```

The scaffolder auto-detects whichever package manager you used (`npm`, `pnpm`, `yarn`, `bun`).

## Never used Node.js before?

The command above needs **Node.js** - a free program that runs JavaScript on your computer. The instructions live here,
on this page, on purpose: a brand-new project cannot teach you to install the thing it needs to exist. One-time setup:

1. Go to [nodejs.org](https://nodejs.org) and download the button marked **LTS** ("the stable one").
2. Install it like any other app: keep clicking Next or Continue.
3. Open a terminal (your editor has one built in - in Zed or VS Code, look for "Terminal" in the menu). If the editor
   was already open, quit and reopen it first so it notices Node.
4. Now run the Quick start commands above, one line at a time.

A zero-install path that runs entirely in the browser (StackBlitz) is planned; once it ships, this section will lead
with it.

### Send this to a friend

Starting someone else off? Copy and paste this message:

> Want to make a little pixel game? First install Node.js: go to nodejs.org, download the LTS button, and install it
> like any app. Then open the terminal inside your editor and type these three lines, pressing Enter after each:
> `npm create blit-tech@latest my-game`, then `cd my-game`, then `npm run dev`. A web address appears - open it in your
> browser and you are playing your own game. Open `src/game.js` to change it; every line has a comment that explains
> itself.

## Development (this repo)

```bash
pnpm install
pnpm run build        # build both packages with tsup
pnpm run typecheck    # tsc --noEmit per package
pnpm run test         # scaffolder smoke test (needs a build first)
pnpm run preflight    # format:check + lint + typecheck + spellcheck + knip + docs:links + build + test
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request to `main`.

## Status

v0.1 (phase 1): JavaScript scaffold, the Catcher starter game, local docs, and the `blit` CLI. No AI-agent config is
generated yet (the project ships a readable `AGENTS.md`); TypeScript templates and per-agent generation arrive in later
phases. See the design doc in the parent workspace for the full roadmap.

Publishing to npm is a deliberate, manual step and is not automated here.
