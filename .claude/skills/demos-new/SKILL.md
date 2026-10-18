---
name: demos-new
description:
  Scaffold a new packages/demos demo file with the correct kebab-case slug, the standard demo class pattern, the
  DEMO_ORDER registration, and beginner-friendly comments. Use when the user wants to add, create, or scaffold a new
  demo or example, or says 'make a demo for X' or 'add a demo that shows Y'.
---

# New Demo

Create a new demo in `packages/demos` following the project's slug, structure, and documentation rules.

## Usage

```text
/demos-new sprite trails
```

The text after `/demos-new` is the topic. It becomes the kebab-cased slug (`sprite-trails`) and the default page title.

## Steps

### 1. Pick the slug

Number-free kebab-case, derived from the topic: `sprite-trails`, `audio-buses`, `basics`. The first path segment must
start with a letter - numeric prefixes such as `001-sprite-trails` are rejected by the registry check. Confirm the slug
is free with `ls packages/demos/src/*.js` and check it does not collide with a retired or vintage path in
`packages/demos/plugins/demo-vintage-urls.js`.

### 2. Create packages/demos/src/<slug>.js

Every demo except the five full-screen pieces with no demo HUD (`flurry`, `hello-world`, `hypercube`, `logo-lowres`,
`pattern-fill`) uses the shared UI kit for on-screen panels and touch controls - `packages/demos/CLAUDE.md` forbids
hand-rolling panels, buttons, or HUD text colors, and requires the demo to be usable on touch. Start from this shape:

```js
/*

Demo Topic: one-sentence summary of what this shows.
@description One line of 60-104 characters ending in a period, written for a shared link preview.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics

Live version: https://demos.blit386.dev/<slug>

Guides:
  - Input: https://blit386.dev/docs/guides/input

---

WHAT YOU WILL SEE
-----------------

Plain-language description of the screen, wrapped at 90 columns.

WHAT YOU WILL LEARN
-------------------

- The engine calls this demo introduces, one per bullet.

TRY THIS
--------

- Press R to reset.

*/

import { bootstrap, BT } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// One-paragraph plain comment describing the demo class. No JSDoc in demo files beyond
// the `@type` and `@typedef` one-liners (see packages/demos/CLAUDE.md, Comment format).
class Demo {
  /** @type {Palette | null} */
  palette = null;

  // Palette slots of the shared UI colors, filled by applyTheme() in init().
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

    // Optional - only when this demo's input model includes directional controls
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
  `ui.pip`, `ui.button`, `ui.slider`, `ui.meter`, `ui.separator`, `ui.spacer`, `ui.tooltip` (hover or long-press help on
  a widget), `ui.caption` (free-placed label outside a panel), `ui.audioUnlockHint` (the tap-to-unlock notice for audio
  demos), and `ui.drawRect` / `ui.drawRectFill` for kit-colored boxes in the scene. Update-side queries:
  `ui.dpad.isDown` / `isPressed`, `ui.swipe()`, `ui.tapIn(rect)`, `ui.hasTouch()`, `ui.overWidget(x, y)` (skip
  raw-pointer painting or dragging that would land on a widget). Read `packages/demos/src/shared/ui.js` and a recent
  demo such as `packages/demos/src/synth-toy.js` for the full pattern.
- Widget identity is the label; pass `{ id }` when two widgets in one frame share a label.
- Keyboard `{ key }` bindings are edge-safe because `ui.tick()` runs in `update()` - never read `BT.isKeyPressed` from
  `render()`.
- The page title defaults to `BLIT386 Demo – Title Cased Topic` (the registry emits an en dash there; it is the one
  place the project uses one). Only add a `// @pageTitle Custom Title` comment when that default is wrong for the demo,
  and keep it within the first 2000 bytes of the file - `demo-registry.js` scans no further.
- **Required:** a `@description` tag in the header - one line, 60-104 characters, ending in a period, within the first
  2000 bytes of the file (directly under the title line, as above). It becomes the page's meta description and
  `og:description`, so write the sentence you would want to read under a shared link, not a restatement of the title.
  `check:demo-registry` fails without it and enforces every one of those rules, the 60-character floor included, so a
  short placeholder will not pass:

  ```text
  @description Fade old frames through the palette instead of clearing them, leaving sprite trails.
  ```

