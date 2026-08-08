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
track the local engine source during development. Both packages live in this same `blit386` monorepo –
`packages/blit386` and `packages/demos` – wired together by the root `pnpm-workspace.yaml`, so a single clone and
`pnpm install` gets you both, already linked.

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

### 1. Clone the Repository

```bash
git clone https://github.com/blit386/blit386.git
cd blit386
```

### 2. Install Dependencies

```bash
pnpm install
```

That single install resolves every package in the workspace, including the `demos` -> `blit386` `workspace:*` link – no
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
│       │   └── shared/            # Shared UI kit (panels, buttons, touch D-pad) + helpers
│       ├── public/                # Static assets: sprites/, fonts/, audio/, _headers
│       ├── _partials/             # Shared HTML template + persistent-shell chrome (demo-shell.js)
│       ├── plugins/               # virtual-demos + demo-order.js + demo-vintage-urls.js + registry
│       ├── scripts/                # Package scripts (Markdown link check, registry check, audio loops)
│       ├── docs/                   # This guide, CI setup, security headers
│       └── package.json
└── package.json
```

Prerequisite: Node.js >= 22.18.0 (`engines` in the root `package.json`).

## Running the Demos

### Standard Development

```bash
cd packages/demos
pnpm run dev
```

Opens the browser at `http://localhost:5173/demos/basics.html` (or visit `/demos/` for the full index). Vintage numbered
paths such as `/demos/001-basics.html` 301 to the current slug.

### Development with Auto-Rebuild

To edit the BLIT386 library and see changes instantly:

```bash
cd packages/demos
pnpm run dev:watch
```

This runs two processes concurrently:

- Watches `packages/blit386/src` and rebuilds on changes (a full `blit386` dist rebuild still triggers a full page
  reload)
- Runs the Vite dev server; a method-only edit to a demo's own `src/<slug>.js` hot-swaps in place (state kept), while an
  edit to `init()`/the constructor re-initializes instead, and a `configure()` hardware-setting change still forces a
  full reload – see [CLAUDE.md](../CLAUDE.md#hot-reload) for the full tier breakdown

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

Fix: run `pnpm install` from the repo root (`blit386/`), not from inside `packages/demos` alone – pnpm resolves
`workspace:*` dependencies only when installed at the workspace root.

### Demos won't start – "TypeError: Cannot read properties..."

Cause: BLIT386 library not built

Fix:

```bash
cd packages/blit386
pnpm install
pnpm run build
cd ../demos
pnpm run dev
```

## Alternative: Start your own game with the scaffolder

The setup above is only needed to hack on the demos in this repo against the local engine source. If you just want to
build your own game with the published engine, use the
[create-blit386](https://github.com/blit386/blit386/tree/main/packages/create-blit386) scaffolder instead – it writes a
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
