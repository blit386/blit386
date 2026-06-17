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
    };
  }

  async init() {
    // Runs once, at the start. Set up colors and load anything you need.
    // Return true when it worked.
    return true;
  }

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

- `BT.ticks` - how many update steps have happened since the start (a steadily rising whole number). Great for timers:
  `if (BT.ticks % 30 === 0) { ... }` does something twice a second.
- `BT.targetFPS` - the frames-per-second you asked for (default 60).
- `BT.deltaSeconds` - how much time one step represents, in seconds. Use it for smooth motion if you prefer
  speed-per-second over speed-per-step.

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

Next: `docs/drawing.md` to put things on screen, `docs/input.md` to react to the player, `docs/palette.md` for colors.
