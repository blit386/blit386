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
- Take the highest three-digit prefix and add 1, zero-padded to three digits (e.g. `034`).
- Retired numbers stay retired – never reuse one. `021` is retired (it was `021-error-preview`); skip it.
- The only non-numeric slug is the lone `00a-barebones`. Do not create more `00a-*` files.

### 2. Create src/NNN-topic.js

File name is `src/NNN-topic.js` with the kebab-cased topic (e.g. `src/034-sprite-trails.js`). Start from the standard
demo shape:

```js
// @pageTitle BLIT386 Demo NNN – Title Cased Topic
//
// Demo NNN – Topic: one-sentence summary of what this shows.
// Written for readers about 12 years old.
//
// What you will see:
//   - ...

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @implements {IBTDemo} */
class Demo {
  // configure() {}            // optional; omit for the 320x240 / 640x480 / 60 FPS default
  async init() {
    // set up colors and load assets once; return true on success
    return true;
  }
  update() {
    // read input and change state here (logic only)
  }
  render() {
    // draw the current state here (drawing only)
  }
}

bootstrap(Demo);
```

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

- Add the demo to the `## Demos` list in `README.md` under the right category (e.g. Drawing Basics, Input, Palette
  System), matching the existing `- [NNN-slug](https://blit386-demos.vancura.dev/NNN-slug) – description` format.

### 6. Review

- Run `/demos-review` (or `/demos-preflight`) before committing. Keep integer coordinates (`Vector2i`, `Rect2i`) and no
  emoji, per project rules.

## Rules recap

- Plain JavaScript only (ES2022, no TypeScript).
- Next free three-digit prefix; retired numbers stay unused; `00a-barebones` is the only exception.
- Beginner-friendly comments are required; relaxed linting does not relax the comment rule.
