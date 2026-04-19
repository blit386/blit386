# Project Rules

Interactive demos and examples for the Blit-Tech WebGPU retro engine.

## Tech Stack

- **Node**: >= 20.0.0
- **Build Tool**: Vite 7 with a custom virtual-demos plugin (no templating library)
- **Language**: JavaScript (ES2022)
- **Styling**: Plain CSS with CSS custom properties
- **Engine**: Blit-Tech (WebGPU retro engine, workspace dependency)
- **Package Manager**: pnpm
- **Deployment**: Cloudflare Pages via GitHub Actions
- **Linting**: Biome + ESLint + Prettier

## Critical Rules

- **No emoji** -- no emoji in code, commits, docs, or UI strings (no exceptions)
- **Integer coordinates** -- all rendering uses `Vector2i` and `Rect2i` for pixel-perfect graphics
- **Plain JavaScript** -- demos use ES2022 JS for simplicity (no TypeScript)
- **Beginner-friendly comments** -- see Documentation Style section below

## Project Structure

```text
blit-tech-demos/
  demos/                       # Shared demo styling (HTML pages are virtual)
    styles.css
  src/                         # JavaScript source - one file per demo (single source of truth)
    001-basics.js
    002-primitives.js
    ...                        # 003 through 022
  public/                      # Static assets
    fonts/                     # Bitmap fonts (.btfont + .png)
    _headers                   # Cloudflare headers
  _partials/                   # Shared HTML template (plain HTML with {{title}} and {{scriptFile}} placeholders)
    layout.html
    plausible-analytics.html   # Inlined at the <!-- analytics --> marker in layout.html
  plugins/                     # Vite plugin that renders virtual demo HTML at build and dev time
    virtual-demos.js
    demo-registry.js
  docs/                        # Project documentation
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

### JavaScript Demo Files (`src/NNN-name.js`)

Each demo is a single JS file under `src/`. The matching HTML page is served virtually at `/demos/NNN-name.html` by the
`virtual-demos` Vite plugin; no HTML file exists on disk. Follow this pattern:

```js
/**
 * 003 Colors - Brief description.
 */

import { bootstrap, BT, Color32, Vector2i } from 'blit-tech';

// #region Demo Class

class Demo {
  queryHardware() {
    /* ... */
  }
  async initialize() {
    /* ... */
  }
  update() {
    /* ... */
  }
  render() {
    /* ... */
  }
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
```

### Adding a New Demo

Demos use a **three-digit prefix** plus kebab-case (`NNN-topic`), e.g. `023-particles`.

The `virtual-demos` plugin discovers demos automatically by scanning `src/*.js` for this pattern. Adding a demo is a
single step:

1. Create `src/NNN-your-topic.js` with the next free number. The page title defaults to
   `Blit-Tech Demo NNN - Your Topic` (topic title-cased from the slug). To override, add a `// @pageTitle Custom Title`
   comment in the first ~20 lines of the file (see `src/021-error-preview.js` for an example).

No `vite.config.js` edit. No context file to update. No HTML file to create.

## Code Quality (Relaxed for Demos)

Demos have relaxed linting compared to the library:

- JSDoc not required (but class-level JSDoc with `@implements {IBlitTechDemo}` is encouraged)
- Console logging allowed
- Mutation allowed for demo state -- demo classes may mutate instance properties in `update()` and `render()` for
  performance. The global immutability preference does not apply to per-frame demo state.

Focus on clarity and readability over strict documentation.

## Documentation Style

Demo source files are written for readers with little or no coding experience. Comments must explain **what** the code
does and **why**, not just restate it.

### Rules

- Comment nearly every line or logical block in plain English.
- Explain programming concepts when they appear (e.g., what `Math.sin()` returns, what `%` does).
- Use analogies where they help (e.g., "Like looking through a window" for camera offset).
- Never assume the reader knows what a function does just from its name.
- Use short sentences. Avoid jargon unless you explain it immediately after.
- Reference earlier demos when a concept was already explained. Use the pattern: "We learned about X in the Basics demo:
  https://vancura.dev/articles/blit-tech-basics"

### Example (do this)

```js
// Move the square by adding its speed to its position.
// Think of it like adding steps to where you are standing.
this.pos = this.pos.add(this.speed);

// If the square goes past the right edge of the screen...
// BT.displaySize().x is how wide the screen is in pixels.
if (this.pos.x >= BT.displaySize().x - this.size.x) {
  // Flip the horizontal direction so it bounces back.
  this.speed.x = -this.speed.x;
}
```

### Example (do not do this)

```js
// Update position.
this.pos = this.pos.add(this.speed);

if (this.pos.x >= BT.displaySize().x - this.size.x) {
  this.speed.x = -this.speed.x;
}
```

When reviewing demo files, check that comments would make sense to someone who has never written code before. If a block
has no comment, or the comment only restates the code without explaining it, that is a quality issue.

## Blit-Tech Engine API

All engine functionality via static `BT` namespace:

```js
BT.clear(Color32.black());
BT.clearRect(color, rect);
BT.drawPixel(pos, color);
BT.drawLine(p0, p1, color);
BT.drawRect(rect, color);
BT.drawRectFill(rect, color);
BT.drawSprite(sheet, srcRect, destPos, tint);
BT.print(pos, color, text); // built-in placeholder text (no font asset)
BT.printFont(font, pos, text, color);
BT.cameraSet(offset);
BT.cameraGet();
BT.cameraReset();
BT.displaySize();
BT.ticks();
BT.ticksReset();
BT.fps();
await BT.captureFrame(); // returns a Blob
await BT.downloadFrame(filename); // optional filename; default PNG name if omitted
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

Enforced by Biome (JS/JSON/CSS) and Prettier (Markdown/YAML):

- Four spaces indent (two for JSON/YAML/Markdown)
- 120 char line width, single quotes, always semicolons, always trailing commas

## Git Commits

Follow Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

AI-assisted commits: include `Co-Authored-By: Claude <noreply@anthropic.com>`

## Git Hooks

Managed by Husky (auto-installed via `prepare` script).

- **Pre-commit** (lint-staged): auto-formats and lints staged files
- **Pre-push**: runs lint

## Deployment

Demos deploy to Cloudflare Pages via GitHub Actions on push to main. A Vite plugin flattens `demos/` URLs so production
paths are clean (e.g., `/001-basics.html`).
