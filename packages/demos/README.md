# Blit-Tech Demos

Interactive demos for the [Blit-Tech](https://github.com/vancura/blit-tech/) WebGPU retro game engine.

This repository showcases the capabilities of Blit-Tech through a growing collection of interactive demos, demonstrating
everything from basic rendering to advanced sprite effects.

## Prerequisites

- **Node.js** v20 or higher (LTS)
- **pnpm** v10.26.0 or higher
- A **WebGPU-compatible browser**:
  - Chrome/Edge 113+ (Windows, macOS, Linux, Android)
  - Firefox Nightly (with `dom.webgpu.enabled` in `about:config`)
  - Safari 18+ (macOS/iOS)

## Setup

This project depends on the [Blit-Tech](https://github.com/vancura/blit-tech) library using a pnpm workspace. Since
Blit-Tech is not yet published to npm, you need to set up a local workspace structure.

> **Detailed Setup Guide:** See [docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for complete
> step-by-step instructions and troubleshooting.

### Quick Setup

```bash
# 1. Create workspace directory
mkdir blit-tech-workspace && cd blit-tech-workspace

# 2. Clone both repositories
git clone https://github.com/vancura/blit-tech.git
git clone https://github.com/vancura/blit-tech-demos.git

# 3. Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "blit-tech"
  - "blit-tech-demos"
EOF

# 4. Install dependencies
pnpm install
```

Your directory structure:

```text
blit-tech-workspace/          # Your workspace root
├── pnpm-workspace.yaml       # Workspace config (you created this)
├── blit-tech/                # Cloned from GitHub
└── blit-tech-demos/          # Cloned from GitHub
```

> **Note:** Once Blit-Tech is published to npm, you'll be able to install it directly without this workspace setup.

## Running the Demos

Start the development server:

```bash
cd blit-tech-demos
pnpm dev
```

The browser will open automatically at `http://localhost:5173/demos/basics.html` showing the demo gallery.

### Development with Auto-Rebuild

For seamless development where changes to the Blit-Tech library automatically rebuild:

```bash
cd blit-tech-demos
pnpm dev:watch
```

This runs both the library watcher and the dev server concurrently. Any changes to Blit-Tech source files will trigger
an automatic rebuild.

## Development

### Build for Production

```bash
pnpm build
```

Builds all demos to the `dist/` directory.

### Preview Production Build

```bash
pnpm preview
```

### Code Quality

```bash
pnpm lint          # Run ESLint
pnpm format        # Format code with Biome + Prettier
pnpm typecheck     # TypeScript type checking
pnpm preflight     # Run all quality checks (format, lint, typecheck, spellcheck, knip)
```

## Browser Compatibility

| Browser     | Version | Status                        |
| ----------- | ------- | ----------------------------- |
| Chrome/Edge | 113+    | Full support                  |
| Safari      | 18+     | Full support                  |
| Firefox     | Nightly | Requires `dom.webgpu.enabled` |
| Opera       | Latest  | Full support (Chromium-based) |

## Deployment

The demos are automatically deployed to Cloudflare Pages when changes are pushed to the `main` branch. The deployment
process is handled by GitHub Actions:

1. **Build in GitHub Actions**: The blit-tech library is cloned, built, and then the demos are built against it
2. **Deploy Artifacts**: The built `dist/` directory is deployed to Cloudflare Pages using the `cloudflare/pages-action`
3. **Skip Cloudflare Build**: Cloudflare Pages is configured to skip its own build process via `wrangler.jsonc` and
   `.cfignore`

### URL Structure

- **Development**: URLs include the `demos/` path (e.g., `http://localhost:5173/demos/basics.html`)
- **Production**: URLs are at the root (e.g., `https://blit-tech-demos.vancura.dev/basics.html`)

A custom Vite plugin flattens the `dist/demos/` output to `dist/` during the build, providing cleaner production URLs
while keeping source files organized in the `demos/` folder.

### Deployment Configuration

- **vite.config.ts**: Contains `flattenDemosPlugin()` to restructure build output for production
- **wrangler.jsonc**: Specifies `pages_build_output_dir` to indicate pre-built content
- **.cfignore**: Prevents Cloudflare from attempting to install dependencies
- **GitHub Actions**: Handles all build steps with proper pnpm workspace setup

This approach works around Cloudflare Pages' lack of native pnpm workspace support while maintaining the ability to use
the local unpublished `blit-tech` dependency.

## License

ISC

## Links

- **Blit-Tech on GitHub:** [github.com/vancura/blit-tech](https://github.com/vancura/blit-tech)
