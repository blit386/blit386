# Hot reload: keep playing while you edit

When you change a line and save, your game should keep running – score, position, and colors still where you left them.
That is hot reload. New games from `create-blit386` already wire it up in `vite.config.js`. You do not have to write any
special code for the basic case.

## What you get for free

With the `blit386` Vite plugin in place (it ships in the starter `vite.config.js`):

- Edit `update()` or `render()` and save – the new code takes over; your game state stays put.
- Edit a PNG, a sound, or a `.btfont` under `public/` – the running game swaps that asset in place. No reload.
- A broken save that makes `init()` fail leaves the previous game running, so you can fix the typo without losing the
  session.

Hot reload only works while `npm run dev` (or `npx blit run`) is running. A production build (`npm run build`) never
includes it.

## The three kinds of save

Not every edit is the same:

1. Method-only change – you edited `update()`, `render()`, or a top-level constant those methods use. The running game
   keeps every field (`this.score`, `this.pos`, …). This is the common case.
2. Re-init – you edited `init()`, the constructor, or a class field initializer. The engine builds a fresh instance and
   runs `init()` again. Without extra code, fields reset to whatever `init()` sets. Optional `onHotReload` lets you copy
   important values across (see below).
3. Full page reload – you changed something in `configure()` that rebuilds the screen or audio graph (`displaySize`,
   `backend`, `targetFPS`, `audioVoices`, overlay flags, and friends). The page reloads because those settings cannot be
   swapped live.

## Keep state across a re-init

Only needed when you edit `init()` a lot and care about values like score. Add an optional method on your game class:

```js
onHotReload(context) {
  // Only restore after a re-init (not after a method-only swap).
  if (context.reason !== 'reinit' || !context.snapshot) {
    return;
  }
  if (typeof context.snapshot.score === 'number') {
    this.score = context.snapshot.score;
  }
}
```

`context.snapshot` holds the previous instance's own fields, captured just before the new `init()` ran. Skip fields you
want `init()` to reset on purpose.

## Check that the plugin is there

Your `vite.config.js` should look like this:

```js
import { defineConfig } from 'vite';
import { blit386 } from 'blit386/vite';

export default defineConfig({
  plugins: [blit386()],
  server: { open: true },
});
```

New games from `create-blit386` already ship with that. Older games can pick it up as a nice surprise:

```bash
npx blit upgrade          # installs the latest engine, then offers migrate
npx blit migrate --write  # also enables hot reload in vite.config when missing
```

`blit migrate` / `blit upgrade` rewrite a standard Vite `defineConfig({...})` to add the import and
`plugins: [blit386()]`. Restart the dev server once after that, then save a file – the game should keep playing. If your
vite.config is unusual, add the two lines by hand (this page) or ask your AI assistant (the use-hot-reload skill).

The plugin needs blit386 1.4.0 or newer.

## What still forces a full reload

- Changing `configure()` hardware settings (see above).
- Rebuilding or upgrading the `blit386` package itself.
- Editing a file under `public/` that the plugin does not recognize as an image, audio, or `.btfont` (by default that
  reloads the page).

Next: `docs/basics.md` for the game loop, `docs/when-something-breaks.md` if a save did something unexpected.
