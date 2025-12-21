# Blit-Tech Demos

Interactive demos for the [Blit-Tech](../blit-tech/) WebGPU retro game engine.

This repository showcases the capabilities of Blit-Tech through 8 interactive demos, demonstrating everything from basic
rendering to advanced sprite effects.

## Prerequisites

- **Node.js** v20 or higher (LTS)
- **pnpm** v10.24.0 or higher
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

The browser will open automatically at `http://localhost:5173/demos/` showing the demo gallery.

### Development with Auto-Rebuild

For seamless development where changes to the Blit-Tech library automatically rebuild:

```bash
cd blit-tech-demos
pnpm dev:watch
```

This runs both the library watcher and the dev server concurrently. Any changes to Blit-Tech source files will trigger
an automatic rebuild.

## Available Demos

### 1. Basics (`basics.html`)

**Minimal game setup and game loop**

Demonstrates the fundamental structure of a Blit-Tech game:

- Hardware configuration (`queryHardware`)
- Game initialization
- Update/render loop separation
- Basic primitive drawing
- Automatic bouncing square movement

**Key Concepts:** Game lifecycle, fixed timestep, primitive drawing

---

### 2. Primitives (`primitives.html`)

**Drawing pixels, lines, and rectangles**

Showcases all available primitive drawing functions:

- Individual pixel drawing
- Line rendering (Bresenham algorithm)
- Rectangle outlines
- Filled rectangles
- Screen clearing

**Key Concepts:** Coordinate system, color manipulation, primitive API

---

### 3. Camera (`camera.html`)

**Scrolling world with camera offsets**

Advanced camera system demonstration:

- World scrolling with camera offset
- Multiple viewport layers
- Mini-map implementation
- UI overlay (unaffected by camera)
- Performance-optimized rendering

**Key Concepts:** Camera transforms, viewport management, layered rendering

---

### 4. Patterns (`patterns.html`)

**Mathematical animations and effects**

Generative art and mathematical patterns:

- Spiral patterns
- Wave animations
- Lissajous curves
- Parametric equations
- Performance-optimized rendering

**Key Concepts:** Procedural generation, mathematics in games, optimization

---

### 5. Sprites (`sprites.html`)

**Sprite sheets and texture rendering**

Core sprite rendering features:

- Loading sprite sheets
- Drawing sprites with source rectangles
- Color tinting
- Transparency
- Texture batching

**Key Concepts:** Asset loading, sprite sheets, texture rendering

---

### 6. Animation (`animation.html`)

**Tick-based timing and state machines**

Game timing and animation systems:

- Tick counter usage
- Frame-based animation
- State machines
- Cooldown timers
- Animation cycling

**Key Concepts:** Game timing, state management, animation logic

---

### 7. Sprite Effects (`sprite-effects.html`)

**Color tinting and visual effects**

Practical sprite effect techniques:

- Damage flash effect
- Drop shadows
- Team color tinting
- Ambient lighting
- Effect combinations

**Key Concepts:** Visual feedback, color manipulation, game feel

---

### 8. Fonts (`fonts.html`)

**Bitmap font rendering**

Text rendering system:

- Bitmap font loading
- Text rendering with colors
- Variable-width fonts
- Custom font support
- Font attribution

**Key Concepts:** Text rendering, bitmap fonts, UI elements

---

## Learning Path

**Recommended order for learning:**

1. **basics.ts** - Start here to understand core concepts
2. **primitives.ts** - Learn the drawing API
3. **fonts.ts** - Add text rendering
4. **sprites.ts** - Work with sprite sheets
5. **sprite-effects.ts** - Apply visual effects
6. **animation.ts** - Implement timing and state
7. **patterns.ts** - Explore procedural techniques
8. **camera.ts** - Master advanced camera systems

## Project Structure

```text
blit-tech-demos/
├── demos/                    # All HTML files
│   ├── index.html           # Demo gallery
│   ├── landing.html         # Landing/marketing page
│   ├── basics.html
│   ├── primitives.html
│   ├── camera.html
│   ├── patterns.html
│   ├── sprites.html
│   ├── animation.html
│   ├── sprite-effects.html
│   ├── fonts.html
│   └── styles.css           # Demo styling
├── src/                      # Demo TypeScript files
│   ├── basics.ts
│   ├── primitives.ts
│   ├── camera.ts
│   ├── patterns.ts
│   ├── sprites.ts
│   ├── animation.ts
│   ├── sprite-effects.ts
│   └── fonts.ts
├── public/                   # Static assets
│   └── fonts/                # Bitmap fonts
├── _partials/                # Handlebars templates
│   ├── layout-top.hbs
│   ├── layout-bottom.hbs
│   ├── font-attribution.hbs
│   └── plausible-analytics.hbs
├── _config/
│   └── contexts.ts           # Page context data
├── .github/workflows/        # CI/CD workflows
│   └── deploy.yml           # Cloudflare Pages deployment
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

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
```

## Using Blit-Tech in Your Project

### Current Status (Pre-npm)

These demos currently use the local Blit-Tech library via pnpm workspace (see Setup section above). This workspace setup
is required because Blit-Tech is not yet published to npm.

### After npm Publication

When Blit-Tech is published to npm, you'll be able to install it directly:

```bash
npm install blit-tech
# or
pnpm add blit-tech
```

Then import in your project:

```typescript
import { BT, bootstrap, Color32, Vector2i, type IBlitTechGame } from 'blit-tech';
```

No workspace setup will be needed once the package is on npm.

## Browser Compatibility

| Browser     | Version | Status                           |
| ----------- | ------- | -------------------------------- |
| Chrome/Edge | 113+    | ✅ Full support                  |
| Safari      | 18+     | ✅ Full support                  |
| Firefox     | Nightly | ⚠️ Requires `dom.webgpu.enabled` |
| Opera       | Latest  | ✅ Full support (Chromium-based) |

## License

ISC

## Links

- **Blit-Tech on GitHub:** [github.com/vancura/blit-tech](https://github.com/vancura/blit-tech)
