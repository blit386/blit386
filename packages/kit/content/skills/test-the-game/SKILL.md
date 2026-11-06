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

There are two ways to do that, with the same results:

- **In a browser tool that can run JavaScript in the page and press keys**, such as the browser pane in the Claude
  desktop app. Follow the browser steps below.
- **From the terminal, with `npx blit play`.** This works in any assistant, including Cursor: Cursor's built-in browser
  can open the page and take screenshots, but it cannot run JavaScript or press keys, so it cannot read the game's
  state.

## When to use

Use this after a change to gameplay, input, or drawing, to reproduce a bug the user described, or when the user says
"test it", "try it", "play it", or "does it work now?"

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
- To test a drag or a scroll, move the pointer onto the game, run the step, then print `state`:

  ```sh
  npx blit play move:160:120 wheel:120 state drag:40:120:280:120:150 state
  ```

  `BT.pointerDelta(0)` and `BT.pointerScrollDelta` are only the movement since the previous `update()`, so by the time
  the next step runs they are zero again. The release lands right after the last move, so `pointerDelta` on the release
  is that last move's distance (a short `<ms>`, about 100, makes it large; a long one can read 0 if an `update()` slips
  in between). Have the game's `update()` copy what it read (for example `this.lastDrag` and `this.lastWheel`) into
  `testState()`. The game only receives the wheel when `configure()` sets `isCapturingPointerScroll: true`, and
  `BT.pointerScrollDelta` is vertical only, so the `<dx>` of `wheel:<dx>:<dy>` never reaches the game.

- Options: `--seed <n>`, `--backend software`, `--url <url>` (use a dev server that is already running), `--headed`
  (show the browser window). `npx blit play --help` lists them all.
- The first time, it may say it needs the `playwright-core` package and print the command that adds it. Run that command
  once, then try again. It uses the browser you already have and never downloads one.
- Timing is steadier than a browser tool: all steps run in one process, with no pause between tool calls.

## In a browser tool

1. Start the dev server with the `run` skill (`{{pmRunDev}}`). Leave it running.
2. Open the game with a fixed seed: `http://localhost:5173/?nosplash&seed=42` (use the port the server printed).
   - `seed=42` makes every random roll the same on every run, so two tests can be compared. Any whole number works.
   - `nosplash` skips the BLIT386 splash. A dev build already skips it, so this matters for a built game you open with
     `vite preview`. If the game's `configure()` sets `isSplashEnabled`, that setting wins over the URL.
   - Add `&backend=software` when the browser has no WebGPU, or to test what players without WebGPU get. `software` is
     the only value it accepts.
3. Give the canvas keyboard focus without clicking it: run `document.querySelector('canvas').focus()` in the page. A
   click makes the pointer active, and the starter game then steers the paddle with the mouse and ignores the keys.
4. Read the state. Run this JavaScript in the page:

   ```js
   window.BT.testState();
   ```

   It returns `{ ticks, backend, state }`, where `state` is whatever the game's `testState()` method returns - the
   starter game gives plain numbers, for example `{ score, lives, paddle: { x, y, ... }, items: [...] }`. Read it twice
   about a second apart: `ticks` should have grown by about 60. `state` is `null` when the game has no `testState()`
   method. `BT.testState()` needs engine 1.8.0+; for an older game, see the note on pre-1.8.0 games below. See
   `use-dev-mode`.

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

   Synthetic pointer events need a `pointerType` (`'mouse'`, `'touch'`, or `'pen'`); an empty one is treated as the
   mouse, and touch or pen contacts are only tracked when the event says so.

   The game runs in real time (about 60 steps a second), so read the state afterward instead of assuming how far
   something moved.

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

   This is sharper than a browser screenshot: it is the game's own pixels, not scaled by the page. `{ size: 'display' }`
   (engine 1.7.1+) gives a 1:1 frame at `BT.displaySize` (`320x240` for the starter game), the size that pixel
   comparisons want. Leave it out and you get `BT.outputSize` (`640x480`, every game pixel a 2x2 block). See
   `save-a-screenshot` for the difference between the two sizes.

