# Basics: the game loop

Every BLIT386 game is one class with up to four methods. You hand the class to `bootstrap()` and the engine takes care
of the rest.

```js
import { bootstrap, BT, Vector2i } from 'blit386';

class Game {
  configure() {
    // Optional. Omit it to get a 320x240 screen at 60 frames per second.
    // Return settings to change the size or speed:
    return {
      displaySize: new Vector2i(320, 240), // the pixel grid you draw on
      targetFPS: 60, // how many times update/render run per second
      // preferredOrientation: 'landscape', // optional; ask phones to stay landscape
    };
  }

  async init() {
    // Runs once, at the start. Set up colors and load anything you need.
    // Return true when it worked.
    return true;
  }

  // Optional. Called when the phone rotates (type is a string like 'landscape-primary').
  // onOrientationChange(type) {}

  update() {
    // Runs ~60 times a second, before render(). Read input and change your game's state here.
    // Do NOT draw here.
  }

  render() {
    // Runs ~60 times a second, after update(). Draw the current picture here.
    // Do NOT change game logic here.
  }
}

bootstrap(Game);
```

## Why update and render are separate

- `update()` is the "thinking" step: where is the player, did they press a key, did two things collide.
- `render()` is the "drawing" step: put the current state on screen.

Keeping them apart keeps games predictable. Decide things in `update()`, draw them in `render()`.

## Telling time

The engine gives you a few read-only values (they are properties, so no parentheses):

- `BT.ticks` – how many update steps have happened since the start (a steadily rising whole number). Great for timers:
  `if (BT.ticks % 30 === 0) { ... }` does something twice a second.
- `BT.targetFPS` – the frames-per-second you asked for (default 60).
- `BT.deltaSeconds` – how much time one step represents, in seconds. Use it for smooth motion if you prefer
  speed-per-second over speed-per-step.

## Phones and screen orientation

`BT.screenOrientation` is the current orientation type from the browser (for example `'landscape-primary'`), or `null`
when the browser does not report one. Set `preferredOrientation: 'landscape'` or `'portrait'` in `configure()` if your
game assumes one layout – the engine asks the browser to lock after start when it can (often Android Chrome; not iOS
Safari). Optional `onOrientationChange(type)` on your game class runs when the player rotates the device. Drawing a
"please rotate" message is still your code; the engine only tells you the orientation.

## Drawing between two steps

`update()` runs at a fixed speed (60 times a second), but the screen often draws faster than that – 120 or 144 times a
second on a modern monitor. That means some drawn frames land _in between_ two thinking steps.

`BT.renderAlpha` tells you where you landed: `0` is "exactly on the previous step", `1` is "exactly on the current
step", `0.5` is "halfway between them". If you ignore it and just draw the current position, motion looks slightly
stepped. If you use it, motion looks smooth.

To use it, remember where a thing was before you move it:

```js
import { BT, Rect2i, Vector2i } from 'blit386';

update() {
    this.prevPos = this.pos.clone(); // remember, BEFORE moving
    this.pos = this.pos.add(this.vel);
}

render() {
    const drawPos = Vector2i.lerp(this.prevPos, this.pos, BT.renderAlpha);
    BT.drawRectFill(new Rect2i(drawPos.x, drawPos.y, 8, 8), 2);
}
```

Do this for things that move. Do not do it for the HUD or the score – those should sit still.

## init returns a promise

`init()` is `async`, which means it can wait for things to load. Anything that loads (a font, a sprite sheet) gives back
a promise, so you must `await` it:

```js
async init() {
    this.font = await SomeLoader.load('...'); // await is required
    return true;
}
```

Forgetting `await` is the single most common beginner mistake. If something you loaded is `undefined`, check for a
missing `await` first.

## Waiting for assets (a loading screen)

`BT.loadingAssetsCount` is how many image and audio loads are still in flight. It is a property (no parentheses). To
draw a "Loading…" message, return from `init()` before every load finishes (start loads in a helper you do not await
from `init()`), then poll the counter in `update()` / `render()`:

```js
if (BT.loadingAssetsCount > 0) {
  BT.systemPrint(new Vector2i(8, 8), 1, 'Loading...');
  return;
}
```

If you `await` every load inside `init()`, the loop has not started yet, so there is nothing to draw on – that is fine
for small games. Per-sheet hot-reload replacements also expose `sheet.status` (`'loading' | 'ready' | 'failed'`) and a
coarse `sheet.progress` (`0` or `1.0`). Prefer `BT.loadingAssetsCount` for one engine-wide signal.

## Keep playing while you edit

New projects include the `blit386` Vite plugin, so most saves keep the running game alive. Optional
`onHotReload(context)` on your game class can restore fields after an `init()` edit. Full detail: `docs/hot-reload.md`.

Next: `docs/drawing.md` to put things on screen, `docs/input.md` to react to the player, `docs/palette.md` for colors.
