# Blit-Tech Demos

Fun examples for the [Blit-Tech](https://github.com/vancura/blit-tech/) pixel art engine.

Each demo shows a different feature of the engine. Source files in `src/` use plain JavaScript with lots of comments
explaining how everything works.

**Progressive learning:** Use `NNN-name` file stems (e.g. `demos/001-basics.html` and `src/001-basics.js`).

The demos build on each other in numeric order; later pages assume you have seen the ideas from earlier ones.

## Demos

### Drawing Basics

- **001-basics** -- Engine basics, lifecycle, bouncing square
- **002-primitives** -- All primitive drawing: pixels, lines, rectangles
- **003-colors** -- Color32 deep dive: named, hex, HSL, alpha, lerp

### Text and Visual Art

- **004-fonts** -- Bitmap fonts, text rendering, measurement
- **005-pixel-art** -- Programmatic pixel art with nested loops
- **006-patterns** -- Mathematical art: spirals, Lissajous, waves, tunnel

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

## How to run

You need both the `blit-tech` engine and `blit-tech-demos` set up as a pnpm workspace. See
[docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for the full setup guide.

Once the workspace is ready:

```bash
cd blit-tech-demos
pnpm install
pnpm dev
```

This opens the demos at `http://localhost:5173/demos/`. Open numbered pages such as `001-basics.html` from the file list
there.

## License

ISC