7. Freeze the game on an exact moment when timing matters (engine 1.8.0+). A live game keeps running between your tool
   calls, so two reads never describe the same tick. `BT.renderAt` replays the game from the start on a fresh copy of
   the game class and stops the loop on that frame; nothing moves until you say so:

   ```js
   while (!window.BT.isReady) await new Promise((r) => setTimeout(r, 16)); // init finished, loop exists
   await window.BT.renderAt(3.0); // tick 180 at 60 FPS - update() ran 180 times, render() once
   window.BT.testState(); // the state at exactly tick 180
   await window.BT.captureFrame({ size: 'display' }); // the frame at exactly tick 180
   await window.BT.renderAt(3.5, { from: 'current' }); // on to 3.5 s without replaying (never backwards)
   await window.BT.resume(); // let it play again from there
   ```

   It works in a hidden or headless page too (no animation frame needed), and the same seed gives the same frame every
   time. It only lands on the right picture if the game moves from `BT.ticks` / `BT.timeSeconds` / `BT.random`, never
   `Date.now()` or `performance.now()`. Key presses do not replay - `renderAt` checks what the game does on its own.

8. Check that a click or key reached `update()` exactly once (engine 1.8.1+; a zero-delay `page.mouse.click()` counts
   there, but on 1.8.0 hold it about 100 ms). Do not wrap `BT.isPressed` or other `BT` methods to count calls:
   `render()` sees the same press on a different clock, so the count comes out wrong. Record the input trace instead. It
   lists what each `update()` and each rendered frame saw:

   ```js
   window.__btInputTrace.start();
   // ...click, press keys or pad buttons (step 5)...
   const { entries } = window.__btInputTrace.stop();

   const count = (clock, test) => entries.filter((e) => e.clock === clock && test(e)).length;
   count('update', (e) => e.pointer.some((p) => p.pressed & BT.BTN_POINTER_A)); // one per click
   count('update', (e) => e.pointer.some((p) => p.released & BT.BTN_POINTER_A)); // one per release
   count('update', (e) => e.keys.pressed.includes('Space')); // one per Space tap
   count('render', (e) => e.pointer.some((p) => p.pressed & BT.BTN_POINTER_A)); // render() sees presses too
   ```

   Each entry has `clock` (`'update'` or `'render'`), `tick`, `pointer` (slots with an edge or movement: `pressed` and
   `released` are masks of `BT.BTN_POINTER_*`, plus `dx` / `dy`), `wheel`, `keys` (`{ pressed, released }` key codes)
   and `gamepad` (players with an edge, masks of `BT.BTN_*`). Only update entries tell you what the game's logic saw.
   Recording stops by itself after 10000 entries (`start({ maxEntries })` changes that) and sets `isTruncated`. Like
   `window.BT`, it exists only in a dev build. Stop it before `BT.renderAt` (step 7): the replay runs `update()` once
   per tick, and the trace records every one.

## What a healthy run looks like

- From the terminal: the last line shows `"errors":[]` and the exit code is 0. Any error the page logs fails the run.
- In a browser tool: `ticks` climbs between two reads, and the browser console shows no errors.
- The numbers you meant to change moved the way you expected (the score went up after a catch, the paddle's `x` went
  down while `KeyA` was held).
- The same seed and the same steps give the same result. Seeded values (where blocks appear, how far they fell by a
  given tick) match exactly across runs. Values you steered can differ by a step or two, because a key press lands in
  real time, not on an exact tick.

## Notes

- The starter game's `testState()` method lives in `src/game.*`. Add a field to it when you need to check something new,
  for example `level: this.level`. Keep it plain numbers, strings, and arrays so it can be printed.
- For a game of your own, the same `testState()` method is all you need (engine 1.8.0+): no global to assign and no
  `declare global` block, and `window.BT.testState()` reads it. The terminal `state` step prints it too.
- A game scaffolded before engine 1.8.0 has no `testState()`; its starter assigned a dev-only `window.__game` instead,
  and `window.__game.state()` returns the same plain object there. The terminal `state` step falls back to it, then to
  `BT.ticks`. `window.BT` is still there in a dev build: `BT.ticks`, `BT.activeBackend`, and `BT.captureFrame()` work
  straight away. See `use-dev-mode`.
- `window.BT` exists only while the dev server runs the game. A built game does not have it.
- `?seed=` only helps if the game rolls dice with `BT.random`, not `Math.random()`. See `use-random`.
- If the browser pane or tab is hidden, the browser slows the game down or stops it completely: `ticks` climbs slowly or
  not at all, and `document.visibilityState` reads `hidden`. Show the pane again, or use `npx blit play`, before testing
  anything that depends on timing.
- If nothing happens when you press keys, the canvas has lost focus, the pointer has taken over the paddle, a key that
  must be held was only tapped, or the game is still on a title screen waiting for a press (check the state). Focus the
  canvas again with `document.querySelector('canvas').focus()`, keep the mouse off it, and hold movement keys as in
  step 5.
