# One HTML File, No Install

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/guides/single-file, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

BLIT386 runs from a CDN with nothing to install: no Node, no npm, no bundler. One `.html` file loads the engine from
jsDelivr as a plain ES module and the browser does the rest. This is the path for anyone who only has a chat app
(Claude, ChatGPT, Gemini) or a text editor, and for pasting a game into a single file to share.

The engine's browser build is a single self-contained ES module (about 400 KB, no dependencies, no bare imports), so the
browser can import it straight from a URL. A smoke test in the engine repo boots that build from a plain HTML file with
no bundler on every CI run that touches the engine, so a build change that would break this path fails before it ships.

## The import

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'https://cdn.jsdelivr.net/npm/blit386@1.9.2/dist/blit386.js';
```

The URL names an exact version. Every release updates the version on this page, and a check fails the release if it is
stale, so the snippet here always matches the newest engine. Keep the exact version in your own file too: a pinned URL
keeps working the same way forever, while a moving one (`blit386@1`, or no version at all) can pick up a release whose
API your game does not expect.

The same file is also served at `https://cdn.jsdelivr.net/npm/blit386@1.9.2/+esm` and by unpkg. jsDelivr `/npm/` is the
one to use: Claude.ai artifacts allow scripts from it, and it sends `access-control-allow-origin: *`.

## A whole game in one file

This is the Catcher game that `npm create blit386` makes, in one file. Save it as `catcher.html` and open it in a
browser with WebGPU (Chrome, Edge, or Safari 26+; see [Browser Support](api-browser-support.md)). The engine falls back
to its software renderer elsewhere.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Catcher</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: black;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      canvas {
        image-rendering: pixelated;
        width: min(100vw, calc(100vh * 4 / 3));
      }
    </style>
  </head>

  <body>
    <canvas id="blit386-canvas"></canvas>

    <script type="module">
      import {
        bootstrap,
        BT,
        Color32,
        Rect2i,
        Vector2i,
      } from 'https://cdn.jsdelivr.net/npm/blit386@1.9.2/dist/blit386.js';

      // Color slot numbers. Slot 0 is always transparent, so we start at 1.
      const COLOR_BACKGROUND = 1;
      const COLOR_PADDLE = 2;
      const COLOR_ITEM = 3;
      const COLOR_TEXT = 4;

      const PADDLE_WIDTH = 48;
      const PADDLE_HEIGHT = 8;
      const ITEM_SIZE = 10;
      const PADDLE_SPEED = 3;
      const ITEM_FALL_SPEED = 2;
      const SPAWN_EVERY = 45; // steps between new blocks; 60 steps is about one second
      const STARTING_LIVES = 3;

      class Game {
        screen = new Vector2i(320, 240);
        paddlePos = new Vector2i(0, 0);
        items = [];
        score = 0;
        lives = STARTING_LIVES;

        async init() {
          this.screen = BT.displaySize;

          const palette = BT.paletteCreate(16);
          palette.set(COLOR_BACKGROUND, new Color32(18, 22, 40));
          palette.set(COLOR_PADDLE, new Color32(90, 200, 160));
          palette.set(COLOR_ITEM, new Color32(240, 180, 70));
          palette.set(COLOR_TEXT, new Color32(235, 240, 255));
          BT.paletteSet(palette);

          this.paddlePos.x = Math.floor((this.screen.x - PADDLE_WIDTH) / 2);
          this.paddlePos.y = this.screen.y - PADDLE_HEIGHT - 6;

          // One player, so both WASD and the arrow keys move the paddle.
          BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
          BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight');

          return true;
        }

        update() {
          // A held mouse button or a finger steers; otherwise the keys do.
          if (BT.isDown(BT.BTN_POINTER_A, 0)) {
            this.paddlePos.x = BT.pointerPos(0).x - Math.floor(PADDLE_WIDTH / 2);
          } else if (BT.isDown(BT.BTN_POINTER_A, 1)) {
            this.paddlePos.x = BT.pointerPos(1).x - Math.floor(PADDLE_WIDTH / 2);
          } else {
            if (BT.isDown(BT.BTN_LEFT, 0)) {
              this.paddlePos.x -= PADDLE_SPEED;
            }
            if (BT.isDown(BT.BTN_RIGHT, 0)) {
              this.paddlePos.x += PADDLE_SPEED;
            }
          }

          this.paddlePos.x = Math.max(0, Math.min(this.paddlePos.x, this.screen.x - PADDLE_WIDTH));

          if (BT.ticks % SPAWN_EVERY === 0) {
            this.items.push(new Vector2i(BT.random.int(this.screen.x - ITEM_SIZE), -ITEM_SIZE));
          }

          const paddleRect = new Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT);
          const stillFalling = [];

          for (const item of this.items) {
            item.y += ITEM_FALL_SPEED;

            if (paddleRect.isIntersecting(new Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE))) {
              this.score += 1;
            } else if (item.y > this.screen.y) {
              this.lives -= 1;
            } else {
              stillFalling.push(item);
            }
          }

          this.items = stillFalling;

          if (this.lives <= 0) {
            this.score = 0;
            this.lives = STARTING_LIVES;
            this.items = [];
          }
        }

        render() {
          BT.clear(COLOR_BACKGROUND);

          for (const item of this.items) {
            BT.drawRectFill(new Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE), COLOR_ITEM);
          }

          BT.drawRectFill(new Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT), COLOR_PADDLE);
          BT.systemPrint(new Vector2i(6, 6), COLOR_TEXT, `Score ${this.score}`);
          BT.systemPrint(new Vector2i(6, 18), COLOR_TEXT, `Lives ${this.lives}`);
        }
      }

      bootstrap(Game);
    </script>
  </body>
