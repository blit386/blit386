# BLIT386 Demos

Interactive examples for [BLIT386](https://github.com/blit386/blit386/), a palette-first WebGPU retro engine for
TypeScript.

Each demo shows a different feature of the engine. Source files in `src/` use plain JavaScript with lots of comments
explaining how everything works.

Want to build your own game with the engine? Start with the [create-blit386](https://github.com/blit386/create-blit386)
scaffolder (`npm create blit386@latest my-game`).

There are 40 demo modules today, covering drawing, palettes, post-process CRT effects, input (pointer, keyboard,
gamepad), and audio. Each demo lives in a single number-free kebab-case file under `src/` (for example `src/basics.js`).
Navigation order comes from `plugins/demo-order.js` (`DEMO_ORDER`), not from filenames. Most demos import the shared UI
kit in `src/shared/` for their on-screen panels and touch controls (see [Shared UI kit](#shared-ui-kit) below for the
two exceptions). During development, Vite serves the matching page at `/demos/basics.html` (no HTML file is committed;
the build wires a shared layout to each script). The default page is a persistent shell (navigation banner + iframe).
The banner's demo selector is a fuzzy-searchable combobox (type to filter by title). The iframe loads the same demo with
`?embed&source`, which runs the canvas, keeps the Twoslash source panel under it, and lets demo swaps discard the engine
with the frame. Direct `?embed` URLs (and docs-site iframes) hide the banner and source panel for a centered
full-viewport canvas.

Hosted site: Browse every demo at [demos.blit386.dev](https://demos.blit386.dev/). Live URLs use a flat, number-free
path per slug, for example `https://demos.blit386.dev/basics`. Older numbered (vintage) URLs such as `/001-basics` still
work: the build writes permanent 301 redirects from every entry in `plugins/demo-vintage-urls.js` (`VINTAGE_URLS`) into
`dist/_redirects`.

The demos build on each other in `DEMO_ORDER` where it matters; later pages assume you have seen the ideas from earlier
ones.

Each demo passes a class to `bootstrap()` from `blit386`. Optional `configure()` overrides resolution and FPS; if you
omit it, the engine applies `defaultConfig()` (`320x240` logical, `640x480` canvas, `60` FPS). Every demo still
implements `init()`, `update()`, and `render()`.

The engine draws a unified stats overlay on top of each frame (FPS, target FPS, backend, resolution, demo title). The
overlay body starts hidden; a small bitmap toggle hint sits in the bottom-left corner by default. Press Backquote (`~`)
or tap the bottom-left 17x13 px corner to show or hide the body. Opt into a body that is visible on the first frame with
`isOverlayVisibleAtStart: true`. Immersive demos hide the hint icon with `isOverlayToggleHintVisible: false` (see
`image-output`, `game-scene`, `crt-pipboy`, and `snake-game`); the overlay still toggles with Backquote. Set
`isOverlayToggleEnabled: false` to lock body visibility, or `isOverlayEnabled: false` in `configure()` to disable the
overlay subsystem entirely.

## Demos

Below, each title links to the deployed page (number-free slug). Vintage numbered paths such as `/001-basics` redirect
to these URLs via `VINTAGE_URLS`.

### Drawing Basics

- [basics](https://demos.blit386.dev/basics) – Engine basics, lifecycle, bouncing sprite, canvas text
- [basics-enhanced](https://demos.blit386.dev/basics-enhanced) – Enhanced version of the basics demo with optional
  visual effects
- [logo-lowres](https://demos.blit386.dev/logo-lowres) – Logo sprite centered on a tiny 80x60 screen, upscaled 3x to
  240x180 with nearest-neighbor filtering, then wrapped in the Tesla Orava black-and-white CRT stack (scanlines,
  scrolling roll line, flicker, RGB mask, vignette, bloom, and random analog-TV fault bursts) with a shared UI-kit
  status chip naming the current fault. The one demo that turns the engine overlay off entirely
  (`isOverlayEnabled: false`)
- [primitives](https://demos.blit386.dev/primitives) – All primitive drawing: pixels, lines, rectangles
- [colors](https://demos.blit386.dev/colors) – Color32 deep dive: named, HSL, alpha, lerp
- [named-colors](https://demos.blit386.dev/named-colors) – Color32 named registry APIs: resolve, register, update,
  unregister
- [filip-test-02](https://demos.blit386.dev/filip-test-02) – Pointer-centered rectangle, animated palette colors driven
  by the cursor, and a pixel-drawn circle
- [hypercube](https://demos.blit386.dev/hypercube) – Fez-style rotating tesseract wireframe on a 256×256 PICO-8 canvas

### Text and Visual Art

- [fonts](https://demos.blit386.dev/fonts) – Built-in system font with `BT.systemPrint()` and text measurement
- [pixel-art](https://demos.blit386.dev/pixel-art) – Programmatic pixel art with nested loops
- [patterns](https://demos.blit386.dev/patterns) – Mathematical art: spirals, Lissajous, waves, tunnel
- [bitmap-font](https://demos.blit386.dev/bitmap-font) – Load a proportional `.btfont` file and draw rainbow,
  alpha-pulsing, and measured text

### World Building

- [camera](https://demos.blit386.dev/camera) – Camera scrolling, world vs screen space, mini-map
- [sprites](https://demos.blit386.dev/sprites) – Programmatic sprite sheet, source rectangles, palette offsets
- [animation](https://demos.blit386.dev/animation) – Tick-based animation, walk frame cycling, state machines, particles
- [sprite-effects](https://demos.blit386.dev/sprite-effects) – Damage flash, silhouette, ghost, team colors, day/night
- [starfield](https://demos.blit386.dev/starfield) – Parallax scrolling starfield
- [tilemap](https://demos.blit386.dev/tilemap) – Grid-based tile world with camera

### Palette System

- [palette-presets](https://demos.blit386.dev/palette-presets) – Six built-in color sets (VGA, CGA, C64, etc.) you can
  load instantly
- [palette-animation](https://demos.blit386.dev/palette-animation) – Change palette entries every tick for instant
  visual effects
- [palette-swap](https://demos.blit386.dev/palette-swap) – Switch the active palette at runtime to change color themes
- [flurry](https://demos.blit386.dev/flurry) – Retro screensaver: particle physics and palette animation (port of macOS
  Flurry)
- [palette-cycling](https://demos.blit386.dev/palette-cycling) – Classic retro color rotation using palette cycling
- [palette-fade](https://demos.blit386.dev/palette-fade) – Smooth color transitions and flash effects with palette fade

### Putting It All Together

- [image-output](https://demos.blit386.dev/image-output) – Frame capture and PNG export
- [game-scene](https://demos.blit386.dev/game-scene) – Capstone: tilemap ground, patterns, sprites, camera, animation,
  frame capture, and looping background music with a real intro/loop point in one scene

### Input

- [pointer-basics](https://demos.blit386.dev/pointer-basics) – Mouse position, delta, scroll wheel, and four pointer
  buttons (A/B/C/D) on slot 0 with a live crosshair, button indicators, and a wheel-driven scroll bar
- [pointer-paint](https://demos.blit386.dev/pointer-paint) – Multi-touch finger painting using all four pointer slots
  (mouse + up to three touches), with edge-triggered clear / brush-cycle on right and middle click
- [pointer-drag-flick](https://demos.blit386.dev/pointer-drag-flick) – Drag-and-flick physics: grab one of three
  bouncing balls, release with `pointerDelta` as launch velocity. Multi-touch grabs one ball per finger. Throws and wall
  bounces play synthesized whoosh/thud sound effects.
- [keyboard-input](https://demos.blit386.dev/keyboard-input) – Keyboard face buttons for two players (`BT.BTN_UP` …
  `BT.BTN_SELECT`), raw `BT.isKeyDown` / `BT.isKeyPressed` (optional tick repeat) / `BT.isKeyReleased`, and typed text
  via `BT.inputString`
- [keyboard-diagnostic](https://demos.blit386.dev/keyboard-diagnostic) – Full on-screen keyboard layout with press /
  hold / release color feedback; use to verify fast taps on high-refresh displays
- [snake-game](https://demos.blit386.dev/snake-game) – Grid snake with walls, food, keyboard, D-pad, and swipe steering,
  PipBoy-style CRT post-processing, synth SFX on eat/game-over, and a looping background music track
- [input-map-remapping](https://demos.blit386.dev/input-map-remapping) – Runtime face-button remapping with
  `BT.inputMap` / `BT.inputMapReset` (defaults, custom OR keys, clearing a binding); complements `keyboard-input`
- [gamepad-input](https://demos.blit386.dev/gamepad-input) – Tiny hover-pod playground showing gamepad connect status,
  analog sticks, triggers, and face button masks (`BT.BTN_A | BT.BTN_B`) with `BT.getAxis` / `BT.isGamepadConnected` /
  `BT.gamepadCount`

### Post-Process Effects

- [crt-pipboy](https://demos.blit386.dev/crt-pipboy) – Faux Fallout terminal with the full CRT stack (barrel, scanlines,
  mask, bloom, glitch state machine) built from individual decomposed effects
- [crt-toggle](https://demos.blit386.dev/crt-toggle) – Toggle the entire `BT.preset.crtPipBoy()` CRT stack on and off at
  runtime – auto-switches between clean and CRT output every two seconds

### Audio

- [audio-basics](https://demos.blit386.dev/audio-basics) – Loading clips with `AudioClip.load()`, playing SFX on a key
  press and a pointer click with volume/pitch/pan variation, and the `BT.isAudioUnlocked` first-gesture prompt;
  `isOverlayAudioMetersEnabled` shows live bus-level meters and a voice-count readout in the overlay
- [synth-toy](https://demos.blit386.dev/synth-toy) – Procedural chip-tune SFX built entirely with `AudioClip.synth()`:
  six keyboard-triggered presets (jump/pickup/explosion/laser/hit/blip) via `BT.synthPreset`, plus a randomize key that
  rolls a fresh `SynthParams` object to show off waveform, envelope, pitch-sweep, and noise-mix variation; also opts
  into the overlay's live audio meters via `isOverlayAudioMetersEnabled`
- [music](https://demos.blit386.dev/music) – Crossfading between two looping tracks with two different `BT.musicPlay()`
  fade profiles, plus a third track demonstrating a seamless `loopStart`/`loopEnd` region after a one-time intro
- [audio-buses](https://demos.blit386.dev/audio-buses) – Mixer bus control: draggable `main`/`music`/`sfx` volume
  sliders, per-bus mute toggles that preserve the stored volume, and an alert button that ducks the music bus with
  `BT.audioVolumeSet()`

## Shared UI kit

All on-screen demo UI – panels, labels, key-value rows, checkboxes, pips, buttons, sliders, meters, a virtual touch
D-pad, swipes, and tap zones – comes from a small shared kit in `src/shared/`. It is imported by 38 of the 40 demos. Two
demos are deliberate exceptions: `flurry` (an immersive screensaver with no demo HUD, only the engine overlay),
`filip-test-02` (a bare-bones starter kept close to the getting-started example, with no demo UI at all), and
`hypercube` (a full-canvas tesseract with no shared UI kit):

| File                      | What it provides                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `ui.js`                   | The single entry point demos import: `applyTheme()` and the `ui` object             |
| `ui-core.js`              | Immediate-mode context: layout anchors, pooled draw commands, hit testing           |
| `ui-widgets.js`           | Panels, labels, key-value rows, checkboxes, pips, buttons, sliders, meters          |
| `ui-theme.js`             | `applyTheme(palette)` – installs the 12 shared UI colors (slots 240–251 by default) |
| `ui-dpad.js`              | The virtual touch D-pad (`ui.dpadWidget()`, `ui.dpad.isDown` / `ui.dpad.isPressed`) |
| `ui-gestures.js`          | Swipe recognition (`ui.swipe()`) and invisible tap zones (`ui.tapIn()`)             |
| `post-process-backend.js` | `isAvailable()` and `SOFTWARE_FALLBACK_NOTE` for effect demos that need WebGPU      |

The kit is immediate mode: a demo declares its widgets every frame inside `render()`, and each widget answers a click, a
tap, or its bound key on the spot. Because every action is reachable by tap as well as by key, the demos are usable on a
phone without a keyboard.

## Browser and Renderer

BLIT386 uses two backends (WebGPU and Canvas 2D software). The default path is WebGPU (indexed framebuffer, full
post-process chain, CRT presets, and related demos). If WebGPU is unavailable or fails to initialize, the engine
automatically switches to a Canvas 2D software renderer. There is no on-canvas banner for this: the engine logs
`[BT] WebGPU unavailable, falling back to software renderer` to the browser console, and the engine overlay reports the
active backend in its status row (for example `software|320x240`). Demo code can query the same value at runtime with
`BT.activeBackend` (`'webgpu'` or `'software'`). You can force software mode with the `?backend=software` query on a
demo URL, or with `HardwareSettings.backend: 'software'` in a demo's `configure()`.

Most demos run in software mode for core drawing (sprites, primitives, palette, input). Post-process and fullscreen
effect stacks (for example the CRT demos) need WebGPU; effect-heavy demos skip those stacks in software mode and show an
on-screen note while the rest of the scene keeps running.

WebGPU support (for the full experience) is typical in:

| Browser     | Version        | Notes                                                        |
| ----------- | -------------- | ------------------------------------------------------------ |
| Chrome/Edge | 113+           | Enabled by default                                           |
| Firefox     | 141+ (Windows) | Enabled by default; 145+/147+ on macOS; Nightly on Linux     |
| Safari      | 26+            | Enabled by default; Safari 18–25 available via Feature Flags |

## Engine documentation

These demos are thin wrappers around the library. For complete behavior, APIs, and internals, read the full docs at
[blit386.dev](https://blit386.dev):

- [Engine README](https://github.com/blit386/blit386/blob/main/README.md) – features list, quick start, bootstrap
  helpers, manual `BT.init`, project layout
- [Input](https://blit386.dev/docs/guides/input) – pointer slots, keyboard, gamepad, remapping
- [Post-process effects](https://blit386.dev/docs/guides/post-process-effects) – pixel vs display tiers, presets,
  writing effects
- [Bitmap fonts](https://blit386.dev/docs/guides/bitmap-fonts) – `.btfont` format and tooling
- [Testing](https://blit386.dev/docs/reference/testing) – unit, integration, and visual tests
- [Performance testing](https://blit386.dev/docs/performance/testing) – benchmarks and CI
- [Software fallback smoke matrix](https://blit386.dev/docs/performance/smoke-matrix) – manual backend coverage notes

## How to Run

You need both the `blit386` engine and `blit386-demos` set up as a pnpm workspace. See
[docs/EXTERNAL-DEVELOPER-SETUP.md](docs/EXTERNAL-DEVELOPER-SETUP.md) for the full setup guide.

Once the workspace is ready:

```bash
cd blit386-demos
pnpm install
pnpm run dev
```

The dev server opens `http://localhost:5173/demos/basics.html` in your browser (configured by `server.open` in
`vite.config.js`). Every demo is served at `http://localhost:5173/demos/<slug>.html`, and the index listing all of them
is at `http://localhost:5173/demos/`. Vintage numbered paths redirect to the current slug in both dev (301 from the Vite
plugin) and production (`dist/_redirects`). For the public build, open the flat URLs on
[demos.blit386.dev](https://demos.blit386.dev/).

Editing a demo's `src/<slug>.js` file usually avoids a full page reload: a method-only edit (`render()`/`update()`)
keeps state in place, while an edit to `init()` or the constructor re-initializes the demo instead. A `configure()`
hardware-setting change still forces a full reload – see [CLAUDE.md](CLAUDE.md#hot-reload) for the full tier breakdown.

## Community

- [Discord](https://discord.gg/tC2wGt88Uj)
- [GitHub Discussions](https://github.com/blit386/blit386/discussions)
- [X](https://x.com/blit386)
- [Bluesky](https://bsky.app/profile/blit386.bsky.social)
- [Mastodon](https://mastodon.gamedev.place/@blit386)

## Credits

- [Departure Mono](https://departuremono.com) by Helena Zhang – font used in the demo navigation banner, licensed under
  the [SIL Open Font License](public/fonts/DepartureMono/LICENSE)

## License

ISC
