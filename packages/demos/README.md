# BLIT386 Demos

Interactive examples for [BLIT386](https://github.com/blit386/blit386/), a palette-first WebGPU retro engine for
TypeScript.

Each demo shows a different feature of the engine. Source files in `src/` use plain JavaScript with lots of comments
explaining how everything works.

Want to build your own game with the engine? Start with the [create-blit386](https://github.com/blit386/create-blit386)
scaffolder (`npm create blit386@latest my-game`).

There are **34** demo modules today (33 numbered demos plus `00a-barebones`). Each one lives in a single file under
`src/` (for example `src/001-basics.js`). During development, Vite serves the matching page at `/demos/001-basics.html`
(no HTML file is committed; the build wires a shared layout to each script).

**Hosted site:** Browse every demo at [demos.blit386.dev](https://demos.blit386.dev/). Live URLs use a flat path per
slug, for example `https://demos.blit386.dev/001-basics`.

The demos build on each other in numeric order where it matters; later pages assume you have seen the ideas from earlier
ones.

Each demo passes a class to `bootstrap()` from `blit386`. Optional `configure()` overrides resolution and FPS; if you
omit it, the engine applies `defaultConfig()` (`320x240` logical, `640x480` canvas, `60` FPS). Every demo still
implements `init()`, `update()`, and `render()`.

The engine draws a unified stats overlay on top of each frame (FPS, target FPS, backend, resolution, demo title). The
overlay **body starts hidden**; a small bitmap toggle hint sits in the **bottom-left** corner by default. Press
Backquote (`~`) or tap the bottom-left 48x48 px corner to show or hide the body. Opt into a body that is visible on the
first frame with `isOverlayVisibleAtStart: true`. Immersive demos hide the hint icon with
`isOverlayToggleHintVisible: false` (see `013-image-output`, `014-game-scene`, `023-crt-pipboy`, and `029-snake-game`);
the overlay still toggles with Backquote. Set `isOverlayToggleEnabled: false` to lock body visibility, or
`isOverlayEnabled: false` in `configure()` to disable the overlay subsystem entirely.

## Demos

Below, each title links to the deployed page. Slug `021-error-preview` was retired; numbering resumes at `022`.

### Drawing Basics

- **[001-basics](https://demos.blit386.dev/001-basics)** - Engine basics, lifecycle, bouncing sprite, canvas text
- **[033-basics-enhanced](https://demos.blit386.dev/033-basics-enhanced)** - Enhanced version of the basics demo with
  optional visual effects
- **[002-primitives](https://demos.blit386.dev/002-primitives)** - All primitive drawing: pixels, lines, rectangles
- **[003-colors](https://demos.blit386.dev/003-colors)** - Color32 deep dive: named, HSL, alpha, lerp
- **[032-named-colors](https://demos.blit386.dev/032-named-colors)** - Color32 named registry APIs: resolve, register,
  update, unregister

### Text and Visual Art

- **[004-fonts](https://demos.blit386.dev/004-fonts)** - Built-in system font with `BT.systemPrint()` and text
  measurement
- **[005-pixel-art](https://demos.blit386.dev/005-pixel-art)** - Programmatic pixel art with nested loops
- **[006-patterns](https://demos.blit386.dev/006-patterns)** - Mathematical art: spirals, Lissajous, waves, tunnel
- **[022-bitmap-font](https://demos.blit386.dev/022-bitmap-font)** - Load a proportional `.btfont` file and draw
  rainbow, alpha-pulsing, and measured text

### World Building

- **[007-camera](https://demos.blit386.dev/007-camera)** - Camera scrolling, world vs screen space, mini-map
- **[008-sprites](https://demos.blit386.dev/008-sprites)** - Programmatic sprite sheet, source rectangles, palette
  offsets
- **[009-animation](https://demos.blit386.dev/009-animation)** - Tick-based animation, walk frame cycling, state
  machines, particles
- **[010-sprite-effects](https://demos.blit386.dev/010-sprite-effects)** - Damage flash, silhouette, ghost, team colors,
  day/night
- **[011-starfield](https://demos.blit386.dev/011-starfield)** - Parallax scrolling starfield
- **[012-tilemap](https://demos.blit386.dev/012-tilemap)** - Grid-based tile world with camera

### Palette System

- **[015-palette-presets](https://demos.blit386.dev/015-palette-presets)** - Six built-in color sets (VGA, CGA, C64,
  etc.) you can load instantly
- **[016-palette-animation](https://demos.blit386.dev/016-palette-animation)** - Change palette entries every tick for
  instant visual effects
- **[017-palette-swap](https://demos.blit386.dev/017-palette-swap)** - Switch the active palette at runtime to change
  color themes
- **[018-flurry](https://demos.blit386.dev/018-flurry)** - Retro screensaver: particle physics and palette animation
  (port of macOS Flurry)
- **[019-palette-cycling](https://demos.blit386.dev/019-palette-cycling)** - Classic retro color rotation using palette
  cycling
- **[020-palette-fade](https://demos.blit386.dev/020-palette-fade)** - Smooth color transitions and flash effects with
  palette fade

### Putting It All Together

- **[013-image-output](https://demos.blit386.dev/013-image-output)** - Frame capture and PNG export
- **[014-game-scene](https://demos.blit386.dev/014-game-scene)** - Capstone: tilemap ground, patterns, sprites, camera,
  animation, and frame capture in one scene

### Input

- **[025-pointer-basics](https://demos.blit386.dev/025-pointer-basics)** - Mouse position, delta, scroll wheel, and four
  pointer buttons (A/B/C/D) on slot 0 with a live crosshair, button indicators, and a wheel-driven scroll bar
- **[026-pointer-paint](https://demos.blit386.dev/026-pointer-paint)** - Multi-touch finger painting using all four
  pointer slots (mouse + up to three touches), with edge-triggered clear / brush-cycle on right and middle click
- **[027-pointer-drag-flick](https://demos.blit386.dev/027-pointer-drag-flick)** - Drag-and-flick physics: grab one of
  three bouncing balls, release with `pointerDelta` as launch velocity. Multi-touch grabs one ball per finger.
- **[028-keyboard-input](https://demos.blit386.dev/028-keyboard-input)** - Keyboard face buttons for two players
  (`BT.BTN_UP` … `BT.BTN_SELECT`), raw `BT.isKeyDown` / `BT.isKeyPressed` (optional tick repeat) / `BT.isKeyReleased`,
  and typed text via `BT.inputString`
- **[029-snake-game](https://demos.blit386.dev/029-snake-game)** - Grid snake with walls, food, keyboard steering, and
  PipBoy-style CRT post-processing
- **[030-input-map-remapping](https://demos.blit386.dev/030-input-map-remapping)** - Runtime face-button remapping with
  `BT.inputMap` / `BT.inputMapReset` (defaults, custom OR keys, clearing a binding); complements demo 028
- **[031-gamepad-input](https://demos.blit386.dev/031-gamepad-input)** - Tiny hover-pod playground showing gamepad
  connect status, analog sticks, triggers, and face button masks (`BT.BTN_A | BT.BTN_B`) with `BT.getAxis` /
  `BT.isGamepadConnected` / `BT.gamepadCount`

### Post-Process Effects

- **[023-crt-pipboy](https://demos.blit386.dev/023-crt-pipboy)** - Faux Fallout terminal with the full CRT stack
  (barrel, scanlines, mask, bloom, glitch state machine) built from individual decomposed effects
- **[024-crt-toggle](https://demos.blit386.dev/024-crt-toggle)** - Toggle the entire `BT.preset.crtPipBoy()` CRT stack
  on and off at runtime - auto-switches between clean and CRT output every two seconds

## Browser and Renderer

BLIT386 uses **two backends** (WebGPU and Canvas 2D software). The default path is **WebGPU** (indexed framebuffer, full
post-process chain, CRT presets, and related demos). If WebGPU is unavailable or fails to initialize, the engine
**automatically** switches to a **Canvas 2D software renderer**; a small dismissible **SOFTWARE RENDERER** banner
appears on the canvas. You can also force software mode with the `?backend=software` query on a demo URL, or with
`HardwareSettings.backend: 'software'` in a demo’s `configure()`.

Most demos run in **software mode** for core drawing (sprites, primitives, palette, input). **Post-process and
fullscreen effect stacks** (for example the CRT demos) need **WebGPU**; effect-heavy demos skip those stacks in software
mode and show an on-screen note while the rest of the scene keeps running.

**WebGPU support** (for the full experience) is typical in:

| Browser     | Version        | Notes                                                        |
| ----------- | -------------- | ------------------------------------------------------------ |
| Chrome/Edge | 113+           | Enabled by default                                           |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux     |
| Safari      | 26+            | Enabled by default; Safari 18-25 available via Feature Flags |

## Engine documentation

These demos are thin wrappers around the library. For complete behavior, APIs, and internals, use the BLIT386 repo:

- **[README](https://github.com/blit386/blit386/blob/main/README.md)** - features list, quick start, bootstrap helpers,
  manual `BT.init`, project layout
- **[Input](https://github.com/blit386/blit386/blob/main/docs/input.md)** - pointer slots, keyboard, gamepad, remapping
- **[Post-process effects](https://github.com/blit386/blit386/blob/main/docs/post-process-effects.md)** - pixel vs
  display tiers, presets, writing effects
- **[Bitmap fonts](https://github.com/blit386/blit386/blob/main/docs/bitmap-fonts.md)** - `.btfont` format and tooling
- **[Testing](https://github.com/blit386/blit386/blob/main/docs/testing.md)** - unit, integration, and visual tests
- **[Performance testing](https://github.com/blit386/blit386/blob/main/docs/performance-testing.md)** - benchmarks and
  CI
- **[Software fallback smoke matrix](https://github.com/blit386/blit386/blob/main/docs/software-fallback-smoke-matrix.md)** -
  manual backend coverage notes

## How to Run

You need both the `blit386` engine and `blit386-demos` set up as a pnpm workspace. See
[docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for the full setup guide.

Once the workspace is ready:

```bash
cd blit386-demos
pnpm install
pnpm run dev
```

This opens the demo index at `http://localhost:5173/demos/` and each page at `http://localhost:5173/demos/<slug>.html`
(for example `http://localhost:5173/demos/001-basics.html`). For the public build, open the flat URLs on
[demos.blit386.dev](https://demos.blit386.dev/).

## License

ISC
