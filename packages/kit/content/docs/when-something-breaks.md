# When something breaks

Every programmer breaks their game many times a day. It is a normal part of making things, not a sign you did something
wrong. This page walks you through the most common problems, from "nothing shows up" to "my change did something weird,"
and how to read the clues your computer gives you.

## First: learn to see the error messages

Your game leaves clues in two places. Check both before anything else.

1. The terminal - the window where you typed `npm run dev`. If the dev server crashed or a file has a typo, red text
   appears here.
2. The browser console - a hidden panel in your browser that shows errors from the running game. Open it with F12, or
   right-click the page and choose Inspect, then click the Console tab. (On a Mac you can also press Cmd+Option+J in
   Chrome.) Red lines are errors. The first red line is usually the real problem; the rest are often side effects of it.

An error message looks scary, but it always answers two questions: what went wrong and where. Look for your file name
(like `game.js`, or `game.ts` in a TypeScript project) and a line number. That is the spot to inspect.

### Poking at the running game from the console (blit386 1.7.0+)

The console is not only for reading errors - you can type into it. While `npm run dev` is running, the engine puts
itself on the page as `window.BT` once the game has started, so anything the guides show as `BT.something` works there
too, on the game running in front of you:

```js
BT.displaySize; // how big the screen actually is
BT.ticks; // how many update steps have happened so far
BT.activeBackend; // 'webgpu' or 'software' - which renderer you really got
BT.palette.get(1); // what color is actually in slot 1
```

That is often the fastest way to answer "is this value what I think it is" without adding a `console.log` and reloading.
Type `BT` on its own and press Enter to expand the whole object and browse it.

If your game class has a `testState()` method (blit386 1.7.2+), `BT.testState()` prints what it returns next to the tick
counter and the renderer - see the `use-dev-mode` skill.

A built game does not get `window.BT` - it is there for you while you work, and gone once you ship. It is a debugging
convenience, not a place to write game code: your game should always reach the engine through its own
`import { BT } from 'blit386'`, never through `window`.

## The screen is blank or black

Work through this list in order:

1. Is the dev server still running? Look at the terminal. If it shows a normal prompt (waiting for you to type), the
   server stopped. Start it again with `npm run dev`.
2. Is there a red error in the browser console? Open it (see above) and read the first red line.
3. Did you forget `await`? This is the most common BLIT386 beginner bug. Anything that loads something (a sprite sheet,
   a font) returns a _promise_ - an "I owe you" note for a thing that is not ready yet. If you forget `await`, your code
   keeps going with the IOU instead of the real thing, and drawing fails or draws nothing.

   ```js
   // Wrong: sheet is a promise, not a sprite sheet yet.
   const sheet = SpriteSheet.load('sprites/player.png');

   // Right: await pauses until the file has actually loaded.
   const sheet = await SpriteSheet.load('sprites/player.png');
   ```

4. Did `init()` return `true`? The engine only starts the game loop when `init()` finishes and returns `true`. If you
   added code to `init()` and removed or skipped the `return true;` at the end, nothing ever runs.
5. Are you drawing with an empty color slot? Colors live in numbered palette slots, and slot 0 is always transparent. If
   you draw with a slot number you never filled with `palette.set(...)`, you are drawing with invisible ink. Check the
   numbers you pass to `BT.clear`, `BT.drawRectFill`, and friends against the slots you set up in `init()`. (More in
   `palette.md`.)

## The game freezes on one picture

The game was running, then it stopped on a single frame: nothing moves and no key does anything. Open the browser
console. There is almost always a red error there, and it came from your `update()` or `render()`.

The engine calls `update()` and `render()` over and over, and each round asks the browser for the next one. If your code
throws an error in the middle of a round, the engine never gets to ask, so the loop stops for good. There is no error
screen and no restart; the last picture just stays there until you reload the page.

Read the first red line, fix that spot, and reload. Be extra careful with browser features that can fail on some
devices, like saving with `localStorage` (it throws in some private windows) or `navigator.vibrate`. Wrap those in `try`
/ `catch` so a failure skips the feature instead of stopping the game:

```js
try {
  localStorage.setItem('best', String(this.best));
} catch {
  // Saving is not available here. Keep playing without it.
}
```

## Key or button taps feel randomly missed

