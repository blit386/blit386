# Project Rules

Interactive demos and examples for BLIT386, a palette-first WebGPU retro engine for TypeScript.

## Tech Stack

- Node: >= 22.18.0 (required by cspell 10 and workspace sibling blit386)
- Build Tool: Vite 8 with a custom virtual-demos plugin (no templating library)
- Language: JavaScript (ES2022)
- Styling: Plain CSS with CSS custom properties
- Engine: BLIT386 (pixel engine: WebGPU default, optional software renderer; workspace dependency)
- Package Manager: pnpm
- Deployment: Cloudflare Pages via GitHub Actions
- Linting: Biome + ESLint + Prettier

## Critical Rules

- No emoji – no emoji in code, commits, docs, or UI strings (no exceptions)
- Integer coordinates – all rendering uses `Vector2i` and `Rect2i` for pixel-perfect graphics
- Plain JavaScript – demos use ES2022 JS for simplicity (no TypeScript)
- Beginner-friendly comments – see Documentation Style section below

## Project Structure

```text
blit386-demos/
  src/                         # JavaScript source – one file per demo (single source of truth)
    001-basics.js
    002-primitives.js
    ...                        # numbered demos under src/*.js (plugin discovers all)
    shared/                    # Cross-demo helpers (post-process backend checks)
      post-process-backend.js
  public/                      # Static assets copied to dist/ verbatim
    fonts/                     # Bitmap fonts (.btfont + .png)
    sprites/                   # Sprite sheets used by demos
    _headers                   # Cloudflare Pages headers
    _redirects                 # Cloudflare Pages redirects
  _partials/                   # Shared HTML template (plain HTML with {{title}} and {{scriptFile}} placeholders)
    layout.html
  plugins/                     # Vite plugin that renders virtual demo HTML at build and dev time
    virtual-demos.js
    demo-registry.js
  docs/                        # Project documentation
```

The `/demos/NNN-name.html` URLs are served virtually by the `virtual-demos` plugin. There is no `demos/` directory on
disk.

## Development Commands

```bash
pnpm run dev              # Start dev server (http://localhost:5173/demos/)
pnpm run dev:watch        # Dev server + watch BLIT386 library for changes
pnpm run build            # Build for production (output: dist/)
pnpm run preview          # Preview production build
pnpm run lint             # Lint (ESLint)
pnpm run lint:fix         # Auto-fix lint issues
pnpm run format           # Format (Biome + Prettier)
pnpm run format:check     # Check formatting
pnpm run spellcheck       # Check spelling
pnpm run knip             # Find unused exports
pnpm run docs:links       # Check Markdown links (README, docs/, skills)
pnpm run preflight        # ALL quality checks before committing
pnpm run clean            # Clean build artifacts
pnpm run security:audit   # Run security audit on dependencies
```

RTK: Use `pnpm run …` for scripts. Cursor `.cursor/hooks.json` runs `rtk hook cursor` on Shell; Claude Code uses
`rtk hook claude` on Bash. Prefer shell + RTK over native Read/Grep for exploration. See `~/.claude/RTK.md`.

## Workspace Integration

This project depends on BLIT386 via pnpm workspace:

```json
{ "dependencies": { "blit386": "workspace:*" } }
```

Local workspace structure:

```text
parent-dir/
  pnpm-workspace.yaml
  blit386/
  blit386-demos/
```

CI recreates this structure by cloning both repos. See `docs/CI-WORKSPACE-SETUP.md` for details.

## Demo File Conventions

### JavaScript Demo Files (`src/NNN-name.js`)

Each demo is a single JS file under `src/`. Filenames are `NNN-topic.js` with three digits. The matching HTML page is
served virtually at `/demos/<slug>.html` by the `virtual-demos` Vite plugin; no HTML file exists on disk. Follow this
pattern:

```js
/**
 * 003 Colors – Brief description.
 */

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

class Demo {
  // Optional: omit configure() to use engine defaultConfig (320x240 logical, 640x480 canvas, 60 FPS).
  // In configure(), you may set `backend: 'software'` to force Canvas 2D; default is WebGPU with automatic fallback.
  configure() {
    /* ... */
  }
  async init() {
    /* ... */
  }
  update() {
    /* ... */
  }
  render() {
    /* ... */
  }
}

bootstrap(Demo);
```

### Adding a New Demo

Demos use kebab-case slugs: `NNN-topic` with three digits, e.g. `023-particles`.

The `virtual-demos` plugin discovers demos automatically by scanning `src/*.js` for this pattern. Adding a demo is a
single step:

1. Create `src/NNN-your-topic.js` (or `00a-…`) with the next free number. Retired numbers stay unused (e.g. `021`). The
   page title defaults to `BLIT386 Demo NNN – Your Topic` (topic title-cased from the slug). To override, add a
   `// @pageTitle Custom Title` comment in the first ~20 lines of the file (see `src/023-crt-pipboy.js` or
   `src/024-crt-toggle.js` for examples).

No `vite.config.js` edit. No context file to update. No HTML file to create.

