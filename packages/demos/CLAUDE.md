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
- American English spelling – see Documentation Style below

## Project Structure

```text
blit386-demos/
  src/                         # JavaScript source – one file per demo (single source of truth)
    001-basics.js
    002-primitives.js
    ...                        # numbered demos under src/*.js (plugin discovers all)
    shared/                    # Shared UI kit + cross-demo helpers (38 of 39 demos import it; 018-flurry is the exception)
      ui.js                    # The one entry point demos import: applyTheme() + the ui object
      ui-core.js               # Immediate-mode context: anchors, layout, pooled draws, hit testing
      ui-widgets.js            # panel, label, caption, kv, checkbox, pip, button, slider, meter,
                               #   separator, spacer, audioUnlockHint
      ui-theme.js              # applyTheme(palette) – installs the 12 shared UI colors (slots 240-251)
      ui-dpad.js               # Virtual touch D-pad (ui.dpadWidget, ui.dpad.isDown / isPressed)
      ui-gestures.js           # Swipe recognition (ui.swipe) and tap zones (ui.tapIn)
      post-process-backend.js  # isAvailable() + SOFTWARE_FALLBACK_NOTE (WebGPU-only effect demos)
      rand.js                  # randInt, randIntInclusive, randFloat, randPick (shared random helpers)
      canvas-sprites.js        # canvasToImage() + registerCanvasColors() for canvas-built sprite sheets
  public/                      # Static assets copied to dist/ verbatim
    fonts/                     # Bitmap fonts (.btfont + .png) and DepartureMono/ (otf/woff/woff2 + LICENSE,
                               #   the web font used by the demo navigation banner)
    sprites/                   # Sprite sheets used by demos
    audio/                     # blip.wav, pop.wav, music-calm.wav, music-upbeat.wav,
                               #   music-intro-loop.wav + music-intro-loop.loop.json (loop points)
    _headers                   # Cloudflare Pages headers
    _redirects                 # Cloudflare Pages redirects
  styles/                      # Demo chrome CSS (Vite + PostCSS: nesting, Autoprefixer)
    layout.css                 # Banner, canvas sizing, embed mode (from layout.html)
    demo-source.css            # Source panel / Shiki / Twoslash hover polish
    twoslash-rich.css          # Vendored from @shikijs/twoslash (Biome-ignored)
    demos-index.css            # Dev-only /demos/ index page
  _partials/                   # Shared HTML template (plain HTML with {{title}}, {{scriptFile}},
    layout.html                #   {{slug}}, {{demoList}}, and {{sourceHtml}} placeholders)
  plugins/                     # Vite plugin that renders virtual demo HTML at build and dev time
    virtual-demos.js           # Virtual HTML pages + injects Twoslash-highlighted source
    highlight-demo-source.js   # Shiki + @shikijs/twoslash highlighter (mtime cache)
    demo-registry.js
  scripts/                     # Repo maintenance scripts (run via package scripts)
    check-markdown-links.mjs   # pnpm run docs:links – walks every .md/.mdx in the repo
    generate-audio-loops.mjs   # pnpm run generate:audio-loops – writes the *.loop.json loop points
  docs/                        # CI-WORKSPACE-SETUP, EXTERNAL-DEVELOPER-SETUP, SECURITY-HEADERS
```

The `/demos/NNN-name.html` URLs are served virtually by the `virtual-demos` plugin. There is no `demos/` directory on
disk. Each demo page top-aligns the canvas (40px pad), then shows a Shiki + Twoslash highlighted copy of that demo's
`src/<slug>.js` below it (Pragmata Pro, github-light / github-dark, CSS type-hover popovers). `?embed` hides the source
panel and restores a centered full-viewport canvas for docs iframes.

Numbering has two gaps: `021` is retired (it was `021-error-preview`), and `039` / `040` were never used. New demos take
the next free number after the highest one in use – never a retired or skipped one.

## Development Commands

