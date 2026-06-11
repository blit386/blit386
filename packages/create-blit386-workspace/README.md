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

## Development (this repo)

```bash
pnpm install
pnpm run build        # build both packages with tsup
pnpm run typecheck    # tsc --noEmit per package
pnpm run test         # scaffolder smoke test (needs a build first)
pnpm run preflight    # format:check + typecheck + build + test
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request to `main`.

## Status

v0.1 (phase 1): JavaScript scaffold, the Catcher starter game, local docs, and the `blit` CLI. No AI-agent config is
generated yet (the project ships a readable `AGENTS.md`); TypeScript templates and per-agent generation arrive in later
phases. See the design doc in the parent workspace for the full roadmap.

Publishing to npm is a deliberate, manual step and is not automated here.
