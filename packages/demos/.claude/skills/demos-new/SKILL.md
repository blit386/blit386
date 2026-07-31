---
name: demos-new
description:
  Scaffold a new blit386-demos demo file with the correct kebab-case slug, the standard demo class pattern, the
  DEMO_ORDER registration, and beginner-friendly comments. Use when the user wants to add, create, or scaffold a new
  demo or example, or says 'make a demo for X' or 'add a demo that shows Y'.
---

# New Demo

Create a new demo in `blit386-demos` following the project's slug, structure, and documentation rules.

## Usage

```text
/demos-new sprite trails
```

The text after `/demos-new` is the topic. It becomes the kebab-cased slug (`sprite-trails`) and the default page title.

## Steps

### 1. Pick the slug

Number-free kebab-case, derived from the topic: `sprite-trails`, `audio-buses`, `basics`. The first path segment must
start with a letter – numeric prefixes such as `001-sprite-trails` are rejected by the registry check. Confirm the slug
is free with `ls src/*.js` and check it does not collide with a retired or vintage path in
`plugins/demo-vintage-urls.js`.

### 2. Create src/<slug>.js

Every demo except `flurry` (the immersive screensaver with no demo HUD) uses the shared UI kit for on-screen panels and
touch controls – `CLAUDE.md` forbids hand-rolling panels, buttons, or HUD text colors, and requires the demo to be
usable on touch. Start from this shape:

```js
// Demo Topic – one-sentence summary of what this shows.
// Written for readers about 12 years old.
//
// What you will see:
//   - ...
//
// Prerequisites: Basics (https://demos.blit386.dev/basics)
// Live version: https://demos.blit386.dev/<slug>

import { bootstrap, BT } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

/** @implements {IBTDemo} */
class Demo {
  /** @type {Palette | null} */
  palette = null;

  /** Palette slots of the shared UI colors, filled by applyTheme() in init(). */
  theme = null;

  // configure() {}            // optional; omit for the 320x240 / 640x480 / 60 FPS default

  async init() {
    // Build the palette, then install the shared UI colors BEFORE BT.paletteSet().
    // applyTheme() takes slots 240-251 by default and hands back their slot numbers.
    this.palette = BT.paletteCreate(256);
    this.theme = applyTheme(this.palette);

    BT.paletteSet(this.palette);

    return true;
  }

  update() {
    // First line: lets the kit latch key presses, touches, swipes, and the D-pad.
    ui.tick();

    // Read input and change state here (logic only).
    // Directional input (when needed): ui.dpad.isDown('left'), ui.dpad.isPressed('up'), ui.swipe().
  }

  render() {
    BT.clear(this.theme.bg);

    // Draw the scene here, then declare the UI on top of it.

    ui.begin('bottomLeft'); // topLeft | topRight | bottomLeft | bottomRight | topBar
    ui.panel('Controls');

    // Every action needs a tap target, not just a key: the { key } option binds both.
    if (ui.button('Reset (R)', { key: 'KeyR' })) {
      this.reset();
    }

    ui.kv('Ticks', BT.ticks);
    ui.end();

    // Optional – only when this demo's input model includes directional controls
    // (movement, aim, menu navigation). Keep the call outside begin/end so the
    // touch D-pad sits as its own overlay; it appears after the first touch contact.
    // ui.dpadWidget();
  }

  reset() {
    // ...
  }
}

bootstrap(Demo);
```

- Widgets: `ui.panel`, `ui.label` (roles `text`/`dim`/`header`/`accent`/`warm`/`info`), `ui.kv`, `ui.checkbox`,
  `ui.pip`, `ui.button`, `ui.slider`, `ui.meter`, `ui.separator`, `ui.spacer`. Update-side queries: `ui.dpad.isDown` /
  `isPressed`, `ui.swipe()`, `ui.tapIn(rect)`, `ui.hasTouch()`, `ui.overWidget(x, y)` (skip raw-pointer painting or
  dragging that would land on a widget). Read `src/shared/ui.js` and a recent demo such as `src/synth-toy.js` for the
  full pattern.
- Widget identity is the label; pass `{ id }` when two widgets in one frame share a label.
- Keyboard `{ key }` bindings are edge-safe because `ui.tick()` runs in `update()` – never read `BT.isKeyPressed` from
  `render()`.
- The page title defaults to `BLIT386 Demo - Title Cased Topic`. Only add a `// @pageTitle Custom Title` comment (in the
  first ~20 lines) when that default is wrong for the demo.
- If the demo builds on earlier ones, list them as prerequisites in the header comment the way existing demos do (slug
  plus hosted URL).

### 3. Register it in DEMO_ORDER

Append the slug to `DEMO_ORDER` in `plugins/demo-order.js`. This is required: navigation order comes from that array,
not from disk order or the filename, and `check:demo-registry` fails without it. An unregistered demo is only
soft-appended after the ordered entries.

No `vite.config.js` edit, HTML file, or vintage-map entry is needed for a brand-new slug. Only a **rename** needs
`plugins/demo-vintage-urls.js` updated – repoint the vacated slug and add a mapping for the old public path so bookmarks
keep working.

### 4. Write beginner-friendly comments

A hard rule for `src/*.js`: every logical block gets a plain-English comment explaining what it does and why, as if the
reader has never written code before. Use analogies; never assume familiarity with math functions or language features.
Comments that only restate the code (`// add 1 to i` above `i++`) are not enough. Match the bar set by
`src/barebones.js`; see `CLAUDE.md` (Documentation Style) for the full rules.

### 5. Verify it runs

- `pnpm run check:demo-registry` – confirms disk, order, vintage, and nav-hidden sets agree.
- `pnpm run dev`, then open `/demos/<slug>.html` and exercise the demo by hand. There are no automated tests here (see
  `/demos-test`).
- `pnpm run build` to confirm the production build still succeeds (the Cloudflare Pages deploy gate).

### 6. Update the docs

Add the demo to the `## Demos` list in `README.md` under the right category (Drawing Basics, Input, Audio, Palette
System, …), matching the existing `- [slug](https://demos.blit386.dev/slug) – description` format. Hosted URLs are flat:
no `/demos/` prefix, no `.html`. `blit386-demos.vancura.dev` is a dead host and must never appear in a link.

### 7. Review

Run `/demos-review` (or `/demos-preflight`) before committing. Keep integer coordinates (`Vector2i`, `Rect2i`) and no
emoji, per project rules.

## Rules recap

- Plain JavaScript only (ES2022, no TypeScript).
- Number-free kebab-case slug; numeric prefixes are rejected.
- Every new demo must be appended to `DEMO_ORDER`.
- Use the shared UI kit – never hand-roll panels, buttons, or HUD text colors (`flurry` is the only intentional
  exception: no demo HUD).
- Every demo must be usable on touch: key-triggered actions also get a `ui.button` with a `{ key }` binding, and
  directional input also gets `ui.dpadWidget()` / `ui.swipe()`.
- Beginner-friendly comments are required; relaxed linting does not relax the comment rule.