- Optional: `// @ogScale fit` or `// @ogScale integer` overrides how this demo's OpenGraph card is framed. The default
  (`auto`) scales by a whole number when that already fills the card and fills the frame otherwise, which suits nearly
  every demo - only add the tag after looking at the captured card.
- If the demo builds on earlier ones, list them under `Prerequisites:` in series order (`DEMO_ORDER`), each as
  `- Name: https://demos.blit386.dev/<slug>`. Link the guides the demo exercises under `Guides:` and API pages under
  `Reference:`; `packages/demos/src/palette-fade.js` is the reference header.

### 3. Register it in DEMO_ORDER

Append the slug to `DEMO_ORDER` in `packages/demos/plugins/demo-order.js`. This is required: navigation order comes from
that array, not from disk order or the filename, and `check:demo-registry` fails without it. An unregistered demo is
only soft-appended after the ordered entries.

No `vite.config.js` edit, HTML file, or vintage-map entry is needed for a brand-new slug. Only a **rename** needs
`plugins/demo-vintage-urls.js` updated - repoint the vacated slug and add a mapping for the old public path so bookmarks
keep working.

### 4. Write beginner-friendly comments

A hard rule for `src/*.js`: every logical block gets a plain-English comment explaining what it does and why, as if the
reader has never written code before. Use analogies; never assume familiarity with math functions or language features.
Comments that only restate the code (`// add 1 to i` above `i++`) are not enough. Comments are `//` lines wrapped at 90
columns, never JSDoc or `/* */` blocks inside the code; a short trailing note is lowercase with no period. Match the bar
set by `src/basics.js`; see `packages/demos/CLAUDE.md` (Documentation Style and Comment format) for the full rules.

### 5. Verify it runs

- `pnpm run check:demo-registry` (from `packages/demos`) - confirms disk, order, vintage, and nav-hidden sets agree.
- `pnpm run check:demo-comment-links` (from `packages/demos`) - catches a dead `vancura.dev` link, or a
  `Prerequisites:`/`Guides:`/`Reference:` link to a docs page or demo slug that does not actually exist.
- `pnpm run dev`, then open `/demos/<slug>.html` and exercise the demo by hand. Demo content has no automated tests; the
  tooling under `scripts/`, `plugins/`, `src/shared/`, and `_shots/` does (see `/test demos`).
- `pnpm run build` to confirm the production build still succeeds (the Cloudflare Pages deploy gate).

### 5b. Capture the OG card and the shots

Every demo ships with an OpenGraph card and a `/shots` capture set; `check:demo-registry` fails on a missing
`public/social/og-<slug>.png`, and the demo stays off the all-demos sheet at `/` until it has a `display` capture. With
the dev server running (`pnpm run dev` on :5173, or `pnpm run build && pnpm run preview` on :4173 for the OG card):

- `pnpm run capture:og -- <slug>` writes `public/social/og-<slug>.png`; look at it before committing and add
  `// @ogScale` only if the framing is wrong.
- `pnpm run capture:shots -- --demos <slug>` writes `public/shots/<slug>/`. The first pose is the OG card and the index
  tile; add a `POSES_BY_SLUG` entry in `_shots/` only when the demo needs a key press or pointer gesture to show its
  point (see `/demos-shots`).

### 6. Update the docs

Add the demo to the `## Demos` list in `packages/demos/README.md` under the right category (Drawing Basics, Input,
Audio, Palette System, …), matching the existing `- [slug](https://demos.blit386.dev/slug) - description` format. Hosted
URLs are flat: no `/demos/` prefix, no `.html`. `blit386-demos.vancura.dev` is a dead host and must never appear in a
link.

### 7. Review

Run `/review demos` (or `/preflight demos`) before committing. Keep integer coordinates (`Vector2i`, `Rect2i`) and no
emoji, per project rules.

## Rules recap

- Plain JavaScript only (ES2022, no TypeScript).
- Number-free kebab-case slug; numeric prefixes are rejected.
- Every new demo must be appended to `DEMO_ORDER`.
- Use the shared UI kit - never hand-roll panels, buttons, or HUD text colors (`flurry` is the only intentional
  exception: no demo HUD).
- Every demo must be usable on touch: key-triggered actions also get a `ui.button` with a `{ key }` binding, and
  directional input also gets `ui.dpadWidget()` / `ui.swipe()`.
- Beginner-friendly comments are required; relaxed linting does not relax the comment rule.