If tapping a key or button sometimes does nothing, especially when you tap fast, check where you read it. `update()`
always finishes before `render()` runs each frame, and one-frame events like `BT.isKeyPressed`, `BT.isKeyReleased`,
`BT.inputString`, `BT.isPressed`, and `BT.isReleased` already reset by the time `render()` sees them. Read them in
`update()`, and save what happened (in a variable on `this`) if `render()` needs to know about it later. See `input.md`.

## The keyboard does nothing

- Has the game been clicked? Keys go to the game only while its canvas has _focus_ - the browser's word for "the thing
  you are typing into." Click the game once.
- Did you remap a button with `BT.inputMap`? It replaces the button's whole key list, it does not add to it.
  `BT.inputMap(0, BT.BTN_LEFT, 'ArrowLeft')` makes the left arrow work and switches `KeyA` off. List every key you want:
  `BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft')`.
- In a one-player game, do you want the arrow keys as well as W, A, S, D? Out of the box the arrows belong to player 1,
  the second keyboard player. Return `keyboardLayout: 'single'` from `configure()` (blit386 1.7.2+) and player 0 gets
  both. See `input.md`.

## The mouse acts as if it were pressed all the time

`BT.isPointerActive()` does not mean "the button is down." For the mouse it turns `true` as soon as the mouse moves over
the game and stays `true` until it leaves, so it really means "the mouse is over the game." To react to a click or a
tap, ask about the button instead:

- `BT.isPressed(BT.BTN_POINTER_A, slot)` - true for one `update()` step, right when the button or finger goes down.
- `BT.isDown(BT.BTN_POINTER_A, slot)` - true for as long as it is held.

Slot 0 is the mouse; slots 1 to 3 are fingers on a touch screen. Check all four if the game should work with both.

## The game is completely silent

Almost always, this is the browser and not your code. A web page is not allowed to make noise until the person has
clicked, tapped, or pressed a key on it - otherwise every site you opened would start shouting. Check in this order:

1. Have you touched the page yet? Click the game once, or press a key, and try the sound again. If it works now, nothing
   is broken. Give the game a "press a key to start" screen and the problem disappears for good. `BT.isAudioUnlocked`
   tells you whether the player has interacted yet.
2. Did you forget `await`? `AudioClip.load(...)` and `AudioClip.synth(...)` both load things, so both need `await`.
   Without it you are holding a promise, not a sound, and nothing plays.
3. Is the volume down? Check `BT.audioVolumeGet('main')` and `BT.audioVolumeGet('sfx')`, and that nothing is muted.

Music behaves a bit differently on purpose: `BT.musicPlay()` called too early is remembered and starts by itself on the
first click or keypress, while `BT.soundPlay()` called too early is thrown away. More in `audio.md`.

### The very first sound is missing

A sound you play on the same click that starts the game can still be thrown away. The browser needs a moment after that
first click before sound is switched on, so `BT.isAudioUnlocked` is still `false` during that `update()` step and turns
`true` a step or two later. If a sound must play right at the start (a looping background, say), remember that you want
it and start it once the flag is `true`:

```js
update() {
  if (this.wantsAmbience && BT.isAudioUnlocked) {
    BT.soundPlay(this.ambience, { loop: true });
    this.wantsAmbience = false;
  }
}
```

### `AudioClip.synth` says the sound is too long

A synthesized sound can be at most 60 seconds long; a longer `duration` throws an error. For a long background, make a
short clip and loop it with `BT.soundPlay(clip, { loop: true })`, or load a sound file from `public/` instead.

## A big red overlay covers the page

That is Vite (the dev server) telling you a file has a _syntax error_ - a typo serious enough that the code cannot be
read at all, like a missing `}` or an unclosed quote. Read the first line of the overlay: it names the file and the
line. Fix the typo, save, and the overlay disappears by itself.

## "command not found" in the terminal

- `npm: command not found` - Node.js is not installed, or your terminal has not noticed it yet. Install Node from
  nodejs.org (the LTS button), then fully quit and reopen your editor or terminal.
- `blit: command not found` - the `blit` helper lives inside your project, not on your whole computer, so plain `blit`
  does not work. Type `npx blit doctor` instead - `npx` means "run the helper that is installed in this project."

## "Port 5173 is already in use"

Another copy of the dev server is already running, probably in a forgotten terminal tab. Find that tab and stop it by
pressing Ctrl+C in it, or just use the new address Vite prints (it picks the next free port, like 5174, on its own).

