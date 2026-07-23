---
name: use-hot-reload
description:
  Keep the game running while editing code or assets with the blit386/vite plugin, optional onHotReload state restore,
  and in-place sprite/audio/font hot-replace. Use when the user asks about hot reload, HMR, why the page reloads on
  save, how to keep score across edits, or how to live-update a PNG or sound without restarting.
---

# Use hot reload

Edit, save, keep playing. The `blit386/vite` plugin (engine 1.4.0+) injects hot reload into the starter so method edits
and `public/` asset edits update the running game instead of wiping state with a full page reload.

## When to use

Use when the user asks about hot reload or HMR, why saving reloads the page, how to keep score/position across edits,
how to live-update a sprite or sound, or how to wire `blit386()` into an older Vite config.

## How to do it

### 1. Confirm the Vite plugin

New scaffolds already have this. Older projects get it automatically from `npx blit migrate --write` or
`npx blit upgrade` (blit386 1.4.0+). Or add it by hand, then restart the dev server:

```js
import { defineConfig } from 'vite';
import { blit386 } from 'blit386/vite';

export default defineConfig({
  plugins: [blit386()],
  server: { open: true },
});
```

Needs blit386 `^1.4.0`. Production builds skip the plugin (`apply: 'serve'`), so shipped games are unchanged.

### 2. Know which save you made

| Edit                                                | What happens                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `update()` / `render()` / module constants they use | Method swap – instance fields kept; `init()` does not re-run               |
| `init()`, constructor, or class field initializers  | Fresh instance + `init()`; optional `onHotReload` can restore fields       |
| `configure()` hardware settings                     | Full page reload (display size, backend, FPS, audio voices, overlay flags) |

### 3. Optional: restore state after a re-init

```js
onHotReload(context) {
    if (context.reason !== 'reinit' || !context.snapshot) {
        return;
    }
    if (typeof context.snapshot.score === 'number') {
        this.score = context.snapshot.score;
    }
}
```

Without this hook, a re-init still works – fields just reset to whatever the new `init()` sets. A failed `init()` leaves
the previous instance running.

### 4. Asset hot-replace

Files under `public/` (images, audio, `.btfont`) update in place. Demo-held references stay valid. If a replaced image
changes size, recompute any `srcRect` you cached – the sheet's size updates, but your old rectangle does not.

## Notes

- You never call `registerHotReload` yourself – the plugin injects it.
- Hot reload is local-dev only. It does nothing after `npm run build`.
- See `docs/hot-reload.md` for the beginner walkthrough.
