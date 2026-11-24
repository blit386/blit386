# Candidate chat prompt (draft 1, 2026-11-24)

This is for plain chat apps: ChatGPT, Claude.ai and Gemini, with no Node and no terminal. The user replaces the
bracketed line with their own idea. Everything below the line is the prompt, as it would be copied.

Every API name in it was checked against `blit386@1.9.0` (`dist/blit386.d.ts` plus the kit docs). The jsDelivr URL was
loaded and ran in a browser.

- **Pin:** the version is pinned to 1.9.0. When a release changes any API listed here, this text has to move with it
  (see the "official CDN path" issue).
- **Size:** about 650 words, small enough to paste, and small enough for a `?q=` link if a "Open in Claude" button is
  used instead of copy-paste.

---

```text
I want to make a small game with BLIT386, a free retro game engine for the web.

My game idea: [describe your game in a sentence or two]

Rules for you:
- Write ONE complete HTML file. No npm, no build step, no other files, no image files.
- Load the engine with exactly this line inside <script type="module">:
  import { bootstrap, BT, Color32, Rect2i, Vector2i, AudioClip } from 'https://cdn.jsdelivr.net/npm/blit386@1.9.0/dist/blit386.js';
- Use only the API listed below. Do not invent other BLIT386 functions. If you need something that is not listed, build it from these pieces in plain JavaScript.
- Keep it small: a 320x240 pixel screen, simple shapes, a score, and a way to restart.
- Show it so I can play it right away. If you cannot run it here, tell me to save it as game.html and open it in Chrome, Edge or Safari.
- After the code, tell me in two or three lines how to play, and one thing I could ask you to change next.

Page skeleton (keep the canvas id and the CSS):
<!doctype html>
<html><head><meta charset="utf-8"><title>My game</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
#wrap{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
#wrap canvas{image-rendering:pixelated;width:min(100vw,calc(100vh*4/3));height:min(100vh,calc(100vw*3/4))}</style>
</head><body><div id="wrap"><canvas id="blit386-canvas"></canvas></div>
<script type="module">
import { bootstrap, BT, Color32, Rect2i, Vector2i, AudioClip } from 'https://cdn.jsdelivr.net/npm/blit386@1.9.0/dist/blit386.js';
class Game {
  configure() { return { displaySize: new Vector2i(320, 240), targetFPS: 60, keyboardLayout: 'single' }; }
  async init() { /* set up colors, sounds, starting state */ return true; }
  update() { /* runs 60 times a second: read input, move things, check hits */ }
  render() { /* runs 60 times a second: draw everything, starting with BT.clear() */ }
}
bootstrap(Game);
</script></body></html>

How BLIT386 works:
- Colors are numbered palette slots, not CSS colors. Slot 0 is transparent. In init():
  const p = BT.paletteCreate(16); p.set(1, new Color32(20, 24, 40)); p.set(2, new Color32(240, 200, 80)); BT.paletteSet(p);
  Then draw with the slot number, for example BT.clear(1).
- Positions are new Vector2i(x, y) and boxes are new Rect2i(x, y, width, height). (0,0) is the top-left; y grows downward. They hold whole numbers: keep speeds and positions as plain numbers in your own fields and pass Math.floor(...) values when drawing.
- Read input in update(), draw in render().

Drawing (only inside render()):
- BT.clear(slot) - fill the screen. Call it first every frame.
- BT.drawRectFill(new Rect2i(x, y, w, h), slot) and BT.drawRect(rect, slot) for outlines.
- BT.drawLine(new Vector2i(x1, y1), new Vector2i(x2, y2), slot)
- BT.drawPixel(new Vector2i(x, y), slot)
- BT.systemPrint(new Vector2i(x, y), slot, 'text') - built-in pixel font, no setup.
- BT.systemPrintMeasure('text') returns a Vector2i (width, height), for centering text.
- BT.displaySize is the screen size as a Vector2i (a property, no parentheses). BT.ticks counts frames since the start.

Input (only inside update()):
- BT.isDown(button, 0) is true while held (use for movement). BT.isPressed(button, 0) is true on the one frame it goes down (use for jump, fire, start). BT.isReleased(button, 0) is the opposite.
- Buttons: BT.BTN_LEFT, BT.BTN_RIGHT, BT.BTN_UP, BT.BTN_DOWN, BT.BTN_A, BT.BTN_B. With keyboardLayout 'single', both WASD and the arrow keys are the directions and Space is BT.BTN_A. Gamepads work too.
- Mouse and touch: BT.isDown(BT.BTN_POINTER_A, 0) is true while the mouse button is held; BT.pointerPos(0) returns a Vector2i in game pixels. Touch fingers use slots 1 to 3.

Collisions: rectA.isIntersecting(rectB) returns true when two Rect2i overlap.

Random numbers: BT.random.int(max) gives 0 to max-1, BT.random.int(min, max) gives min to max-1, BT.random.float(min, max) gives a decimal.

Sound (optional):
- In init(): this.hitSound = await AudioClip.synth(BT.synthPreset.hit()); presets are jump, pickup, explosion, laser, hit, blip. Pass a number for a variation: BT.synthPreset.jump(3).
- To play: BT.soundPlay(this.hitSound). The browser only allows sound after the first click or key press; that is handled for you.
```

---

## Proxy test, 2026-11-24

Two fresh Claude Haiku subagents each got only this prompt and a game idea, with no repo, no docs and no web access.
Their output is in `haiku-test/`.

| Idea | Result in Chrome (localhost) | Invented API |
| --- | --- | --- |
| Breakout, three lives | Played on the first try: ball launches, bricks break, score counts, no console errors. WebGPU present | none |
| Rock dodger with shooting, speed-up and sounds | Played on the first try: rocks fall, ship moves, game over, Space restarts, no console errors. Bullets are 1x4 px, so hard to see | none |

What this shows: the cheat sheet is complete enough for a small model to write a working game without guessing.

What it does not show:

- whether ChatGPT, Claude.ai or Gemini previews allow the CDN import;
- how bigger or older models behave;
- what happens after five rounds of changes.

`window.BT` is not exposed in a CDN build, so the debugging console helpers are unavailable there.

## What to check when it comes back

Live test checklist: `live-test-checklist.md` in this folder.
