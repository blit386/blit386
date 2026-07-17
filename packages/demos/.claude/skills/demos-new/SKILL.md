---
name: demos-new
description:
  Scaffold a new blit386-demos demo file with the correct next NNN slug, the standard demo class pattern, and
  beginner-friendly comments. Use when the user wants to add, create, or scaffold a new demo or example, or says 'make a
  demo for X' or 'add a demo that shows Y'.
---

# New Demo

Create a new demo in `blit386-demos` following the project's slug, structure, and documentation rules. The
`virtual-demos` plugin discovers the file automatically – there is no registry or `demos/` directory to edit.

## Usage

```text
/demos-new sprite trails
```

The text after `/demos-new` is the topic. It becomes the kebab-cased slug (`NNN-sprite-trails`) and the default page
title.

## Steps

### 1. Pick the next free number

- List existing demos: `ls src/*.js`.
- Take the highest three-digit prefix and add 1, zero-padded to three digits.
- Numbering has gaps and they stay gaps – never reuse one. `021` is retired (it was `021-error-preview`), and `039` /
  `040` were never used, so the current sequence runs `001`–`020`, `022`–`038`, `041`. The next free number is the one
  above the highest in use (today: `042`), not the first hole in the sequence.
- The only non-numeric slug is the lone `00a-barebones`. Do not create more `00a-*` files.

### 2. Create src/NNN-topic.js

File name is `src/NNN-topic.js` with the kebab-cased topic (e.g. `src/042-sprite-trails.js`). Every demo (except
`018-flurry`, the immersive screensaver with no demo HUD) uses the shared UI kit for its on-screen panels and touch
controls – `CLAUDE.md` forbids hand-rolling panels, buttons, or HUD text colors, and requires the demo to be usable on
touch. Start from this shape:

```js
// @pageTitle BLIT386 Demo NNN – Title Cased Topic
//
// Demo NNN – Topic: one-sentence summary of what this shows.
// Written for readers about 12 years old.
//
// What you will see:
//   - ...
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics)
// Live version: https://demos.blit386.dev/NNN-topic

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
  dragging that would land on a widget). Read `src/shared/ui.js` and a recent demo such as `src/041-synth-toy.js` for
  the full pattern.
- Widget identity is the label; pass `{ id }` when two widgets in one frame share a label.
- Keyboard `{ key }` bindings are edge-safe because `ui.tick()` runs in `update()` – never read `BT.isKeyPressed` from
  `render()`.
- The page title defaults to `BLIT386 Demo NNN – Title Cased Topic`. Only add the `// @pageTitle Custom Title` comment
  (in the first ~20 lines) when that default is wrong for the demo.
- If the demo builds on earlier ones, list them as prerequisites in the header comment the way existing numbered demos
  do (slug plus hosted URL).

### 3. Write beginner-friendly comments

This is a hard rule for `src/*.js` demos: every logical block gets a plain-English comment explaining what it does and
why, as if the reader has never written code before. Use analogies; never assume familiarity with math functions or
language features. Comments that only restate the code (`// add 1 to i` above `i++`) are not enough. Match the bar set
by `src/00a-barebones.js`; see `CLAUDE.md` (Documentation Style) for the full rules.

### 4. Verify it runs

- `pnpm run dev`, then open `/demos/<slug>.html` and exercise the demo by hand. There are no automated tests here (see
  `/demos-test`).
- `pnpm run build` to confirm the production build still succeeds (the Cloudflare Pages deploy gate).

### 5. Update the docs

- Add the demo to the `## Demos` list in `README.md` under the right category (e.g. Drawing Basics, Input, Audio,
  Palette System), matching the existing `- [NNN-slug](https://demos.blit386.dev/NNN-slug) – description` format. The
  hosted URLs are flat (no `/demos/` prefix, no `.html`); `blit386-demos.vancura.dev` is a dead host and must never
  appear in a link.

### 6. Review

- Run `/demos-review` (or `/demos-preflight`) before committing. Keep integer coordinates (`Vector2i`, `Rect2i`) and no
  emoji, per project rules.

## Rules recap

- Plain JavaScript only (ES2022, no TypeScript).
- Next free three-digit prefix above the highest in use; retired (`021`) and skipped (`039`, `040`) numbers stay unused;
  `00a-barebones` is the only non-numeric slug (do not create more `00a-*` files).
- Use the shared UI kit – never hand-roll panels, buttons, or HUD text colors (`018-flurry` is the only intentional
  exception: no demo HUD).
- Every demo must be usable on touch: key-triggered actions also get a `ui.button` with a `{ key }` binding, and
  directional input also gets `ui.dpadWidget()` / `ui.swipe()`.
- Beginner-friendly comments are required; relaxed linting does not relax the comment rule.
