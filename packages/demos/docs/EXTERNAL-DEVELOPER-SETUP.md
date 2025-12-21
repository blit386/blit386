# Quick Start Guide for External Developers

This guide is for developers who want to try out Blit-Tech Demos before Blit-Tech is published to npm.

## Why This Setup Is Needed

Blit-Tech Demos depends on Blit-Tech via a pnpm workspace dependency:

```json
{
  "dependencies": {
    "blit-tech": "workspace:*"
  }
}
```

Since Blit-Tech is not yet on npm, you need to clone both repositories and set up a local workspace.

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
    ├── src/
    ├── demos/
    └── package.json
```

### Optional: Add package.json

You can optionally create a `package.json` in the workspace root:

```json
{
  "name": "blit-tech-workspace",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.24.0"
}
```

This is not required but can help with pnpm version pinning.

## Running the Demos

### Standard Development

```bash
cd blit-tech-demos
pnpm dev
```

Opens browser at `http://localhost:5173/demos/`

> **Note:** Development URLs include the `demos/` path, while production URLs are at the root (e.g.,
> `https://blit-tech-demos.ambilab.com/basics.html`). A build plugin handles this transformation.

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

## After npm Publication

Once Blit-Tech is published to npm, you can:

1. Clone just `blit-tech-demos`
2. Run `pnpm install`
3. Start developing

The workspace setup will no longer be needed.

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

## Alternative: Wait for npm Publication

If this setup seems complex, you can wait for Blit-Tech to be published to npm. Once published, installation will be a
simple:

```bash
npm create vite@latest my-game --template vanilla-ts
cd my-game
npm install blit-tech
```

Check the [Blit-Tech repository](https://github.com/vancura/blit-tech) for publication status.
