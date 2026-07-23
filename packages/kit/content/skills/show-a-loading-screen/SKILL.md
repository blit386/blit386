---
name: show-a-loading-screen
description:
  Show a loading spinner or progress UI while sprites and audio finish loading, using BT.loadingAssetsCount and optional
  SpriteSheet.status / progress. Use when the user wants a loading screen, splash screen, progress bar, or asks how to
  wait for assets before starting play.
---

# Show a loading screen

`BT.loadingAssetsCount` is the combined count of in-flight image and audio loads. Poll it each frame and draw a spinner
(or a "Loading…" label) until it returns to `0`.

## When to use

Use when the user wants a loading or splash screen, a progress bar while assets load, or asks how to wait for sprites
and sounds before gameplay starts.

## How to do it

If you `await` every load inside `init()`, the game loop does not start until they finish – so there is nothing to draw
a spinner on. To show a loading screen, return from `init()` quickly and start the loads afterward (or in a helper you
do not await from `init()`). Then poll the counter every frame:

```js
import { AudioClip, BT, SpriteSheet, Vector2i } from 'blit386';

async init() {
    this.palette = BT.paletteCreate(64);
    BT.paletteSet(this.palette);
    this.hero = null;
    // Start loads WITHOUT awaiting them here, so update/render can run a loading UI.
    void this.boot();
    return true;
}

async boot() {
    const hero = await SpriteSheet.loadIndexed('/sprites/hero.png', this.palette, 1);
    this.hero = hero.sheet;
    this.heroRect = hero.srcRect;
    this.theme = await AudioClip.load('/audio/theme.wav');
}

update() {
    // Still loading (first boot or a hot-replaced asset under public/).
    if (BT.loadingAssetsCount > 0 || !this.hero) {
        return;
    }
    // ... normal update ...
}

render() {
    BT.clear(0);
    if (BT.loadingAssetsCount > 0 || !this.hero) {
        BT.systemPrint(new Vector2i(8, 8), 1, 'Loading...');
        return;
    }
    BT.drawSprite(this.hero, this.heroRect, new Vector2i(120, 90));
}
```

### Per-sheet status (hot-reload replacements)

After a PNG under `public/` is replaced, that sheet reports:

- `sheet.status` – `'loading' | 'ready' | 'failed'`
- `sheet.progress` – coarse `0` or `1.0` (not a percentage)

A normally loaded sheet is `'ready'` with `progress` `1.0`. Use these for a per-image indicator; use
`BT.loadingAssetsCount` for one engine-wide "anything still loading?" signal.

## Key calls

- `BT.loadingAssetsCount` (getter) – in-flight image + audio count; `0` means settled.
- `SpriteSheet.status` / `SpriteSheet.progress` (getters) – per-sheet hot-replace state.

## Notes

- Arrived in blit386 1.4.0. If the getter is missing, run `npx blit upgrade`.
- Small starters can still `await` everything in `init()` and skip a loading UI – that is fine. Use this skill when you
  want the player to see progress (or when hot-reload replacements should show a brief "Loading…" state).
- Do not invent a fine-grained byte percentage from `progress`; it is intentionally coarse.

See `docs/basics.md` and `docs/hot-reload.md`.
