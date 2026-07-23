# BLIT386

[![CI](https://github.com/blit386/blit386/actions/workflows/ci.yml/badge.svg)](https://github.com/blit386/blit386/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/blit386.svg)](https://www.npmjs.com/package/blit386)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)](https://www.w3.org/TR/webgpu/)

A palette-first retro engine for the web. You draw with numbered colors instead of RGBA pixels – the same trick that
made VGA games shimmer – and a modern GPU does the rest. Roll the palette and water flows, fire rises, the sky drifts at
dusk, all without redrawing a single pixel. WebGPU when your browser has it, an automatic Canvas 2D fallback when it
does not.

It is small, it is fast, and it is built to feel like a toy. That is the whole point.

![BLIT386 logo](https://github.com/blit386/blit386/raw/main/assets/logo.png)

## Quick overview

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

class Game {
  // The box position, in pixels. update() changes it; render() only reads it.
  x = 140;
  speed = 1;

  // init() runs once at startup. Set up your colors and load things here.
  // Slot 0 is always transparent, so we start numbering at 1.
  // Think of the palette as a numbered paint box.
  async init() {
    const palette = BT.paletteCreate(16); // room for 16 colors

    palette.set(1, new Color32(32, 0, 128)); // a deep blue background
    palette.set(2, new Color32(255, 220, 90)); // a warm yellow

    BT.paletteSet(palette); // make this the palette the engine draws with

    return true; // tell the engine setup went fine
  }

  // update() is the THINKING step: change the world here (move things, read
  // input, run physics), but never draw. It runs at a FIXED rate – targetFPS,
  // 60 times a second by default – no matter how fast the screen is. The engine
  // runs it as many times per frame as it needs to hold that pace, so your game
  // moves at the same speed on every machine.
  update() {
    this.x += this.speed; // slide the box sideways

    if (this.x < 0 || this.x > 280) {
      this.speed = -this.speed; // bounce off the screen edges
    }
  }

  // render() is the DRAWING step: only paint the world as it is right now,
  // never change state. It runs ONCE PER SCREEN REFRESH – way faster on a
  // high-refresh monitor, slower on a struggling machine – so it is not locked
  // to update().
  render() {
    // Draw with slot numbers, not colors.
    BT.clear(1); // fill the screen with slot 1
    BT.drawRectFill(new Rect2i(this.x, 100, 40, 40), 2); // the moving box
    BT.systemPrint(new Vector2i(108, 160), 2, 'HELLO BLIT386'); // built-in font; bitmap fonts work too
  }
}

bootstrap(Game); // hand the class to the engine and start the loop
```

That is a whole game on a 320×240 screen: `update()` thinks, `render()` draws, and the box slides back and forth at the
same speed on every machine – because `update()` ticks at a fixed rate while `render()` just follows your screen. No
config, no scene graph, no ceremony.

### Load a sprite and draw it

```js
import { bootstrap, BT, Color32, Palette, SpriteSheet, Vector2i } from 'blit386';

class Game {
  async init() {
    this.palette = new Palette(256);
    this.palette.set(1, new Color32(20, 20, 40)); // background

    // loadIndexed() scans the PNG, drops its colors into the palette starting
    // at slot 10, and hands you back the sheet plus a rect for the whole image.
    this.hero = await SpriteSheet.loadIndexed('/sprites/hero.png', this.palette, 10);

    BT.paletteSet(this.palette); // activate AFTER loadIndexed returns

    return true;
  }

  update() {}

  render() {
    BT.clear(1);
    BT.drawSprite(this.hero.sheet, this.hero.srcRect, new Vector2i(140, 100));
  }
}

bootstrap(Game);
```

### Make an ocean out of one palette

This is the party trick. Build eight shades of blue, then tell the engine to rotate them. The pixels never change – only
the paint-box labels shuffle – and the whole sea starts to move, exactly like it did in DeluxePaint.

```js
import { bootstrap, BT, Color32, Rect2i } from 'blit386';

const OCEAN_START = 1; // eight blue slots live in 1..8
const OCEAN_END = 8;

class Game {
  async init() {
    const palette = BT.paletteCreate(16);

    // A gradient from deep navy to bright cyan across the eight slots.
    for (let i = 0; i < 8; i++) {
      const t = i / 7; // 0..1
      palette.set(OCEAN_START + i, new Color32(0, Math.floor(40 + t * 160), Math.floor(100 + t * 155)));
    }

    BT.paletteSet(palette);

    // Roll those eight slots forward, ~4 steps a second. The engine keeps
    // doing this every frame on its own. We never touch a pixel again.
    BT.paletteCycle(OCEAN_START, OCEAN_END, 4);

    return true;
  }

  update() {}

  render() {
    // Eight horizontal bands, one per ocean slot. As the palette rolls, the
    // colors slide down the screen like a calm, glittering sea.
    for (let i = 0; i < 8; i++) {
      BT.drawRectFill(new Rect2i(0, i * 30, 320, 30), OCEAN_START + i);
    }
  }
}

bootstrap(Game);
```

## What makes it fun

- Draw with numbers, not pixels: A 256-color paint box; every primitive and sprite is just a slot index.
- Animate colors, not geometry: Cycle, fade, flash, and swap give you water, lava, and lightning for the cost of one
  tiny palette upload.
- Retro palettes in the box: VGA, CGA, C64, Game Boy, PICO-8, and NES presets.
- Recolor without redrawing: Palette offsets turn one sprite sheet into team colors, day and night, or power-up states –
  no duplicate textures.
- CRT when you want it: A two-tier post-process chain with bundled CRT presets for that curved-glass glow.
- Everything a tiny engine needs: Pointer, keyboard, and gamepad input, a fixed-timestep loop with render-time
  interpolation for smooth motion between ticks, bitmap fonts, a camera, and one-call PNG frame capture.
- Sound that plays, not just routes: Fire off sound effects and crossfading music through a three-bus mixer (sfx, music,
  main) with volume, mute, and fades, synthesize blips and booms from scratch or reach for a built-in preset, and read
  live levels off the overlay's audio meters – all while tracking the browser's autoplay-gesture unlock honestly instead
  of pretending it doesn't exist.

## Get started

The fastest way – easy enough that a pigeon would skip its dinner to try it – is the scaffolder. It writes a
ready-to-run Vite project, installs the engine, and drops in a starter game plus local docs.

```bash
npm create blit386@latest my-game
cd my-game
npm run dev
```

Works with npm, pnpm, yarn, or bun – it uses whichever you ran it with. Open the address it prints and edit
`src/game.js`. See [create-blit386](https://github.com/blit386/create-blit386) for the options and what lands in the
project.

### Add it to a project you already have

```bash
pnpm add blit386
```

`bootstrap()` looks for a canvas inside `#canvas-container`:

```html
<div id="canvas-container"><canvas id="blit386-canvas"></canvas></div>
<script type="module" src="/src/main.js"></script>
```

You need an ESM bundler (Vite, esbuild, webpack, and friends) and Node >=22.18.0. The engine wants a WebGPU browser and
quietly falls back to Canvas 2D when there is not one – see [Browser support](docs/api-browser-support.md) for the
version details.

On Vite, add the `blit386/vite` plugin to `vite.config.js` for hot reload during development – most code and asset edits
apply to the running game without a page reload (a hardware setting change or an unrecognized asset type still falls
back to one). See the [Hot Reload guide](docs/guide-hot-reload.md).

## Demos

Play the [hosted demos at demos.blit386.dev](https://demos.blit386.dev), or read the source in the
[blit386-demos repo](https://github.com/blit386/blit386-demos) – 34 small, heavily commented examples from a single
moving square up to a full Snake game.

## Documentation

The full, typeset documentation lives at [blit386.dev/docs](https://blit386.dev/docs). The Markdown sources are in
[`docs/`](docs/) – start with [API: Core](docs/api-core.md) for `bootstrap()` and initialization. The rest of the
important pages:

| Documentation                                              | What it covers                                         |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| [API: Core](docs/api-core.md)                              | bootstrap, init, default configuration                 |
| [API: Game Loop](docs/api-game-loop.md)                    | tick timing, present FPS, Timer                        |
| [API: Camera](docs/api-camera.md)                          | global pixel offset, world-clamp helpers               |
| [API: Core Types](docs/api-core-types.md)                  | Vector2i, Rect2i, Color32                              |
| [API: Rendering](docs/api-rendering.md)                    | primitives, sprites, text, post-process, frame capture |
| [API: Palette](docs/api-palette.md)                        | palette setup, presets, effects, serialization         |
| [API: Assets](docs/api-assets.md)                          | sprite sheets, bitmap fonts, asset loading             |
| [API: Audio](docs/api-audio.md)                            | buses, sound effects, music, procedural synthesis      |
| [Input Guide](docs/guide-input.md)                         | pointer, keyboard, gamepad                             |
| [Palette Guide](docs/guide-palette.md)                     | the palette-first workflow, offsets, and effects       |
| [Audio Guide](docs/guide-audio.md)                         | loading, playing, and designing sound                  |
| [Post-Process Effects](docs/guide-post-process-effects.md) | the effect chain, built-in effects, CRT presets        |

The full index – overlay HUD, palette presets, bitmap fonts, performance, testing, security – lives in [`docs/`](docs/).

## Inspiration

BLIT386 owes its whole philosophy to [RetroBlit](https://www.badcastle.com/retroblit.html) by Martin Cietwierkowski
([@daafu](https://github.com/daafu)) – a retro pixel framework for Unity that throws out the scene graph and hands you a
clean, low-level demo loop. BLIT386 brings that same feeling to the web with WebGPU: no frameworks, just sprites,
primitives, fonts, and a palette.

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [X](https://x.com/blit386)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## Made by

BLIT386 is built by Václav Vančura ([@vancura](https://github.com/vancura)) – one person, so far. I am not a player, I
am an engine maker.

Want to help? The contributor workflow, scripts, and release process live in
[Developer Experience](docs/developer-experience-guide.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ISC.