## The browser says it cannot connect

The page at `localhost:5173` only exists while the dev server runs. If you closed the terminal or pressed Ctrl+C, the
game's address goes dead. Start the server again with `npm run dev` and reload the page.

## I changed the code and nothing happened

1. Did you save the file? The browser only updates after a save. Look for a dot or asterisk on the file's tab in your
   editor - that means unsaved changes.
2. Did the change have a typo? Check the terminal and the browser console for red text.
3. Still nothing? Reload the page yourself (Ctrl+R, or Cmd+R on a Mac).

## My change didn't show up

Same checklist as above. Also remember: a full page reload (so everything looks like a cold start) is expected when you
edit `configure()` hardware settings (screen size, backend, FPS, audio voices, overlay flags), when you upgrade the
`blit386` package itself, or when you change an unrecognized file under `public/`. Method and most asset edits should
update without wiping the page - if they do not, confirm `vite.config.js` still has `plugins: [blit386()]` and restart
the dev server once.

## I changed the code and the game acted weird

With hot reload (the starter's `blit386` Vite plugin), most saves keep the game running:

- Edited `update()` or `render()`? State stays. If something looks wrong, you may be looking at old values mixed with
  new logic - reload the page once for a clean start.
- Edited `init()`? The engine re-runs setup. Without an `onHotReload` hook, scores and positions reset. That is normal.
  See `docs/hot-reload.md`.
- Edited `configure()` (screen size, FPS, overlay flags)? A full page reload is expected.
- Broke `init()` so it throws or returns `false`? The previous game should keep running. Fix the typo and save again.

If the page reloads on every tiny edit, check that `vite.config.js` still has `plugins: [blit386()]` and that you are on
blit386 1.4.0 or newer (`npx blit doctor`). Older games can pick the plugin up with `npx blit migrate --write` (or
`npx blit upgrade`), then restart the dev server once.

## I edited another file and the game still runs the old code

Hot reload decides what to do by looking at your game class (the file with `bootstrap(...)` in it). When you edit a
different file that the game imports, the game class itself did not change, so the engine keeps the running game and
does not run `init()` again. That has one surprising effect:

- A plain function the game calls every frame picks up your edit right away.
- An object the game made in `init()` and kept on `this` (say `this.player = new Player()`) was built from the old code
  and keeps running it.

Reload the page to rebuild everything from the new code.

## The game restarted and lost my score

That usually means you edited `init()`, the constructor, or a class field initializer - hot reload builds a fresh
instance and runs `init()` again, so fields reset unless you restore them in `onHotReload`. Editing `configure()`
hardware settings reloads the whole page (score is gone either way). Method-only edits to `update()` / `render()` keep
state. Details and a restore example: `docs/hot-reload.md`.

## Hot reload seems stuck

Stop the dev server (Ctrl+C) and start it again with `npm run dev` (or `npx blit run`). An engine package upgrade also
forces a full reload - that is expected. If saves still do nothing after a restart, check the terminal for errors and
confirm the `blit386()` plugin is still in `vite.config.js`.

## My change made everything weird and I want to go back

- Just now? Press Ctrl+Z (Cmd+Z on a Mac) in your editor to undo, one step at a time.
- A while ago, and your project uses git? Git keeps snapshots of your work. `git status` shows what changed;
  `git restore src/game.js` puts that one file back to the last saved snapshot. (This throws away your edits to that
  file, so be sure.)
- This is exactly why `npx blit doctor` nudges you about git. Snapshots turn "I ruined everything" into "I went back two
  minutes."

## Check your setup

When the problem feels like it is about your computer rather than your code, run:

```bash
npx blit doctor
```

It checks your Node version, whether your work is saved with git, and which BLIT386 version you have, then tells you
what to do in plain language.

## Still stuck?

- Make the problem smaller. Undo until the game works again, then redo your change in tiny steps, checking the browser
  after each one. The step where it breaks is the answer.
- Read the matching guide. Drawing problems: `drawing.md`. Input problems: `input.md`. Color problems: `palette.md`.
  Sound problems: `audio.md`. Game loop confusion: `basics.md`. Hot reload surprises: `hot-reload.md`.
- Ask for help with the error text. Whether you ask a person or an AI assistant, copy the exact error message from the
  console or terminal - it contains the clues they need.