## Code Quality (Relaxed for Demos)

Demos have relaxed linting compared to the library:

- JSDoc not required (but class-level JSDoc with `@implements {IBTDemo}` is encouraged)
- Console logging allowed
- Mutation allowed for demo state – demo classes may mutate instance properties in `update()` and `render()` for
  performance. The global immutability preference does not apply to per-frame demo state.

Focus on clarity and readability over strict documentation.

## Documentation Style

Demo source files are written for readers with little or no coding experience. Comments must explain what the code does
and why, not just restate it.

### Rules

- Comment nearly every line or logical block in plain English.
- Explain programming concepts when they appear (e.g., what `Math.sin()` returns, what `%` does).
- Use analogies where they help (e.g., "Like looking through a window" for camera offset).
- Never assume the reader knows what a function does just from its name.
- Use short sentences. Avoid jargon unless you explain it immediately after.
- Reference earlier demos when a concept was already explained. Use the pattern: "We learned about X in the Basics demo:
  https://demos.blit386.dev/001-basics"

### Example (do this)

```js
// Move the square by adding its speed to its position.
// Think of it like adding steps to where you are standing.
this.pos = this.pos.add(this.speed);

// If the square goes past the right edge of the screen...
// BT.displaySize.x is how wide the screen is in pixels.
if (this.pos.x >= BT.displaySize.x - this.size.x) {
  // Flip the horizontal direction so it bounces back.
  this.speed.x = -this.speed.x;
}
```

### Example (do not do this)

```js
// Update position.
this.pos = this.pos.add(this.speed);

if (this.pos.x >= BT.displaySize.x - this.size.x) {
  this.speed.x = -this.speed.x;
}
```

When reviewing demo files, check that comments would make sense to someone who has never written code before. If a block
has no comment, or the comment only restates the code without explaining it, that is a quality issue.

## BLIT386 Engine API

All engine functionality via static `BT` namespace:

```js
const BG = 1;
const FG = 2;
BT.clear(BG);
BT.clearRect(rect, FG);
BT.drawPixel(pos, FG); // or BT.drawPixel(x, y, FG)
BT.drawLine(p0, p1, FG);
BT.drawRect(rect, FG);
BT.drawRectFill(rect, FG);
BT.drawSprite(sheet, srcRect, destPos, paletteOffset); // default paletteOffset is 0
BT.systemPrint(pos, paletteIndex, text); // built-in 6x14 system font (palette index, not Color32)
BT.systemPrintMeasure(text); // Vector2i size in pixels
BT.printFont(font, pos, text, paletteOffset?); // bitmap font; paletteOffset shifts glyph indices (default 0)
BT.cameraSet(offset);
BT.camera;
BT.cameraReset();
BT.cameraClamp(camera, worldSize, viewSize?); // clamp scroll position to world bounds
BT.displaySize;
BT.ticks;
BT.ticksReset();
BT.targetFPS;
BT.deltaSeconds;
BT.timeSeconds;
BT.activeBackend; // 'webgpu' | 'software' | null – after successful init
BT.isPointerActive(0); // pointer slot active (mouse hover or touch contact)
BT.isDown(BT.BTN_A, 0); // button held (ANY-match for masks)
BT.isPressed(BT.BTN_A, 0); // edge: up -> down this frame
BT.isKeyDown('KeyW'); // raw keyboard hold
BT.isKeyPressed('ArrowUp', 10); // edge + optional tick repeat
await BT.captureFrame(); // returns a Blob
await BT.downloadFrame(filename); // optional filename; default PNG name if omitted
```

