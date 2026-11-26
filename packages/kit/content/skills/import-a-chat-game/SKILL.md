---
name: import-a-chat-game
description:
  Move a one-file BLIT386 game made in a chat app (ChatGPT, Claude, Gemini) into this project, so you can keep working
  on the same game here. Use when the user has a game.html (one HTML file whose script imports blit386 from
  cdn.jsdelivr.net) and says 'I have a game.html from ChatGPT, make it a project', 'move my chat game into a real
  project', 'keep working on this HTML game', or 'import my game'.
---

# Import a game made in a chat app

A chat app can write a whole BLIT386 game as one HTML file: a page, a canvas, and one `<script type="module">` that
imports the engine from jsDelivr. This skill moves that game into a project, so it runs with `{{pmRunDev}}`, hot
reloads, and can be tested with `blit play`. The game code itself does not change.

## Rules

- Never edit, move, rename, or delete the user's HTML file. Read it and copy from it. If something goes wrong, the
  original is still there.
- Change only what the move needs: the import line, the page around the canvas, the title, and (step 4) a `canvasID`
  option. Leave the game logic alone, even if you would write it differently. Improve it later, when the user asks.

## Steps

1. Get a project. If there is none yet, make one next to the HTML file, with JavaScript (chat games are JavaScript, so
   no `--ts`) and your own assistant's files (`claude`, `cursor`, `codex`, `copilot`, `gemini`, `opencode`,
   `antigravity`, or `zed`):

   ```sh
   npm create blit386@latest my-game -- --yes --agent claude
   ```

   The starter game it makes (Catcher) is replaced in step 3. Your assistant loads the project's hooks and docs server
   only from a session started in `my-game/`, so ask the user to open a new session there (in Claude Code, `/cd` into
   it) and continue from step 2 in that session.

2. Find the game in the HTML file: the `<script type="module">` block that imports from
   `https://cdn.jsdelivr.net/npm/blit386@X.Y.Z/dist/blit386.js`. Note the version `X.Y.Z`, the page `<title>`, and the
   canvas id (usually `blit386-canvas`).

3. Replace all of `src/game.js` with the code between `<script type="module">` and `</script>`. Then change only the
   address in the import line to `'blit386'`, and keep the list of names:

   ```js
   // before
   import {
     bootstrap,
     BT,
     Color32,
     Rect2i,
     Vector2i,
     AudioClip,
   } from 'https://cdn.jsdelivr.net/npm/blit386@1.9.0/dist/blit386.js';
   // after
   import { bootstrap, BT, Color32, Rect2i, Vector2i, AudioClip } from 'blit386';
   ```

   Keep `bootstrap(Game)` at the bottom. It starts the game, the same as on the one-file page.

   Already in a TypeScript project (it has `src/game.ts`, not `src/game.js`)? Put the code in `src/game.ts` instead. It
   runs as it is; `{{pmRunDev}}` does not check types, so add them later, when the user asks.

4. Keep the project's own `index.html`. It already has `<canvas id="blit386-canvas">` and CSS that scales the canvas
   crisply for any screen size, so the chat page's skeleton CSS (`#wrap`, the `4/3` sizes) is not needed. Change only:
   - `<title>`: copy the title from the HTML file.
   - Extra page CSS or markup the game really uses (a font, a note under the canvas): copy it into `index.html`. Skip
     the rules that only center and scale the canvas.
   - A different canvas id: keep `blit386-canvas` in `index.html`, and remove the `canvasID` option the game passes to
     `bootstrap`, so both use the default.

5. Handle files that do not match the usual shape:
   - Two or more inline scripts that belong to the game: put all their code into the game file from step 3, in page
     order, with one import line at the top.
   - Other `https://` imports or images and sounds loaded from the internet: keep them, and tell the user the game needs
     a connection for those. Offer to move the files into `public/` later.
   - No `class Game` or no `bootstrap(...)` call: stop and ask the user before rewriting anything. That is a different
     program, not a quick move.

6. Check the engine version. Compare the `X.Y.Z` from step 2 with the installed engine: the `version` in
   `node_modules/blit386/package.json`, not the range in `package.json`.
   - Same version: nothing to do.
   - The project's engine is newer (the usual case with a fresh project): keep it, so the guides and the `blit` tools
     match it, and tell the user in one line: "Your file used blit386 X.Y.Z; this project uses A.B.C." When the first
     number is the same, the game's code still works. If a name has changed, use the `migrate` skill.
   - The file's version is newer (an older project): the game may call something the installed engine does not have yet.
     Run `npx blit upgrade` before step 7. It moves the project to the latest engine. On a project with no git commit
     yet it first asks "Upgrade anyway?", so commit first.

7. Run it and play it. Start the game with `{{pmRunDev}}` (or `npx blit run`) and check that it looks and plays like the
   HTML file did, with no errors in the browser console. Then play-test it with the `test-the-game` skill, for example
   `npx blit play wait:1500 hold:ArrowLeft:500 shot`. A chat game has no `testState()` hook, so `state` prints only
   `ticks` until you add one (the `use-dev-mode` skill shows how). In the project, `window.BT` works in the browser
   console during development, which the one-file version did not have.

8. Suggest a first commit, so the imported game is a clean starting point before any new changes.

## Notes

- Need the other direction, a project back into one HTML file? That is `blit bundle --single`; see the `share-the-game`
  skill and `docs/shipping-to-a-compo.md`.
- Everything the game used from the chat prompt (palette, drawing, input, sound) is the same API in the project. The
  other skills in this folder show what comes next: sprites, hot reload, a loading screen, more sounds.
