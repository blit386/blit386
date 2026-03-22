# Project Rules

Interactive demos and examples for the Blit-Tech WebGPU retro game engine.

## Tech Stack

- **Node**: >= 20.0.0
- **Build Tool**: Vite 7 with Handlebars templates
- **Language**: TypeScript (strict mode)
- **Styling**: Plain CSS with CSS custom properties
- **Engine**: Blit-Tech (WebGPU retro game engine, workspace dependency)
- **Package Manager**: pnpm
- **Deployment**: Cloudflare Pages via GitHub Actions
- **Linting**: Biome + ESLint + Prettier

## Critical Rules

- **No emoji** -- no emoji in code, commits, docs, or UI strings (no exceptions)
- **Integer coordinates** -- all rendering uses `Vector2i` and `Rect2i` for pixel-perfect graphics
- **TypeScript strict mode** -- all strict checks enabled

## Project Structure

```text
blit-tech-demos/
  demos/                  # HTML pages for each demo
    basics.html           # Individual demo pages...
    styles.css            # Shared demo styling
  src/                    # TypeScript source for demos
    basics.ts             # One file per demo
    primitives.ts
    camera.ts
    patterns.ts
    sprites.ts
    animation.ts
    sprite-effects.ts
    fonts.ts
  public/                 # Static assets
    fonts/                # Bitmap fonts (.btfont + .png)
    _headers              # Cloudflare headers
  _partials/              # Handlebars templates
    layout-top.hbs        # Page header (HTML boilerplate + centered canvas)
    layout-bottom.hbs     # Page footer (script tag + closing tags)
  _config/
    contexts.ts           # Page context data for templates
  docs/                   # Project documentation
```

## Development Commands

```bash
pnpm dev              # Start dev server (http://localhost:5173/demos/)
pnpm dev:watch        # Dev server + watch Blit-Tech library for changes
pnpm build            # Build for production (output: dist/)
pnpm preview          # Preview production build
pnpm lint             # Lint (ESLint)
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Format (Biome + Prettier)
pnpm format:check     # Check formatting
pnpm typecheck        # TypeScript type checking
pnpm spellcheck       # Check spelling
pnpm knip             # Find unused exports
pnpm preflight        # ALL quality checks before committing
pnpm clean            # Clean build artifacts
pnpm security:audit   # Run security audit on dependencies
```

## Workspace Integration

This project depends on Blit-Tech via pnpm workspace:

```json
{ "dependencies": { "blit-tech": "workspace:*" } }
```

Local workspace structure:

```text
parent-dir/
  pnpm-workspace.yaml
  blit-tech/
  blit-tech-demos/
```

CI recreates this structure by cloning both repos. See `docs/CI-WORKSPACE-SETUP.md` for details.

## Demo File Conventions

### TypeScript Demo Files (`src/*.ts`)

Each demo follows this pattern:

```typescript
/**
 * Demo Name - Brief description.
 */

import { bootstrap, BT, Color32, type HardwareSettings, type IBlitTechGame, Vector2i } from 'blit-tech';

// #region Game Class

class DemoGame implements IBlitTechGame {
  queryHardware(): HardwareSettings {
    /* ... */
  }
  async initialize(): Promise<boolean> {
    /* ... */
  }
  update(): void {
    /* ... */
  }
  render(): void {
    /* ... */
  }
}

// #endregion

// #region App Lifecycle

bootstrap(DemoGame);

// #endregion
```

### HTML Demo Pages (`demos/*.html`)

Use Handlebars partials (canvas and script are included by the partials):

```html
{{> layout-top}} {{> layout-bottom}}
```

### Adding a New Demo

1. Create `src/new-demo.ts` following the demo pattern
2. Create `demos/new-demo.html` using the HTML template
3. Add entry to `vite.config.ts` rollupOptions.input
4. Add context to `_config/contexts.ts`

## Code Quality (Relaxed for Demos)

Demos have relaxed linting compared to the library:

- JSDoc not required
- Non-null assertions allowed (`element!`)
- Console logging allowed
- Mutation allowed for game state -- demo classes may mutate instance properties in `update()` and `render()` for
  performance. The global immutability preference does not apply to per-frame game state.

Focus on clarity and readability over strict documentation.

## Blit-Tech Engine API

All engine functionality via static `BT` namespace:

```typescript
BT.clear(Color32.black());
BT.drawPixel(pos, color);
BT.drawLine(p0, p1, color);
BT.drawRect(rect, color);
BT.drawRectFill(rect, color);
BT.drawSprite(sheet, srcRect, destPos, tint);
BT.printFont(font, pos, text, color);
BT.cameraSet(offset);
BT.cameraReset();
```

Core types: `Vector2i`, `Rect2i`, `Color32`, `SpriteSheet`, `BitmapFont`.

## File Organization

Use `// #region` / `// #endregion` for collapsible sections. Standard order:

1. Imports (no region needed)
2. Configuration
3. Type Definitions
4. Module State
5. Helper Functions
6. Main Logic
7. Exports

## Formatting Rules

Enforced by Biome (TS/JS/JSON/CSS) and Prettier (Markdown/YAML):

- Four spaces indent (two for JSON/YAML/Markdown)
- 120 char line width, single quotes, always semicolons, always trailing commas

## Git Commits

Follow Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

AI-assisted commits: include `Co-Authored-By: Claude <noreply@anthropic.com>`

## Git Hooks

Managed by Husky (auto-installed via `prepare` script).

- **Pre-commit** (lint-staged): auto-formats and lints staged files
- **Pre-push**: runs typecheck + lint

## Deployment

Demos deploy to Cloudflare Pages via GitHub Actions on push to main. A Vite plugin flattens `demos/` URLs so production
paths are clean (e.g., `/basics.html`).
