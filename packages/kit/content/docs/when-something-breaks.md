# When something breaks

Every programmer breaks their game many times a day. It is a normal part of making things, not a sign you did something
wrong. This page walks you through the most common problems, from "nothing shows up" to "my change did something weird,"
and how to read the clues your computer gives you.

## First: learn to see the error messages

Your game leaves clues in two places. Check both before anything else.

1. **The terminal** - the window where you typed `npm run dev`. If the dev server crashed or a file has a typo, red text
   appears here.
2. **The browser console** - a hidden panel in your browser that shows errors from the running game. Open it with
   **F12**, or right-click the page and choose **Inspect**, then click the **Console** tab. (On a Mac you can also press
   Cmd+Option+J in Chrome.) Red lines are errors. The first red line is usually the real problem; the rest are often
   side effects of it.

An error message looks scary, but it always answers two questions: **what** went wrong and **where**. Look for your file
name (like `game.js`) and a line number. That is the spot to inspect.

## The screen is blank or black

Work through this list in order:

1. **Is the dev server still running?** Look at the terminal. If it shows a normal prompt (waiting for you to type), the
   server stopped. Start it again with `npm run dev`.
2. **Is there a red error in the browser console?** Open it (see above) and read the first red line.
3. **Did you forget `await`?** This is the most common BLIT386 beginner bug. Anything that loads something (a sprite
   sheet, a font) returns a _promise_ - an "I owe you" note for a thing that is not ready yet. If you forget `await`,
   your code keeps going with the IOU instead of the real thing, and drawing fails or draws nothing.

   ```js
   // Wrong: sheet is a promise, not a sprite sheet yet.
   const sheet = SpriteSheet.load('sprites/player.png');

   // Right: await pauses until the file has actually loaded.
   const sheet = await SpriteSheet.load('sprites/player.png');
   ```

4. **Did `init()` return `true`?** The engine only starts the game loop when `init()` finishes and returns `true`. If
   you added code to `init()` and removed or skipped the `return true;` at the end, nothing ever runs.
5. **Are you drawing with an empty color slot?** Colors live in numbered palette slots, and slot 0 is always
   transparent. If you draw with a slot number you never filled with `palette.set(...)`, you are drawing with invisible
   ink. Check the numbers you pass to `BT.clear`, `BT.drawRectFill`, and friends against the slots you set up in
   `init()`. (More in `palette.md`.)

## A big red overlay covers the page

That is Vite (the dev server) telling you a file has a _syntax error_ - a typo serious enough that the code cannot be
read at all, like a missing `}` or an unclosed quote. Read the first line of the overlay: it names the file and the
line. Fix the typo, save, and the overlay disappears by itself.

## "command not found" in the terminal

- **`npm: command not found`** - Node.js is not installed, or your terminal has not noticed it yet. Install Node from
  nodejs.org (the LTS button), then fully quit and reopen your editor or terminal.
- **`blit: command not found`** - the `blit` helper lives inside your project, not on your whole computer, so plain
  `blit` does not work. Type `npx blit doctor` instead - `npx` means "run the helper that is installed in this project."

## "Port 5173 is already in use"

Another copy of the dev server is already running, probably in a forgotten terminal tab. Find that tab and stop it by
pressing **Ctrl+C** in it, or just use the new address Vite prints (it picks the next free port, like 5174, on its own).

## The browser says it cannot connect

The page at `localhost:5173` only exists while the dev server runs. If you closed the terminal or pressed Ctrl+C, the
game's address goes dead. Start the server again with `npm run dev` and reload the page.

## I changed the code and nothing happened

1. **Did you save the file?** The browser only updates after a save. Look for a dot or asterisk on the file's tab in
   your editor - that means unsaved changes.
2. **Did the change have a typo?** Check the terminal and the browser console for red text.
3. **Still nothing?** Reload the page yourself (Ctrl+R, or Cmd+R on a Mac).

## My change made everything weird and I want to go back

- **Just now?** Press Ctrl+Z (Cmd+Z on a Mac) in your editor to undo, one step at a time.
- **A while ago, and your project uses git?** Git keeps snapshots of your work. `git status` shows what changed;
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

- **Make the problem smaller.** Undo until the game works again, then redo your change in tiny steps, checking the
  browser after each one. The step where it breaks is the answer.
- **Read the matching guide.** Drawing problems: `drawing.md`. Input problems: `input.md`. Color problems: `palette.md`.
  Game loop confusion: `basics.md`.
- **Ask for help with the error text.** Whether you ask a person or an AI assistant, copy the exact error message from
  the console or terminal - it contains the clues they need.