Read keyboard edges (`BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, and the keyboard-mapped half of
`BT.isPressed` / `BT.isReleased` for players 0/1) from `update()`, never `render()`. They clear once per fixed-update
tick, which always runs before that frame's `render()` – reading them from `render()` intermittently drops presses under
rapid input (the tick already consumed and cleared the edge before render saw it). `BT.isKeyDown` / `BT.isDown` (held
state, not edges) have no such restriction and are safe from either lifecycle method.

Configure example (overlay flags use grammatical `is*`):

```javascript
configure() {
    return {
        isOverlayEnabled: true,
        isOverlayVisibleAtStart: false,
        isOverlayPaletteEnabled: true,
    };
}
```

## Boolean naming

Demos use the library's public names only. Configure flags (Tier B): grammatical `is*` in `configure()` –
`isOverlayEnabled`, `isDetectingDroppedFrames`, `canvasID`. Runtime input (Tier A): `BT.isDown`, `BT.isPressed`,
`BT.isKeyDown`, `BT.isPointerActive`. Full policy: blit386
[docs/developer-experience-guide.md](https://github.com/blit386/blit386/blob/main/docs/developer-experience-guide.md).

Core types: `Vector2i`, `Rect2i`, `Color32`, `SpriteSheet`, `BitmapFont`.

Static helpers on those types worth knowing:

- `await SpriteSheet.load(url)` – loads a PNG as a GPU texture.
- `sheet.width` / `sheet.height` – sprite-sheet dimensions in pixels.
- `sheet.fullRect()` – returns `Rect2i(0, 0, sheet.width, sheet.height)` for whole-sheet draw calls.
- `await SpriteSheet.loadColorsIntoPalette(url, palette, startSlot, options?)` – scans a PNG and registers every unique
  opaque color into `palette` starting at `startSlot`. Returns the registered `Color32[]` in palette-write order (sorted
  darkest-first by luminance by default; pass `{ sort: 'none' }` to keep raster scan order). Use this whenever a demo
  needs a sprite's colors in the palette so subsequent `sheet.indexize(palette)` resolves.
- `Color32#luminance` – perceived (Rec.601) brightness in the 0..255 range. Use this instead of writing inline
  `0.299*r + 0.587*g + 0.114*b` formulas in demos.
- `Color32#multiply(other)` – component-wise color multiply, returns a new Color32. Use this for ambient tints and
  team-color modulation instead of writing your own helper.
- `Color32.fromHex('#ff8800')` and `Color32.resolveNamedColor('cornflowerblue')` – use these when a demo needs to parse
  user/authored string colors. You can extend names with `registerColor`, `updateColor`, and `unregisterColor`.
- `palette.applyHUD(startSlot?)` – fills six contiguous slots starting at `startSlot` (default 1) with the canonical HUD
  colors (white, background, label gray, header gold, dim gray, code blue) and registers named aliases (`hud_white`,
  `hud_bg`, `hud_label`, `hud_header`, `hud_dim`, `hud_code`). Eliminates the repetitive `palette.set()` boilerplate for
  UI text colors. Call in `init()` before `BT.paletteSet()`.

Full input APIs (`BT.isKeyDown`, `BT.isKeyPressed`, `BT.isKeyReleased`, `BT.isDown`, `BT.isPressed`, `BT.isReleased`,
gamepad helpers, remapping) are documented in the engine [input guide](https://blit386.dev/docs/guides/input).
Post-process presets and effect tiers are in the
[post-process effects guide](https://blit386.dev/docs/guides/post-process-effects).

### Shared demo helpers

CRT and post-process demos import `isAvailable()` and `SOFTWARE_FALLBACK_NOTE` from
`src/shared/post-process-backend.js`. After `init()`, call `this.effectsAvailable = isAvailable()` (checks
`BT.activeBackend === 'webgpu'`, not `BT.requestedBackend`) before `BT.effectAdd(...)`. When effects are skipped, show
`SOFTWARE_FALLBACK_NOTE` on the overlay or in demo HUD text.

The engine draws a default stats overlay (FPS, target FPS, backend, resolution, demo title) after each `render()` call.
The overlay body starts hidden; a bitmap toggle hint sits in the bottom-left corner by default. Toggle the body with
Backquote or a primary press in the bottom-left 48x48 px corner. Use `isOverlayVisibleAtStart: true` to show the body on
the first frame, `isOverlayToggleHintVisible: false` to hide the hint icon on immersive demos (the body still toggles
with Backquote; see `013-image-output`, `014-game-scene`, `023-crt-pipboy`, `029-snake-game`),
`isOverlayToggleEnabled: false` to lock body visibility, or `isOverlayEnabled: false` to disable the overlay subsystem
(see [API: Core](https://blit386.dev/docs/api/core)). Set `isOverlayTimingChartEnabled: true` to opt in to the scrolling
update/render timing chart band (~22 px under the title row). Chart renderer diagnostics default to minimal when the
chart is on; set `overlayTimingChartDiagnostics: 'rich'` for vertex-pressure dots or `false` to disable chart markers.
Set `isOverlayRendererDiagnosticsBarEnabled: true` for a GPU pipeline text row below frame timings (off by default). Bar
colors default to `overlayStyle` indices; override with `overlayTimingChartStyle`. Milestone labels use
`overlayTimingChartStyle.tagPaletteIndex` (engine default 5). The engine adds a Start tag when the chart resets (first
layout and on resize). For gameplay events, call `BT.assignTag('...')` from `update()` or `init()` when the chart is
enabled in `configure()`.

## File Organization

Standard section order:

1. Imports
2. Configuration
3. Type Definitions
4. Module State
5. Helper Functions
6. Main Logic
7. Exports

Demo class member order: instance fields → `configure()` (optional) → `init()` → `update()` → `render()` → helper
methods. Keep `bootstrap(Demo);` as the last statement in the file.

Never use `// #region` / `// #endregion` – region markers are banned everywhere. See `.cursor/rules/file-structure.mdc`.

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

- Pre-commit (lint-staged): auto-formats and lints staged files
- Pre-push: runs `pnpm run preflight` (format, lint, spellcheck, knip, docs:links, build)

## Deployment

Demos deploy to Cloudflare Pages via GitHub Actions on push to main. The production build copies each virtual demo to
`dist/<slug>.html` at the site root (see `flattenDemosPlugin` in `vite.config.js`). Public URLs are listed in
`README.md` (the hosted site uses short paths such as `/001-basics`; local dev still uses `/demos/<slug>.html`).