```bash
pnpm run dev                    # Start dev server (opens /demos/001-basics.html; index at /demos/)
pnpm run dev:watch              # Dev server + watch BLIT386 library for changes
pnpm run build                  # Build for production (output: dist/)
pnpm run preview                # Preview production build
pnpm run lint                   # Lint (ESLint)
pnpm run lint:fix               # Auto-fix lint issues
pnpm run format                 # Format (Biome + Prettier)
pnpm run format:check           # Check formatting
pnpm run format:biome           # Format JS/JSON/CSS only (Biome)
pnpm run format:prettier        # Format Markdown/YAML only (Prettier)
pnpm run spellcheck             # Check spelling (src/**, docs/**, README.md)
pnpm run knip                   # Find unused exports
pnpm run knip:fix               # Auto-remove what knip flags (review the diff)
pnpm run docs:links             # Check Markdown links (every .md/.mdx in the repo)
pnpm run generate:audio-loops   # Regenerate public/audio/*.loop.json loop points
pnpm run preflight              # ALL quality checks before committing
pnpm run clean                  # Clean build artifacts
pnpm run security:audit         # Run security audit on dependencies
pnpm run security:audit:fix     # Apply the audit's suggested fixes
pnpm run security:mcp-preflight # MCP security preflight (script lives in the blit386 repo)
```

RTK: Use `pnpm run …` for scripts. Cursor `.cursor/hooks.json` runs `rtk hook cursor` on Shell; Claude Code uses
`rtk hook claude` on Bash. Prefer shell + RTK over native Read/Grep for exploration. See `~/.claude/RTK.md`.

## Hot Reload

`pnpm run dev` / `pnpm run dev:watch` wire the `blit386/vite` plugin (`import { blit386 } from 'blit386/vite'` in
`vite.config.js`) alongside the existing `virtual-demos` watcher. Editing a demo's own `src/NNN-*.js` file no longer
full-reloads the page:

- **Method-only change** (`render()`/`update()` bodies, etc.): the engine swaps the class prototype in place – state
  kept, `init()` not re-run. Console shows `[BT] Hot reload #N (methods)`.
- **`init()`/constructor/class-field change**: the engine re-creates the demo instance and re-runs `init()` while the
  old instance keeps driving the loop, then swaps on success. `onHotReload(oldSnapshot)` fires if the demo class defines
  it.
- **`configure()` hardware-settings change** (`displaySize`, `backend`, `targetFPS`, `audioVoices`,
  `outputUpscaleFilter`, `maxCanvasSize`, `overlay*` flags): full page reload – these are baked into the renderer/audio
  graph at init and cannot be hot-swapped.
- **Asset change** (`public/sprites`, `public/audio`, `public/fonts` – image, audio, `.btfont`): the plugin's asset
  watcher replaces the loaded `SpriteSheet` / `AudioClip` / `BitmapFont` in place; no reload.

What still always full-reloads: `_partials/*.html` edits (the page template), a `blit386` library dist rebuild (via
`blit386WatchReload()` – a changed engine bundle invalidates everything), and adding or removing a `src/NNN-*.js` demo
file (the registry and the page set changed).

The live source panel (the highlighted code block under the canvas) updates itself on a demo-entry edit via a
`blit386:source-updated` custom HMR event, independent of the code hot-swap – see `plugins/virtual-demos.js`'s
`configureServer` watcher and `_partials/source-panel.js`.

