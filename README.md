# BLIT386

[![CI](https://github.com/blit386/blit386/actions/workflows/ci.yml/badge.svg)](https://github.com/blit386/blit386/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/blit386.svg)](https://www.npmjs.com/package/blit386)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)](https://www.w3.org/TR/webgpu/)
[![pnpm](https://img.shields.io/badge/pnpm-10.26.2-yellow.svg)](https://pnpm.io/)

A palette-first WebGPU retro engine for TypeScript, inspired by [RetroBlit](https://badcastle.itch.io/retroblit). Draw
with palette indices, animate with palette cycling and fades, and ship authentic VGA-era effects on modern GPUs.

![BLIT386 logo](assets/logo.png)

## Inspiration

BLIT386 draws heavy inspiration from [RetroBlit](https://www.badcastle.com/retroblit/docs/doc/index.html) by Martin
Cietwierkowski ([@daafu](https://github.com/daafu)) - a retro pixel demo framework for Unity that replaces the editor
with a clean, low-level demo loop. BLIT386 brings the same philosophy to the web using WebGPU: no scene graphs, no
complex frameworks, just sprites, primitives, and fonts.

## Features

- **True indexed rendering**: primitives and sprites write palette indices, not RGBA pixels
- **Palette effects built-in**: cycling, fade, flash, and swap run per frame with no per-sprite rewrites
- **Built-in retro palettes**: VGA, CGA, C64, Game Boy, PICO-8, and NES preset factories
- **Palette offset variants**: recolor one sprite sheet into team colors, states, or themes without duplicate textures
- **Performance-first data model**: tiny palette uploads (4 KB), smaller sprite textures, and compact primitive vertices
- **WebGPU rendering** with dual-pipeline architecture (primitives + sprites); automatic Canvas 2D software fallback
- **Post-process effects**: two-tier system - pixel tier on the `r8uint` index framebuffer; display tier on upscaled
  RGBA; bundled CRT presets
- **Primitive drawing**: pixels, lines, rectangles (outline and filled)
- **Sprite system**: palette-indexed textures, palette offset, automatic texture batching
- **Bitmap fonts**: variable-width rendering from `.btfont` files with palette offset support
- **Camera system**: scrolling with offset/reset and world-bounds clamping via `BT.cameraClamp`
- **Asset loading**: sprite sheets and bitmap fonts with automatic caching
- **Pointer input**: mouse, touch, and pen unified under four slots; scroll delta; cursor control
- **Keyboard input**: raw keys via `KeyboardEvent.code`, virtual face buttons, remapping, text accumulation
- **Gamepad input**: up to four players via standard Gamepad API, stick dead zone, face buttons
- **Fixed timestep**: deterministic update loop with tick counter, `Timer`, and timing helpers
- **Frame capture**: `BT.captureFrame()` and `BT.downloadFrame()` for PNG export
- **Overlay**: engine-drawn FPS, backend, resolution, and demo title (toggle with `~` or bottom-left corner; disable via
  `isOverlayEnabled: false` in `configure()`)

## Why BLIT386?

| Feature                  | BLIT386                             | Typical 2D WebGPU engines        |
| ------------------------ | ----------------------------------- | -------------------------------- |
| Rendering model          | Native indexed palette pipeline     | RGBA textures and framebuffers   |
| Color animation          | Palette cycling/fade/flash built-in | Manual sprite or shader rewrites |
| Global recolor/fade cost | One palette update                  | Scene redraw and blend passes    |
| Color variants           | Palette offsets                     | Duplicate assets or tint logic   |
| Retro palette presets    | C64, NES, Game Boy, CGA, VGA, etc.  | Usually custom/manual only       |

## Prerequisites

**Runtime (browser)**

- A **WebGPU-compatible browser** (the engine falls back to Canvas 2D software rendering when WebGPU is unavailable):
  - Chrome/Edge 113+ (Windows, macOS, Linux, Android)
  - Firefox 141+ on Windows; 145+/147+ on macOS; Nightly on Linux and Android
  - Safari 26+ (macOS Tahoe / iOS 26); or Safari 18-25 with WebGPU enabled via Feature Flags

**App toolchain**

- **Node.js** >=22.18.0 (LTS)
- An **ESM bundler** (Vite, webpack, esbuild, and similar) to load the published package in the browser

## Quick Start

The fastest way to start is the **scaffolder**. It writes a ready-to-run Vite project, installs the engine, and includes
a starter game and local docs:

```bash
npm create blit386@latest my-game
cd my-game
npm run dev
```

Works with npm, pnpm, yarn, or bun (it uses whichever you ran it with). See
[create-blit386](https://github.com/blit386/create-blit386) for options and what the project contains.

### Add to an existing project

Install **blit386** from npm ([npmjs.com/package/blit386](https://www.npmjs.com/package/blit386)):

```bash
pnpm add blit386
```

`bootstrap()` expects a canvas inside `#canvas-container` (defaults: canvas id `blit386-canvas`, container id
`canvas-container`):

```html
<div id="canvas-container"><canvas id="blit386-canvas"></canvas></div>
<script type="module" src="/src/main.ts"></script>
```

```ts
import { bootstrap, BT, Color32, Palette, Rect2i, type IBTDemo } from 'blit386';

const BG = 1;
const WATER_A = 9;
const WATER_B = 12;

class MyDemo implements IBTDemo {
  async init(): Promise<boolean> {
    const palette = Palette.c64();
    palette.set(BG, new Color32(20, 30, 40, 255));
    BT.paletteSet(palette);

    // Animate every pixel that uses slots 9..12 (water/lava style cycling).
    BT.paletteCycle(WATER_A, WATER_B, 6);

    return true;
  }

  update(): void {
    // fixed-step logic here
  }

  render(): void {
    BT.clear(BG);
    BT.drawRectFill(new Rect2i(100, 100, 50, 50), WATER_A);
  }
}

bootstrap(MyDemo);
```

See [API: Core](docs/api-core.md) for full `bootstrap()` options.

## Examples & Demos

For interactive examples and demos, visit the [BLIT386 Demos repository](https://github.com/blit386/blit386-demos) or
browse the [hosted demos at demos.blit386.dev](https://demos.blit386.dev). To start a new project, use the
[create-blit386](https://github.com/blit386/create-blit386) scaffolder (see [Quick Start](#quick-start)).

## Documentation

See [API: Core](docs/api-core.md) for `bootstrap()` options.

| Guide                                                | What it covers                                         |
| ---------------------------------------------------- | ------------------------------------------------------ |
| [API: Core](docs/api-core.md)                        | bootstrap, game loop, camera, Timer, core types        |
| [Overlay Guide](docs/overlay.md)                     | engine HUD subsystem, toggle, custom rows, layout      |
| [API: Rendering](docs/api-rendering.md)              | primitives, sprites, text, post-process, frame capture |
| [API: Palette](docs/api-palette.md)                  | palette setup, presets, effects, serialization         |
| [API: Assets](docs/api-assets.md)                    | sprite sheets, bitmap fonts, asset loading             |
| [Input Guide](docs/input.md)                         | pointer, keyboard, gamepad                             |
| [Palette Guide](docs/palette-guide.md)               | palette-first workflow, offsets, effects               |
| [Palette Presets](docs/palette-presets.md)           | built-in preset reference and exact color data         |
| [Post-Process Effects](docs/post-process-effects.md) | effect chain, built-in effects, custom effects         |
| [Bitmap Fonts](docs/bitmap-fonts.md)                 | `.btfont` format and BMFont conversion                 |

## Browser Compatibility

WebGPU support varies by browser:

| Browser     | Version        | Status                                                           |
| ----------- | -------------- | ---------------------------------------------------------------- |
| Chrome/Edge | 113+           | Enabled by default                                               |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux/Android |
| Safari      | 26+            | Enabled by default; Safari 18-25 available via Feature Flags     |

When WebGPU is unavailable the engine falls back to the Canvas 2D software renderer automatically. The software path
also works on browsers that do not expose WebGPU globals at all (for example Firefox on Linux without Nightly); the
WebGPU renderer is loaded only when WebGPU init succeeds. By default the engine draws a stats overlay after each frame:
measured FPS, configured target FPS, the active backend name (via `BT.activeBackend`), logical resolution, and a short
demo title derived from `document.title`. The overlay **body starts hidden** with a bitmap toggle hint in the
bottom-left corner; toggle it with `~` (Backquote) or a primary press in the bottom-left corner. Use
`isOverlayVisibleAtStart: true` to show the body on the first frame, `isOverlayToggleHintVisible: false` to hide the
hint icon on immersive demos, or `isOverlayEnabled: false` to disable the overlay entirely in `configure()`. Use
`BT.activeBackend` to read which backend is running (`'webgpu'`, `'software'`, or `null` before init).

## Contributors

Contributor workflow, scripts, release process, and repository tooling docs live in
[Developer Experience](docs/developer-experience-guide.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ISC
