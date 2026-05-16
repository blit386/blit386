# Blit-Tech Demos

Fun examples for [Blit-Tech](https://github.com/vancura/blit-tech/), a palette-first WebGPU retro engine for TypeScript.

Each demo shows a different feature of the engine. Source files in `src/` use plain JavaScript with lots of comments
explaining how everything works.

There are **32** numbered demo modules today. Each one lives in a single file under `src/` (for example
`src/001-basics.js`). During development, Vite serves the matching page at `/demos/001-basics.html` (no HTML file is
committed; the build wires a shared layout to each script).

**Hosted site:** Browse every demo at [blit-tech-demos.vancura.dev](https://blit-tech-demos.vancura.dev/). Live URLs use
a flat path per slug, for example `https://blit-tech-demos.vancura.dev/001-basics`.

The demos build on each other in numeric order where it matters; later pages assume you have seen the ideas from earlier
ones.

Each demo passes a class to `bootstrap()` from `blit-tech`. Optional `configure()` overrides resolution and FPS; if you
omit it, the engine applies `defaultConfig()` (`320x240` logical, `640x480` canvas, `60` FPS). Every demo still
implements `init()`, `update()`, and `render()`.

## Demos

Below, each title links to the deployed page. Slug `021-error-preview` was retired; numbering resumes at `022`.

### Drawing Basics

- **[001-basics](https://blit-tech-demos.vancura.dev/001-basics)** -- Engine basics, lifecycle, bouncing square
- **[002-primitives](https://blit-tech-demos.vancura.dev/002-primitives)** -- All primitive drawing: pixels, lines,
  rectangles
- **[003-colors](https://blit-tech-demos.vancura.dev/003-colors)** -- Color32 deep dive: named, HSL, alpha, lerp
- **[032-named-colors](https://blit-tech-demos.vancura.dev/032-named-colors)** -- Color32 named registry APIs: resolve,
  register, update, unregister

### Text and Visual Art

- **[004-fonts](https://blit-tech-demos.vancura.dev/004-fonts)** -- Built-in system font with `BT.systemPrint()`
- **[005-pixel-art](https://blit-tech-demos.vancura.dev/005-pixel-art)** -- Programmatic pixel art with nested loops
- **[006-patterns](https://blit-tech-demos.vancura.dev/006-patterns)** -- Mathematical art: spirals, Lissajous, waves,
  tunnel
- **[022-bitmap-font](https://blit-tech-demos.vancura.dev/022-bitmap-font)** -- Load a proportional `.btfont` file and
  draw rainbow, alpha-pulsing, and measured text

### World Building

- **[007-camera](https://blit-tech-demos.vancura.dev/007-camera)** -- Camera scrolling, world vs screen space, mini-map
- **[008-sprites](https://blit-tech-demos.vancura.dev/008-sprites)** -- Sprite sheets, source rectangles, tinting
- **[009-animation](https://blit-tech-demos.vancura.dev/009-animation)** -- Tick-based animation, state machines,
  particles
- **[010-sprite-effects](https://blit-tech-demos.vancura.dev/010-sprite-effects)** -- Damage flash, silhouette, ghost,
  team colors, day/night
- **[011-starfield](https://blit-tech-demos.vancura.dev/011-starfield)** -- Parallax scrolling starfield
- **[012-tilemap](https://blit-tech-demos.vancura.dev/012-tilemap)** -- Grid-based tile world with camera

### Palette System

- **[015-palette-presets](https://blit-tech-demos.vancura.dev/015-palette-presets)** -- Six built-in color sets (VGA,
  CGA, C64, etc.) you can load instantly
- **[016-palette-animation](https://blit-tech-demos.vancura.dev/016-palette-animation)** -- Change palette entries every
  tick for instant visual effects
- **[017-palette-swap](https://blit-tech-demos.vancura.dev/017-palette-swap)** -- Switch the active palette at runtime
  to change color themes
- **[018-flurry](https://blit-tech-demos.vancura.dev/018-flurry)** -- Retro screensaver: particle physics and palette
  animation (port of macOS Flurry)
- **[019-palette-cycling](https://blit-tech-demos.vancura.dev/019-palette-cycling)** -- Classic retro color rotation
  using palette cycling
- **[020-palette-fade](https://blit-tech-demos.vancura.dev/020-palette-fade)** -- Smooth color transitions and flash
  effects with palette fade

### Putting It All Together

- **[013-image-output](https://blit-tech-demos.vancura.dev/013-image-output)** -- Frame capture and PNG export
- **[014-game-scene](https://blit-tech-demos.vancura.dev/014-game-scene)** -- Capstone: everything combined into a mini
  game scene

### Input

- **[025-pointer-basics](https://blit-tech-demos.vancura.dev/025-pointer-basics)** -- Mouse position, delta, scroll
  wheel, and four pointer buttons (A/B/C/D) on slot 0 with a live crosshair, button indicators, and a wheel-driven
  scroll bar
- **[026-pointer-paint](https://blit-tech-demos.vancura.dev/026-pointer-paint)** -- Multi-touch finger painting using
  all four pointer slots (mouse + up to three touches), with edge-triggered clear / brush-cycle on right and middle
  click
- **[027-pointer-drag-flick](https://blit-tech-demos.vancura.dev/027-pointer-drag-flick)** -- Drag-and-flick physics:
  grab one of three bouncing balls, release with `pointerDelta` as launch velocity. Multi-touch grabs one ball per
  finger.
- **[028-keyboard-input](https://blit-tech-demos.vancura.dev/028-keyboard-input)** -- Keyboard face buttons for two
  players (`BT.BTN_UP` … `BT.BTN_SELECT`), raw `BT.keyDown` / `BT.keyPressed` (optional tick repeat) / `BT.keyReleased`,
  and typed text via `BT.inputString()`
- **[029-snake-game](https://blit-tech-demos.vancura.dev/029-snake-game)** -- Grid snake with walls, food, keyboard
  steering, and PipBoy-style CRT post-processing
- **[030-input-map-remapping](https://blit-tech-demos.vancura.dev/030-input-map-remapping)** -- Runtime face-button
  remapping with `BT.inputMap` / `BT.inputMapReset` (defaults, custom OR keys, clearing a binding); complements demo 028
- **[031-gamepad-input](https://blit-tech-demos.vancura.dev/031-gamepad-input)** -- Tiny hover-pod playground showing
  gamepad connect status, analog sticks, triggers, and face button masks (`BT.BTN_A | BT.BTN_B`) with `BT.getAxis` /
  `BT.gamepadConnected` / `BT.gamepadCount`

### Post-Process Effects

- **[023-crt-pipboy](https://blit-tech-demos.vancura.dev/023-crt-pipboy)** -- Faux Fallout terminal with the full CRT
  stack (barrel, scanlines, mask, bloom, glitch state machine) built from individual decomposed effects
- **[024-crt-toggle](https://blit-tech-demos.vancura.dev/024-crt-toggle)** -- Toggle the entire `BT.preset.crtPipBoy()`
  CRT stack on and off at runtime -- auto-switches between clean and CRT output every two seconds

## Browser and renderer

Blit-Tech uses **two renderers**. The default path is **WebGPU** (indexed framebuffer, full post-process chain, CRT
presets, and related demos). If WebGPU is unavailable or fails to initialize, the engine **automatically** switches to a
**Canvas 2D software renderer**; a small dismissible **SOFTWARE RENDERER** banner appears on the canvas. You can also
force software mode with the `?renderer=software` query on a demo URL, or with `HardwareSettings.renderer: 'software'`
in a demo’s `configure()`.

Most demos run in **software mode** for core drawing (sprites, primitives, palette, input). **Post-process and
fullscreen effect stacks** (for example the CRT demos) need **WebGPU**; the engine throws a clear error if software mode
cannot provide them.

**WebGPU support** (for the full experience) is typical in:

| Browser     | Version        | Notes                                                        |
| ----------- | -------------- | ------------------------------------------------------------ |
| Chrome/Edge | 113+           | Enabled by default                                           |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux     |
| Safari      | 26+            | Enabled by default; Safari 18-25 available via Feature Flags |

## Engine documentation

These demos are thin wrappers around the library. For complete behavior, APIs, and internals, use the Blit-Tech repo:

- **[README](https://github.com/vancura/blit-tech/blob/main/README.md)** — features list, quick start, bootstrap
  helpers, manual `BT.init`, project layout
- **[Input](https://github.com/vancura/blit-tech/blob/main/docs/input.md)** — pointer slots, keyboard, gamepad,
  remapping
- **[Post-process effects](https://github.com/vancura/blit-tech/blob/main/docs/post-process-effects.md)** — pixel vs
  display tiers, presets, writing effects
- **[Bitmap fonts](https://github.com/vancura/blit-tech/blob/main/docs/bitmap-fonts.md)** — `.btfont` format and tooling
- **[Testing](https://github.com/vancura/blit-tech/blob/main/docs/testing.md)** — unit, integration, and visual tests
- **[Performance testing](https://github.com/vancura/blit-tech/blob/main/docs/performance-testing.md)** — benchmarks and
  CI
- **[Software fallback smoke matrix](https://github.com/vancura/blit-tech/blob/main/docs/software-fallback-smoke-matrix.md)**
  — manual backend coverage notes

## How to run

You need both the `blit-tech` engine and `blit-tech-demos` set up as a pnpm workspace. See
[docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for the full setup guide.

Once the workspace is ready:

```bash
cd blit-tech-demos
pnpm install
pnpm dev
```

This opens the demo index at `http://localhost:5173/demos/` and each page at `http://localhost:5173/demos/<slug>.html`
(for example `http://localhost:5173/demos/001-basics.html`). For the public build, open the flat URLs on
[blit-tech-demos.vancura.dev](https://blit-tech-demos.vancura.dev/).

## License

ISC
