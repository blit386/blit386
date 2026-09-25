---
name: save-a-screenshot
description:
  Capture the rendered frame as a PNG, either downloading it or getting a Blob. Use for a screenshot button, a 'share my
  creation' feature, or exporting generated pixel art.
---

# Save a screenshot

Capture the rendered frame as a PNG - download it, or get a Blob to use yourself.

## When to use

Use for a screenshot button, a "share my creation" feature, or exporting generated pixel art.

## Download a PNG

```js
async update() {
    if (BT.isKeyPressed('KeyP')) {
        await BT.downloadFrame('my-art.png'); // async; prompts a browser download; filename optional
    }
}
```

## Get a Blob (upload, preview, store)

```js
async takeShot() {
    const blob = await BT.captureFrame(); // a PNG Blob, after the next render
    const url = URL.createObjectURL(blob);
    this.previewUrl = url;
}
```

## Get an exact 1:1 frame (tests, agents, pixel art) - engine 1.8.0+

By default the PNG matches `BT.outputSize`, which for a game with no `configure()` is `640x480` - every game pixel a 2x2
block, plus any display-tier effects (scanlines, vignette). For the game's real pixels, one PNG pixel per logical pixel
at `BT.displaySize`, pass `{ size: 'display' }`:

```js
const exact = await BT.captureFrame({ size: 'display' }); // 320x240 for the default game
await BT.downloadFrame('exact.png', { size: 'display' });
```

Use this whenever you compare frames or read pixels: the size no longer depends on the game's `configure()`, and the
capture never collides with someone pressing F9 in the same frame. It leaves out display-tier effects, since those only
exist in the upscaled buffer.

## The built-in dev shortcut (engine 1.7.0+)

While `npm run dev` is running, you do not need any code to grab a frame:

- **F9** - copy the current frame to the clipboard, ready to paste into a chat or an issue.
- **Shift+F9** - save it as a PNG, named with the date and time so repeated presses never overwrite each other.

Both are dev-only: they follow `BT.isDevMode`, so a built game never binds them. If your game wants F9 for itself, turn
them off in `configure()`:

```js
configure() {
    return {
        isFrameCaptureShortcutEnabled: false, // F9 and Shift+F9 are mine now
    };
}
```

Setting the flag wins in both directions - `true` keeps the shortcuts in a release build too. Leave it unset and dev
mode decides. Either way, this is for you while you work; a screenshot _button_ your players can press is still the
`BT.downloadFrame` / `BT.captureFrame` code above.

## Key calls

- `BT.downloadFrame(filename?, options?)` (method, async) - capture and download.
- `BT.captureFrame(options?)` (method, async) - resolve to a PNG `Blob`.
- `{ size: 'display' }` (options, engine 1.8.0+) - capture at logical `BT.displaySize` instead of `BT.outputSize`.
- `isFrameCaptureShortcutEnabled` (configure flag, engine 1.7.0+) - force the F9 / Shift+F9 shortcuts on or off.

## Notes

- Both are async - `await` them, or call from an async handler.
- Capture happens after the next frame renders, so the latest draw is included.
- Works on both the WebGPU and software backends.
