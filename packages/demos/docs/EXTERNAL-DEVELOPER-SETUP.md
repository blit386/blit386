# Quick Start Guide for External Developers

This guide is for developers who want to run BLIT386 Demos locally against the local BLIT386 engine source.

## Why This Setup Is Needed

BLIT386 Demos depends on BLIT386 via a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit386": "workspace:*"
  }
}
```

BLIT386 is published to npm, but this package intentionally depends on `blit386` via `workspace:*` so the demos can
track the local engine source during development. Both packages live in this same `blit386` monorepo -
`packages/blit386` and `packages/demos` - wired together by the root `pnpm-workspace.yaml`, so a single clone and
`pnpm install` gets you both, already linked.

How the link resolves: in `pnpm run dev` the Vite config aliases `blit386` straight to `../blit386/dist/blit386.js` (so
`dev:watch` rebuilds show up without a restart); `pnpm run build` resolves it through `node_modules`, which pnpm points
at the same workspace package. There is no environment variable to point the demos at a different engine checkout - to
test the demos against an engine branch, check that branch out in this monorepo (a `git worktree` works) and run the
demos from there.

## Browser and Renderer

The engine prefers WebGPU and falls back to a Canvas 2D software renderer when WebGPU is missing or fails to start
(optional `?backend=software` on a demo URL). There is no on-canvas banner for this. The engine logs
`[BT] WebGPU unavailable, falling back to software renderer` to the browser console, and the engine overlay shows the
active backend in its status row (for example `software|320x240`). Demo code can read the same value at runtime with
`BT.activeBackend`.

WebGPU is required for post-process / fullscreen effect demos (CRT stacks, two-tier chains). In software mode those
demos still boot and run their core scene without the CRT stack; an on-screen note explains the limitation. Most other
demos run fully in software mode for core 2D, including all audio.

WebGPU is supported in current versions of Chrome/Edge, recent Firefox and Safari as listed in the demos
[README](../README.md#browser-and-renderer).

## One-Time Setup

Prerequisites: Node.js `>=22.18.0` (`engines` in the root `package.json`; `.node-version` pins `22.23.1` for `fnm` /
`nvm`-style managers) and pnpm `11.20.0` (the root `packageManager` field - `corepack enable` or pnpm's own version
manager picks it up). `pnpm run capture:og` and `capture:demo` additionally need Google Chrome installed and `ffmpeg` on
`PATH`; nothing else does.

### 1. Clone the Repository

```bash
git clone https://github.com/blit386/blit386.git
cd blit386
```

### 2. Install Dependencies

```bash
pnpm install
```

That single install resolves every package in the workspace, including the `demos` -> `blit386` `workspace:*` link - no
manual `pnpm-workspace.yaml` or second clone needed.

## Directory Structure

The relevant parts of the repo look like this:

```text
blit386/                        # This repo
├── pnpm-workspace.yaml         # Links every package, including these two
├── node_modules/                # Shared dependencies
├── packages/
│   ├── blit386/                 # The engine
│   │   ├── src/
│   │   ├── dist/                 # Built output
│   │   └── package.json
│   └── demos/                   # The demos (npm name: blit386-demos)
│       ├── src/                  # One number-free kebab-case JS file per demo (e.g. basics.js)
│       │   └── shared/            # Shared UI kit (panels, buttons, tooltips, touch D-pad) + helpers + tests
│       ├── public/                # Static assets: sprites/, fonts/, audio/, social/ (OG cards),
│       │                          # shots/ (gallery captures + manifest.json), _headers, 404.html
│       ├── _partials/             # Shared HTML template + persistent-shell chrome (demo-shell*.js)
│       ├── _shots/                # The /shots capture gallery and the / demo sheet (poses.js, tests)
│       ├── plugins/               # virtual-demos + demo-order.js + demo-vintage-urls.js + registry + tests
│       ├── scripts/                # playwright-session, capture-demo-shots, capture-og-image, capture-demo-clip,
│       │                           # check-demo-comment-links, check-demo-registry, generate-audio-loops, tests
│       ├── styles/                 # layout.css, demo-source.css, twoslash-rich.css
│       ├── docs/                   # This guide, security headers
│       ├── wrangler.jsonc          # Cloudflare Pages project name + output dir
│       └── package.json
├── .node-version
└── package.json                 # engines.node, packageManager (pnpm)
```

## Running the Demos

The first `pnpm run dev`, `build`, `preview`, or `knip` in a fresh checkout or worktree builds the BLIT386 engine
automatically if `packages/blit386/dist` is missing, so that first run may take a little longer than usual. There is no
need to run `pnpm --filter blit386 run build` by hand first - the commands below already handle it.

### Standard Development

```bash
cd packages/demos
pnpm run dev
```

The server never opens a browser. Visit `http://localhost:5173/` for the demo sheet, a demo directly at
`http://localhost:5173/demos/<slug>.html`, or `http://localhost:5173/shots` for the capture gallery with its dev-only
capture controls. Vintage numbered paths such as `/demos/001-basics.html` 301 to the current slug.