</html>
```

The engine draws into the `<canvas>` whose id is `blit386-canvas`. Use that id, or pass another one with
`bootstrap(Game, { canvasID: 'my-canvas' })`. The game class is the same one a scaffolded project uses: `init()`,
`update()` and `render()`, plus the optional hooks described in [API: Core](api-core.md).

Chrome runs the file straight from disk with a double-click, and a chat app's preview runs it too. If a browser shows a
blank page for a file opened from disk, run any small static server in its folder (for example `python3 -m http.server`)
and open `http://localhost:8000/catcher.html`.

## What works and what does not

Everything the engine draws, plays, and reads works the same as in a scaffolded game: the palette, primitives, text, the
system font, sound, input (keyboard, mouse, touch, gamepad), the camera, and post-process effects. The differences all
come from having no Vite dev server:

- **No hot reload.** Saving the file does nothing until you reload the page. The `blit386/vite` plugin that swaps code
  and assets in place ([Hot Reload](guide-hot-reload.md)) needs Vite.
- **The splash plays.** Without the Vite plugin the page reads as a release build, so the BLIT386 splash runs before the
  game. Return `{ isSplashEnabled: false }` from `configure()` to skip it ([Splash](guide-splash.md)).
- **No `window.BT` by default.** The browser-console helpers (`BT.testState()`, `BT.captureFrame()`) live on
  `window.BT`, which a release build does not set. Pass `bootstrap(Game, { exposeGlobal: true })` to turn it back on.
- **Loading files may be blocked.** Sprite sheets, sounds, and fonts load with `fetch`, so they need a URL the page is
  allowed to reach. Inside a chat app's preview a `fetch` to another host is often blocked; draw with primitives and the
  system font there, or embed small files as `data:` URLs.
- **Gamepads may be blocked.** Some chat-app previews block gamepad access. The game still runs: gamepads read as
  disconnected, the console shows one warning, and keyboard, mouse, and touch keep working. Save the file and open it in
  a browser tab to play with a gamepad.
- **No type checking or tests.** A scaffolded game ships TypeScript (or checked JavaScript), formatting, and a play-test
  harness. One HTML file has none of that.

## When to move to `npm create blit386`

Move once the game outgrows one file: when you want hot reload, sprite sheets and sounds in an `assets` folder, more
than one source file, type checking, or a coding agent that can run and test the game for you. Scaffold a project with:

```sh
npm create blit386@latest my-game
```

The `Game` class carries over unchanged: copy it into `src/game.js` and change the import line back to
`import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';`. A coding agent can do the move for you: the kit's
`import-a-chat-game` skill walks it through. It ships with every project set up for an AI assistant and is published
under [Build a Game](https://blit386.dev/docs/build-a-game).
