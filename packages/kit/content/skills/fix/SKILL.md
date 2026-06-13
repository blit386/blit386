# Fix a runtime error

Diagnose and fix a Blit-Tech game error using the local docs.

## When to use

Use when the game crashes, shows a blank screen, throws an error in the browser console, or behaves unexpectedly.

## Steps

1. Open `docs/when-something-breaks.md` first. It covers the most common beginner errors with concrete fixes.
2. For a **blank screen**: check that `BT.paletteSet(palette)` was called in `init()` before any draw call.
3. For **"Cannot read properties of undefined"**: you likely forgot `await` before a load call (sprites, fonts).
4. For **"0 is not a valid palette index"**: you drew with slot 0, which is always transparent. Use slot 1 or higher.
5. For **engine API errors**: check `AGENTS.md` for the correct method name — getters have no `()`, methods do.
6. For **post-process effects not showing**: they need WebGPU. Check `BT.activeBackend` — if it is `'software'`, the
   Canvas 2D fallback is active and effects will not work. Keep starters free of post-process effects.

## What to check

- `update()` is for logic only; `render()` is for drawing only. Drawing in `update()` causes visual glitches.
- All screen coordinates must be whole numbers (`Vector2i`, `Rect2i`). Fractions cause off-by-one pixel issues.
- If you see `{{` or `}}` in a file, a template placeholder was not substituted — this is a scaffolding bug, not a game
  bug.
