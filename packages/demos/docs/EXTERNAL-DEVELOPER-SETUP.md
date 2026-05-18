# Quick Start Guide for External Developers

This guide is for developers who want to run Blit-Tech Demos locally with the latest Blit-Tech source.

## Why This Setup Is Needed

Blit-Tech Demos depends on Blit-Tech via a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit-tech": "workspace:*"
  }
}
```

Blit-Tech is published to npm, but this demos repository intentionally depends on `blit-tech` via `workspace:*` so the
demos can track the local sibling repo during development. That means you still need both repositories in one pnpm
workspace.

## Browser and Renderer

The engine prefers **WebGPU** and falls back to a **Canvas 2D software renderer** when WebGPU is missing or fails to
start (optional `?renderer=software` on a demo URL). A dismissible on-canvas banner indicates software mode.

**WebGPU** is required for post-process / fullscreen effect demos (CRT stacks, two-tier chains). Most other demos run in
software mode for core 2D.

**WebGPU** is supported in current versions of Chrome/Edge, recent Firefox and Safari as listed in the
[Blit-Tech README](https://github.com/vancura/blit-tech/blob/main/README.md#prerequisites) and the demos
[README](../README.md#browser-and-renderer).

## One-Time Setup

### 1. Create Workspace Directory

```bash
mkdir blit-tech-workspace
cd blit-tech-workspace
```

### 2. Clone Both Repositories

```bash
git clone https://github.com/vancura/blit-tech.git
git clone https://github.com/vancura/blit-tech-demos.git
```

### 3. Create Workspace Configuration

Create a `pnpm-workspace.yaml` file in the workspace root:

```bash
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "blit-tech"
  - "blit-tech-demos"
EOF
```

### 4. Install Dependencies

```bash
pnpm install
```

## Directory Structure

After setup, your directory should look like this:

```text
blit-tech-workspace/          # Your workspace root
├── pnpm-workspace.yaml       # Links the two packages
├── package.json              # Optional (see below)
├── node_modules/             # Shared dependencies
├── blit-tech/                # The library
│   ├── src/
│   ├── dist/                 # Built output
│   └── package.json
└── blit-tech-demos/          # The demos
    ├── src/                  # One JS file per demo (single source of truth)
    ├── _partials/            # Shared HTML template
    ├── plugins/              # virtual-demos Vite plugin
    └── package.json
```

### Optional: Add package.json

You can optionally create a `package.json` in the workspace root:

Prerequisite: Node.js >= 22.18.0 is required for this workspace because the sibling `blit-tech` package requires it.

```json
{
  "name": "blit-tech-workspace",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.26.2"
}
```

This is not required but can help with pnpm version pinning.

## Running the Demos

### Standard Development

```bash
cd blit-tech-demos
pnpm dev
```

Opens the browser at `http://localhost:5173/demos/001-basics.html` (or visit `/demos/` for the full index).

### Development with Auto-Rebuild

If you want to edit the Blit-Tech library and see changes instantly:

```bash
cd blit-tech-demos
pnpm dev:watch
```

This runs two processes concurrently:

- Watches `blit-tech/src` and rebuilds on changes
- Runs Vite dev server with hot module reload

## Building from Scratch

If you want to rebuild the library:

```bash
cd blit-tech
pnpm build
```

Then the demos will use the newly built version.

## Troubleshooting

### Error: "Cannot find package 'blit-tech'"

**Cause**: Workspace structure not set up correctly

**Fix**: Ensure you have:

- Both repos cloned as siblings
- `pnpm-workspace.yaml` in the parent directory
- Ran `pnpm install` from the workspace root

### Error: "No matching version found for blit-tech@workspace:\*"

**Cause**: pnpm can't find the workspace

**Fix**: Check that:

- `pnpm-workspace.yaml` exists in the parent directory
- Both Blit-Tech and Blit-Tech Demos are listed in the config
- You're running commands from inside the workspace structure

### Demos won't start - "TypeError: Cannot read properties..."

**Cause**: Blit-Tech library not built

**Fix**:

```bash
cd blit-tech
pnpm install
pnpm build
cd ../blit-tech-demos
pnpm dev
```

## Alternative: Use Blit-Tech from npm

If you only want to build your own standalone app with the published package (instead of working on this demos repo),
you can install Blit-Tech directly from npm:

```bash
pnpm create vite my-demo --template vanilla-ts
cd my-demo
pnpm add blit-tech
```