`pnpm run test` runs the `node:test` suites (scripts, plugins, the shared UI kit, the shots page); `pnpm run preflight`
runs every gate the pre-push hook runs. Demo files themselves have no automated tests - open them and look.

### Development with Auto-Rebuild

To edit the BLIT386 library and see changes instantly:

```bash
cd packages/demos
pnpm run dev:watch
```

This runs two processes concurrently:

- Watches `packages/blit386/src` and rebuilds on changes (a full `blit386` dist rebuild still triggers a full page
  reload). The watch pass rebuilds only the JS bundle, without minification and with sourcemaps; declarations come from
  the one-shot `blit386` build that `dev:watch` runs first, so `dist/blit386.d.ts` does not track your edits until you
  run `pnpm run build` in `packages/blit386` again
- Runs the Vite dev server; a method-only edit to a demo's own `src/<slug>.js` hot-swaps in place (state kept), while an
  edit to `init()`/the constructor re-initializes instead, and a `configure()` hardware-setting change still forces a
  full reload - see [CLAUDE.md](../CLAUDE.md#hot-reload) for the full tier breakdown

## Building from Scratch

To rebuild the library from scratch:

```bash
cd packages/blit386
pnpm run build
```

Then the demos will use the newly built version.

## Troubleshooting

### Error: "Cannot find package 'blit386'"

Cause: dependencies were not installed from the workspace root.

Fix: run `pnpm install` from the repo root (`blit386/`), not from inside `packages/demos` alone - pnpm resolves
`workspace:*` dependencies only when installed at the workspace root.

### `vite` / `knip` fails with "Cannot find module '.../blit386/dist/vite.js'"

Cause: the BLIT386 engine has never been built in this checkout - common right after `git clone` or `git worktree add`.

Fix: `pnpm run dev`, `build`, `preview`, and `knip` in `packages/demos` detect this automatically and build the engine
first, so simply re-running the command that failed is usually enough. To force a fresh rebuild yourself (for example
after switching branches):

```bash
cd packages/blit386
pnpm run build
cd ../demos
pnpm run dev
```

## Alternative: Start your own game with the scaffolder

The setup above is only needed to hack on the demos in this repo against the local engine source. If you just want to
build your own game with the published engine, use the
[create-blit386](https://github.com/blit386/blit386/tree/main/packages/create-blit386) scaffolder instead - it writes a
ready-to-run project (starter game, Vite config, `index.html`, docs, and an optional AI-assistant config) that already
depends on `blit386` from npm:

```bash
npm create blit386@latest my-game
cd my-game
pnpm install
pnpm run dev
```

The generated project also ships the `blit` CLI (`blit run`, `blit doctor`, `blit upgrade`, `blit agents`). You do not
need a pnpm workspace or a local engine checkout for this path.
