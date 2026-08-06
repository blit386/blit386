---
name: show-a-loading-screen
description:
  Show a loading spinner or progress UI while sprites and audio finish loading, using BT.loadingAssetsCount and optional
  SpriteSheet.status / progress. Use when the user wants a loading screen, progress bar, or asks how to wait for assets
  before starting play. For the built-in BLIT386 splash (which already covers init() in release builds), see
  docs/basics.md.
---

# Show a loading screen

`BT.loadingAssetsCount` is the combined count of in-flight image and audio loads. Poll it each frame and draw a spinner
(or a "Loading…" label) until it returns to `0`.

## When to use

Use when the user wants a loading or splash screen, a progress bar while assets load, or asks how to wait for sprites
and sounds before gameplay starts.

## The BLIT386 splash already covers init()

In a real build the BLIT386 splash plays before your game starts, and its hold extends until `init()` settles. So in a
release build there is already something on screen while you load, and awaiting your loads inside `init()` costs the
player nothing.

Write your own loading UI when you need it _after_ the splash has gone – a level load mid-game, or assets you
deliberately start after `init()` returns. Also remember the splash never plays in a development build, so a spinner you
only see under `npx blit run` is still worth having if loads are slow.

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

See `docs/basics.md` (including The splash) and `docs/hot-reload.md`.
