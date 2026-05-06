# Blit-Tech Demos

Fun examples for the [Blit-Tech](https://github.com/vancura/blit-tech/) pixel art engine.

Each demo shows a different feature of the engine. Source files in `src/` use plain JavaScript with lots of comments
explaining how everything works.

**Progressive learning:** Each demo lives in a single numbered file under `src/` (e.g. `src/001-basics.js`). The
matching HTML page is served virtually at `/demos/001-basics.html`.

The demos build on each other in numeric order; later pages assume you have seen the ideas from earlier ones.

## Demos

### Drawing Basics

- **001-basics** -- Engine basics, lifecycle, bouncing square
- **002-primitives** -- All primitive drawing: pixels, lines, rectangles
- **003-colors** -- Color32 deep dive: named, hex, HSL, alpha, lerp

### Text and Visual Art

- **004-fonts** -- Built-in system font with `BT.systemPrint()`
- **005-pixel-art** -- Programmatic pixel art with nested loops
- **006-patterns** -- Mathematical art: spirals, Lissajous, waves, tunnel
- **022-bitmap-font** -- Load a proportional `.btfont` file and draw rainbow, alpha-pulsing, and measured text

### World Building

- **007-camera** -- Camera scrolling, world vs screen space, mini-map
- **008-sprites** -- Sprite sheets, source rectangles, tinting
- **009-animation** -- Tick-based animation, state machines, particles
- **010-sprite-effects** -- Damage flash, silhouette, ghost, team colors, day/night
- **011-starfield** -- Parallax scrolling starfield
- **012-tilemap** -- Grid-based tile world with camera

### Palette System

- **015-palette-presets** -- Six built-in color sets (VGA, CGA, C64, etc.) you can load instantly
- **016-palette-animation** -- Change palette entries every tick for instant visual effects
- **017-palette-swap** -- Switch the active palette at runtime to change color themes
- **018-flurry** -- Retro screensaver: particle physics and palette animation (port of macOS Flurry)
- **019-palette-cycling** -- Classic retro color rotation using palette cycling
- **020-palette-fade** -- Smooth color transitions and flash effects with palette fade

### Putting It All Together

- **013-image-output** -- Frame capture and PNG export
- **014-game-scene** -- Capstone: everything combined into a mini game scene

### Input

- **025-pointer-basics** -- Mouse position, delta, scroll wheel, and four pointer buttons (A/B/C/D) on slot 0 with a
  live crosshair, button indicators, and a wheel-driven scroll bar
- **026-pointer-paint** -- Multi-touch finger painting using all four pointer slots (mouse + up to three touches), with
  edge-triggered clear / brush-cycle on right and middle click
- **027-pointer-drag-flick** -- Drag-and-flick physics: grab one of three bouncing balls, release with `pointerDelta` as
  launch velocity. Multi-touch grabs one ball per finger.

### Post-Process Effects

- **023-crt-pipboy** -- Faux Fallout terminal with the full CRT stack (barrel, scanlines, mask, bloom, glitch state
  machine) built from individual decomposed effects
- **024-crt-toggle** -- Toggle the entire `BT.preset.crtPipBoy()` CRT stack on and off at runtime -- auto-switches
  between clean and CRT output every two seconds

### Developer Tools

- **021-error-preview** -- Utility that cycles through every WebGPU error message the engine can display, for checking
  layout and wording without needing to simulate real failures

## Browser Requirements

The demos require a WebGPU-capable browser:

| Browser     | Version        | Notes                                                        |
| ----------- | -------------- | ------------------------------------------------------------ |
| Chrome/Edge | 113+           | Enabled by default                                           |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux     |
| Safari      | 26+            | Enabled by default; Safari 18-25 available via Feature Flags |

## How to run

You need both the `blit-tech` engine and `blit-tech-demos` set up as a pnpm workspace. See
[docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for the full setup guide.

Once the workspace is ready:

```bash
cd blit-tech-demos
pnpm install
pnpm dev
```

This opens the demos at `http://localhost:5173/demos/001-basics.html`. The `/demos/` index page lists every demo, or you
can navigate directly to any `/demos/NNN-name.html` URL.

## License

ISC
