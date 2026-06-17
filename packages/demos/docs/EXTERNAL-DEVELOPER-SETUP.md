# Quick Start Guide for External Developers

This guide is for developers who want to run BLIT386 Demos locally with the latest BLIT386 source.

## Why This Setup Is Needed

BLIT386 Demos depends on BLIT386 via a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit386": "workspace:*"
  }
}
```

BLIT386 is published to npm, but this demos repository intentionally depends on `blit386` via `workspace:*` so the demos
can track the local sibling repo during development. That means you still need both repositories in one pnpm workspace.

## Browser and Renderer

The engine prefers **WebGPU** and falls back to a **Canvas 2D software renderer** when WebGPU is missing or fails to
start (optional `?backend=software` on a demo URL). A dismissible on-canvas banner indicates software mode.

**WebGPU** is required for post-process / fullscreen effect demos (CRT stacks, two-tier chains). In software mode those
demos still boot and run their core scene without the CRT stack; an on-screen note explains the limitation. Most other
demos run fully in software mode for core 2D.

**WebGPU** is supported in current versions of Chrome/Edge, recent Firefox and Safari as listed in the
[BLIT386 README](https://github.com/blit386/blit386/blob/main/README.md#prerequisites) and the demos
[README](../README.md#browser-and-renderer).

## One-Time Setup

### 1. Create Workspace Directory

```bash
mkdir blit386-workspace
cd blit386-workspace
```

### 2. Clone Both Repositories

```bash
git clone https://github.com/blit386/blit386.git
git clone https://github.com/blit386/blit386-demos.git
```

### 3. Create Workspace Configuration

Create a `pnpm-workspace.yaml` file in the workspace root:

```bash
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "blit386"
  - "blit386-demos"
EOF
```

### 4. Install Dependencies

```bash
pnpm install
```

## Directory Structure

After setup, your directory should look like this:

```text
blit386-workspace/          # Your workspace root
├── pnpm-workspace.yaml       # Links the two packages
├── package.json              # Optional (see below)
├── node_modules/             # Shared dependencies
├── blit386/                # The library
│   ├── src/
│   ├── dist/                 # Built output
│   └── package.json
└── blit386-demos/          # The demos
    ├── src/                  # One JS file per demo (single source of truth)
    ├── _partials/            # Shared HTML template
    ├── plugins/              # virtual-demos Vite plugin
    └── package.json
```

### Optional: Add package.json

You can optionally create a `package.json` in the workspace root:

Prerequisite: Node.js >= 22.18.0 is required for this workspace because the sibling `blit386` package requires it.

```json
{
  "name": "blit386-workspace",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.26.2"
}
```

This is not required but can help with pnpm version pinning.

## Running the Demos

### Standard Development

```bash
cd blit386-demos
pnpm run dev
```

Opens the browser at `http://localhost:5173/demos/001-basics.html` (or visit `/demos/` for the full index).

### Development with Auto-Rebuild

To edit the BLIT386 library and see changes instantly:

```bash
cd blit386-demos
pnpm run dev:watch
```

This runs two processes concurrently:

- Watches `blit386/src` and rebuilds on changes
- Runs Vite dev server with hot module reload

## Building from Scratch

To rebuild the library from scratch:

```bash
cd blit386
pnpm run build
```

Then the demos will use the newly built version.

## Troubleshooting

### Error: "Cannot find package 'blit386'"

**Cause**: Workspace structure not set up correctly

**Fix**: Ensure you have:

- Both repos cloned as siblings
- `pnpm-workspace.yaml` in the parent directory
- Ran `pnpm install` from the workspace root

### Error: "No matching version found for blit386@workspace:\*"

**Cause**: pnpm can't find the workspace

**Fix**: Check that:

- `pnpm-workspace.yaml` exists in the parent directory
- Both BLIT386 and BLIT386 Demos are listed in the config
- You're running commands from inside the workspace structure

### Demos won't start - "TypeError: Cannot read properties..."

**Cause**: BLIT386 library not built

**Fix**:

```bash
cd blit386
pnpm install
pnpm run build
cd ../blit386-demos
pnpm run dev
```

## Alternative: Use BLIT386 from npm

If you only want to build your own standalone app with the published package (instead of working on this demos repo),
you can install BLIT386 directly from npm:

```bash
pnpm create vite my-demo --template vanilla-ts
cd my-demo
pnpm add blit386
```