Editing `src/shared/*.js` (the shared UI kit) hot-swaps too, through Vite's own module-graph HMR rather than a
`blit386:source-updated` event (the source panel only ever shows a demo's own file). This re-evaluates the shared UI
kit's module-scope state: `src/shared/ui.js`'s singleton `const ctx = new UiContext()` gets replaced, and `ui-dpad.js` /
`ui-gestures.js` reset their module-scope D-pad and swipe state. In practice this means the D-pad can briefly hide, an
in-flight swipe or key press can be dropped, and `ui.hasTouch()` can revert to `false` until the next touch – all
self-heals within a frame or two as `ui.tick()` repopulates the fresh instance. No `addEventListener` call in
`ui-core.js`, `ui-dpad.js`, or `ui-gestures.js` runs at module scope, so a shared-UI edit never double-registers a DOM
listener.

If you change the engine's `blit386/vite` plugin itself (`blit386/src/vite/**`), `dev:watch`'s `pnpm run build --watch`
only rebuilds the browser bundle (`dist/blit386.js`) – run a one-shot `pnpm run build` in `blit386` to pick up
`dist/vite.js` changes, then restart `pnpm run dev`.

### Manual hot-reload test script

No automated test covers this (see Global Constraints in the implementation plan) – run this by hand after any change to
the hot-reload wiring:

1. `pnpm run dev:watch`; open `001-basics`.
2. Edit a `render()` color constant – visual change, state (ticks/positions) kept, console shows
   `[BT] Hot reload #1 (methods)`.
3. Edit `init()` – re-init runs, `onHotReload` fires with a snapshot (add a temporary hook to verify), no page reload.
4. Edit `configure()`'s `displaySize` – full page reload.
5. Edit `public/sprites/*.png` used by 013/014 – texture updates in place, no reload.
6. Edit `public/audio/blip.wav` (036) – the next `soundPlay` uses the new sound; replace the playing music clip (037) –
   the track restarts.
7. Edit `src/shared/ui.js` – demo keeps its own state, the UI kit still works (D-pad visibility may reset – expected,
   see above).
8. Edit `_partials/layout.html` – full reload; the source panel updates on demo edits without a reload.
9. Edit an engine `src/` file – the lib rebuilds – full reload (`blit386WatchReload` preserved).
10. Repeat steps 2-4 with `?backend=software` (software renderer parity).
11. Introduce a syntax error in a demo – the Vite overlay appears, the old demo keeps running; fix it – it recovers.

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

1. Create `src/NNN-your-topic.js` (or `00a-…`) with the next free number. Retired and skipped numbers stay unused (`021`
   retired; `039` and `040` never used), so pick the next number above the highest one in use. The page title defaults
   to `BLIT386 Demo NNN – Your Topic` (topic title-cased from the slug). To override, add a `// @pageTitle Custom Title`
   comment in the first ~20 lines of the file (see `src/023-crt-pipboy.js` or `src/024-crt-toggle.js` for examples).

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
  <https://demos.blit386.dev/001-basics>"
- American English spelling – `color`, `center`, `canceled`, `traveling`, `gray`, never `colour`, `centre`, `cancelled`,
  `travelling`, `grey`. Exempt: literal third-party or spec-mandated names correctly spelled with a British `s` or `c`
  in their own spec (for example Web Audio's `AnalyserNode`/`createAnalyser`, should this repo ever reference them) – do
  not "fix" those. See blit386 [CLAUDE.md](https://github.com/blit386/blit386/blob/main/CLAUDE.md) (American English
  spelling) for the full policy this repo follows. Cursor: `.cursor/rules/american-english-spelling.mdc` (always applied
  in this repo).

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

### Audio API

Audio works on both backends (WebGPU and Canvas 2D software) – it is Web Audio only and never touches the GPU.
Post-process effects remain the only WebGPU-only feature.

```js
import { AudioClip, BT } from 'blit386';

// init(): load or synthesize clips. Both work before audio is unlocked – decoding needs no unlocked context.
const blip = await AudioClip.load('/audio/blip.wav'); // pass an array for an ordered fallback list
const [pop, music] = await AudioClip.loadAll(['/audio/pop.wav', '/audio/music-calm.wav']);
const jump = await AudioClip.synth(BT.synthPreset.jump()); // synth() is never cached

// One-shot sound effects. soundPlay() returns a SoundRef handle.
const ref = BT.soundPlay(blip, { volume: 0.8, pitch: 1.2, pan: -0.3, loop: false, priority: 0, fadeInMs: 0 });
BT.isSoundPlaying(ref); // still audible?
BT.soundStop(ref, { fadeOutMs: 120 });
BT.soundVolumeSet(ref, 0.5, { fadeMs: 100 }); // also soundPitchSet / soundPanSet (+ matching *Get)

// Music: one track at a time, crossfaded by the engine.
BT.musicPlay(music, { fadeMs: 800, loop: true, loopStart: 2.5, loopEnd: 30.0, overlap: 1 });
BT.isMusicPlaying;
BT.musicVolumeSet(0.6, { fadeMs: 400 });
BT.musicStop({ fadeMs: 600 });

// Buses: 'main' | 'music' | 'sfx' (sfx and music feed main; main feeds the speakers).
BT.audioVolumeSet('music', 0.25, { fadeMs: 300, easing: 'ease-out' }); // duck the music bus
BT.audioVolumeGet('sfx');
BT.audioMuteSet('sfx', true); // mute preserves the stored volume
BT.isAudioMuted('sfx');
```

`BT.synthPreset` has exactly six keys: `jump`, `pickup`, `explosion`, `laser`, `hit`, `blip`. Each is
`(seed?) => SynthParams` – a plain, JSON-round-trippable recipe object (`waveform`, `frequency`, `duration`, `seed`,
plus optional `volume`, `envelope`, `pitchSweep`, `vibrato`, `noiseMix`, `dutyCycle`). Waveforms: `sine`, `square`,
`triangle`, `sawtooth`, `noise`. There is no `BT.audioUnlock()` and no `BT.soundLoad()`.

The user-gesture unlock rule (get this right in every audio demo): browsers refuse to play any sound until the user
interacts with the page. `BT.init()` installs one-shot `pointerdown` / `keydown` / `touchstart` listeners on the canvas;
the first gesture unlocks the audio context for the session and `BT.isAudioUnlocked` flips to `true`. The asymmetry that
matters:

- `BT.soundPlay()` before unlock is dropped – it returns an inert `SoundRef` and no voice is allocated.
- `BT.musicPlay()` before unlock is remembered and starts automatically the instant the context unlocks.
- `AudioClip.load()` / `AudioClip.synth()` work fine while still locked.

So every audio demo shows a "click or press a key to enable sound" prompt gated on `BT.isAudioUnlocked`, and never
assumes an SFX triggered on the first frame was heard.

Audio settings in `configure()`: `audioVoices` (default `16`, range 1–64 – sizes the SFX voice pool) and
`isOverlayAudioMetersEnabled` (default `false` – adds live per-bus level meters and a voice-count readout to the
overlay; metering costs nothing while it is off). Style them with `overlayAudioMeterHeight` (default `13` px) and
`overlayAudioMeterStyle`.

Audio demos: `036-audio-basics` (loading and playing SFX), `037-music` (crossfades and loop points), `038-audio-buses`
(mixer buses, mute, ducking), `041-synth-toy` (`AudioClip.synth()` and `BT.synthPreset`). Demos `014`, `027`, and `029`
use audio as part of a larger scene.

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

### Shared UI kit (src/shared/ui.js)

All demo UI (panels, labels, key-value rows, checkboxes, pips, buttons, sliders, meters, the touch D-pad, swipes, and
tap zones) comes from the shared immediate-mode kit. NEVER hand-roll panels, buttons, or HUD text colors in a demo –
import the kit. The one intentional exception is `018-flurry` (immersive screensaver with no demo HUD; engine overlay
only):

```js
import { applyTheme, ui } from './shared/ui.js';

// init(): install the 12 shared UI colors (slots 240-251 by default; returns the slot map).
this.theme = applyTheme(this.palette); // before BT.paletteSet(); pass a startSlot if 240-251 collides

// update(): first line, whenever the demo uses { key } bindings, gestures, or the D-pad.
ui.tick();

// render(): declare UI each frame; widgets answer clicks/taps/keys immediately.
ui.begin('bottomLeft'); // or topLeft/topRight/bottomRight/topBar; opts: { x, y, width, margin, pad, kvCols }
ui.panel('Title'); // optional bg+border+amber title; first call after begin()
if (ui.button('Play (Space)', { key: 'Space' })) {
  this.play();
}
this.loop = ui.checkbox('Loop', this.loop);
volume = ui.slider('Vol', volume);
ui.kv('State', label);
ui.pip('A held', isHeld); // read-only indicator
ui.meter('Level', fraction);
ui.label('hint', { color: 'dim' }); // roles: text/dim/header/accent/warm/info
ui.audioUnlockHint(); // audio demos: standard "enable sound" row, auto-hides once unlocked
ui.end();

ui.caption(x, y, 'Pixels'); // pinned one-line caption (default amber); no begin()/end() needed
ui.dpadWidget(); // self-contained touch D-pad (outside begin/end); shows after first touch
```

Update-side queries: `ui.dpad.isDown/isPressed(dir)`, `ui.swipe()`, `ui.tapIn(rect)`, `ui.hasTouch()`,
`ui.overWidget(x, y)` (skip raw-pointer painting/dragging under UI). Widget identity is the label; pass `{ id }` for
duplicate labels. Keyboard `{ key }` bindings are edge-safe via `ui.tick()` - never read `BT.isKeyPressed` in
`render()`. Pointer APIs stay safe in `render()`. The kit allocates nothing per frame (pooled draw commands, cached
one-frame-old hit rects), so calling it from `render()` at 60 FPS is fine. `configure()` runs before `init()`, so
overlay styles that need theme colors use literal slot numbers (240 + offset) with a comment, or dedicated scene slots.

Every demo must be usable on touch: actions triggered by keys get a `ui.button` with a `{ key }` binding, directional
game input gets `ui.dpadWidget()` + `ui.swipe()`, and hardware-showcase demos (028, 031, 035) show a warm "needs a
keyboard/gamepad" label when `ui.hasTouch()` is true.

The engine draws a default stats overlay (FPS, target FPS, backend, resolution, demo title) after each `render()` call.
The overlay body starts hidden; a bitmap toggle hint sits in the bottom-left corner by default. Toggle the body with
Backquote or a primary press in the bottom-left 17x13 px corner. Use `isOverlayVisibleAtStart: true` to show the body on
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

Standard section order (matches `.cursor/rules/file-structure.mdc`):

1. Header comment (`// Demo NNN – …`, prerequisites, hosted links; optional `// @pageTitle`)
2. Imports
3. Type definitions (`@typedef` JSDoc)
4. Configuration constants
5. Module state
6. Helper functions
7. Main logic (`Demo` class)
8. Exports / bootstrap – `bootstrap(Demo);` last

Demo class member order: instance fields → `configure()` (optional) → `init()` → `update()` → `render()` → helper
methods.

Never use `// #region` / `// #endregion` – region markers are banned everywhere. See `.cursor/rules/file-structure.mdc`.

## Formatting Rules

Enforced by Biome (JS/JSON/CSS) and Prettier (Markdown/YAML):

- Four spaces indent (two for JSON/YAML/Markdown)
- 120 char line width, single quotes, always semicolons, always trailing commas

## Git Commits

Follow Conventional Commits: `<type>(<scope>): <description>`

Types (commitlint-enforced): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`

DCO sign-off is recommended: prefer `git commit -s` so commits carry a `Signed-off-by` trailer. This repo's history
follows that convention, but the commit hook only runs commitlint (conventional commits) and there is no DCO CI check.

Scopes are optional (not commitlint-enforced). Prefer ones already in history: `demos`, `ui`, `assets`, `docs`,
`skills`, `deps`.

AI-assisted commits: include `Co-Authored-By: Claude <noreply@anthropic.com>`

## Git Hooks

Managed by Husky (auto-installed via `prepare` script).

- Pre-commit (lint-staged): auto-formats and lints staged files
- Commit-msg: commitlint (conventional commit type/subject rules)
- Pre-push: runs `pnpm run preflight` (format, lint, spellcheck, knip, docs:links, build)

## Deployment

Demos deploy to Cloudflare Pages via GitHub Actions on push to main. The production build copies each virtual demo to
`dist/<slug>.html` at the site root (see `flattenDemosPlugin` in `vite.config.js`). Public URLs are listed in
`README.md` (the hosted site uses short paths such as `/001-basics`; local dev still uses `/demos/<slug>.html`).

## Agent skills

Skills live in `.claude/skills/` (Zed/Cursor also see them via `.agents/skills/*` symlinks – edit the `.claude` copy
once). Available:

| Skill                                 | Purpose                                                     |
| ------------------------------------- | ----------------------------------------------------------- |
| `demos-preflight`                     | Run format, lint, spellcheck, knip, docs:links, build       |
| `demos-format` / `demos-quick-format` | Format with Biome + Prettier (verify / skip verify)         |
| `demos-review` / `demos-deep-review`  | Diff review vs project rules; deep pre-push review          |
| `demos-pr`                            | Preflight, conventional commit (DCO recommended), open a PR |
| `demos-new`                           | Scaffold the next `NNN-topic.js` demo                       |
| `demos-spellcheck`                    | Fix cspell errors and extend `cspell.json`                  |
| `demos-test`                          | Explain that this repo has no automated tests               |
| `demos-security-run`                  | MCP security preflight + audit fallbacks                    |

`.agents/skills/*` are symlinks to `.claude/skills/*`. Do not treat them as two copies to patch.
