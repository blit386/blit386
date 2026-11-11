---
name: test-the-game
description:
  Play-test the game in a real browser to check that a change works, reproduce a bug, or see what is on screen. Use
  whenever you changed gameplay, input, drawing, or anything the player sees, or the user asks to test, try, play, or
  check the game, even if they just say 'does it work now?' or 'try it'.
---

# Test the game

Open the game, press keys, and read the game's numbers to check that it does what you expect.

The game draws everything into one `<canvas>`, so a page snapshot or accessibility tree shows nothing useful: there are
no buttons or text on the page to read. Read the game's state through JavaScript instead of guessing from pixels.

There are two ways to do that, with the same results: a browser tool that can run JavaScript in the page and press keys
(such as the browser pane in the Claude desktop app), or `npx blit play` from the terminal. The terminal works in any
assistant, including Cursor, whose built-in browser cannot run JavaScript or press keys.

## From the terminal (works in any assistant)

```sh
npx blit play --seed 42 wait:1000 state hold:ArrowLeft:500 state shot
```

That starts the dev server, opens the game in the Chrome or Edge on this computer, focuses the canvas, runs the steps in
order, and prints one JSON line per step.

- Steps: `wait:<ms>`, `press:<key>`, `hold:<key>:<ms>`, `move:<x>:<y>`, `click:<x>:<y>` (game pixels; holds the button
  100 ms), `drag:<x1>:<y1>:<x2>:<y2>:<ms>` (press, move over `<ms>`, release; a small `<ms>` is a flick), `wheel:<dy>`
  or `wheel:<dx>:<dy>` (at the pointer; `move` there first), `state`, `shot[:<file.png>]` (saved under `screenshots/`,
  ignored by git), `eval:<expression>`.
- To test a drag or a scroll: `npx blit play move:160:120 wheel:120 state drag:40:120:280:120:150 state`.
  `BT.pointerDelta(0)` and `BT.pointerScrollDelta` cover only the time since the previous `update()` (engine 1.8.1+), so
  they are zero again by the next `state` step: add them up in `update()` and return the total from `testState()`. The
  wheel needs `isCapturingPointerScroll: true` in `configure()`, and only its vertical part reaches the game.
- Options: `--seed <n>`, `--backend software`, `--url <url>` (use a dev server that is already running), `--headed`
  (show the browser window). `npx blit play --help` lists them all.
- The first time, it may say it needs the `playwright-core` package and print the command that adds it. Run that command
  once, then try again. It uses the browser you already have and never downloads one.
- Timing is steadier than a browser tool: all steps run in one process, with no pause between tool calls.

## In a browser tool

1. Start the dev server with the `run` skill (`{{pmRunDev}}`). Leave it running.
2. Open the game with a fixed seed: `http://localhost:5173/?nosplash&seed=42` (use the port the server printed).
   - `seed=42` makes every random roll the same on every run, so two tests can be compared. Any whole number works.
   - `nosplash` skips the BLIT386 splash in a built game opened with `vite preview` (a dev build already skips it). A
     game whose `configure()` sets `isSplashEnabled` ignores it.
   - Add `&backend=software` to test what players without WebGPU get. `software` is the only value it accepts.
3. Give the canvas keyboard focus without clicking it: run `document.querySelector('canvas').focus()` in the page. A
   click makes the pointer active, and the starter game then steers the paddle with the mouse and ignores the keys.
4. Wait until the game has started, then read its state:

   ```js
   for (let i = 0; i < 300 && !window.BT?.isReady; i++) await new Promise((r) => setTimeout(r, 16));
   window.BT.testState();
   ```

   `window.BT` appears even when the game failed to start, so wait for `isReady` (engine 1.8.0+), not for `window.BT`.
   You get `{ ticks, backend, state }`, where `state` is what the game's `testState()` method returns (see
   `use-dev-mode`). If `isReady` stays `false` or `backend` is `null`, the game did not start: read the browser console
   and use the `fix` skill. Otherwise read it twice a second apart: `ticks` should have grown by about 60.

