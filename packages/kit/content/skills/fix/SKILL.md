---
name: fix
description:
  Diagnose and fix a BLIT386 game error using the local docs. Use this whenever the game crashes, shows a blank or black
  screen, throws an error in the browser console, freezes, or behaves unexpectedly, even if the user only says 'it is
  broken', 'nothing shows up', or 'why is this not working'.
---

# Fix a runtime error

Diagnose and fix a BLIT386 game error using the local docs.

## When to use

Use when the game crashes, shows a blank screen, throws an error in the browser console, or behaves unexpectedly.

## Steps

1. Open `docs/when-something-breaks.md` first. It covers the most common beginner errors with concrete fixes.
2. On a blank screen: ensure `BT.paletteSet(palette)` was called in `init()` before any draw call.
3. If you see "Cannot read properties of undefined": you likely forgot `await` before sprite or font load calls.
4. Note: 0 is not a valid palette index – slot 0 is always transparent; use slot 1 or higher.
5. Check `AGENTS.md` for correct engine API usage – getters have no `()`, methods do.
6. Post-process effects require WebGPU – confirm `BT.activeBackend` is not `'software'` (the Canvas 2D fallback does not
   run effects). Keep starters free of post-process effects.

## What to check

- `update()` is for logic only; `render()` is for drawing only. Drawing in `update()` causes visual glitches.
- If key or button taps feel randomly missed: `isKeyPressed`/`isKeyReleased`/`inputString`/`isPressed`/`isReleased` must
  be read in `update()`. Reading them in `render()` can miss the one-frame edge; see `docs/input.md`.
- All screen coordinates must be whole numbers (`Vector2i`, `Rect2i`). Fractions cause off-by-one pixel issues.
- If you see `{{` or `}}` in a file, a template placeholder was not substituted – this is a scaffolding bug, not a game
  bug.
- After a save that breaks `init()`, hot reload should leave the previous game running – fix the typo and save again
  (see `docs/hot-reload.md`). If every tiny edit full-reloads the page, confirm `vite.config.js` has
  `plugins: [blit386()]` and blit386 is 1.4.0+.