5. Press keys, then read the state again. Keys use `KeyboardEvent.code` names: `KeyA`, `KeyD`, `ArrowLeft`, `Space`.
   Player 0 uses W, A, S, D and Space out of the box; the starter game also maps the left and right arrow keys.
   - A quick tap from your browser tool's key-press action is enough for things that react to one press (`BT.isPressed`:
     jump, fire, menu confirm).
   - Movement that happens while a key is held (`BT.isDown`, like the starter's paddle) needs a real hold. A tap is
     usually over before the game's next step and does nothing. Hold the key from JavaScript instead:

     ```js
     const canvas = document.querySelector('canvas');
     canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
     await new Promise((resolve) => setTimeout(resolve, 500)); // hold for half a second
     canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
     ```

   Synthetic pointer events need a `pointerType` (`'mouse'`, `'touch'`, or `'pen'`); an empty one counts as the mouse,
   so a touch test must say `'touch'`. The game runs in real time, so read the state afterward instead of assuming how
   far something moved.

6. Grab an exact frame when you need to see the picture:

   ```js
   const blob = await window.BT.captureFrame({ size: 'display' }); // a PNG Blob, one pixel per game pixel
   await new Promise((resolve, reject) => {
     const reader = new FileReader();
     reader.onload = () => resolve(reader.result); // a data:image/png;base64,... string
     reader.onerror = () => reject(reader.error);
     reader.readAsDataURL(blob);
   });
   ```

   These are the game's own pixels, sharper than a browser screenshot. `{ size: 'display' }` (engine 1.7.1+) gives one
   PNG pixel per game pixel (`320x240` for the starter); without it you get `BT.outputSize` (`640x480`).

7. Freeze the game on an exact moment when timing matters (engine 1.8.0+). A live game keeps running between your tool
   calls; `BT.renderAt` replays it from the start on a fresh copy of the game class and stops on that frame:

   ```js
   await window.BT.renderAt(3.0); // tick 180 at 60 FPS - update() ran 180 times, render() once
   window.BT.testState(); // the state at exactly tick 180
   await window.BT.captureFrame({ size: 'display' }); // the frame at exactly tick 180
   await window.BT.renderAt(3.5, { from: 'current' }); // on to 3.5 s without replaying (never backwards)
   await window.BT.resume(); // let it play again from there
   ```

   Wait for `isReady` first (step 4). It works in a hidden or headless page too, and the same seed gives the same frame
   every time - as long as the game moves from `BT.ticks` / `BT.timeSeconds` / `BT.random`, never `Date.now()` or
   `performance.now()`, and resets top-of-file variables in `init()`. Key presses do not replay.

8. Check that a click or key reached `update()` exactly once (engine 1.8.1+). Do not wrap `BT.isPressed` to count calls:
   `render()` sees the same press on a different clock. Record the input trace instead:

   ```js
   window.__btInputTrace.start();
   // ...click, press keys or pad buttons (step 5)...
   const { entries } = window.__btInputTrace.stop();

   const count = (clock, test) => entries.filter((e) => e.clock === clock && test(e)).length;
   count('update', (e) => e.pointer.some((p) => p.pressed & BT.BTN_POINTER_A)); // one per click
   count('update', (e) => e.keys.pressed.includes('Space')); // one per Space tap
   ```

   Each entry has `clock` (`'update'` or `'render'`), `tick`, `pointer` (`pressed` / `released` masks of
   `BT.BTN_POINTER_*`, plus `dx` / `dy`), `wheel`, `keys` (`{ pressed, released }`) and `gamepad`. Only update entries
   show what the game's logic saw. Recording stops after 10000 entries (`start({ maxEntries })`) and sets `isTruncated`.
   Dev builds only. Stop it before `BT.renderAt`, which runs `update()` once per replayed tick.

## What a healthy run looks like

- From the terminal: the last line shows `"errors":[]` and the exit code is 0. Any error the page logs fails the run.
- In a browser tool: `isReady` is `true`, `ticks` climbs between two reads, and the console shows no errors.
- The numbers you meant to change moved the way you expected (the score went up after a catch, the paddle's `x` went
  down while `KeyA` was held).
- The same seed and the same steps give the same seeded values (where blocks appear, how far they fell by a given tick).
  Values you steered can differ by a step or two, because a key press lands in real time, not on an exact tick.

## Notes

- The starter game's `testState()` method lives in `src/game.*`. Add a field to it when you need to check something new.
- A game scaffolded before engine 1.8.0 has no `testState()`; its starter assigned a dev-only `window.__game` instead,
  and `window.__game.state()` returns the same plain object. The terminal `state` step falls back to it.
- `window.BT` exists only while the dev server runs the game. A built game does not have it.
- `?seed=` only helps if the game rolls dice with `BT.random`, not `Math.random()`. See `use-random`.
- A hidden browser pane or tab slows the game or stops it: `ticks` barely climbs and `document.visibilityState` reads
  `hidden`. Show the pane again, or use `npx blit play`, before testing anything that depends on timing.
- Keys do nothing? The canvas lost focus, the pointer took over the paddle, a held key was only tapped, or the game
  waits on a title screen (check the state). Focus the canvas again, keep the mouse off it, and hold keys as in step 5.
